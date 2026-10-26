import { open, lstat } from 'node:fs/promises';
import path from 'node:path';

export const MAX_WEIGHTS = 256 * 1024 * 1024;
const MAX_ELEMENTS = MAX_WEIGHTS / 4;

export async function readJson(file, limit = 1024 * 1024) {
  const handle = await open(file, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > limit) throw new Error('JSON file is too large or not a regular file.');
    const bytes = await handle.readFile();
    if (bytes.length > limit) throw new Error('JSON limit exceeded.');
    return JSON.parse(bytes.toString('utf8'));
  } finally { await handle.close(); }
}

export function halfToFloat(bits) {
  const sign = bits & 0x8000 ? -1 : 1;
  const exponent = (bits >> 10) & 31;
  const mantissa = bits & 1023;
  if (exponent === 31) return mantissa ? NaN : sign * Infinity;
  if (!exponent) return sign * mantissa * 2 ** -24;
  return sign * (1 + mantissa / 1024) * 2 ** (exponent - 15);
}

// Safetensors is a data-only format. Never deserialize Python pickle or execute
// a model repository's code. Every tensor must occupy a disjoint bounded range.
export function parseSafetensors(bytes) {
  if (bytes.length < 10 || bytes.length > MAX_WEIGHTS) throw new Error('Invalid or oversized safetensors file (256 MiB alpha limit).');
  const rawLength = bytes.readBigUInt64LE(0);
  if (rawLength > 1024n * 1024n || rawLength < 2n) throw new Error('Invalid safetensors header length.');
  const length = Number(rawLength);
  const start = 8 + length;
  if (start > bytes.length) throw new Error('Truncated safetensors header.');
  const header = JSON.parse(bytes.subarray(8, start).toString('utf8'));
  if (!header || Array.isArray(header) || typeof header !== 'object') throw new Error('Invalid tensor header.');
  const entries = [];
  let total = 0;
  for (const [name, meta] of Object.entries(header)) {
    if (name === '__metadata__') continue;
    if (!meta || !['F32', 'F16', 'BF16'].includes(meta.dtype)) throw new Error(`Unsupported dtype for ${name}.`);
    if (!Array.isArray(meta.shape) || meta.shape.length < 1 || meta.shape.length > 2 ||
        meta.shape.some(n => !Number.isSafeInteger(n) || n <= 0)) throw new Error(`Invalid tensor shape: ${name}.`);
    const count = meta.shape.reduce((a, b) => a * b, 1);
    total += count;
    if (!Number.isSafeInteger(count) || count > MAX_ELEMENTS || total > MAX_ELEMENTS) throw new Error('Decoded tensors exceed the alpha memory limit.');
    const [from, to] = meta.data_offsets ?? [];
    const width = meta.dtype === 'F32' ? 4 : 2;
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to < from ||
        to - from !== count * width || start + to > bytes.length) throw new Error(`Invalid tensor offsets: ${name}.`);
    entries.push({ name, meta, count, from, to });
  }
  if (!entries.length) throw new Error('No tensors found.');
  entries.sort((a, b) => a.from - b.from);
  let end = 0;
  for (const entry of entries) {
    if (entry.from !== end) throw new Error('Tensor ranges overlap or contain gaps.');
    end = entry.to;
  }
  if (start + end !== bytes.length) throw new Error('Unexpected bytes after tensor data.');
  const tensors = new Map();
  const bits = new DataView(new ArrayBuffer(4));
  for (const entry of entries) {
    const data = new Float32Array(entry.count);
    const offset = start + entry.from;
    for (let i = 0; i < data.length; i++) {
      const index = offset + i * (entry.meta.dtype === 'F32' ? 4 : 2);
      if (entry.meta.dtype === 'F32') data[i] = bytes.readFloatLE(index);
      else if (entry.meta.dtype === 'F16') data[i] = halfToFloat(bytes.readUInt16LE(index));
      else {
        bits.setUint32(0, bytes.readUInt16LE(index) << 16, true);
        data[i] = bits.getFloat32(0, true);
      }
      if (!Number.isFinite(data[i])) throw new Error(`Non-finite tensor value: ${entry.name}.`);
    }
    tensors.set(entry.name, { shape: entry.meta.shape, data });
  }
  return tensors;
}

export async function loadTensors(directory, kernel = null) {
  let indexed = false;
  try { await lstat(path.join(directory, 'model.safetensors.index.json')); indexed = true; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (indexed) {
    try {
      await lstat(path.join(directory, 'model.safetensors'));
      throw new Error('Ambiguous checkpoint: supply either a single file or a sharded index, not both.');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const { loadShardedTensors } = await import('./sharded-tensors.mjs');
    return loadShardedTensors(directory, kernel);
  }
  const handle = await open(path.join(directory, 'model.safetensors'), 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw new Error('Weights must be a regular safetensors file.');
    if (stat.size > MAX_WEIGHTS || kernel) {
      const { loadDiskTensors } = await import('./disk-tensors.mjs');
      return loadDiskTensors(path.join(directory, 'model.safetensors'), {kernel});
    }
    return parseSafetensors(await handle.readFile());
  } finally { await handle.close(); }
}

export function matvec(tensor, vector, guard = () => {}) {
  if (tensor.multiply) return tensor.multiply(vector, guard);
  const [rows, cols] = tensor.shape;
  if (cols !== vector.length) throw new Error('Matrix/vector shape mismatch.');
  const result = new Float32Array(rows);
  for (let row = 0; row < rows; row++) {
    if ((row & 127) === 0) guard();
    let sum = 0;
    const base = row * cols;
    for (let col = 0; col < cols; col++) sum += tensor.data[base + col] * vector[col];
    result[row] = sum;
  }
  return result;
}

export function normalize(x, weight, bias, epsilon, rms = false) {
  let mean = 0, variance = 0;
  if (!rms) mean = x.reduce((a, b) => a + b, 0) / x.length;
  for (const value of x) variance += (value - mean) ** 2;
  const scale = 1 / Math.sqrt(variance / x.length + epsilon);
  return Float32Array.from(x, (value, i) => (value - mean) * scale * weight[i] + (bias?.[i] ?? 0));
}

export function softmax(x) {
  const max = Math.max(...x);
  if (!Number.isFinite(max)) throw new Error('Non-finite attention scores.');
  const values = Float64Array.from(x, value => Math.exp(value - max));
  const sum = values.reduce((a, b) => a + b, 0);
  return Float64Array.from(values, value => value / sum);
}

export function gelu(x) { return 0.5 * x * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (x + 0.044715 * x ** 3))); }

export function rotary(vector, position, headSize, theta) {
  const output = vector.slice();
  for (let base = 0; base < vector.length; base += headSize) {
    for (let i = 0; i < headSize / 2; i++) {
      const angle = position / theta ** (2 * i / headSize);
      const a = vector[base + i], b = vector[base + i + headSize / 2];
      output[base + i] = a * Math.cos(angle) - b * Math.sin(angle);
      output[base + i + headSize / 2] = b * Math.cos(angle) + a * Math.sin(angle);
    }
  }
  return output;
}
