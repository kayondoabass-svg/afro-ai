// Official pinned Electron runtime + our owned CPU engine. Cross-builds are
// developer previews: a Mac must finish ad-hoc signing; Apple notarization is separate.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const run=promisify(execFile),require=createRequire(import.meta.url);
const root=fileURLToPath(new URL('..',import.meta.url));
const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
const electron=require('electron/package.json'),checksums=require('electron/checksums.json');
const arch=process.argv[3]??process.arch;
if(!['arm64','x64'].includes(arch))throw new Error('Choose arm64 (Apple Silicon) or x64 (Intel).');
const output=path.resolve(process.argv[2]??path.join(os.tmpdir(),'keyo-desktop-releases'));
await fs.mkdir(output,{recursive:true});
const name=`KEYO-Studio-${pkg.version}-darwin-${arch}`,directory=path.join(output,name);
await fs.mkdir(directory); // No overwriting an existing release.
const archiveName=`electron-v${electron.version}-darwin-${arch}.zip`;
const expected=checksums[archiveName];
if(!/^[a-f0-9]{64}$/.test(expected??''))throw new Error('Missing pinned official runtime checksum.');
const runtime=path.join(directory,archiveName),handle=await fs.open(runtime,'wx',0o600);
try{
  const response=await fetch(`https://github.com/electron/electron/releases/download/v${electron.version}/${archiveName}`);
  if(!response.ok||!response.body)throw new Error(`Runtime download failed: HTTP ${response.status}`);
  const hash=createHash('sha256');let bytes=0;
  for await(const chunk of response.body){
    bytes+=chunk.length;if(bytes>350*1024**2)throw new Error('Runtime exceeds size budget.');
    hash.update(chunk);let offset=0;
    while(offset<chunk.length){
      const result=await handle.write(chunk,offset,chunk.length-offset);
      if(!result.bytesWritten)throw new Error('Runtime write stalled.');
      offset+=result.bytesWritten;
    }
  }
  if(hash.digest('hex')!==expected)throw new Error('Official runtime checksum mismatch.');
}finally{await handle.close();}
const entries=(await run('unzip',['-Z1',runtime],{maxBuffer:2*1024**2})).stdout.trim().split('\n');
if(entries.some(p=>p.startsWith('/')||p.includes('\\')||p.includes(':')||p.split('/').includes('..')))
  throw new Error('Unsafe runtime archive paths.');
