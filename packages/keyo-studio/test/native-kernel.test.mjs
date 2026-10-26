import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { cpuKernel } from '../src/cpu-kernel.mjs';
import { loadDiskTensors } from '../src/disk-tensors.mjs';
import { matvec } from '../src/tensors.mjs';
import { fixture, safetensors } from './fixture.mjs';
import { KeyoEngine } from '../src/engine.mjs';
import { ByteBPE } from '../src/tokenizer.mjs';

const built=existsSync(new URL('../native/generated/keyo-kernels.node',import.meta.url));
test('CPU selection rejects unknown kernels rather than silently changing modes',()=>{
  assert.equal(cpuKernel('javascript'),null);
  assert.throws(()=>cpuKernel('external'),/CPU kernel/);
  if (!built) assert.throws(()=>cpuKernel('native'),/unavailable/);
});

test('native block arithmetic matches scalar F32/FP16/BF16 and validates arguments',{skip:!built},()=>{
  const kernel=cpuKernel('native'),vector=Float32Array.from([0.25,-2,3,0.125]);
  for (const [dtype,raw,decoded] of [
    ['F32',Float32Array.from([1,-2,0.5,4,-1,2,3,0.25]),[1,-2,0.5,4,-1,2,3,0.25]],
    ['F16',Uint16Array.from([0x3c00,0xc000,0x3800,0x4400,0xbc00,0x4000,0x4200,0x3400]),[1,-2,0.5,4,-1,2,3,0.25]],
    ['BF16',Uint16Array.from([0x3f80,0xc000,0x3f00,0x4080,0xbf80,0x4000,0x4040,0x3e80]),[1,-2,0.5,4,-1,2,3,0.25]],
  ]) assert.deepEqual(kernel.multiply(raw,vector,2,dtype),
    matvec({shape:[2,4],data:Float32Array.from(decoded)},vector));
  assert.throws(()=>kernel.multiply(new Uint16Array(2),vector,1,'F16'),/Invalid native/);
  assert.throws(()=>kernel.multiply(new Uint16Array(4),vector,1.5,'F16'),/Invalid native/);
  assert.throws(()=>kernel.multiply(new Uint16Array(4),vector,1,'I8'),/Invalid native/);
});

test('nonzero full-transformer native logits exactly match JavaScript for all three families',{skip:!built},async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'keyo-native-'));
  try {
    for (const family of ['gpt_neo','qwen2','llama']) {
      const f=fixture(family);
      // Unlike the smoke fixture, exercise every projection, bias and gated MLP.
      for (const [name,tensor]of f.tensors) if (!name.includes('norm') && !name.includes('ln_'))
        tensor.data=Float32Array.from(tensor.data,(_,i)=>Math.sin(i*1.7+name.length)*0.15);
      const file=path.join(dir,'model.safetensors');await fs.writeFile(file,safetensors(f.tensors));
      const native=loadDiskTensors(file,{kernel:cpuKernel('native')});
      const js=loadDiskTensors(file);
      try {
        const a=new KeyoEngine(f.config,js,new ByteBPE(f.tokenizer));
        const b=new KeyoEngine(f.config,native,new ByteBPE(f.tokenizer)),ac=a.cache(),bc=b.cache();
        for (const token of [97,98,99,100]) assert.deepEqual(a.forward(token,ac),b.forward(token,bc));
      } finally { native.close();js.close(); }
    }
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
});
