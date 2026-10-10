import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';

const source=fileURLToPath(new URL('../packages/keyo-studio/',import.meta.url));
const pkg=JSON.parse(await fs.readFile(path.join(source,'package.json'),'utf8'));
const output=path.resolve(process.argv[2] || `generated-artifacts/keyo-publication/${pkg.version}`);
await fs.mkdir(output,{recursive:true});
const github=path.join(output,'github'), hf=path.join(output,'huggingface');
// Refuse to overwrite a previous export or an existing Git working tree.
await fs.mkdir(github); await fs.mkdir(hf);
const permitted=file => ['package.json','README.md','CONTRIBUTING.md','LICENSE','SECURITY.md','bin/keyo.mjs'].includes(file) ||
  /^src\/[a-z-]+\.mjs$/.test(file) ||
  /^test\/[a-z-]+(?:\.test)?\.mjs$/.test(file) ||
  /^desktop\/[a-z-]+\.(?:cjs|mjs|md)$/.test(file) ||
  /^desktop\/renderer\/[a-z-]+\.(?:html|css|mjs|svg)$/.test(file);
async function walk(directory,prefix='') {
  const files=[];
  for (const entry of await fs.readdir(directory,{withFileTypes:true})) {
    const relative=prefix+entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Symlink refused: ${relative}`);
    if (entry.isDirectory()) {
      if (!['src','bin','test','desktop','desktop/renderer'].includes(relative)) continue;
      files.push(...await walk(path.join(directory,entry.name),relative+'/'));
    } else if (entry.isFile() && permitted(relative)) files.push(relative);
  }
  return files;
}
const files=await walk(source);
for (const file of files) {
  const target=path.join(github,file);
  await fs.mkdir(path.dirname(target),{recursive:true});
  await fs.copyFile(path.join(source,file),target);
}
await fs.writeFile(path.join(github,'.gitignore'),`node_modules/\ndist/\nmodels/\nweights/\n*.safetensors\n*.gguf\n*.bin\n*.tgz\n*.tar.gz\n.env*\n**/api-token\n`);
await fs.mkdir(path.join(github,'.github/workflows'),{recursive:true});
await fs.writeFile(path.join(github,'.github/workflows/tests.yml'),`name: Runner checks
on: [push, pull_request]
permissions:
  contents: read
jobs:
  checks:
    strategy:
      matrix:
        node: [22, 24]
        os: [ubuntu-latest, windows-latest, macos-latest]
    runs-on: \${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: \${{ matrix.node }}
      - run: npm test
`);
// No install is needed for the engine/store/worker tests; they have zero dependencies.
const run=promisify(execFile);
const {stdout}=await run('npm',['pack','--ignore-scripts','--json','--pack-destination',hf],{cwd:github,timeout:30000,maxBuffer:1024*1024});
const [pack]=JSON.parse(stdout);
if (!pack.files.every(file => permitted(file.path))) throw new Error('Unexpected file in the publication archive.');
const archive=await fs.readFile(path.join(hf,pack.filename));
const sha256=createHash('sha256').update(archive).digest('hex');
for (const file of ['index.html','style.css','app.mjs','bridge.mjs'])
  await fs.copyFile(path.join(source,'desktop/renderer',file),path.join(hf,file));
// Explicit preview-only links; the Space never pretends to execute local models.
const html=await fs.readFile(path.join(hf,'index.html'),'utf8');
await fs.writeFile(path.join(hf,'index.html'),html.replace('</body>',`<footer class="notice"><a href="./${pack.filename}" download>Download KEYO Studio source — developer alpha</a></footer>\n</body>`));
await fs.copyFile(path.join(source,'LICENSE'),path.join(hf,'LICENSE'));
await fs.writeFile(path.join(hf,'README.md'),`---
title: KEYO Studio
sdk: static
app_file: index.html
license: mit
colorFrom: green
colorTo: yellow
short_description: Ugandan-built local AI runner — preview and source
---

# KEYO Studio — KEYO Technologies, Uganda

Open-source LLM/SLM runner with our own CPU engine. This Space is an
**interface preview and code download**, not browser/cloud model inference.
Conversation CRUD is browser-local. Model loading and generation are disabled
in the preview; install the desktop source on your own device to use them.

Source archive: [${pack.filename}](./${pack.filename})

SHA-256: \`${sha256}\`

CLI: Node >=20. Desktop development: Node >=22.12 and Electron.
4 GiB single checkpoint / disk-backed above 256 MiB / 512 context tokens /
128 output tokens. 7B/14B models,
GPU inference and signed Windows/macOS installers are unfinished.
No weights, credentials, paid API or billing integration are included.

The code licence does not license third-party weights. Model releases belong
in separate licensed model repositories. Listing this Space does not
automatically generate payments or establish any partnership with Hugging Face.
`);
await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify({version:pkg.version,githubFiles:files,sourceArchive:pack.filename,sha256,bytes:archive.length,
  includesPrivatePlatform:false,includesWeights:false,published:false},null,2));
console.log(JSON.stringify({github,huggingface:hf,version:pkg.version,sourceArchive:pack.filename,bytes:archive.length,sha256,published:false},null,2));
