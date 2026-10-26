import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('public source includes native build inputs and local validation without bundling compiled binaries',async()=>{
  const pkg=JSON.parse(await fs.readFile(new URL('../package.json',import.meta.url),'utf8'));
  for (const file of ['native/kernels.cc','native/build.mjs']) {
    assert.ok(pkg.files.includes(file));
    assert.ok((await fs.readFile(new URL('../'+file,import.meta.url))).length>0);
  }
  assert.ok((await fs.readFile(new URL('../bin/validate.mjs',import.meta.url))).length>0);
  assert.ok(!pkg.files.includes('native/')&&!pkg.files.includes('native/generated/'));
});
