import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {KEYO_VERSION as version} from '../packages/keyo-studio/src/version.mjs';
const output=path.resolve('generated-artifacts/keyo-publication',version),release=path.join(output,'release');
const exported=JSON.parse(await fs.readFile(path.join(output,'manifest.json'),'utf8'));
const metadata=JSON.parse(await fs.readFile('dist/keyo-studio/release.json','utf8'));
assert.equal(exported.version,version);assert.equal(metadata.version,version);
assert.equal(exported.sha256,metadata.sha256,'Source bytes must match across website, GitHub and HF.');
assert.equal(exported.includesPrivatePlatform,false);assert.equal(exported.includesWeights,false);
await fs.mkdir(release);
for(const asset of metadata.releaseAssets) {
  assert.match(asset.filename,/^[a-zA-Z0-9_.-]+$/);
  await fs.copyFile(path.join('dist/keyo-studio',asset.filename),path.join(release,asset.filename));
}
const apk='artifacts/keyo-mobile/android/app/build/outputs/apk/debug/app-debug.apk';
const android=JSON.parse(await fs.readFile('artifacts/keyo-mobile/android/app/build/outputs/apk/debug/output-metadata.json','utf8'));
assert.equal(android.applicationId,'com.keyostudio.app');
assert.equal(android.elements[0].versionName,version);
await fs.copyFile(apk,path.join(release,`KEYO-Studio-${version}-android-debug.apk`));
await fs.copyFile('dist/keyo-studio/keyo-studio-huggingface-upload.zip',path.join(release,`KEYO-Studio-${version}-huggingface-upload.zip`));
const smol=JSON.parse(await fs.readFile('generated-artifacts/smol-check.json','utf8'));
const qwen=JSON.parse(await fs.readFile('generated-artifacts/qwen-check.json','utf8'));
const browser=JSON.parse(await fs.readFile('generated-artifacts/keyo-browser-check.json','utf8'));
assert.equal(smol.mismatches,0);assert.equal(qwen.mismatches,0);
assert.ok(browser.checks.length>=9);assert.deepEqual(browser.errors,[]);
await fs.copyFile('docs/keyo-portable-release.md',path.join(release,`KEYO-Studio-${version}-verification.md`));
await fs.writeFile(path.join(release,`KEYO-Studio-${version}-verification.json`),JSON.stringify({
  version,numerical:{qwen,smol},browser,
  limits:{phoneExecutionCertified:false,androidArtifact:'debug-signed development APK',webGpu:false,wasm:false,integerQuantization:false},
  toolingAudit:{productionDependencies:'zero advisories in the isolated portable UI npm audit --omit=dev',moderateBuildToolFindings:5,
    notes:'Development-only xcode/uuid and typography/selector-parser chains; not executed by the browser inference engine. Cleanup is deferred, not claimed complete.'},
},null,2));
const sums=[];
for(const name of (await fs.readdir(release)).sort())sums.push(`${createHash('sha256').update(await fs.readFile(path.join(release,name))).digest('hex')}  ${name}`);
await fs.writeFile(path.join(release,`KEYO-Studio-${version}-ALL-ASSETS-SHA256SUMS.txt`),sums.join('\n')+'\n');
console.log(JSON.stringify({version,assets:sums.length+1,sourceBytes:exported.bytes,sourceSha256:exported.sha256},null,2));
