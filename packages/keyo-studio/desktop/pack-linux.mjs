import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

const run=promisify(execFile);
if (process.platform !== 'linux') throw new Error('This builder produces Linux packages only. Windows/macOS are not yet verified.');
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
const require=createRequire(import.meta.url);
const electronRoot=path.dirname(require.resolve('electron/package.json'));
const electron=JSON.parse(await fs.readFile(path.join(electronRoot,'package.json'),'utf8'));
const output=path.resolve(process.argv[2] || path.join(os.tmpdir(),'keyo-desktop-releases'));
await fs.mkdir(output,{recursive:true});
const name=`KEYO-Studio-${pkg.version}-linux-${process.arch}`;
const directory=path.join(output,name);
// Never erase an existing release or unrelated user directory.
await fs.mkdir(directory);
await fs.cp(path.join(electronRoot,'dist'),directory,{recursive:true});
await fs.rm(path.join(directory,'resources/default_app.asar'),{force:true});
await fs.rename(path.join(directory,'electron'),path.join(directory,'keyo-studio'));
const appDirectory=path.join(directory,'resources/app');
await fs.mkdir(appDirectory,{recursive:true});
async function copySource(directory,prefix='') {
  for (const entry of await fs.readdir(directory,{withFileTypes:true})) {
    const relative=prefix+entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Source symlink refused: ${relative}`);
    if (entry.isDirectory() && ['src','desktop','desktop/renderer','bin'].includes(relative))
      await copySource(path.join(directory,entry.name),relative+'/');
    else if (entry.isFile() && (['package.json','LICENSE','README.md','CONTRIBUTING.md','SECURITY.md','bin/keyo.mjs'].includes(relative) ||
      /^src\/[a-z-]+\.mjs$/.test(relative) || /^desktop\/[a-z-]+\.(?:mjs|cjs|md)$/.test(relative) ||
      /^desktop\/renderer\/[a-z-]+\.(?:html|css|mjs|svg)$/.test(relative))) {
      const target=path.join(appDirectory,relative);
      await fs.mkdir(path.dirname(target),{recursive:true});
      await fs.copyFile(path.join(directory,entry.name),target);
    }
  }
}
await copySource(root);
const filename=`${name}.tar.gz`;
await run('tar',['-czf',path.join(output,filename),'-C',output,name],{timeout:180000});
const hash=createHash('sha256'); for await (const chunk of createReadStream(path.join(output,filename))) hash.update(chunk);
const bytes=(await fs.stat(path.join(output,filename))).size;
const release={name:'KEYO Studio',version:pkg.version,platform:'linux',architecture:process.arch,filename,bytes,sha256:hash.digest('hex'),
  electronVersion:electron.version,signed:false,modelsIncluded:false,engine:'keyo-cpu',modelLimits:'4 GiB single checkpoint, disk-backed above 256 MiB, 512 token context',nativeStatus:'unsigned developer alpha'};
await fs.writeFile(path.join(output,'release.json'),JSON.stringify(release,null,2));
console.log(JSON.stringify(release,null,2));
