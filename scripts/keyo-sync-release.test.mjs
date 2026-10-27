import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {publishedAssets,publishedVersion,syncPublishedKeyoRelease} from './keyo-sync-release.mjs';

test('published mirror rejects corrupt bytes before changing build outputs',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'keyo-mirror-'));
  const directory=path.join(root,'dist/keyo-studio');
  await fs.mkdir(directory,{recursive:true});
  const original=JSON.stringify({version:publishedVersion});
  await fs.writeFile(path.join(directory,'release.json'),original);
  try {
    await assert.rejects(syncPublishedKeyoRelease({root,fetcher:async()=>new Response('corrupt')}),/checksum mismatch/);
    assert.equal(await fs.readFile(path.join(directory,'release.json'),'utf8'),original);
    assert.deepEqual(await fs.readdir(directory),['release.json']);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('published mirror refuses a mismatched build version before downloading',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'keyo-mirror-'));
  await fs.mkdir(path.join(root,'dist/keyo-studio'),{recursive:true});
  await fs.writeFile(path.join(root,'dist/keyo-studio/release.json'),JSON.stringify({version:'wrong'}));
  try {
    await assert.rejects(syncPublishedKeyoRelease({root,fetcher:()=>{throw new Error('must not fetch');}}),/version mismatch/);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('all pinned release asset hashes are well formed and unique',()=>{
  assert.equal(Object.keys(publishedAssets).length,6);
  for(const [name,hash] of Object.entries(publishedAssets)){
    assert.match(name,/^[a-zA-Z0-9_.-]+$/);
    assert.ok(name.includes(publishedVersion));
    assert.match(hash,/^[a-f0-9]{64}$/);
  }
  assert.equal(new Set(Object.values(publishedAssets)).size,6);
});
