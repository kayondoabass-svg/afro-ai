import { createRequire } from 'node:module';

export function cpuKernel(name = 'javascript') {
  if (name === 'javascript') return null;
  if (name !== 'native') throw new Error('CPU kernel must be javascript or native.');
  try {
    const addon = createRequire(import.meta.url)('../native/generated/keyo-kernels.node');
    if (typeof addon.multiply !== 'function') throw new Error('Invalid native interface.');
    return addon;
  } catch (cause) {
    throw new Error('KEYO native kernel is unavailable. Build native/build.mjs or select javascript explicitly.', {cause});
  }
}
