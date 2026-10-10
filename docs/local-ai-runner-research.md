# Local AI runners — preliminary global inventory

This is not a worldwide census or a ranking. At least **17 distinct named
projects/products** are identifiable across desktop apps, API runtimes and
inference engines. Some apps use the same engine, and not all products are
open source. Do not count these as 17 independent engines or equivalent apps.

| Project/product | Category | Primary source |
|---|---|---|
| Ollama | Local runtime/CLI | https://ollama.com |
| LM Studio | Desktop product | https://lmstudio.ai |
| Jan | Desktop product | https://jan.ai |
| GPT4All | Desktop product/backend | https://www.nomic.ai/gpt4all |
| Msty Studio | Desktop product | https://msty.ai/products/studio |
| AnythingLLM | Desktop/workspace, uses underlying runners | https://anythingllm.com/download |
| KoboldCpp | Local UI/runtime based on llama.cpp | https://github.com/LostRuins/koboldcpp |
| llamafile | Single-file runtime based on llama.cpp | https://github.com/mozilla-ai/llamafile |
| LocalAI | Local multi-backend API/runtime | https://localai.io |
| Lemonade | Local API/CLI/UI | https://lemonade-server.ai |
| GenieX / formerly Nexa SDK | Local SDK/runtime; one project, not two | https://github.com/qualcomm/GenieX |
| Textgen / formerly text-generation-webui | Local multi-backend interface | https://github.com/oobabooga/textgen |
| llama.cpp | Inference engine | https://github.com/ggml-org/llama.cpp |
| vLLM | Inference/serving engine | https://github.com/vllm-project/vllm |
| LMDeploy/TurboMind | Inference/serving engine | https://github.com/InternLM/lmdeploy |
| MNN / MNN-LLM | On-device inference framework/runtime | https://github.com/alibaba/MNN |
| FastDeploy | LLM/VLM serving framework | https://github.com/PaddlePaddle/FastDeploy |

## Regional checks

- **China:** LMDeploy authors include Shanghai AI Laboratory
  (https://arxiv.org/html/2508.15601v2).
  MNN's technical report identifies Alibaba affiliations in China
  (https://arxiv.org/html/2506.10443v1).
  FastDeploy belongs to the PaddlePaddle ecosystem; avoid inventing a separate
  corporate headquarters attribution based only on its GitHub README.
- **Europe:** LocalAI creator's public profile identifies Italy
  (https://github.com/mudler). llama.cpp creator's public profile identifies
  Bulgaria (https://github.com/ggerganov). These are creator associations,
  not a claim that international contributions come from only those countries.
- **Africa:** searches did not establish a comparable African-origin runner
  sufficient to verify a priority claim. Lelapa (https://lelapa.ai) and
  Masakhane (https://masakhane.io) are relevant African AI initiatives, but
  they should not be counted as desktop runners without product evidence.

**No search results is not proof that no African runner exists.** Consequently
“KEYO is eighth worldwide” and “KEYO Technologies is the first company in Africa”
remain unverified. The substantiated product identity supplied by its creator
is Ugandan-built KEYO Studio by KEYO Technologies.
