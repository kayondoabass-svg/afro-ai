import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(directory, 'generated');
mkdirSync(output, {recursive:true});
const temporary = path.join(output, `keyo-kernels-${process.pid}.node`);
const include = process.argv[2] ?? path.join(path.dirname(path.dirname(process.execPath)), 'include/node');
if (!existsSync(path.join(include, 'node_api.h')))
  throw new Error('Node development headers are required. Run: node native/build.mjs /path/to/include/node');
if (!['linux', 'darwin'].includes(process.platform))
  throw new Error('This native build script supports Linux/macOS only. Use the JavaScript kernel on Windows.');
const args = ['-std=c++17', '-O3', '-fPIC', '-shared', '-ffp-contract=off', '-fno-fast-math',
  '-DNAPI_VERSION=8', '-I', include, path.join(directory, 'kernels.cc'),
  '-o', temporary];
if (process.platform === 'darwin') args.push('-undefined', 'dynamic_lookup');
const result = spawnSync('c++', args, {stdio:'inherit'});
if (result.error || result.status !== 0) {
  rmSync(temporary, {force:true});
  throw result.error ?? new Error('KEYO native kernel compilation failed.');
}
renameSync(temporary, path.join(output, 'keyo-kernels.node'));
console.log('Built KEYO native CPU kernel. Select it explicitly with KEYO_CPU_KERNEL=native.');
