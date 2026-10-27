import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {releaseIdentity, releaseEnvironment} from './keyo-release-identity.mjs';

test('release attribution uses the verified owner ID and login', () => {
  assert.deepEqual(releaseIdentity({login:'example-owner',id:123},'example-owner'), {
    name:'example-owner',email:'123+example-owner@users.noreply.github.com',
  });
});

test('unrelated accounts and missing account IDs cannot publish as the owner', () => {
  for (const account of [null,{login:'Release',id:1},{login:'example-owner'},
    {login:'example-owner',id:0},{login:'example-owner',id:'123'}]) {
    assert.throws(() => releaseIdentity(account,'example-owner'),/authenticated repository owner/);
  }
});

test('both actual Git authorship fields override stale environment and Git config', async () => {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'keyo-identity-test-'));
  const identity=releaseIdentity({login:'example-owner',id:123},'example-owner');
  const env=releaseEnvironment({
    ...process.env,GIT_AUTHOR_NAME:'Wrong',GIT_AUTHOR_EMAIL:'wrong@example.invalid',
    GIT_COMMITTER_NAME:'Wrong',GIT_COMMITTER_EMAIL:'wrong@example.invalid',
  },identity);
  const git=(args)=>execFileSync('git',args,{cwd:directory,env,encoding:'utf8',stdio:['ignore','pipe','pipe']});
  try {
    git(['init','--quiet']);
    git(['-c','user.name=Wrong','-c','user.email=wrong@example.invalid',
      '-c','commit.gpgsign=false','commit','--allow-empty','-m','Attribution test']);
    assert.equal(git(['log','-1','--format=%an|%ae|%cn|%ce']).trim(),
      `${identity.name}|${identity.email}|${identity.name}|${identity.email}`);
  } finally {
    await fs.rm(directory,{recursive:true,force:true});
  }
});
