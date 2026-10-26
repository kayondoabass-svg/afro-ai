// Cross-package the official Electron runtime; this is not a Windows
// execution or signing certificate. The resulting portable app is unsigned.
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
const output=path.resolve(process.argv[2]??path.join(os.tmpdir(),'keyo-desktop-releases'));
await fs.mkdir(output,{recursive:true});
const name=`KEYO-Studio-${pkg.version}-win32-x64`,directory=path.join(output,name);
await fs.mkdir(directory);
const archiveName=`electron-v${electron.version}-win32-x64.zip`;
const expected=checksums[archiveName];if(!/^[a-f0-9]{64}$/.test(expected??''))throw new Error('Missing pinned official Electron checksum.');
const runtime=path.join(directory,archiveName),h=await fs.open(runtime,'wx',0o600);
try{
  const r=await fetch(`https://github.com/electron/electron/releases/download/v${electron.version}/${archiveName}`);
  if(!r.ok||!r.body)throw new Error(`Official runtime download failed: HTTP ${r.status}`);
  let bytes=0;const hash=createHash('sha256');
  for await(const chunk of r.body){
    bytes+=chunk.length;if(bytes>300*1024**2)throw new Error('Runtime exceeds package size budget.');
    hash.update(chunk);let offset=0;
    while(offset<chunk.length){const result=await h.write(chunk,offset,chunk.length-offset);if(!result.bytesWritten)throw new Error('Runtime write stalled.');offset+=result.bytesWritten;}
  }
  if(hash.digest('hex')!==expected)throw new Error('Official runtime checksum mismatch.');
}finally{await h.close();}
const listing=(await run('unzip',['-Z1',runtime],{maxBuffer:2*1024**2})).stdout.trim().split('\n');
if(listing.some(p=>p.startsWith('/')||p.includes('\\')||p.split('/').includes('..')||p.includes(':')))
  throw new Error('Unsafe runtime archive paths.');
await run('unzip',['-q',runtime,'-d',directory],{timeout:120000});await fs.unlink(runtime);
await fs.rm(path.join(directory,'resources/default_app.asar'),{force:true});
await fs.rename(path.join(directory,'electron.exe'),path.join(directory,'KEYO Studio.exe'));
const destination=path.join(directory,'resources/app');await fs.mkdir(destination,{recursive:true});
for(const dir of ['src','desktop','bin'])await fs.cp(path.join(root,dir),path.join(destination,dir),{recursive:true});
await fs.mkdir(path.join(destination,'native'));
for(const file of ['kernels.cc','build.mjs'])await fs.copyFile(path.join(root,'native',file),path.join(destination,'native',file));
for(const file of ['package.json','LICENSE','README.md','CONTRIBUTING.md','SECURITY.md'])
  await fs.copyFile(path.join(root,file),path.join(destination,file));
await fs.writeFile(path.join(directory,'READ-ME-FIRST.txt'),
  'KEYO Studio unsigned developer portable build.\r\nExtract the entire ZIP before opening KEYO Studio.exe. Do not run it inside the ZIP.\r\nNo Node installation or cloud AI key is needed. Use Model library to download a public model and then Load downloaded model.\r\nModels use Internet bandwidth; prompts remain local. CPU generation can be slow. Windows runtime execution has not been certified by the Linux build host.\r\nDo not disable your security software to run this package. Check the release checksum and source first.\r\n');
const filename=name+'.zip';
await run('zip',['-q','-r',path.join(output,filename),name],{cwd:output,timeout:180000});
const hash=createHash('sha256');for await(const chunk of createReadStream(path.join(output,filename)))hash.update(chunk);
const release={version:pkg.version,platform:'win32',architecture:'x64',filename,bytes:(await fs.stat(path.join(output,filename))).size,
  sha256:hash.digest('hex'),electronVersion:electron.version,officialRuntimeSha256:expected,
  signed:false,executionVerified:false,modelsIncluded:false,engine:'keyo-cpu',cpuKernel:'javascript',
  status:'unsigned, Windows execution unverified',extractBeforeRunning:true};
await fs.writeFile(path.join(output,'windows-release.json'),JSON.stringify(release,null,2),{flag:'wx'});
console.log(JSON.stringify(release,null,2));
