import test from 'node:test';
import assert from 'node:assert/strict';
import { KeyoEngine } from '../src/engine.mjs';
import { ByteBPE, byteAlphabet } from '../src/tokenizer.mjs';
import { matvec, normalize, rotary, halfToFloat, parseSafetensors, softmax } from '../src/tensors.mjs';
import { fixture, safetensors } from './fixture.mjs';

test('independent matrix/vector, norm and stable softmax arithmetic',() => {
  assert.deepEqual([...matvec({shape:[2,2],data:Float32Array.from([1,2,3,4])},[2,3])],[8,18]);
  const actual = normalize([1,2,3,4],[1,1,1,1],null,1e-5);
  const expected = [-1.5,-0.5,0.5,1.5].map(x => x/Math.sqrt(1.25+1e-5));
  actual.forEach((value,i) => assert.ok(Math.abs(value-expected[i]) < 1e-6));
  const probabilities = softmax([10000,10000]);
  assert.deepEqual([...probabilities],[0.5,0.5]);
  assert.equal(halfToFloat(0x3c00),1); assert.equal(halfToFloat(0xc000),-2);
});

test('RoPE follows analytic rotation, preserving per-head norm',() => {
  const result = rotary(Float32Array.from([1,2,3,4]),1,4,10000);
  assert.ok(Math.abs(result[0]-(Math.cos(1)-3*Math.sin(1))) < 1e-6);
  assert.ok(Math.abs(result[2]-(Math.sin(1)+3*Math.cos(1))) < 1e-6);
  assert.ok(Math.abs([...result].reduce((a,b)=>a+b*b,0)-30) < 1e-5);
});

test('data-only safetensors roundtrip and bounds',() => {
  const f = fixture();
  const parsed = parseSafetensors(safetensors(f.tensors));
  assert.equal(parsed.size,f.tensors.size);
  assert.deepEqual([...parsed.get('transformer.wte.weight').data], [...f.tensors.get('transformer.wte.weight').data]);
  assert.throws(()=>parseSafetensors(Buffer.alloc(10)),/header length/);
  const malformed = Buffer.from(safetensors(f.tensors)); malformed.writeBigUInt64LE(9000000n,0);
  assert.throws(()=>parseSafetensors(malformed),/header length/);
  const nan = fixture(); nan.tensors.get('lm_head.weight').data[0] = NaN;
  assert.throws(()=>parseSafetensors(safetensors(nan.tensors)),/Non-finite/);
});

test('safetensors rejects overlapping, wrong dtype and mismatched offsets',() => {
  const header = {a:{dtype:'F32',shape:[1],data_offsets:[0,4]}, b:{dtype:'F32',shape:[1],data_offsets:[0,4]}};
  const wrap = h => { const data=Buffer.from(JSON.stringify(h)),size=Buffer.alloc(8); size.writeBigUInt64LE(BigInt(data.length)); return Buffer.concat([size,data,Buffer.alloc(8)]); };
  assert.throws(()=>parseSafetensors(wrap(header)),/overlap/);
  header.a.dtype='I8'; assert.throws(()=>parseSafetensors(wrap(header)),/dtype/);
  header.a.dtype='F32'; header.a.data_offsets=[0,3]; assert.throws(()=>parseSafetensors(wrap(header)),/offsets/);
});

test('BPE roundtrips multilingual UTF-8 and applies ranked merges',() => {
  const f=fixture(); const bpe=new ByteBPE(f.tokenizer);
  for (const text of ["Hello world!", "Oluganda — 日本語 😀", "don't 12\nx"]) assert.equal(bpe.decode(bpe.encode(text)),text);
  f.tokenizer.model.vocab['ab']=257; f.tokenizer.model.merges=['a b'];
  const merged=new ByteBPE(f.tokenizer); assert.deepEqual(merged.encode('ab'),[257]);
  assert.equal(merged.decode([257]),'ab');
  assert.deepEqual(bpe.encode('<eos>',true),[256]);
  assert.notDeepEqual(bpe.encode('<eos>',false),[256]);
  assert.equal(byteAlphabet().encode.size,256);
});

