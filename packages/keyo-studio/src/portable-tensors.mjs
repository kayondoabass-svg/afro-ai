import { halfToFloat } from './math.mjs';

export const SCRATCH_BYTES = 256 * 1024;
const VECTOR_BUDGET = 8 * 1024 * 1024;
const WIDTHS = {F32:4,F16:2,BF16:2};
const decoder = new TextDecoder('utf-8', {fatal:true});

// Reader: {size, read(Uint8Array, offset): number, close()}. Both an OPFS sync
// access handle and the Node QA adapter implement this bounded interface.
export function loadPortableTensors(readers) {
  const tensors = new Map();
  const scratch = new Uint8Array(SCRATCH_BYTES);
  const view = new DataView(scratch.buffer);
  let vectorBytes = 0, totalBytes = 0, closed = false;
  const read = (reader, bytes, offset) => {
    if (closed || reader.read(bytes, offset) !== bytes.byteLength) throw new Error('Truncated or closed model storage.');
  };
  const valueAt = (dtype, offset) => {
    if (dtype === 'F32') return view.getFloat32(offset, true);
    if (dtype === 'F16') return halfToFloat(view.getUint16(offset, true));
    view.setUint32(SCRATCH_BYTES-4, view.getUint16(offset,true)*65536, true);
    return view.getFloat32(SCRATCH_BYTES-4,true);
  };
  // Separate conversion cell: never overwrite the final four bytes of a block.
  const cell = new DataView(new ArrayBuffer(4));
  const scalar = (dtype, offset) => {
    if (dtype !== 'BF16') return valueAt(dtype, offset);
    cell.setUint32(0,view.getUint16(offset,true)*65536,true);
    return cell.getFloat32(0,true);
  };
  try {
    if (!Array.isArray(readers) || !readers.length || readers.length > 16) throw new Error('Invalid portable shard count.');
    for (const reader of readers) {
      if (!Number.isSafeInteger(reader.size) || reader.size < 10 || reader.size > 4*1024**3) throw new Error('Invalid portable checkpoint size.');
      totalBytes += reader.size;
      if (totalBytes > 8*1024**3) throw new Error('Portable checkpoint exceeds 8 GiB.');
      const prefix = new Uint8Array(8); read(reader,prefix,0);
      const headerSize = new DataView(prefix.buffer).getBigUint64(0,true);
      if (headerSize < 2n || headerSize > 1048576n || 8+Number(headerSize)>reader.size) throw new Error('Invalid safetensors header.');
      const bytes = new Uint8Array(Number(headerSize)); read(reader,bytes,8);
      const header = JSON.parse(decoder.decode(bytes)), start=8+bytes.length, entries=[];
      if (!header || typeof header !== 'object' || Array.isArray(header)) throw new Error('Invalid tensor metadata.');
      for (const [name,meta] of Object.entries(header)) {
        if (name === '__metadata__') continue;
        const width = WIDTHS[meta?.dtype];
        if (!width || !Array.isArray(meta.shape) || ![1,2].includes(meta.shape.length) ||
            meta.shape.some(n=>!Number.isSafeInteger(n)||n<1||n>500000)) throw new Error(`Unsupported tensor ${name}.`);
        const count=meta.shape.reduce((a,b)=>a*b,1),[from,to]=meta.data_offsets??[];
        if (!Number.isSafeInteger(count)||!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||
            from<0||to-from!==count*width||start+to>reader.size) throw new Error(`Invalid tensor offsets: ${name}.`);
        if (tensors.has(name)||entries.some(e=>e.name===name)) throw new Error('Duplicate tensor.');
        entries.push({name,meta,width,count,from,to});
      }
      entries.sort((a,b)=>a.from-b.from);
      let end=0;
      for (const entry of entries) {
        if(entry.from!==end) throw new Error('Overlapping or gapped tensor data.');
        end=entry.to;
      }
      if (!entries.length||start+end!==reader.size) throw new Error('Unexpected safetensors data.');
      for (const {name,meta,width,count,from} of entries) {
        const offset=start+from;
        const decodeInto = (target,position,count) => {
          let done=0;
          while(done<count) {
            const n=Math.min(count-done,SCRATCH_BYTES/width);
            read(reader,scratch.subarray(0,n*width),position+done*width);
            for(let i=0;i<n;i++) {
              const v=scalar(meta.dtype,i*width);
              if(!Number.isFinite(v)) throw new Error(`Non-finite weight: ${name}.`);
              target[done+i]=v;
            }
            done+=n;
          }
        };
        const tensor={shape:meta.shape};
        if(meta.shape.length===1) {
          vectorBytes+=count*4;
          if(vectorBytes>VECTOR_BUDGET) throw new Error('Resident vectors exceed 8 MiB.');
          tensor.data=new Float32Array(count); decodeInto(tensor.data,offset,count);
        } else {
          const [rows,cols]=meta.shape;
          if(cols*width>SCRATCH_BYTES) throw new Error('Matrix row exceeds scratch limit.');
          tensor.row = index => {
            if(!Number.isInteger(index)||index<0||index>=rows) throw new Error('Invalid embedding index.');
            const result=new Float32Array(cols); decodeInto(result,offset+index*cols*width,cols); return result;
          };
          tensor.multiply=(input,guard=()=>{})=>{
            if(input.length!==cols) throw new Error('Matrix/vector shape mismatch.');
            const output=new Float32Array(rows), blockRows=Math.max(1,Math.floor(SCRATCH_BYTES/(cols*width)));
            for(let row=0;row<rows;row+=blockRows) {
              guard();
              const n=Math.min(blockRows,rows-row);
              read(reader,scratch.subarray(0,n*cols*width),offset+row*cols*width);
              for(let r=0;r<n;r++) {
                let sum=0;
                for(let c=0;c<cols;c++) {
                  const value=scalar(meta.dtype,(r*cols+c)*width);
                  if(!Number.isFinite(value)) throw new Error(`Non-finite weight: ${name}.`);
                  sum+=value*input[c];
                }
                output[row+r]=sum;
              }
            }
            return output;
          };
        }
        tensors.set(name,tensor);
      }
    }
    tensors.storage='disk'; tensors.kernel='javascript-opfs'; tensors.checkpointBytes=totalBytes; tensors.shardCount=readers.length;
    tensors.close=()=>{if(!closed){closed=true;for(const reader of readers) reader.close();}};
    return tensors;
  } catch(error) { for(const reader of readers) try{reader.close();}catch{} throw error; }
}
