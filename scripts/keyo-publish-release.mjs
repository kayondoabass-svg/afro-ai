// Explicit operator command. Credentials stay in the environment and never in
// exported files, remote URLs, Git config or logs. Existing tags are immutable.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {KEYO_VERSION} from '../packages/keyo-studio/src/version.mjs';
import {uploadFiles} from '@huggingface/hub';
const root=process.cwd(),version=KEYO_VERSION;
if(!process.argv.includes('--execute'))throw new Error('Use --execute only after reviewing the export and verifying this release.');
if(!process.env.GITHUB_TOKEN||!process.env.HF_TOKEN)throw new Error('Existing GitHub and Hugging Face credentials are required.');
const publication=path.join(root,'generated-artifacts/keyo-publication',version);
const manifest=JSON.parse(await fs.readFile(path.join(publication,'manifest.json'),'utf8'));
if(manifest.version!==version||manifest.includesPrivatePlatform!==false||manifest.includesWeights!==false)throw new Error('Unsafe publication manifest.');
const api='https://api.github.com/repos/kayondoabass-svg/keyo-studio';
const headers={Authorization:`Bearer ${process.env.GITHUB_TOKEN}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
async function gh(url,options={}) {
  const r=await fetch(url,{...options,headers:{...headers,...options.headers}});
  if(!r.ok)throw new Error(`GitHub request failed: HTTP ${r.status}`);
  return r.status===204?null:r.json();
}
const exists=await fetch(`${api}/git/ref/tags/v${version}`,{headers});
if(exists.status!==404)throw new Error(exists.ok?'Release tag already exists; immutable release will not be overwritten.':`Cannot verify tag absence: HTTP ${exists.status}`);
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'keyo-publish-'));
try {
  const askpass=path.join(temp,'askpass.sh');
  await fs.writeFile(askpass,'#!/bin/sh\ncase "$1" in *Username*) printf "%s" x-access-token;; *) printf "%s" "$GITHUB_TOKEN";; esac\n',{mode:0o700});
  const env={...process.env,GIT_ASKPASS:askpass,GIT_TERMINAL_PROMPT:'0'};
  const checkout=path.join(temp,'keyo-studio');
  const git=(args,cwd=checkout)=>execFileSync('git',args,{cwd,env,stdio:['ignore','pipe','pipe'],timeout:120000});
  git(['clone','--depth','1','https://github.com/kayondoabass-svg/keyo-studio.git',checkout],temp);
  for(const name of [...manifest.githubFiles,'.gitignore']) {
    if(typeof name!=='string'||path.isAbsolute(name)||name.split('/').includes('..')||name.includes('node_modules')||name.startsWith('.github/workflows/'))throw new Error('Unexpected GitHub export path.');
    const source=path.join(publication,'github',name),destination=path.join(checkout,name);
    if(!(await fs.lstat(source)).isFile())throw new Error('Non-regular GitHub export file.');
    await fs.mkdir(path.dirname(destination),{recursive:true});await fs.copyFile(source,destination);
  }
  git(['add','--all']);
  git(['-c','user.name=KEYO release','-c','user.email=release@users.noreply.github.com','commit','-m',`KEYO Studio ${version}: portable owned-engine Android alpha`]);
  git(['tag',`v${version}`]);
  git(['push','origin','HEAD:main',`refs/tags/v${version}`]);
  const release=await gh(`${api}/releases`,{method:'POST',body:JSON.stringify({
    tag_name:`v${version}`,name:`KEYO Studio ${version} — portable CPU / Android development alpha`,prerelease:true,draft:true,
    body:await fs.readFile(path.join(root,`dist/keyo-studio/KEYO-Studio-${version}-release-notes.md`),'utf8'),
  })});
  const assets=path.join(publication,'release');
  const uploaded=[];
  for(const name of await fs.readdir(assets)) {
    const bytes=await fs.readFile(path.join(assets,name));
    await gh(`${release.upload_url.split('{')[0]}?name=${encodeURIComponent(name)}`,{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:bytes});
    uploaded.push({name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
  }
  // Hugging Face commit API: only the reviewed static app and identical release
  // bytes. Existing desktop archives are deliberately left untouched.
  const operations=[{key:'header',value:{summary:`KEYO portable ${version}: owned CPU engine and Android development release`}}];
  async function collect(directory,prefix='') {
    for(const entry of await fs.readdir(directory,{withFileTypes:true})) {
      if(entry.isSymbolicLink())throw new Error('Symlink refused in HF export.');
      const name=prefix+entry.name;
      if(entry.isDirectory())await collect(path.join(directory,entry.name),name+'/');
      else operations.push({key:'file',value:{content:(await fs.readFile(path.join(directory,entry.name))).toString('base64'),path:name,encoding:'base64'}});
    }
  }
  await collect(path.join(publication,'huggingface'));
  for(const file of uploaded) {
    const content=(await fs.readFile(path.join(assets,file.name))).toString('base64');
    const existing=operations.find(op=>op.key==='file'&&op.value.path===file.name);
    if(existing){if(existing.value.content!==content)throw new Error('Mirror bytes disagree before HF publication.');}
    else operations.push({key:'file',value:{content,path:file.name,encoding:'base64'}});
  }
  const hf=await uploadFiles({
    repo:{type:'space',name:'kayondoabass/KEYO-Studio'},accessToken:process.env.HF_TOKEN,
    commitTitle:`KEYO portable ${version}: own CPU engine and Android development release`,
    files:operations.filter(op=>op.key==='file').map(op=>({path:op.value.path,content:new Blob([Buffer.from(op.value.content,'base64')])})),
  });
  await gh(`${api}/releases/${release.id}`,{method:'PATCH',body:JSON.stringify({draft:false})});
  const receipt={version,githubRelease:release.html_url,githubCommit:git(['rev-parse','HEAD']).toString().trim(),huggingFace:hf,assets:uploaded};
  await fs.writeFile(path.join(publication,'publication-receipt.json'),JSON.stringify(receipt,null,2));
  console.log(JSON.stringify({version,githubRelease:release.html_url,huggingFacePublished:true,assets:uploaded.map(a=>({name:a.name,bytes:a.bytes,sha256:a.sha256}))},null,2));
} finally {await fs.rm(temp,{recursive:true,force:true});}