test('unsupported tokenizer normalization and arbitrary regex fail closed',() => {
  const f=fixture(); f.tokenizer.normalizer={type:'NFKC'};
  assert.throws(()=>new ByteBPE(f.tokenizer),/unnormalized/);
  f.tokenizer.normalizer=null;
  f.tokenizer.pre_tokenizer={type:'Sequence',pretokenizers:[{type:'Split',pattern:{Regex:'(a+)+$'},behavior:'Isolated'}, {type:'ByteLevel'}]};
  assert.throws(()=>new ByteBPE(f.tokenizer),/splitting rule/);
});

for (const family of ['gpt_neo','qwen2','llama']) {
  test(`${family}: real transformer steps, cache, analytic final logits and generation`,async () => {
    const f=fixture(family),tokenizer=new ByteBPE(f.tokenizer),engine=new KeyoEngine(f.config,f.tensors,tokenizer);
    const cache=engine.cache(),logits=engine.forward(97,cache);
    const variance=family === 'gpt_neo' ? 1.25 : 7.5;
    const expected=family === 'gpt_neo' ? 4/Math.sqrt(variance+1e-5) : 4/Math.sqrt(variance+1e-5);
    assert.ok(Math.abs(logits[97]-expected)<1e-5);
    assert.equal(cache.position,1); assert.equal(cache.blocks[0].keys.length,1);
    assert.equal(cache.blocks[0].keys[0].length,family === 'gpt_neo' ? 4 : 2);
    const events=[];
    for await (const event of engine.generate('x',{maxTokens:3})) events.push(event);
    assert.equal(events.filter(e=>e.type==='token').map(e=>e.text).join(''),'aaa');
    assert.deepEqual(events.at(-1).usage,{prompt_tokens:1,completion_tokens:3,total_tokens:4});
  });
}

test('context, variants, missing tensors, cancellation and options fail explicitly',async () => {
  const f=fixture(),engine=new KeyoEngine(f.config,f.tensors,new ByteBPE(f.tokenizer));
  const run=async (prompt,options) => { for await(const event of engine.generate(prompt,options)) {} };
  await assert.rejects(run('x',{maxTokens:0}),/options/);
  await assert.rejects(run('a'.repeat(63),{maxTokens:2}),/context/);
  await assert.rejects(run('x',{cancelled:()=>true}),/cancelled/);
  await assert.rejects(run('x',{deadlineMs:-1}),/time limit/);
  assert.throws(()=>engine.chatPrompt([{role:'user',content:'hello'}]),/no supported chat template/);
  assert.throws(()=>new KeyoEngine({...f.config,rope_scaling:{}},f.tensors,new ByteBPE(f.tokenizer)),/variant/);
  f.tensors.delete('transformer.wte.weight');
  assert.throws(()=>new KeyoEngine(f.config,f.tensors,new ByteBPE(f.tokenizer)),/tensor/);
});

test('supported ChatML and Llama header templates and control-token rejection',() => {
  for (const family of ['qwen2','llama']) {
    const f=fixture(family);
    const special=family==='qwen2' ? ['<|im_start|>','<|im_end|>'] : ['<|begin_of_text|>','<|start_header_id|>','<|end_header_id|>','<|eot_id|>'];
    f.tokenizer.added_tokens.push(...special.map((content,i)=>({content,id:300+i,special:true})));
    const engine=new KeyoEngine(f.config,f.tensors,new ByteBPE(f.tokenizer));
    assert.match(engine.chatPrompt([{role:'user',content:'Hello'}]),/assistant/);
    assert.throws(()=>engine.chatPrompt([{role:'user',content:special[0]}]),/control tokens/);
  }
});
