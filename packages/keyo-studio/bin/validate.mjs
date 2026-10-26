#!/usr/bin/env node
import fs from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { KeyoEngine } from '../src/engine.mjs';

// Local-only smoke/benchmark tool, not a claim of comprehensive certification.
const [directory, reportFile, kernel = 'javascript', parityFlag] = process.argv.slice(2);
if (process.argv.length > 6 || !directory || !reportFile || !['javascript','native'].includes(kernel) ||
    (parityFlag !== undefined && parityFlag !== '--parity'))
  throw new Error('Usage: node bin/validate.mjs MODEL_DIRECTORY NEW_REPORT.json [javascript|native] [--parity]');
try {
  await fs.lstat(reportFile);
  throw new Error('Report already exists; choose a new filename.');
} catch (error) { if (error.code !== 'ENOENT') throw error; }
const cases = [
  {id:'greeting', prompt:'Hello', accepts:text=>/^\s*(hello|hi\b|hey\b)/i.test(text)},
  {id:'basic-arithmetic', prompt:'2+2=? Reply with just the number.', accepts:text=>/^\s*4(?:\s|[.!]|$)/.test(text)},
];
const started=performance.now(), engine=await KeyoEngine.load(directory,{kernel});
const report={schema:1, scope:'Two short instruction smoke checks; not general model certification.',
  model:engine.info(), loadMs:performance.now()-started, parity:null, cases:[]};
try {
  if (parityFlag) {
    const reference=await KeyoEngine.load(directory,{kernel:'javascript'});
    try {
      const token=engine.tokenizer.encode('Hello')[0];
      let start=performance.now();
      const expected=reference.forward(token,reference.cache());
      const javascriptMs=performance.now()-start;
      start=performance.now();
      const actual=engine.forward(token,engine.cache());
      const selectedMs=performance.now()-start;
      let maxAbsoluteDelta=0;
      for(let i=0;i<expected.length;i++) {
        if (!Number.isFinite(expected[i]) || !Number.isFinite(actual[i]))
          throw new Error('Parity produced non-finite logits.');
        maxAbsoluteDelta=Math.max(maxAbsoluteDelta,Math.abs(expected[i]-actual[i]));
      }
      report.parity={tokensChecked:1,logitsChecked:expected.length,maxAbsoluteDelta,
        passed:maxAbsoluteDelta===0,javascriptMs,selectedMs};
    } finally {reference.close();}
  }
  for(const item of cases) {
    const start=performance.now();let text='',usage,firstTokenMs;
    try {
      const prompt=engine.chatPrompt([{role:'user',content:item.prompt}]);
      for await(const event of engine.generate(prompt,{chat:true,maxTokens:4,temperature:0})) {
        if(event.type==='token') {firstTokenMs??=performance.now()-start;text+=event.text;}
        if(event.type==='done') usage=event.usage;
      }
      report.cases.push({id:item.id,text,passed:item.accepts(text),firstTokenMs,
        elapsedMs:performance.now()-start,usage});
    } catch(error) {
      report.cases.push({id:item.id,passed:false,error:error.message,elapsedMs:performance.now()-start});
    }
  }
  report.passed=report.cases.every(item=>item.passed)&&(!report.parity||report.parity.passed);
  report.totalMs=performance.now()-started;
  report.peakRssBytes=process.resourceUsage().maxRSS*1024;
  await fs.writeFile(reportFile,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log(JSON.stringify(report,null,2));
  if(!report.passed) process.exitCode=1;
} finally {engine.close();}
