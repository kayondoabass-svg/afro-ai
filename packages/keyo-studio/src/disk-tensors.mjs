import { openSync, closeSync, readSync, fstatSync, constants } from 'node:fs';
import { endianness } from 'node:os';
import { halfToFloat } from './tensors.mjs';

export const MAX_CHECKPOINT_BYTES = 4 * 1024 ** 3;
const BLOCK_BYTES = 256 * 1024;
const MAX_VECTOR_BYTES = 8 * 1024 ** 2;
const half = Float32Array.from({length:65536}, (_, i) => halfToFloat(i));
const floatBits = new DataView(new ArrayBuffer(4));

function decode(raw, dtype) {
  if (dtype === 'F16') return half[raw];
  if (dtype === 'BF16') {
    floatBits.setUint32(0, raw << 16, true);
    return floatBits.getFloat32(0, true);
  }
  return raw;
}

// Read-only, out-of-core weights. Matrix blocks are read into one bounded
// scratch buffer, never a multi-gigabyte Buffer or decoded Float32Array.
export function loadDiskTensors(filename, { kernel = null, maxBytes = MAX_CHECKPOINT_BYTES,
  maxDecodedBytes = 8 * 1024 ** 3 } = {}) {
  if (endianness() !== 'LE') throw new Error('Disk-backed weights require a little-endian machine.');
  const fd = openSync(filename, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  let closed = false;
  const close = () => { if (!closed) { closed=true; closeSync(fd); } };
  try {
    const initial = fstatSync(fd);
    if (!initial.isFile() || initial.size < 10 || initial.size > maxBytes)
      throw new Error(`Checkpoint exceeds the ${maxBytes / 1024 ** 3} GiB disk-backed limit.`);
    function read(buffer, bytes, position) {
      if (closed) throw new Error('Model weights are closed.');
      let done=0;
      while (done < bytes) {
        const count=readSync(fd,buffer,done,bytes-done,position+done);
        if (!count) throw new Error('Truncated model weights.');
        done+=count;
      }
    }
    const prefix=Buffer.alloc(8); read(prefix,8,0);
    const length=prefix.readBigUInt64LE();
    if (length < 2n || length > 1024n*1024n || Number(length)+8 > initial.size)
      throw new Error('Invalid safetensors header length.');
    const bytes=Buffer.alloc(Number(length)); read(bytes,bytes.length,8);
    const header=JSON.parse(bytes.toString('utf8')), start=8+bytes.length;
    if (!header || typeof header !== 'object' || Array.isArray(header)) throw new Error('Invalid tensor header.');
    const entries=[];
    let elements=0,vectorBytes=0;
    for (const [name,meta] of Object.entries(header)) {
      if (name === '__metadata__') continue;
      if (!meta || !['F32','F16','BF16'].includes(meta.dtype)) throw new Error(`Unsupported dtype for ${name}.`);
      if (!Array.isArray(meta.shape) || meta.shape.length < 1 || meta.shape.length > 2 ||
          meta.shape.some(n => !Number.isSafeInteger(n) || n <= 0)) throw new Error(`Invalid tensor shape: ${name}.`);
      const count=meta.shape.reduce((a,b) => a*b,1), width=meta.dtype === 'F32' ? 4 : 2;
      elements+=count;
      if (!Number.isSafeInteger(count) || !Number.isSafeInteger(elements) || elements*4 > maxDecodedBytes)
        throw new Error('Decoded weight dimensions exceed the equivalent limit.');
      const [from,to]=meta.data_offsets ?? [];
      if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to < from ||
          to-from !== count*width || start+to > initial.size) throw new Error(`Invalid tensor offsets: ${name}.`);
      if (meta.shape.length === 1) vectorBytes+=count*4;
      if (vectorBytes > MAX_VECTOR_BYTES) throw new Error('Normalization/bias vectors exceed the 8 MiB memory limit.');
      entries.push({name,shape:meta.shape,dtype:meta.dtype,width,count,from,to});
    }
    if (!entries.length) throw new Error('No tensors found.');
    entries.sort((a,b) => a.from-b.from);
    let end=0;
    for (const entry of entries) {
      if (entry.from !== end) throw new Error('Tensor ranges overlap or contain gaps.');
      end=entry.to;
    }
    if (start+end !== initial.size) throw new Error('Unexpected bytes after tensor data.');
    const scratch=Buffer.alloc(BLOCK_BYTES), tensors=new Map();
    function block(entry, index, count) {
      const size=count*entry.width;
      if (size > scratch.length) throw new Error('Weight block exceeds scratch budget.');
      read(scratch,size,start+entry.from+index*entry.width);
      return entry.dtype === 'F32'
        ? new Float32Array(scratch.buffer,scratch.byteOffset,count)
        : new Uint16Array(scratch.buffer,scratch.byteOffset,count);
    }
    // Validate every value before accepting the model, including unused tensors.
    for (const entry of entries) {
      const data=entry.shape.length === 1 ? new Float32Array(entry.count) : null;
      for (let index=0; index < entry.count;) {
        const count=Math.min(entry.count-index,BLOCK_BYTES/entry.width), raw=block(entry,index,count);
        for (let i=0;i<count;i++) {
          const value=decode(raw[i],entry.dtype);
          if (!Number.isFinite(value)) throw new Error(`Non-finite tensor value: ${entry.name}.`);
          if (data) data[index+i]=value;
        }
        index+=count;
      }
      tensors.set(entry.name,{
        shape:entry.shape, ...(data ? {data} : {}),
        row(row) {
          const cols=entry.shape[1];
          if (!Number.isInteger(row) || row < 0 || row >= entry.shape[0] || !cols)
            throw new Error('Invalid tensor row.');
          const output=new Float32Array(cols);
          for (let index=0;index<cols;) {
            const count=Math.min(cols-index,BLOCK_BYTES/entry.width), raw=block(entry,row*cols+index,count);
            for (let i=0;i<count;i++) output[index+i]=decode(raw[i],entry.dtype);
            index+=count;
          }
          return output;
        },
        multiply(vector,guard) {
          const [rows,cols]=entry.shape;
          if (vector.length !== cols) throw new Error('Matrix/vector shape mismatch.');
          const output=new Float32Array(rows);
          const rowsPerBlock=Math.floor(BLOCK_BYTES/(cols*entry.width));
          if (rowsPerBlock >= 1) {
            for (let first=0;first<rows;first+=rowsPerBlock) {
              guard();
              const size=Math.min(rowsPerBlock,rows-first),raw=block(entry,first*cols,size*cols);
               if (kernel && vector instanceof Float32Array) {
                 output.set(kernel.multiply(raw, vector, size, entry.dtype), first);
                 continue;
               }
              for (let row=0;row<size;row++) {
                guard();
                let sum=0;
                const base=row*cols;
                if (entry.dtype === 'F16') {
                  for (let col=0;col<cols;col++) sum+=half[raw[base+col]]*vector[col];
                } else if (entry.dtype === 'F32') {
                  for (let col=0;col<cols;col++) sum+=raw[base+col]*vector[col];
                } else {
                  for (let col=0;col<cols;col++) sum+=decode(raw[base+col],entry.dtype)*vector[col];
                }
                output[first+row]=sum;
              }
            }
            return output;
          }
          for (let row=0;row<rows;row++) {
            guard();
            let sum=0;
            for (let index=0;index<cols;) {
              const count=Math.min(cols-index,BLOCK_BYTES/entry.width),raw=block(entry,row*cols+index,count);
              for (let i=0;i<count;i++) sum+=decode(raw[i],entry.dtype)*vector[index+i];
              index+=count;
            }
            output[row]=sum;
          }
          return output;
        }
      });
    }
    const final=fstatSync(fd);
    if (final.size !== initial.size || final.mtimeMs !== initial.mtimeMs) throw new Error('Weights changed while loading.');
    Object.assign(tensors,{close,storage:'disk',checkpointBytes:initial.size,scratchBytes:BLOCK_BYTES,vectorBytes,
      kernel:kernel ? 'native' : 'javascript',payloadBytes:end});
    return tensors;
  } catch (error) { close(); throw error; }
}
