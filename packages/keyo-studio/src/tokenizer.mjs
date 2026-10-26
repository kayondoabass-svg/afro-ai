import path from 'node:path';
import { readJson } from './tensors.mjs';

// GPT byte-to-Unicode mapping, implemented here rather than delegated to a
// model runner. Byte-level BPE retains UTF-8, including non-English text.
export function byteAlphabet() {
  const values = [...Array.from({length: 94}, (_, i) => i + 33),
    ...Array.from({length: 12}, (_, i) => i + 161), ...Array.from({length: 82}, (_, i) => i + 174)];
  const characters = values.slice();
  let next = 256;
  for (let byte = 0; byte < 256; byte++) if (!values.includes(byte)) { values.push(byte); characters.push(next++); }
  const encode = new Map(values.map((byte, i) => [byte, String.fromCodePoint(characters[i])]));
  return { encode, decode: new Map([...encode].map(([a, b]) => [b, a])) };
}

const GPT_PATTERN = /'s|'t|'re|'ve|'m|'ll|'d| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+/gu;
const CONTRACTION = "'(?:[sS]|[tT]|[rR][eE]|[vV][eE]|[mM]|[lL][lL]|[dD])";
const QWEN_PATTERN = new RegExp(`${CONTRACTION}|[^\\r\\n\\p{L}\\p{N}]?\\p{L}+|\\p{N}| ?[^\\s\\p{L}\\p{N}]+[\\r\\n]*|\\s*[\\r\\n]+|\\s+(?!\\S)|\\s+`, 'gu');
const LLAMA_PATTERN = new RegExp(`${CONTRACTION}|[^\\r\\n\\p{L}\\p{N}]?\\p{L}+|\\p{N}{1,3}| ?[^\\s\\p{L}\\p{N}]+[\\r\\n]*|\\s*[\\r\\n]+|\\s+(?!\\S)|\\s+`, 'gu');

