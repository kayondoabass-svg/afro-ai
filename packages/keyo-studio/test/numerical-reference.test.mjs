import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixture.mjs';
import { KeyoEngine } from '../src/engine.mjs';
import { ByteBPE } from '../src/tokenizer.mjs';

// Independent, full-sequence scalar reference. No engine math helpers, native
// kernels or incremental cache are used to calculate the expected logits.
const fp = values => Float32Array.from(values);
const plus = (a,b) => fp(a.map((x,i)=>x+b[i]));
function reference(f,tokens) {
  const neo=f.config.model_type==='gpt_neo',weights=f.tensors;
  const get=name=>weights.get(name);
  const h=f.config.hidden_size,heads=f.config.num_attention_heads;
  const size=h/heads,kv=f.config.num_key_value_heads;
  function linear(x,name,bias=false) {
    const tensor=get(name+'.weight'),out=[];
    for(let r=0;r<tensor.shape[0];r++) {
      let sum=0;for(let c=0;c<x.length;c++)sum+=tensor.data[r*x.length+c]*x[c];
      out.push(Math.fround(sum));
    }
    return bias?plus(fp(out),get(name+'.bias').data):fp(out);
  }
  function norm(x,name) {
    const mean=neo?Array.from(x).reduce((a,b)=>a+b,0)/h:0;
    let variance=0;for(const value of x)variance+=(value-mean)**2;
    const scale=1/Math.sqrt(variance/h+1e-5),w=get(name+'.weight').data;
    return fp(Array.from(x,(value,i)=>(value-mean)*scale*w[i]+(neo?get(name+'.bias').data[i]:0)));
  }
  function rotation(x,position) {
    const out=x.slice();
    for(let b=0;b<x.length;b+=size)for(let i=0;i<size/2;i++) {
      const angle=position/(f.config.rope_theta**(2*i/size)),a=x[b+i],z=x[b+i+size/2];
      out[b+i]=a*Math.cos(angle)-z*Math.sin(angle);
      out[b+i+size/2]=z*Math.cos(angle)+a*Math.sin(angle);
    }
    return out;
  }
  const embedding=get(neo?'transformer.wte.weight':'model.embed_tokens.weight');
  let xs=tokens.map((token,t)=>{
    const x=embedding.data.slice(token*h,(token+1)*h);
    return neo?plus(x,get('transformer.wpe.weight').data.slice(t*h,(t+1)*h)):x;
  });
  for(let layer=0;layer<f.config.num_hidden_layers;layer++) {
    const p=neo?`transformer.h.${layer}.`:`model.layers.${layer}.`;
    const a=p+(neo?'attn.attention.':'self_attn.');
    const ns=xs.map(x=>norm(x,p+(neo?'ln_1':'input_layernorm')));
    const qs=ns.map((x,t)=>{const v=linear(x,a+'q_proj',!neo&&f.config.model_type==='qwen2');return neo?v:rotation(v,t);});
    const ks=ns.map((x,t)=>{const v=linear(x,a+'k_proj',!neo&&f.config.model_type==='qwen2');return neo?v:rotation(v,t);});
    const vs=ns.map(x=>linear(x,a+'v_proj',!neo&&f.config.model_type==='qwen2'));
    xs=xs.map((x,t)=>{
      const attention=new Float32Array(h);
      const first=neo&&f.config.attention_layers[layer]==='local'?Math.max(0,t+1-f.config.window_size):0;
      for(let head=0;head<heads;head++) {
        const qb=head*size,kb=Math.floor(head/(heads/kv))*size,scores=[];
        for(let j=first;j<=t;j++) {
          let sum=0;for(let d=0;d<size;d++)sum+=qs[t][qb+d]*ks[j][kb+d];
          scores.push(neo?sum:sum/Math.sqrt(size));
        }
        const max=Math.max(...scores),exps=scores.map(s=>Math.exp(s-max)),den=exps.reduce((a,b)=>a+b,0);
        for(let d=0;d<size;d++) {
          let sum=0;for(let j=first;j<=t;j++)sum+=(exps[j-first]/den)*vs[j][kb+d];
          attention[qb+d]=sum;
        }
      }
      x=plus(x,linear(attention,a+(neo?'out_proj':'o_proj'),neo));
      const n=norm(x,p+(neo?'ln_2':'post_attention_layernorm'));
      const up=linear(n,p+'mlp.'+(neo?'c_fc':'up_proj'),neo);
      const gate=neo?null:linear(n,p+'mlp.gate_proj');
      const activated=fp(Array.from(up,(v,i)=>neo
        ?0.5*v*(1+Math.tanh(Math.sqrt(2/Math.PI)*(v+0.044715*v**3)))
        :v*gate[i]/(1+Math.exp(-gate[i]))));
      return plus(x,linear(activated,p+'mlp.'+(neo?'c_proj':'down_proj'),neo));
    });
  }
  return linear(norm(xs.at(-1),neo?'transformer.ln_f':'model.norm'),'lm_head');
}

for(const family of ['gpt_neo','qwen2','llama'])test(`${family}: cached logits match an independent causal full-sequence reference`,()=>{
  const f=fixture(family);
  f.config.num_hidden_layers=2;f.config.num_layers=2;
  f.config.attention_layers=['global','local'];f.config.window_size=2;
  for(const [name,tensor]of [...f.tensors])if(name.includes('.h.0.')||name.includes('.layers.0.'))
    f.tensors.set(name.replace('.h.0.','.h.1.').replace('.layers.0.','.layers.1.'),
      {shape:[...tensor.shape],data:tensor.data.slice()});
  let seed=17;
  for(const [name,tensor]of f.tensors)tensor.data=fp(Array.from(tensor.data,()=>{
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    return (name.includes('norm')||name.includes('ln_'))&&name.endsWith('.weight')
      ?1+(seed/2**32-0.5)*0.2:(seed/2**32-0.5)*0.4;
  }));
  const engine=new KeyoEngine(f.config,f.tensors,new ByteBPE(f.tokenizer)),cache=engine.cache(),prefix=[];
  for(const token of [97,98,99,100,101]) {
    prefix.push(token);const expected=reference(f,prefix),actual=engine.forward(token,cache);
    for(let i=0;i<actual.length;i++)assert.ok(Math.abs(expected[i]-actual[i])<1e-6,`token ${prefix.length}, logit ${i}`);
  }
});
