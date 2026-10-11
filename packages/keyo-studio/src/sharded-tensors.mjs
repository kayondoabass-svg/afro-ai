import { openSync, readFileSync, closeSync, fstatSync, lstatSync, constants } from 'node:fs';
import path from 'node:path';
import { loadDiskTensors } from './disk-tensors.mjs';

export const MAX_SHARDED_BYTES = 32 * 1024 ** 3;
export const MAX_SHARD_BYTES = 8 * 1024 ** 3;
const MAX_DECODED_BYTES = 64 * 1024 ** 3;

export function loadShardedTensors(directory, kernel = null) {
  const indexPath = path.join(directory, 'model.safetensors.index.json');
  if (!lstatSync(indexPath).isFile()) throw new Error('Checkpoint index must be a regular file, not a symlink.');
  const fd = openSync(indexPath, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  let index;
  try {
    if (fstatSync(fd).size > 1024 * 1024) throw new Error('Checkpoint index exceeds 1 MiB.');
    const bytes = readFileSync(fd);
    if (bytes.length > 1024 * 1024) throw new Error('Checkpoint index exceeds 1 MiB.');
    index = JSON.parse(bytes.toString('utf8'));
  } finally { closeSync(fd); }
  if (!index || !index.weight_map || typeof index.weight_map !== 'object' ||
      Array.isArray(index.weight_map)) throw new Error('Invalid checkpoint weight map.');
  const entries = Object.entries(index.weight_map);
  if (!entries.length || entries.length > 10000) throw new Error('Invalid checkpoint tensor count.');
  const files = [...new Set(entries.map(([, file]) => file))];
  if (files.length > 128 || files.some(file => typeof file !== 'string' ||
      !/^[A-Za-z0-9_-]+\.safetensors$/.test(file)))
    throw new Error('Shard paths must be flat, safe safetensors filenames; at most 128 shards.');
  const declared = index.metadata?.total_size;
  if (!Number.isSafeInteger(declared) || declared <= 0 || declared > MAX_SHARDED_BYTES)
    throw new Error('Index must declare total_size within the 32 GiB checkpoint budget.');
  let checkpointBytes = 0;
  // Preflight every shard before decoding any weights or opening all descriptors.
  for (const file of files) {
    const stat = lstatSync(path.join(directory, file));
    if (!stat.isFile() || stat.size > MAX_SHARD_BYTES) throw new Error('Invalid or oversized shard; symlinks are forbidden.');
    checkpointBytes += stat.size;
  }
  if (checkpointBytes > MAX_SHARDED_BYTES) throw new Error('Shards exceed the 32 GiB checkpoint budget.');
  const shards = [], tensors = new Map();
  try {
    let vectorBytes = 0, elements = 0, payloadBytes = 0;
    for (const file of files) {
      const shard = loadDiskTensors(path.join(directory, file),
        {kernel, maxBytes:MAX_SHARD_BYTES, maxDecodedBytes:16 * 1024 ** 3});
      shards.push(shard); vectorBytes += shard.vectorBytes;
      if (vectorBytes > 8 * 1024 ** 2) throw new Error('Sharded vectors exceed the shared 8 MiB budget.');
      for (const [name, tensor] of shard) {
        if (tensors.has(name) || index.weight_map[name] !== file)
          throw new Error('Duplicate tensor or shard/index mismatch.');
        tensors.set(name, tensor);
        const count = tensor.shape.reduce((a,b) => a*b,1);
        elements += count;
      }
      // Safetensors metadata describes payload sizes, not file headers.
      payloadBytes += shard.payloadBytes;
    }
    if (tensors.size !== entries.length || entries.some(([name]) => !tensors.has(name)))
      throw new Error('Index refers to missing tensors.');
    if (payloadBytes !== declared) throw new Error('Index total_size does not match shard payloads.');
    if (elements * 4 > MAX_DECODED_BYTES) throw new Error('Sharded dimensions exceed the 64 GiB decoded-equivalent budget.');
    Object.assign(tensors, {storage:'disk', kernel:kernel ? 'native' : 'javascript',
      checkpointBytes, vectorBytes, shardCount:shards.length,
      scratchBytes:shards.reduce((n,s) => n+s.scratchBytes,0),
      close() { for (const shard of shards) shard.close(); }});
    return tensors;
  } catch (error) { for (const shard of shards) shard.close(); throw error; }
}
