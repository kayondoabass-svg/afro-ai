import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fixture, safetensors } from './fixture.mjs';
import { loadTensors } from '../src/tensors.mjs';
import { KeyoEngine } from '../src/engine.mjs';
import { ByteBPE } from '../src/tokenizer.mjs';

async function shardFixture(directory) {
  const f=fixture('qwen2'), entries=[...f.tensors], weight_map={};
  const halves=[entries.slice(0,6),entries.slice(6)];
  for (let i=0;i<halves.length;i++) {
    const file=`model-0000${i+1}.safetensors`;
    for (const [name] of halves[i]) weight_map[name]=file;
    await fs.writeFile(path.join(directory,file),safetensors(new Map(halves[i])));
  }
  const total_size=entries.reduce((n,[,t])=>n+t.data.byteLength,0);
  const index={metadata:{total_size},weight_map};
  await fs.writeFile(path.join(directory,'model.safetensors.index.json'),JSON.stringify(index));
  return {f,index};
}

test('indexed shards match single-file logits across sequential attention steps',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'keyo-shards-'));
  try {
    const {f}=await shardFixture(dir), tensors=await loadTensors(dir);
    try {
      const a=new KeyoEngine(f.config,f.tensors,new ByteBPE(f.tokenizer));
      const b=new KeyoEngine(f.config,tensors,new ByteBPE(f.tokenizer)), ac=a.cache(),bc=b.cache();
      for (const token of [97,98,99]) assert.deepEqual(a.forward(token,ac),b.forward(token,bc));
      assert.equal(b.info().shard_count,2);
      assert.equal(tensors.scratchBytes,2*256*1024);
    } finally { tensors.close(); tensors.close(); }
    await fs.writeFile(path.join(dir,'model.safetensors'),safetensors(f.tensors));
    await assert.rejects(loadTensors(dir),/Ambiguous/);
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
});

test('shard indexes reject unsafe paths, mismatches, missing tensors and false size declarations',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'keyo-shards-'));
  try {
    const {index}=await shardFixture(dir), file=path.join(dir,'model.safetensors.index.json');
    for (const unsafe of ['../escape.safetensors','/escape.safetensors','C:\\escape.safetensors','dir/file.safetensors']) {
      const changed=structuredClone(index);changed.weight_map[Object.keys(changed.weight_map)[0]]=unsafe;
      await fs.writeFile(file,JSON.stringify(changed));
      await assert.rejects(loadTensors(dir),/safe safetensors/);
    }
    for (const change of [
      x=>x.metadata.total_size++,
      x=>x.weight_map.missing='model-00001.safetensors',
      x=>delete x.weight_map[Object.keys(x.weight_map)[0]],
      x=>x.weight_map[Object.keys(x.weight_map)[0]]='model-00002.safetensors',
      x=>x.metadata.total_size=33*1024**3,
    ]) {
      const changed=structuredClone(index);change(changed);
      await fs.writeFile(file,JSON.stringify(changed));
      await assert.rejects(loadTensors(dir),/size|mismatch|missing|budget/);
    }
    await fs.writeFile(file,JSON.stringify(index));
    await fs.rm(path.join(dir,'model-00002.safetensors'));
    await assert.rejects(loadTensors(dir),/ENOENT/);
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
});
