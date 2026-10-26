import path from 'node:path';
import { readJson, loadTensors } from './tensors.mjs';
import { cpuKernel } from './cpu-kernel.mjs';
import { ByteBPE } from './tokenizer.mjs';
import { KeyoEngine } from './engine.mjs';

export const readNodeTokenizer = directory =>
  readJson(path.join(directory, 'tokenizer.json'), 16 * 1024 * 1024);

export async function loadNodeEngine(directory, {kernel = process.env.KEYO_CPU_KERNEL ?? 'javascript'} = {}) {
  const config = await readJson(path.join(directory, 'config.json'));
  const tokenizer = await ByteBPE.load(directory, config.model_type);
  const tensors = await loadTensors(directory, cpuKernel(kernel));
  try { return new KeyoEngine(config, tensors, tokenizer, path.basename(path.resolve(directory))); }
  catch (error) { tensors.close?.(); throw error; }
}
