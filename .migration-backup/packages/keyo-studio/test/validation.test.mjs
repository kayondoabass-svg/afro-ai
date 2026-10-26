import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeFixture } from './fixture.mjs';

test('local validation reports failed checks honestly and never overwrites existing reports',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'keyo-validation-'));
  const script=fileURLToPath(new URL('../bin/validate.mjs',import.meta.url));
  try {
    await writeFixture(path.join(dir,'model'));
    const reportFile=path.join(dir,'report.json');
    const result=spawnSync(process.execPath,[script,path.join(dir,'model'),reportFile],{encoding:'utf8'});
    assert.equal(result.status,1);
    const bytes=await fs.readFile(reportFile,'utf8'),report=JSON.parse(bytes);
    assert.equal(report.passed,false);
    assert.equal(report.cases.length,2);
    assert.ok(report.cases.every(c=>c.passed===false&&c.error.includes('chat template')));
    assert.ok(report.peakRssBytes>0);
    if(process.platform!=='win32')assert.equal((await fs.stat(reportFile)).mode&0o777,0o600);
    const again=spawnSync(process.execPath,[script,path.join(dir,'missing-model'),reportFile],{encoding:'utf8'});
    assert.equal(again.status,1);
    assert.match(again.stderr,/Report already exists/);
    assert.equal(await fs.readFile(reportFile,'utf8'),bytes);
  } finally {await fs.rm(dir,{recursive:true,force:true});}
});
