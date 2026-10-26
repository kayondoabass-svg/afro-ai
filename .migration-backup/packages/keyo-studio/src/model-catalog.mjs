// Public, licensed, immutable upstream snapshots. Model weights are not KEYO code.
const shared = [
  {name:'LICENSE',bytes:11343,sha256:'832dd9e00a68dd83b3c3fb9f5588dad7dcf337a0db50f7d9483f310cd292e92e'},
  {name:'tokenizer.json',bytes:7031645,sha256:'c0382117ea329cdf097041132f6d735924b697924d6f6fc3945713e96ce87539'},
  {name:'tokenizer_config.json',bytes:7305,sha256:'5b5d4f65d0acd3b2d56a35b56d374a36cbc1c8fa5cf3b3febbbfabf22f359583'},
];
export const MODEL_CATALOG = Object.freeze([
  {
    id:'qwen25-05b-instruct',name:'Qwen2.5 0.5B Instruct',repository:'Qwen/Qwen2.5-0.5B-Instruct',
    revision:'7ae557604adf67be50417f59c2c2f167def9a775',license:'apache-2.0',
    status:'Linux CPU smoke-tested',description:'Recommended first local test. Public upstream model; CPU responses can be slow. Not broad quality or Windows certification.',
    files:[...shared,
      {name:'config.json',bytes:659,sha256:'18e18afcaccafade98daf13a54092927904649e1dd4eba8299ab717d5d94ff45'},
      {name:'model.safetensors',bytes:988097824,sha256:'fdf756fa7fcbe7404d5c60e26bff1a0c8b8aa1f72ced49e7dd0210fe288fb7fe'},
    ],
  },
  {
    id:'qwen25-7b-instruct',name:'Qwen2.5 7B Instruct',repository:'Qwen/Qwen2.5-7B-Instruct',
    revision:'a09a35458c702b33eeacc393d103063234e8bc28',license:'apache-2.0',
    status:'experimental; download verified only',description:'Large unquantized checkpoint, about 14.2 GiB. CPU execution is not certified; low-memory machines may exceed the loader timeout. Start with the 0.5B model.',
    files:[...shared,
      {name:'config.json',bytes:663,sha256:'7463bb0ea78315365e6c6b74de4e73bbcc8359dfb0c5a737584e077d42c0b03c'},
      {name:'model.safetensors.index.json',bytes:27752,sha256:'624bf7c47cd12468fdc16e38a47cf4f19e0415b859a223ba3c027eed2f0e1028'},
      {name:'model-00001-of-00004.safetensors',bytes:3945441440,sha256:'a1333e6293854747c481288ea83b348226af178dd565c49b6f9495ba1966aba7'},
      {name:'model-00002-of-00004.safetensors',bytes:3864726352,sha256:'f5d25a2772cb825164a2a2c0fb6d51a87e282abf21e4dd75bc5cfb3cd0ea6185'},
      {name:'model-00003-of-00004.safetensors',bytes:3864726424,sha256:'8efdec4c1bc12317ae1a38dc42b595ce777738a64deea3fcb8a0a91381bcdfd5'},
      {name:'model-00004-of-00004.safetensors',bytes:3556377672,sha256:'1a72d403cdf0c1ec3cb7f289f17b394a01e64394c2e9b3c0f94dbce3faf879bd'},
    ],
  },
].map(model=>Object.freeze({...model,files:Object.freeze(model.files.map(Object.freeze))})));
