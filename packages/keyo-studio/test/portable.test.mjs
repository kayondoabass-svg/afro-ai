import test from 'node:test';
import assert from 'node:assert/strict';
import { KeyoEngine } from '../src/engine.mjs';
import { ByteBPE } from '../src/tokenizer.mjs';
import { loadPortableTensors, SCRATCH_BYTES } from '../src/portable-tensors.mjs';
import { fixture, safetensors } from './fixture.mjs';

const reader=bytes=>({size:bytes.length,read(target,offset){
  assert.ok(target.length<=Math.max(SCRATCH_BYTES,1024*1024));
  target.set(bytes.subarray(offset,offset+target.length));return target.length;
},close(){}});
for(const family of ['gpt_neo','qwen2','llama'])test(`portable bounded tensor reader: ${family} full vocabulary parity`,()=>{
  const f=fixture(family),tokenizer=new ByteBPE(f.tokenizer);
  const expected=new KeyoEngine(f.config,f.tensors,tokenizer),tensors=loadPortableTensors([reader(safetensors(f.tensors))]);
  const actual=new KeyoEngine(f.config,tensors,tokenizer),a=actual.cache(),b=expected.cache();
  for(const token of [97,98,99])assert.deepEqual([...actual.forward(token,a)],[...expected.forward(token,b)]);
  actual.close();assert.throws(()=>actual.forward(97,actual.cache()),/closed/);
});
test('portable reader rejects corrupt ranges, truncation, unsupported dtype and NaNs',()=>{
  const f=fixture(),bytes=safetensors(f.tensors);
  assert.throws(()=>loadPortableTensors([reader(bytes.subarray(0,bytes.length-4))]),/offsets|data/);
  const broken=Buffer.from(bytes);broken.writeBigUInt64LE(99999999n,0);
  assert.throws(()=>loadPortableTensors([reader(broken)]),/header/);
  f.tensors.get('transformer.ln_f.weight').data[0]=NaN;
  assert.throws(()=>loadPortableTensors([reader(safetensors(f.tensors))]),/Non-finite/);
});
test('Smol digit adapter splits each Unicode number before GPT byte BPE',()=>{
  const f=fixture();f.tokenizer.pre_tokenizer={type:'Sequence',pretokenizers:[
    {type:'Digits',individual_digits:true},{type:'ByteLevel',add_prefix_space:false}]};
  f.tokenizer.model.vocab['12']=257;f.tokenizer.model.merges=['1 2'];
  const tokenizer=new ByteBPE(f.tokenizer,'llama');
  assert.deepEqual(tokenizer.encode('12'),[49,50]);
  assert.equal(tokenizer.decode(tokenizer.encode('é 12 ١٢ 日本 😀')),'é 12 ١٢ 日本 😀');
});
