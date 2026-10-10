import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadDiskTensors } from '../src/disk-tensors.mjs';
import { KeyoEngine } from '../src/engine.mjs';
import { matvec, loadTensors } from '../src/tensors.mjs';
import { ByteBPE } from '../src/tokenizer.mjs';
import { fixture, safetensors } from './fixture.mjs';

test('disk-backed weights match resident transformer logits and release descriptors',async () => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'keyo-disk-'));
  try {
    for (const family of ['gpt_neo','qwen2','llama']) {
      const f=fixture(family), file=path.join(dir,'model.safetensors');
      await fs.writeFile(file,safetensors(f.tensors));
      const disk=loadDiskTensors(file);
      try {
        const a=new KeyoEngine(f.config,f.tensors,new ByteBPE(f.tokenizer));
        const b=new KeyoEngine(f.config,disk,new ByteBPE(f.tokenizer));
        const ac=a.cache(),bc=b.cache();
        for (const token of [97,98,99]) assert.deepEqual([...a.forward(token,ac)],[...b.forward(token,bc)]);
        assert.equal(b.info().storage,'disk');
        assert.equal(b.info().parameters,a.info().parameters);
        assert.equal(disk.scratchBytes,256*1024);
        let usage;
        for await (const event of b.generate('a')) if (event.type === 'done') usage=event.usage;
        assert.equal(usage.completion_tokens,4);
      } finally { disk.close(); disk.close(); }
      assert.throws(() => disk.get(family === 'gpt_neo' ? 'transformer.wte.weight' : 'model.embed_tokens.weight').row(0),/closed/);
    }
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
});

test('large loader dispatch and invalid/oversized data fail closed',async () => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'keyo-disk-'));
  const file=path.join(dir,'model.safetensors');
  try {
    const f=fixture();f.tensors.get('lm_head.weight').data[0]=NaN;
    await fs.writeFile(file,safetensors(f.tensors));
    assert.throws(()=>loadDiskTensors(file),/Non-finite/);
    await fs.writeFile(file,safetensors(fixture().tensors));
    await fs.truncate(file,257*1024**2);
    await assert.rejects(loadTensors(dir),/Unexpected bytes/);
    await fs.truncate(file,4*1024**3+1);
    await assert.rejects(loadTensors(dir),/4 GiB/);
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
});

test('disk decoding supports FP16 and BF16 without allocating decoded matrices',async () => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'keyo-disk-'));
  try {
    for (const dtype of ['F16','BF16']) {
      const header=Buffer.from(JSON.stringify({matrix:{dtype,shape:[2,2],data_offsets:[0,8]}}));
      const prefix=Buffer.alloc(8);prefix.writeBigUInt64LE(BigInt(header.length));
      const raw=Buffer.alloc(8), values=dtype==='F16'?[0x3c00,0x4000,0x4200,0x4400]:[0x3f80,0x4000,0x4040,0x4080];
      values.forEach((v,i)=>raw.writeUInt16LE(v,2*i));
      const file=path.join(dir,'model.safetensors');
      await fs.writeFile(file,Buffer.concat([prefix,header,raw]));
      const tensors=loadDiskTensors(file);
      try {
        const matrix=tensors.get('matrix');
        assert.equal(matrix.data,undefined);
        assert.deepEqual([...matrix.row(1)],[3,4]);
        assert.deepEqual([...matvec(matrix,[2,3])],[8,18]);
        assert.throws(()=>matvec(matrix,[1]),/shape/);
        assert.throws(()=>matrix.row(2),/row/);
        assert.throws(()=>matvec(matrix,[1,1],()=>{throw new Error('cancel');}),/cancel/);
      } finally { tensors.close(); }
    }
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
});

test('NFC normalization, exact literal tokens and modern default RoPE settings',() => {
  const f=fixture('qwen2');
  f.tokenizer.normalizer={type:'NFC'};
  f.tokenizer.added_tokens.push({id:257,content:'<tool_call>',special:false,normalized:false});
  const tokenizer=new ByteBPE(f.tokenizer);
  assert.deepEqual(tokenizer.encode('e\u0301'),tokenizer.encode('é'));
  assert.deepEqual(tokenizer.encode('<tool_call>'),[257]);
  assert.equal(tokenizer.decode([257]),'<tool_call>');
  assert.deepEqual(tokenizer.encode('<eos>',true),[256]);
  f.tokenizer.added_tokens[1].lstrip=true;
  assert.throws(()=>new ByteBPE(f.tokenizer),/matching flags/);
  f.config.rope_parameters={rope_type:'default',rope_theta:1000000};
  assert.throws(()=>new KeyoEngine(f.config,f.tensors,tokenizer),/Conflicting RoPE/);
  delete f.config.rope_theta;
  const engine=new KeyoEngine(f.config,f.tensors,tokenizer);
  assert.equal(engine.theta,1000000);
  f.config.rope_parameters.rope_type='yarn';
  assert.throws(()=>new KeyoEngine(f.config,f.tensors,tokenizer),/RoPE/);
});

test('matrix rows larger than the scratch buffer are streamed in parts',async () => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'keyo-disk-'));
  try {
    const cols=70000,data=Float32Array.from({length:cols*2},(_,i)=>i<cols?1:2);
    const file=path.join(dir,'model.safetensors');
    await fs.writeFile(file,safetensors(new Map([['matrix',{shape:[2,cols],data}]])));
    const tensors=loadDiskTensors(file);
    try {
      assert.deepEqual([...matvec(tensors.get('matrix'),new Float32Array(cols).fill(1))],[cols,cols*2]);
      assert.equal(tensors.get('matrix').row(1)[cols-1],2);
    } finally { tensors.close(); }
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
});
