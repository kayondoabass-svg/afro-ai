import path from 'node:path';
import { setImmediate as yieldTurn } from 'node:timers/promises';
import { readJson, loadTensors, matvec, normalize, softmax, rotary, gelu } from './tensors.mjs';
import { ByteBPE } from './tokenizer.mjs';

function integer(value, name, max = 500000) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > max) throw new Error(`Invalid model dimension: ${name}.`);
  return value;
}
const add = (a, b) => Float32Array.from(a, (value, i) => value + b[i]);

// All transformer execution is our own typed-array implementation. No model
// runner, Transformers, ONNX, Ollama, llama.cpp, vLLM or remote API is invoked.
export class KeyoEngine {
  static async load(directory) {
    const config = await readJson(path.join(directory, 'config.json'));
    const tokenizer = await ByteBPE.load(directory, config.model_type);
    return new KeyoEngine(config, await loadTensors(directory), tokenizer, path.basename(path.resolve(directory)));
  }
  constructor(config, tensors, tokenizer, id = 'local-model') {
    this.config = config; this.tensors = tensors; this.tokenizer = tokenizer; this.id = id;
    this.family = config.model_type;
    if (!['gpt_neo', 'qwen2', 'llama'].includes(this.family)) throw new Error('Unsupported model architecture. This alpha implements GPT-Neo, Qwen2 and basic Llama only.');
    if (config.rope_scaling != null || (this.family !== 'qwen2' && config.sliding_window != null) || config.use_sliding_window ||
        config.attention_bias === true || config.mlp_bias === true || (config.pretraining_tp ?? 1) !== 1) throw new Error('This model uses an architecture variant not supported by this alpha.');
    this.hidden = integer(config.hidden_size, 'hidden_size', 8192);
    this.layers = integer(config.num_hidden_layers ?? config.num_layers, 'layers', 96);
    this.heads = integer(config.num_attention_heads ?? config.num_heads, 'heads', 128);
    this.kvHeads = integer(config.num_key_value_heads ?? this.heads, 'key/value heads', this.heads);
    this.vocab = integer(config.vocab_size, 'vocabulary');
    this.context = Math.min(512, integer(config.max_position_embeddings, 'context'));
    this.headSize = this.hidden / this.heads;
    if (!Number.isInteger(this.headSize) || this.heads % this.kvHeads || this.headSize % 2) throw new Error('Invalid attention head dimensions.');
    if (config.head_dim != null && config.head_dim !== this.headSize) throw new Error('Custom head dimensions are not supported.');
    this.epsilon = config.rms_norm_eps ?? config.layer_norm_epsilon ?? 1e-5;
    this.theta = config.rope_theta ?? 10000;
    if (!Number.isFinite(this.epsilon) || !(this.epsilon > 0 && this.epsilon < 1) || !Number.isFinite(this.theta) || !(this.theta > 0)) throw new Error('Invalid normalization or position settings.');
    this.eos = new Set(Array.isArray(config.eos_token_id) ? config.eos_token_id : [config.eos_token_id]);
    const neo = this.family === 'gpt_neo';
    if (neo && config.activation_function !== 'gelu_new') throw new Error('Only GPT-Neo gelu_new is supported.');
    if (!neo && config.hidden_act !== 'silu') throw new Error('Only SiLU gated MLPs are supported.');
    this.intermediate = integer(config.intermediate_size ?? this.hidden * 4, 'intermediate', 65536);
    this.embedding = this.require(neo ? 'transformer.wte.weight' : 'model.embed_tokens.weight', [this.vocab, this.hidden]);
    this.output = tensors.has('lm_head.weight') ? this.require('lm_head.weight', [this.vocab, this.hidden]) : this.embedding;
    if (!tensors.has('lm_head.weight') && config.tie_word_embeddings !== true) throw new Error('Missing untied output weights.');
    this.finalWeight = this.require(neo ? 'transformer.ln_f.weight' : 'model.norm.weight', [this.hidden]).data;
    this.finalBias = neo ? this.require('transformer.ln_f.bias', [this.hidden]).data : null;
    if (neo) {
      this.position = this.require('transformer.wpe.weight', [config.max_position_embeddings, this.hidden]);
      if (!Array.isArray(config.attention_layers) || config.attention_layers.length !== this.layers ||
          config.attention_layers.some(value => !['global', 'local'].includes(value))) throw new Error('Invalid GPT-Neo attention configuration.');
      this.window = integer(config.window_size ?? 256, 'attention window', 2048);
    }
    this.blocks = Array.from({length: this.layers}, (_, i) => {
      const p = neo ? `transformer.h.${i}.` : `model.layers.${i}.`;
      const attention = neo ? 'attn.attention.' : 'self_attn.';
      const linear = (name, rows, cols, bias = false) => ({
        weight: this.require(p + name + '.weight', [rows, cols]),
        bias: bias ? this.require(p + name + '.bias', [rows]).data : null
      });
      return {
        norm1: this.require(p + (neo ? 'ln_1.weight' : 'input_layernorm.weight'), [this.hidden]).data,
        norm2: this.require(p + (neo ? 'ln_2.weight' : 'post_attention_layernorm.weight'), [this.hidden]).data,
        bias1: neo ? this.require(p + 'ln_1.bias', [this.hidden]).data : null,
        bias2: neo ? this.require(p + 'ln_2.bias', [this.hidden]).data : null,
        q: linear(attention + 'q_proj', this.hidden, this.hidden, this.family === 'qwen2'),
        k: linear(attention + 'k_proj', this.kvHeads * this.headSize, this.hidden, this.family === 'qwen2'),
        v: linear(attention + 'v_proj', this.kvHeads * this.headSize, this.hidden, this.family === 'qwen2'),
        out: linear(attention + (neo ? 'out_proj' : 'o_proj'), this.hidden, this.hidden, neo),
        up: linear('mlp.' + (neo ? 'c_fc' : 'up_proj'), this.intermediate, this.hidden, neo),
        down: linear('mlp.' + (neo ? 'c_proj' : 'down_proj'), this.hidden, this.intermediate, neo),
        gate: neo ? null : linear('mlp.gate_proj', this.intermediate, this.hidden)
      };
    });
  }
  require(name, shape) {
    const tensor = this.tensors.get(name);
    if (!tensor || tensor.shape.length !== shape.length || tensor.shape.some((value, i) => value !== shape[i])) throw new Error(`Missing or incompatible tensor: ${name}.`);
    return tensor;
  }
  cache() { return { position: 0, blocks: this.blocks.map(() => ({ keys: [], values: [] })) }; }
  forward(token, cache, guard = () => {}, output = true) {
    guard();
    if (!Number.isInteger(token) || token < 0 || token >= this.vocab || cache.position >= this.context) throw new Error('Token or context out of range.');
    const neo = this.family === 'gpt_neo';
    const position = cache.position;
    let x = this.embedding.data.slice(token * this.hidden, (token + 1) * this.hidden);
    if (neo) x = add(x, this.position.data.subarray(position * this.hidden, (position + 1) * this.hidden));
    const project = (layer, input) => {
      const result = matvec(layer.weight, input, guard);
      return layer.bias ? add(result, layer.bias) : result;
    };
    for (let layer = 0; layer < this.layers; layer++) {
      guard();
      const block = this.blocks[layer], history = cache.blocks[layer];
      const norm = normalize(x, block.norm1, block.bias1, this.epsilon, !neo);
      let q = project(block.q, norm), k = project(block.k, norm);
      const v = project(block.v, norm);
      if (!neo) { q = rotary(q, position, this.headSize, this.theta); k = rotary(k, position, this.headSize, this.theta); }
      history.keys.push(k); history.values.push(v);
      const attention = new Float32Array(this.hidden);
      const first = neo && this.config.attention_layers[layer] === 'local' ? Math.max(0, history.keys.length - this.window) : 0;
      for (let head = 0; head < this.heads; head++) {
        const base = head * this.headSize;
        const kvBase = Math.floor(head / (this.heads / this.kvHeads)) * this.headSize;
        const scores = new Float64Array(history.keys.length - first);
        for (let t = first; t < history.keys.length; t++) {
          let score = 0;
          for (let d = 0; d < this.headSize; d++) score += q[base + d] * history.keys[t][kvBase + d];
          // GPT-Neo deliberately does not scale attention by sqrt(head_size).
          scores[t - first] = neo ? score : score / Math.sqrt(this.headSize);
        }
        const probabilities = softmax(scores);
        for (let d = 0; d < this.headSize; d++) {
          let value = 0;
          for (let t = first; t < history.values.length; t++) value += probabilities[t - first] * history.values[t][kvBase + d];
          attention[base + d] = value;
        }
      }
      x = add(x, project(block.out, attention));
      const norm2 = normalize(x, block.norm2, block.bias2, this.epsilon, !neo);
      const up = project(block.up, norm2);
      const activated = neo ? Float32Array.from(up, gelu) : (() => {
        const gate = project(block.gate, norm2);
        return Float32Array.from(up, (value, i) => value * gate[i] / (1 + Math.exp(-gate[i])));
      })();
      x = add(x, project(block.down, activated));
    }
    cache.position++;
    return output ? matvec(this.output, normalize(x, this.finalWeight, this.finalBias, this.epsilon, !neo), guard) : null;
  }
  chatPrompt(messages) {
    if (!Array.isArray(messages) || !messages.length || messages.length > 32 ||
        messages.some(m => !m || !['system','user','assistant'].includes(m.role) || typeof m.content !== 'string')) throw new Error('Invalid chat messages.');
    if (messages.some(m => [...this.tokenizer.special.keys()].some(token => m.content.includes(token)))) throw new Error('Chat content must not contain model control tokens.');
    if (this.family === 'qwen2' && this.tokenizer.special.has('<|im_start|>') && this.tokenizer.special.has('<|im_end|>'))
      return messages.map(m => `<|im_start|>${m.role}\n${m.content}<|im_end|>\n`).join('') + '<|im_start|>assistant\n';
    if (this.family === 'llama' && ['<|begin_of_text|>','<|start_header_id|>','<|end_header_id|>','<|eot_id|>'].every(t => this.tokenizer.special.has(t)))
      return '<|begin_of_text|>' + messages.map(m => `<|start_header_id|>${m.role}<|end_header_id|>\n\n${m.content}<|eot_id|>`).join('') + '<|start_header_id|>assistant<|end_header_id|>\n\n';
    throw new Error('This base model has no supported chat template. Use /v1/completions or CLI --prompt instead.');
  }
  async *generate(prompt, { maxTokens = 32, temperature = 0, topK = 40, seed = 1, signal, deadlineMs = 60000, chat = false, cancelled = () => false } = {}) {
    if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 128 || !Number.isFinite(temperature) ||
        temperature < 0 || temperature > 2 || !Number.isInteger(topK) || topK < 1 || topK > 100 ||
        !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Invalid generation options.');
    const tokens = this.tokenizer.encode(prompt, chat);
    if (!tokens.length) throw new Error('Prompt is empty.');
    if (tokens.length + maxTokens > this.context) throw new Error(`Prompt and output exceed the ${this.context}-token alpha context limit.`);
    const end = Date.now() + deadlineMs;
    const guard = () => { if (signal?.aborted || cancelled()) throw new Error('Generation cancelled.'); if (Date.now() > end) throw new Error('Generation time limit exceeded.'); };
    const cache = this.cache();
    let logits;
    for (let i = 0; i < tokens.length; i++) {
      guard(); logits = this.forward(tokens[i], cache, guard, i === tokens.length - 1);
      await yieldTurn();
    }
    let state = seed >>> 0;
    const random = () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
    const decoder = new TextDecoder('utf-8');
    let reason = 'length', count = 0;
    for (let i = 0; i < maxTokens; i++) {
      guard();
      let chosen = 0;
      if (logits.some(value => !Number.isFinite(value))) throw new Error('Engine produced non-finite logits.');
      if (!temperature) { for (let j = 1; j < logits.length; j++) if (logits[j] > logits[chosen]) chosen = j; }
      else {
        const candidates = Array.from(logits, (value, id) => ({value, id})).sort((a,b) => b.value - a.value).slice(0, topK);
        const probabilities = softmax(candidates.map(c => c.value / temperature));
        let draw = random(), index = 0;
        while (index < probabilities.length - 1 && (draw -= probabilities[index]) > 0) index++;
        chosen = candidates[index].id;
      }
      count++;
      if (this.eos.has(chosen)) { reason = 'stop'; break; }
      yield { type: 'token', token: chosen, text: decoder.decode(this.tokenizer.tokenBytes(chosen), {stream:true}) };
      await yieldTurn();
      if (i < maxTokens - 1) logits = this.forward(chosen, cache, guard);
    }
    const remainder = decoder.decode();
    if (remainder) yield {type:'token', text:remainder};
    yield {type:'done', finishReason:reason, usage:{prompt_tokens:tokens.length, completion_tokens:count, total_tokens:tokens.length + count}};
  }
  info() {
    const chatTemplate = this.family === 'qwen2' && ['<|im_start|>','<|im_end|>'].every(t => this.tokenizer.special.has(t)) ? 'chatml'
      : this.family === 'llama' && ['<|begin_of_text|>','<|start_header_id|>','<|end_header_id|>','<|eot_id|>'].every(t => this.tokenizer.special.has(t)) ? 'llama3' : null;
    return { id:this.id, architecture:this.family, engine:'keyo-cpu', context_limit:this.context, chatTemplate,
      tensors:this.tensors.size, parameters:[...this.tensors.values()].reduce((sum,t) => sum + t.data.length,0) };
  }
}
