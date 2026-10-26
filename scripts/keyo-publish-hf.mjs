// Resume only Hugging Face after a GitHub release exists. The official Hub SDK
// handles binary/LFS uploads; never replace an existing GitHub tag or asset.
import {uploadFiles} from '@huggingface/hub';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {KEYO_VERSION as version} from '../packages/keyo-studio/src/version.mjs';
if(!process.argv.includes('--execute'))throw new Error('Explicit --execute required.');
if(!process.env.HF_TOKEN)throw new Error('Saved HF credential unavailable.');
const root=path.resolve('generated-artifacts/keyo-publication',version),files=new Map();
async function collect(directory,prefix='') {
  for(const entry of await fs.readdir(directory,{withFileTypes:true})) {
    if(entry.isSymbolicLink())throw new Error('Symlink refused.');
    const name=prefix+entry.name;
    if(entry.isDirectory())await collect(path.join(directory,entry.name),name+'/');
    else {
      const content=await fs.readFile(path.join(directory,entry.name));
      if(content.length>16*1024*1024)throw new Error('Unexpected large publication file.');
      if(files.has(name)&&!files.get(name).equals(content))throw new Error('Mirror bytes disagree.');
      files.set(name,content);
    }
  }
}
await collect(path.join(root,'huggingface'));await collect(path.join(root,'release'));
try {
  const result=await uploadFiles({repo:{type:'space',name:'kayondoabass/KEYO-Studio'},
    accessToken:process.env.HF_TOKEN,commitTitle:`KEYO portable ${version}: own CPU engine and Android development release`,
    files:[...files].map(([name,bytes])=>({path:name,content:new Blob([bytes])})),
  });
  const receipt={version,...result,files:[...files].map(([name,bytes])=>({name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}))};
  await fs.writeFile(path.join(root,'huggingface-receipt.json'),JSON.stringify(receipt,null,2));
  console.log(JSON.stringify({version,...result,files:files.size},null,2));
}catch(error){throw new Error(`Hugging Face upload failed: ${String(error.message).slice(0,600)}`);}
