import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { byteAlphabet } from '../src/tokenizer.mjs';

// Synthetic mathematical fixture, deliberately NOT a trained model.
export function fixture(family = 'gpt_neo') {
  const config = {
    model_type:family, hidden_size:4, num_layers:1, num_hidden_layers:1,
    num_heads:2, num_attention_heads:2, num_key_value_heads:1, vocab_size:257,
    max_position_embeddings:64, intermediate_size:8, eos_token_id:256,
    layer_norm_epsilon:1e-5, rms_norm_eps:1e-5, activation_function:'gelu_new',
    hidden_act:'silu', attention_layers:['global'], window_size:4,
    tie_word_embeddings:false, rope_theta:10000
  };
  if (family === 'gpt_neo') config.num_key_value_heads = 2;
  const {encode} = byteAlphabet();
  const tokenizer = {
    model:{type:'BPE',vocab:Object.fromEntries([...encode].map(([byte,char]) => [char,byte])),merges:[]},
    pre_tokenizer:{type:'ByteLevel',add_prefix_space:false,use_regex:true},
    decoder:{type:'ByteLevel'}, added_tokens:[{id:256,content:'<eos>',special:true}]
  };
  const tensors = new Map();
  const tensor = (name,shape,value = 0) => {
    const data = Float32Array.from({length:shape.reduce((a,b) => a*b,1)}, (_,i) => typeof value === 'function' ? value(i) : value);
    tensors.set(name,{shape,data});
  };
  const neo = family === 'gpt_neo';
  tensor(neo ? 'transformer.wte.weight' : 'model.embed_tokens.weight',[257,4], i => [1,2,3,4][i%4]);
  tensor('lm_head.weight',[257,4],i => Math.floor(i/4) === 97 ? [-1,-1,1,1][i%4] : 0);
  tensor(neo ? 'transformer.ln_f.weight' : 'model.norm.weight',[4],1);
  if (neo) { tensor('transformer.ln_f.bias',[4]); tensor('transformer.wpe.weight',[64,4]); }
  const prefix = neo ? 'transformer.h.0.' : 'model.layers.0.';
  for (const name of neo ? ['ln_1','ln_2'] : ['input_layernorm','post_attention_layernorm']) {
    tensor(prefix + name + '.weight',[4],1);
    if (neo) tensor(prefix + name + '.bias',[4]);
  }
  const ap = neo ? 'attn.attention.' : 'self_attn.';
  for (const name of ['q_proj','k_proj','v_proj']) {
    const width = !neo && name !== 'q_proj' ? 2 : 4;
    tensor(prefix+ap+name+'.weight',[width,4], i => name === 'v_proj' && i%5 === 0 ? 0.5 : 0);
    if (family === 'qwen2') tensor(prefix+ap+name+'.bias',[width]);
  }
  tensor(prefix+ap+(neo ? 'out_proj' : 'o_proj')+'.weight',[4,4]);
  if (neo) tensor(prefix+ap+'out_proj.bias',[4]);
  tensor(prefix+'mlp.'+(neo ? 'c_fc' : 'up_proj')+'.weight',[8,4]);
  tensor(prefix+'mlp.'+(neo ? 'c_proj' : 'down_proj')+'.weight',[4,8]);
  if (neo) { tensor(prefix+'mlp.c_fc.bias',[8]); tensor(prefix+'mlp.c_proj.bias',[4]); }
  else tensor(prefix+'mlp.gate_proj.weight',[8,4]);
  return {config,tensors,tokenizer};
}

export function safetensors(tensors) {
  const header = {}, chunks = []; let offset = 0;
  for (const [name,tensor] of tensors) {
    const data = Buffer.alloc(tensor.data.length * 4);
    tensor.data.forEach((value,i) => data.writeFloatLE(value,i*4));
    header[name] = {dtype:'F32',shape:tensor.shape,data_offsets:[offset,offset+data.length]};
    offset += data.length; chunks.push(data);
  }
  const headerBytes = Buffer.from(JSON.stringify(header));
  const size = Buffer.alloc(8); size.writeBigUInt64LE(BigInt(headerBytes.length));
  return Buffer.concat([size,headerBytes,...chunks]);
}

export async function writeFixture(directory,family = 'gpt_neo') {
  await mkdir(directory,{recursive:true});
  const f = fixture(family);
  await Promise.all([
    writeFile(path.join(directory,'config.json'),JSON.stringify(f.config)),
    writeFile(path.join(directory,'tokenizer.json'),JSON.stringify(f.tokenizer)),
    writeFile(path.join(directory,'model.safetensors'),safetensors(f.tensors))
  ]);
}
