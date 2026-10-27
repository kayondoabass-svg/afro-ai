import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
if(!process.argv.includes('--execute'))throw new Error('Explicit --execute required.');
if(!process.env.GITHUB_TOKEN)throw new Error('Saved GitHub credential unavailable.');
const check=await fetch('https://api.github.com/user',{headers:{Authorization:`Bearer ${process.env.GITHUB_TOKEN}`}});
if(!check.ok)throw new Error(`GitHub authorization failed: HTTP ${check.status}.`);
const scopes=check.headers.get('x-oauth-scopes');
if(scopes&&!scopes.split(',').map(s=>s.trim()).includes('workflow'))
  throw new Error('The saved GitHub credential has no workflow scope. Do not remove or rewrite CI to bypass this permission.');
const directory=await fs.mkdtemp(path.join(os.tmpdir(),'keyo-platform-push-'));
try {
  const askpass=path.join(directory,'askpass.sh');
  await fs.writeFile(askpass,'#!/bin/sh\ncase "$1" in *Username*) printf "%s" x-access-token;; *) printf "%s" "$GITHUB_TOKEN";; esac\n',{mode:0o700});
  const code=await new Promise((resolve,reject)=>{
    // The workspace's broad GitHub proxy rewrite uses a different credential.
    // An exact, process-local rewrite keeps this explicitly authorized push direct.
    const repository='https://github.com/kayondoabass-svg/afro-ai.git';
    const child=spawn('git',['-c','credential.helper=','-c',`url.${repository}.insteadOf=${repository}`,'push',repository,'HEAD:main'],{
      env:{...process.env,GIT_ASKPASS:askpass,GIT_TERMINAL_PROMPT:'0'},stdio:'inherit'});
    child.on('close',resolve);child.on('error',reject);
  });
  if(code!==0)throw new Error(`Platform push failed: exit ${code}.`);
}finally{await fs.rm(directory,{recursive:true,force:true});}
