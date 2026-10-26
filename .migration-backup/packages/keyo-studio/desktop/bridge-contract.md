# KEYO desktop renderer bridge

Product: KEYO Studio is a local LLM/SLM workspace for developers using our own
CPU inference engine. This is an early alpha, not a certified larger-model runner.
No login, paid API, cloud inference or telemetry is required.

The native preload exposes `window.keyo`, with these async methods. Failures reject
with a readable Error. All history stays in the current OS user's local data folder.

- `state()` -> State
- `chooseModel()` -> State (native folder picker; cancellation keeps current state)
- `unloadModel()` -> State
- `listChats()` -> ChatSummary[]
- `createChat()` -> Chat
- `getChat(id)` -> Chat
- `renameChat(id, title)` -> Chat
- `deleteChat(id)` -> void
- `generate({chatId, prompt, maxTokens, temperature, mode})` -> `{jobId, messageId}`
- `cancel()` -> void
- `onEvent(callback)` -> unsubscribe function

State:
`{mode:"desktop", platform, model:null|{id,architecture,context,tensors,parameters,chatTemplate:null|"chatml"|"llama3"}, loading:boolean, busy:boolean, limits:{maxTokens:128,context:512,maxWeightsMiB:256}}`.

ChatSummary: `{id,title,createdAt,updatedAt,messageCount}`.
Chat: `{id,title,createdAt,updatedAt,messages:Message[]}`.
Message: `{id,role:"user"|"assistant",content,status:"complete"|"generating"|"cancelled"|"error",model?:string,mode?:"completion"|"chat",usage?:{prompt_tokens,completion_tokens,total_tokens},finishReason?:string}`.

Generation options: maxTokens integer 1..128, temperature 0..2; default 32 and 0.
The mode "completion" continues the user's raw text (suitable for base models).
The mode "chat" uses supported instruction templates and previous messages.
Never describe a base model continuation as a trained assistant response.

Events:
- `{type:"state",state:State}`
- `{type:"token",jobId,chatId,messageId,text}` (incremental text)
- `{type:"done",jobId,chatId,messageId,finishReason,usage}`
- `{type:"error",jobId,chatId,messageId,message,cancelled:boolean}`

Only one generation can run. Block model switches/deleting the active chat
during generation. Cancel must remain available. Show errors explicitly; do not
fabricate replies, model libraries, hardware figures, token usage or completion.
Support empty states, rename/delete chat, real streamed output and real options.
Weights must be supplied separately: compatible config.json, tokenizer.json,
and a single model.safetensors. Both checkpoint and decoded weights are limited
to 256 MiB, with context capped at 512 tokens. GPU/GGUF/14B support is not ready.

Renderer must use textContent for all model/user strings, not unsafe HTML.
No remote scripts, fonts, images or network fetch calls. No inline scripts/styles
or handlers; CSP permits same-origin files only. Responsive desktop and phone
layouts, keyboard accessibility, no emojis anywhere.

For the hosted interface preview, window.keyo is absent. Implement a preview
bridge in bridge.mjs which provides real browser-local chat CRUD using localStorage,
mode:"preview", model:null, loading:false, busy:false and the same limits.
Generation and native model selection must be visibly unavailable, with a clear
"Interface preview — install the desktop app to run local models" explanation.
Never simulate model loading or AI replies. Let people actually create, rename and
delete preview conversations, explicitly stored only in their browser.