export class ByteBPE {
  constructor(json, family) {
    const nfc = json.normalizer?.type === 'NFC' && Object.keys(json.normalizer).length === 1;
    if (json.model?.type !== 'BPE' || (json.normalizer != null && !nfc) || json.model.byte_fallback === true ||
        !json.model.vocab || !Array.isArray(json.model.merges)) throw new Error('Only unnormalized or NFC byte-level BPE tokenizers are supported.');
    this.nfc = nfc;
    const parts = json.pre_tokenizer?.type === 'Sequence' ? json.pre_tokenizer.pretokenizers : [json.pre_tokenizer];
    if (!Array.isArray(parts) || !parts.some(p => p?.type === 'ByteLevel') ||
        parts.some(p => !['ByteLevel', 'Split'].includes(p?.type)) ||
        parts.some(p => p?.type === 'ByteLevel' && p.add_prefix_space)) throw new Error('Unsupported BPE pre-tokenizer.');
    const split = parts.find(p => p?.type === 'Split');
    if (split) {
      const regex = split.pattern?.Regex;
      const expected = "(?i:'s|'t|'re|'ve|'m|'ll|'d)|[^\\r\\n\\p{L}\\p{N}]?\\p{L}+|";
      const suffix = "| ?[^\\s\\p{L}\\p{N}]+[\\r\\n]*|\\s*[\\r\\n]+|\\s+(?!\\S)|\\s+";
      if (![expected + '\\p{N}' + suffix, expected + '\\p{N}{1,3}' + suffix].includes(regex) ||
          split.behavior !== 'Isolated' || split.invert) throw new Error('Unsupported tokenizer splitting rule.');
      this.pattern = regex.includes('\\p{N}{1,3}') ? LLAMA_PATTERN : QWEN_PATTERN;
    } else this.pattern = GPT_PATTERN;
    if (json.decoder?.type !== 'ByteLevel') throw new Error('Only ByteLevel decoding is supported.');
    this.vocab = new Map(Object.entries(json.model.vocab));
    this.ids = new Map();
    for (const [token, id] of this.vocab) {
      if (!Number.isSafeInteger(id) || id < 0 || id > 500000 || this.ids.has(id)) throw new Error('Invalid tokenizer vocabulary.');
      this.ids.set(id, token);
    }
    this.special = new Map();
    this.literal = new Map();
    for (const token of json.added_tokens ?? []) {
      if (!Number.isSafeInteger(token.id) || token.id < 0 || token.id > 500000 || typeof token.content !== 'string' ||
          (this.ids.has(token.id) && this.ids.get(token.id) !== token.content)) throw new Error('Invalid added token.');
      this.vocab.set(token.content, token.id);
      this.ids.set(token.id, token.content);
      if (token.special) this.special.set(token.content, token.id);
      else if (!Object.hasOwn(json.model.vocab, token.content)) {
        if (!token.content.length || ['single_word','lstrip','rstrip','normalized'].some(flag =>
          token[flag] !== undefined && token[flag] !== false))
          throw new Error('Unsupported added-token matching flags.');
        this.literal.set(token.content, token.id);
      }
    }
    const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    this.specialPattern = this.special.size ? new RegExp(`(${[...this.special.keys()].sort((a,b) => b.length - a.length).map(escape).join('|')})`, 'gu') : null;
    const pattern = keys => keys.length ? new RegExp(`(${keys.sort((a,b) => b.length-a.length).map(escape).join('|')})`,'gu') : null;
    this.literalPattern = pattern([...this.literal.keys()]);
    this.addedPattern = pattern([...this.literal.keys(),...this.special.keys()]);
    this.ranks = new Map(json.model.merges.map((merge, index) => [Array.isArray(merge) ? merge.join(' ') : merge, index]));
    this.alphabet = byteAlphabet();
    this.cache = new Map();
  }
  static async load(directory, family) { return new ByteBPE(await readJson(path.join(directory, 'tokenizer.json'), 16 * 1024 * 1024), family); }
  bpe(text) {
    if (this.cache.has(text)) return this.cache.get(text);
    let tokens = [...text];
    while (tokens.length > 1) {
      let best = Infinity, selected = -1;
      for (let i = 0; i < tokens.length - 1; i++) {
        const rank = this.ranks.get(`${tokens[i]} ${tokens[i + 1]}`);
        if (rank !== undefined && rank < best) { best = rank; selected = i; }
      }
      if (selected < 0) break;
      tokens.splice(selected, 2, tokens[selected] + tokens[selected + 1]);
    }
    const ids = tokens.map(token => {
      const id = this.vocab.get(token);
      if (id === undefined) throw new Error('Input cannot be represented by this tokenizer.');
      return id;
    });
    if (this.cache.size < 4096) this.cache.set(text, ids);
    return ids;
  }
  encode(text, allowSpecial = false) {
    if (typeof text !== 'string' || text.length > 16384) throw new Error('Prompt exceeds the 16,384-character alpha limit.');
    const pattern = allowSpecial ? this.addedPattern : this.literalPattern;
    const pieces = pattern ? text.split(pattern) : [text];
    const result = [];
    for (const piece of pieces) {
      if (allowSpecial && this.special.has(piece)) { result.push(this.special.get(piece)); continue; }
      if (this.literal.has(piece)) { result.push(this.literal.get(piece)); continue; }
      for (const match of (this.nfc ? piece.normalize('NFC') : piece).matchAll(this.pattern)) {
        const encoded = [...Buffer.from(match[0], 'utf8')].map(byte => this.alphabet.encode.get(byte)).join('');
        result.push(...this.bpe(encoded));
      }
    }
    return result;
  }
  tokenBytes(id) {
    const token = this.ids.get(id);
    if (token === undefined) throw new Error('Model generated a token absent from its tokenizer.');
    if (this.special.has(token)) return Buffer.alloc(0);
    if (this.literal.has(token)) return Buffer.from(token,'utf8');
    return Buffer.from([...token].map(char => {
      const byte = this.alphabet.decode.get(char);
      if (byte === undefined) throw new Error('Unsupported token encoding.');
      return byte;
    }));
  }
  decode(ids) { return Buffer.concat(ids.map(id => this.tokenBytes(id))).toString('utf8'); }
}
