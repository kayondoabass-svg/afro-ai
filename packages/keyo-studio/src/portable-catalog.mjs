import { MODEL_CATALOG } from './model-catalog.mjs';
const qwen = MODEL_CATALOG[0];
// Immutable, public snapshots only. A download is not a hardware certification.
export const PORTABLE_CATALOG = Object.freeze([
  {...qwen,architecture:'Qwen2',bytes:qwen.files.reduce((n,f)=>n+f.bytes,0),
    licenseUrl:`https://huggingface.co/${qwen.repository}/blob/${qwen.revision}/LICENSE`,
    note:'988 MB weights. KEYO CPU alpha; 512-token context. Phone speed is not certified.'},
  {id:'smollm2-135m-instruct',name:'SmolLM2 135M Instruct',architecture:'Llama',
    repository:'HuggingFaceTB/SmolLM2-135M-Instruct',revision:'12fd25f77366fa6b3b4b768ec3050bf629380bac',
    license:'apache-2.0',licenseUrl:'https://huggingface.co/HuggingFaceTB/SmolLM2-135M-Instruct/blob/12fd25f77366fa6b3b4b768ec3050bf629380bac/README.md',
    note:'269 MB weights. Llama architecture, not a Meta Llama model. CPU alpha; phone speed is not certified.',
    bytes:269060552+861+2104556+3764,
    files:[
      {name:'config.json',bytes:861,sha256:'8eb740e8bbe4cff95ea7b4588d17a2432deb16e8075bc5828ff7ba9be94d982a'},
      {name:'tokenizer.json',bytes:2104556,sha256:'9ca9acddb6525a194ec8ac7a87f24fbba7232a9a15ffa1af0c1224fcd888e47c'},
      {name:'tokenizer_config.json',bytes:3764,sha256:'4ec77d44f62efeb38d7e044a1db318f6a939438425312dfa333b8382dbad98df'},
      {name:'model.safetensors',bytes:269060552,sha256:'5af571cbf074e6d21a03528d2330792e532ca608f24ac70a143f6b369968ab8c'},
    ]},
]);
export function portableModel(id) {
  const model=PORTABLE_CATALOG.find(m=>m.id===id);
  if(!model) throw new Error('Model is not in the pinned portable catalogue.');
  return model;
}