await run('unzip',['-q',runtime,'-d',directory],{timeout:120000});await fs.unlink(runtime);
// The official framework contains required symlinks; keep them, but reject escape links.
async function verifyLinks(folder){
  for(const entry of await fs.readdir(folder,{withFileTypes:true})){
    const file=path.join(folder,entry.name);
    if(entry.isSymbolicLink()){
      const target=await fs.realpath(file);
      if(!target.startsWith(directory+path.sep))throw new Error('Escaping runtime symlink.');
    }else if(entry.isDirectory())await verifyLinks(file);
  }
}
await verifyLinks(directory);
const app=path.join(directory,'KEYO Studio.app');
await fs.rename(path.join(directory,'Electron.app'),app);
const contents=path.join(app,'Contents'),resources=path.join(contents,'Resources');
await fs.rm(path.join(resources,'default_app.asar'),{force:true});
const destination=path.join(resources,'app');await fs.mkdir(destination);
async function copySource(folder,prefix=''){
  for(const entry of await fs.readdir(folder,{withFileTypes:true})){
    const relative=prefix+entry.name;
    if(entry.isSymbolicLink())throw new Error(`Source symlink refused: ${relative}`);
    if(entry.isDirectory()&&['src','native','desktop','desktop/renderer','bin'].includes(relative))
      await copySource(path.join(folder,entry.name),relative+'/');
    else if(entry.isFile()&&(['package.json','LICENSE','README.md','CONTRIBUTING.md','SECURITY.md','bin/keyo.mjs','bin/validate.mjs'].includes(relative)||
      /^src\/[a-z-]+\.mjs$/.test(relative)||['native/kernels.cc','native/build.mjs'].includes(relative)||
      /^desktop\/[a-z-]+\.(?:mjs|cjs|md)$/.test(relative)||/^desktop\/renderer\/[a-z-]+\.(?:html|css|mjs|svg)$/.test(relative))){
      const target=path.join(destination,relative);await fs.mkdir(path.dirname(target),{recursive:true});
      await fs.copyFile(path.join(folder,entry.name),target);
    }
  }
}
await copySource(root);
const plist=path.join(contents,'Info.plist');
let info=await fs.readFile(plist,'utf8');
for(const [key,value]of [['CFBundleName','KEYO Studio'],['CFBundleDisplayName','KEYO Studio'],['CFBundleIdentifier','com.keyotechnologies.keyostudio'],['CFBundleShortVersionString','0.1.0']]){
  const pattern=new RegExp(`(<key>${key}</key>\\s*<string>)[^<]*(</string>)`);
  if(!pattern.test(info)&&key!=='CFBundleDisplayName')throw new Error(`Missing bundle field: ${key}`);
  info=pattern.test(info)?info.replace(pattern,`$1${value}$2`):info.replace('</dict>',`<key>${key}</key><string>${value}</string></dict>`);
}
await fs.writeFile(plist,info);
const minimumMacOS=info.match(/<key>LSMinimumSystemVersion<\/key>\s*<string>([^<]+)<\/string>/)?.[1]??null;
const finish=`#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
if [ "$(uname -s)" != Darwin ]; then echo "Run this on a Mac only."; exit 1; fi
echo "KEYO developer build: applying local ad-hoc signatures. This is NOT Apple notarization."
/usr/bin/codesign --force --deep --sign - --timestamp=none "KEYO Studio.app"
/usr/bin/codesign --verify --deep --strict "KEYO Studio.app"
echo "Local signing complete. Open KEYO Studio.app. If macOS blocks it, report the exact warning; do not disable Gatekeeper."
`;
await fs.writeFile(path.join(directory,'finish-on-mac.command'),finish,{mode:0o755});
await fs.writeFile(path.join(directory,'READ-ME-FIRST.txt'),
  `KEYO Studio ${pkg.version} — macOS ${arch} developer preview.\n`+
  `Minimum runtime macOS: ${minimumMacOS??'check official Electron requirements'}.\n`+
  'Download the correct architecture (About This Mac: Apple chip = arm64, Intel = x64).\n'+
  'Extract the entire ZIP. Cross-built archives must be finished on a Mac:\n'+
  'In Terminal, cd into this extracted folder and run: bash finish-on-mac.command\n'+
  'This locally ad-hoc signs the bundle. It does not notarize it or bypass Gatekeeper.\n'+
  'Open KEYO Studio.app. Keep this bundle intact. If blocked, report the warning.\n'+
  'Never disable security protections or remove quarantine to run this package.\n'+
  'Model library > Qwen2.5 0.5B Instruct > Download model (licence confirmation, about 1 GB) > Load downloaded model > new conversation.\n'+
  'Try: 2+2=? Reply with just the number. After downloading/loading, generation works offline without an account or AI API credits.\n'+
  'macOS GUI execution is unverified. No iPhone/iPad application is included. No separate Node.js installation is required for this desktop bundle.\n');
let adHocSigned=false;
if(process.platform==='darwin'){
  await run('bash',[path.join(directory,'finish-on-mac.command')],{timeout:180000});
  adHocSigned=true;
}
const filename=name+'.zip',archive=path.join(output,filename);
// -y stores framework symlinks as symlinks, not flattened duplicate binaries.
await run('zip',['-q','-9','-r','-y',archive,name],{cwd:output,timeout:300000});
const hash=createHash('sha256');for await(const chunk of createReadStream(archive))hash.update(chunk);
const release={version:pkg.version,platform:'darwin',architecture:arch,filename,
  bytes:(await fs.stat(archive)).size,sha256:hash.digest('hex'),electronVersion:electron.version,
  officialRuntimeSha256:expected,minimumMacOS,adHocSigned,developerIdSigned:false,notarized:false,
  executionVerified:false,requiresMacSigning:!adHocSigned,modelsIncluded:false,engine:'keyo-cpu',cpuKernel:'javascript',
  status:adHocSigned?'ad-hoc developer build; macOS GUI unverified':'cross-built preview; finish signing on a Mac; macOS GUI unverified'};
await fs.writeFile(path.join(output,`macos-${arch}-release.json`),JSON.stringify(release,null,2),{flag:'wx'});
console.log(JSON.stringify(release,null,2));
