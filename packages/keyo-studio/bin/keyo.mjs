#!/usr/bin/env node
import { mkdir, readFile, writeFile, lstat, chmod } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { KeyoEngine } from '../src/engine.mjs';
import { startServer } from '../src/server.mjs';

const help = `KEYO Studio LLM/SLM Runner — 0.1.0-alpha.1
Our CPU engine. No cloud AI API, no telemetry, no bundled model.
Requires Node 20+ and a supported, locally downloaded model.

keyo inspect MODEL_DIRECTORY
keyo chat MODEL_DIRECTORY --prompt "Once upon a time" [--max-tokens 32]
keyo serve MODEL_DIRECTORY [--port 4317]

Folder: config.json + tokenizer.json + model.safetensors (max 256 MiB).
Architectures: basic GPT-Neo, Qwen2, Llama. Unsupported variants fail explicitly.
Not yet: GGUF, quantized weights, GPUs, Tauri desktop installers, training.
`;

async function apiToken() {
  if (process.env.KEYO_API_TOKEN) return {token:process.env.KEYO_API_TOKEN, location:'KEYO_API_TOKEN environment variable'};
  const directory = path.join(os.homedir(), '.keyo-studio');
  await mkdir(directory,{recursive:true,mode:0o700});
  if ((await lstat(directory)).isSymbolicLink()) throw new Error('Refusing a symlinked credential directory.');
  if (process.platform !== 'win32') await chmod(directory,0o700);
  const file = path.join(directory,'api-token');
  try { await writeFile(file,randomBytes(32).toString('hex'),{flag:'wx',mode:0o600}); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  const stat = await lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Invalid credential file.');
  if (process.platform !== 'win32') await chmod(file,0o600);
  return {token:(await readFile(file,'utf8')).trim(),location:file};
}

try {
  const [command,directory,...args] = process.argv.slice(2);
  if (!command || ['help','--help','-h'].includes(command)) { console.log(help); }
  else if (['--version','version'].includes(command)) console.log('0.1.0-alpha.1');
  else {
    if (!['inspect','chat','serve'].includes(command) || !directory) throw new Error('Unknown command or missing model directory. Use keyo --help.');
    const options = {};
    for (let i = 0; i < args.length; i += 2) {
      if (!['--prompt','--max-tokens','--port'].includes(args[i]) || args[i+1] === undefined || options[args[i]] !== undefined) throw new Error('Unknown, missing or repeated option.');
      options[args[i]] = args[i+1];
    }
    const allowed = command === 'chat' ? ['--prompt','--max-tokens'] : command === 'serve' ? ['--port'] : [];
    if (Object.keys(options).some(key => !allowed.includes(key))) throw new Error('Option is not valid for this command.');
    if (command === 'serve') {
      const credentials = await apiToken();
      const runner = await startServer({directory,token:credentials.token,port:Number(options['--port'] ?? 4317)});
      console.log(`KEYO CPU runner ready: http://127.0.0.1:${runner.port}\nModel: ${runner.info.id}\nBearer credential: ${credentials.location}\nToken values are not printed. Ctrl+C stops the runner.`);
      let stopping = false;
      const stop = async () => { if (stopping) return; stopping = true; await runner.close(); };
      process.once('SIGINT',stop); process.once('SIGTERM',stop);
    } else {
      const engine = await KeyoEngine.load(directory);
      if (command === 'inspect') console.log(JSON.stringify(engine.info(),null,2));
      else {
        if (!options['--prompt']) throw new Error('Provide --prompt. This alpha uses text continuation; chat templates are available through the API for supported instruction models.');
        const abort = new AbortController();
        process.once('SIGINT',() => abort.abort());
        for await (const event of engine.generate(options['--prompt'],{maxTokens:Number(options['--max-tokens'] ?? 32),signal:abort.signal}))
          if (event.type === 'token') process.stdout.write(event.text);
        process.stdout.write('\n');
      }
    }
  }
} catch (error) { console.error(`KEYO: ${error.message}`); process.exitCode = 1; }
