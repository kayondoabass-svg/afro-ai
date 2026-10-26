// Opt-in public checkpoint numerical/benchmark check, never part of npm test.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {KeyoEngine} from '../src/engine.mjs';
import {ByteBPE} from '../src/tokenizer.mjs';
import {loadPortableTensors} from '../src/portable-tensors.mjs';
const directory=path.resolve(process.argv[2]),output=path.resolve(process.argv[3]);
const config=JSON.parse(fs.readFileSync(path.join(directory,'config.json')));
const tokenizer=await ByteBPE.load(directory,config.model_type);
const prompt='Hello world',tokens=tokenizer.encode(prompt);
const fd=fs.openSync(path.join(directory,'model.safetensors'),'r');
const tensors=loadPortableTensors([{size:fs.fstatSync(fd).size,read:(bytes,offset)=>fs.readSync(fd,bytes,0,bytes.length,offset),close:()=>fs.closeSync(fd)}]);
const engine=new KeyoEngine(config,tensors,tokenizer),cache=engine.cache(),actual=[];
const start=performance.now();
for(const token of tokens)actual.push(Array.from(engine.forward(token,cache)));
const forwardMs=performance.now()-start;
execFileSync('python',[new URL('./public-reference.py',import.meta.url).pathname,directory,JSON.stringify(tokens),output+'.reference.json'],{env:{...process.env,OPENBLAS_NUM_THREADS:'1'},timeout:300000});
const expected=JSON.parse(fs.readFileSync(output+'.reference.json'));
let maxError=0,mismatches=0;
for(let i=0;i<actual.length;i++)for(let j=0;j<actual[i].length;j++){
  const error=Math.abs(actual[i][j]-expected[i][j]);maxError=Math.max(maxError,error);
  if(error>0.001+0.0001*Math.abs(expected[i][j]))mismatches++;
}
const events=[],generationStart=performance.now();
for await(const e of engine.generate(engine.chatPrompt([{role:'user',content:'Say hello.'}]),{chat:true,maxTokens:8,deadlineMs:300000}))events.push(e);
const report={model:config.model_type,prompt,tokens,vocab:config.vocab_size,reference:'independent NumPy full causal sequence',
  comparedLogits:tokens.length*config.vocab_size,maxAbsoluteError:maxError,mismatches,forwardMs,
  generationMs:performance.now()-generationStart,text:events.filter(e=>e.type==='token').map(e=>e.text).join(''),
  usage:events.at(-1).usage,memory:process.memoryUsage(),backend:'KEYO JS bounded reader; no WebGPU/WASM/integer quantization'};
engine.close();fs.writeFileSync(output,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(mismatches)process.exitCode=1;
