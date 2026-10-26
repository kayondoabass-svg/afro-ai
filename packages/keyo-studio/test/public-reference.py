"""Independent NumPy full-sequence reference for public, pinned Qwen/Llama QA.
Not shipped in the runtime; no model runner, remote inference or paid API.
Usage: python public-reference.py MODEL_DIR TOKEN_IDS_JSON OUTPUT_JSON
"""
import json, struct, sys, pathlib
import numpy as np

directory=pathlib.Path(sys.argv[1])
config=json.loads((directory/"config.json").read_text())
tokens=json.loads(sys.argv[2])
with open(directory/"model.safetensors","rb") as f:
    header_size=struct.unpack("<Q",f.read(8))[0]
    header=json.loads(f.read(header_size))
base=8+header_size

def weight(name):
    entry=header[name];offset=base+entry["data_offsets"][0]
    raw=np.memmap(directory/"model.safetensors",mode="r",offset=offset,
                  dtype={"F32":"<f4","F16":"<f2","BF16":"<u2"}[entry["dtype"]],
                  shape=tuple(entry["shape"]))
    if entry["dtype"]=="BF16":
        return (np.asarray(raw,dtype=np.uint32)<<16).view(np.float32)
    return np.asarray(raw,dtype=np.float32)

def norm(x,name):
    return x/np.sqrt(np.mean(x*x,axis=-1,keepdims=True)+config["rms_norm_eps"])*weight(name)

def linear(x,name,bias=False):
    y=x@weight(name+".weight").T
    return y+weight(name+".bias") if bias else y

heads=config["num_attention_heads"];kv=config["num_key_value_heads"]
dim=config["hidden_size"]//heads
theta=config["rope_theta"];seq=len(tokens)
angles=np.arange(seq)[:,None]/theta**(np.arange(0,dim,2,dtype=np.float64)/dim)
cos=np.cos(angles).astype(np.float32)[:,None,:]
sin=np.sin(angles).astype(np.float32)[:,None,:]
def rope(x):
    a=x[...,:dim//2];b=x[...,dim//2:]
    return np.concatenate([a*cos-b*sin,b*cos+a*sin],axis=-1)

x=weight("model.embed_tokens.weight")[tokens]
for layer in range(config["num_hidden_layers"]):
    p=f"model.layers.{layer}."
    y=norm(x,p+"input_layernorm.weight")
    q=rope(linear(y,p+"self_attn.q_proj",config["model_type"]=="qwen2").reshape(seq,heads,dim))
    k=rope(linear(y,p+"self_attn.k_proj",config["model_type"]=="qwen2").reshape(seq,kv,dim))
    v=linear(y,p+"self_attn.v_proj",config["model_type"]=="qwen2").reshape(seq,kv,dim)
    k=np.repeat(k,heads//kv,axis=1);v=np.repeat(v,heads//kv,axis=1)
    scores=np.einsum("thd,shd->hts",q,k)/np.sqrt(dim)
    scores=np.where(np.triu(np.ones((seq,seq),dtype=bool),1),-np.inf,scores)
    probs=np.exp(scores-np.max(scores,axis=-1,keepdims=True));probs/=np.sum(probs,axis=-1,keepdims=True)
    a=np.einsum("hts,shd->thd",probs,v).reshape(seq,-1).astype(np.float32)
    x=x+linear(a,p+"self_attn.o_proj")
    y=norm(x,p+"post_attention_layernorm.weight")
    gate=linear(y,p+"mlp.gate_proj")
    y=linear(y,p+"mlp.up_proj")*(gate/(1+np.exp(-gate)))
    x=x+linear(y,p+"mlp.down_proj")
output="lm_head.weight" if "lm_head.weight" in header else "model.embed_tokens.weight"
logits=norm(x,"model.norm.weight")@weight(output).T
pathlib.Path(sys.argv[3]).write_text(json.dumps(logits.tolist()))
