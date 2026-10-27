import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {KEYO_VERSION} from '../packages/keyo-studio/src/version.mjs';

// Published releases are immutable. Never repack an existing version on a mirror:
// clean hosts need not have Capacitor-generated files or identical npm tar output.
export const publishedVersion='0.2.0-alpha.2';
export const publishedAssets={
  'afro-ai-keyo-studio-0.2.0-alpha.2.tgz':'95d937460a9f50979d3de2245317ebbfc990c8bd27ca58e1fc7bdedd7576ed0d',
  'KEYO-Studio-0.2.0-alpha.2-source.zip':'23ea3dec10cf599018d54f3000b165782edca801a026d4bd28322aba406c1ba2',
  'KEYO-Studio-0.2.0-alpha.2-release-notes.md':'b2628e4311759541b8f3465a286294d323e4b2ea2fb99a59269a8ede6d0eb12a',
  'KEYO-Studio-0.2.0-alpha.2-SHA256SUMS.txt':'7ef7c3d34bf2191bd08e1d25b73dbe8bc729ec3167a110937ee1edeedee88c09',
  'KEYO-Studio-0.2.0-alpha.2-release-files.zip':'ceffb3a4508746d94489f814950cbdff0ea09b819b829c8ad1f530779e0ea9a4',
  'KEYO-Studio-0.2.0-alpha.2-huggingface-upload.zip':'af8943b71418ffebb11992bfdd5f6706df88593980eb6962c2cb2d5deddac93d',
};
const sha=b=>createHash('sha256').update(b).digest('hex');
export async function syncPublishedKeyoRelease({root=process.cwd(),fetcher=fetch}={}) {
  if(KEYO_VERSION!==publishedVersion)throw new Error('Pin and verify the new published release before deployment.');
  const directory=path.join(root,'dist/keyo-studio');
  const manifest=JSON.parse(await fs.readFile(path.join(directory,'release.json'),'utf8'));
  if(manifest.version!==publishedVersion)throw new Error('Built release version mismatch.');
  const downloaded={};
  for(const [name,expected] of Object.entries(publishedAssets)) {
    const response=await fetcher(`https://github.com/kayondoabass-svg/keyo-studio/releases/download/v${publishedVersion}/${name}`,{signal:AbortSignal.timeout(60000)});
    if(!response.ok)throw new Error(`Published release download failed: ${name}, HTTP ${response.status}`);
    const chunks=[];let size=0;
    for await(const chunk of response.body) {
      size+=chunk.length;
      if(size>16*1024*1024)throw new Error('Published asset exceeds the release size limit.');
      chunks.push(chunk);
    }
    const bytes=Buffer.concat(chunks);
    if(sha(bytes)!==expected)throw new Error(`Published release checksum mismatch: ${name}`);
    downloaded[name]=bytes;
  }
  // Validate every download before replacing any build output.
  const prefix=`KEYO-Studio-${publishedVersion}`;
  const sourceName=`afro-ai-keyo-studio-${publishedVersion}.tgz`;
  const sourceZip=downloaded[`${prefix}-source.zip`];
  const hfZip=downloaded[`${prefix}-huggingface-upload.zip`];
  const AdmZip=createRequire(import.meta.url)('adm-zip');
  const files=bytes=>new AdmZip(bytes).getEntries().filter(e=>!e.isDirectory).map(e=>e.entryName);
  const sourceFiles=files(sourceZip),hfFiles=files(hfZip);
  if(!sourceFiles.includes('src/engine.mjs')||!hfFiles.includes(sourceName))throw new Error('Published archive layout mismatch.');
  const source=downloaded[sourceName];
  manifest.sha256=sha(source);manifest.bytes=source.length;
  manifest.files=sourceFiles.filter(n=>n!=='.gitignore'&&!n.startsWith('.github/'));
  for(const asset of manifest.releaseAssets) {
    const bytes=downloaded[asset.filename];
    if(!bytes)throw new Error('Unrecognized website release asset.');
    asset.bytes=bytes.length;asset.sha256=sha(bytes);
  }
  Object.assign(manifest.manualUpload,{bytes:sourceZip.length,sha256:sha(sourceZip),files:sourceFiles});
  Object.assign(manifest.huggingFaceUpload,{bytes:hfZip.length,sha256:sha(hfZip),files:hfFiles});
  for(const [name,bytes] of Object.entries(downloaded))await fs.writeFile(path.join(directory,name),bytes);
  await fs.writeFile(path.join(directory,manifest.manualUpload.filename),sourceZip);
  await fs.writeFile(path.join(directory,manifest.huggingFaceUpload.filename),hfZip);
  await fs.writeFile(path.join(directory,'release.json'),JSON.stringify(manifest,null,2));
  return {version:publishedVersion,assets:Object.keys(downloaded).length,sha256:manifest.sha256};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  if(!process.argv.includes('--execute'))throw new Error('Explicit --execute required.');
  console.log('Published KEYO mirror verified:',await syncPublishedKeyoRelease());
}
