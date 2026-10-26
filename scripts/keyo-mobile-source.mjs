import fs from 'node:fs/promises';
import path from 'node:path';
// Also bundled into the production CJS server; never evaluate import.meta here.
const root=process.cwd();
export const mobileSourcePermitted=name=>
  /^mobile\/(?:index\.html|package\.json|tsconfig\.json|vite\.config\.ts|capacitor\.config\.ts|README\.md)$/.test(name)||
  /^mobile\/src\/(?:[a-zA-Z.-]+\.(?:tsx?|css)|components\/error-boundary\.tsx)$/.test(name)||
  /^mobile\/public\/(?:favicon\.svg|robots\.txt)$/.test(name)||
  /^mobile\/android\/(?:gradlew(?:\.bat)?|[a-z.-]+\.gradle|gradle\.properties|gradle\/wrapper\/gradle-wrapper\.(?:jar|properties)|app\/(?:build\.gradle|proguard-rules\.pro|src\/main\/(?:AndroidManifest\.xml|java\/com\/keyostudio\/app\/MainActivity\.java|res\/[a-z0-9-]+\/[a-z0-9_.]+)))$/.test(name);
export async function prepareMobileSource() {
  const source=path.join(root,'artifacts/keyo-mobile'),target=path.join(root,'packages/keyo-studio/mobile');
  await fs.mkdir(target,{recursive:true});
  const files=['App.tsx','main.tsx','index.css','studio-types.ts','useKeyoStudio.ts','engine.worker.ts','storage.worker.ts','local-history.ts','components/error-boundary.tsx'];
  for(const relative of files) {
    const destination=path.join(target,'src',relative);await fs.mkdir(path.dirname(destination),{recursive:true});
    const text=(await fs.readFile(path.join(source,'src',relative),'utf8')).replaceAll('../../../packages/keyo-studio/src/','../../src/');
    await fs.writeFile(destination,text);
  }
  await fs.copyFile(path.join(source,'index.html'),path.join(target,'index.html'));
  await fs.mkdir(path.join(target,'public'),{recursive:true});
  for(const file of ['favicon.svg','robots.txt'])await fs.copyFile(path.join(source,'public',file),path.join(target,'public',file));
  await fs.copyFile(path.join(source,'capacitor.config.ts'),path.join(target,'capacitor.config.ts'));
  const portablePackage={
    name:'keyo-studio-portable',version:'0.2.0-alpha.1',private:true,type:'module',
    engines:{node:'>=22.12'},scripts:{dev:'vite --host 0.0.0.0',build:'vite build',android:'npm run build && cap sync android',apk:'npm run android && cd android && ./gradlew assembleDebug'},
    dependencies:{react:'19.1.0','react-dom':'19.1.0','lucide-react':'0.577.0','@noble/hashes':'2.2.0','@capacitor/core':'8.5.3','@capacitor/android':'8.5.3'},
    devDependencies:{'@capacitor/cli':'8.5.3','@vitejs/plugin-react':'4.7.0',vite:'7.3.7',typescript:'5.9.3','@types/node':'22.19.15','@types/react':'19.1.0','@types/react-dom':'19.1.0','@tailwindcss/vite':'4.1.18',tailwindcss:'4.1.18','tw-animate-css':'1.4.0','@tailwindcss/typography':'0.5.19'},
  };
  for(const group of ['dependencies','devDependencies'])
    for(const name of Object.keys(portablePackage[group])) {
      let file=path.join(source,'node_modules',name,'package.json');
      try{await fs.access(file);}catch{file=path.join(root,'node_modules',name,'package.json');}
      portablePackage[group][name]=JSON.parse(await fs.readFile(file,'utf8')).version;
    }
  await fs.writeFile(path.join(target,'package.json'),JSON.stringify(portablePackage,null,2));
  await fs.writeFile(path.join(target,'tsconfig.json'),JSON.stringify({compilerOptions:{target:'ES2022',module:'ESNext',moduleResolution:'bundler',jsx:'react-jsx',strict:true,skipLibCheck:true,allowImportingTsExtensions:true,noEmit:true,types:['vite/client'],paths:{'@/*':['./src/*']}},include:['src']},null,2));
  await fs.writeFile(path.join(target,'vite.config.ts'),`import {defineConfig} from 'vite';import react from '@vitejs/plugin-react';import tailwind from '@tailwindcss/vite';import path from 'node:path';import {readdirSync,writeFileSync} from 'node:fs';
export default defineConfig({base:'./',css:{postcss:{plugins:[]}},plugins:[react(),tailwind(),{name:'offline',closeBundle(){const files=['./','./index.html',...readdirSync('dist/public/assets').map(n=>'./assets/'+n)];writeFileSync('dist/public/sw.js',\`const CACHE='keyo-portable-'+self.registration.scope+'-0.2.0-alpha.1';self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(\${JSON.stringify(files)})).then(()=>self.skipWaiting())));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{if(e.request.method==='GET'&&e.request.url.startsWith(self.registration.scope))e.respondWith(caches.open(CACHE).then(c=>c.match(e.request,{ignoreSearch:true}).then(r=>r||fetch(e.request))));});\`);}}],resolve:{alias:{'@':path.resolve(import.meta.dirname,'src')}},build:{outDir:'dist/public',emptyOutDir:true},server:{fs:{allow:['..']}}});`);
  async function walk(directory,prefix='android/') {
    for(const entry of await fs.readdir(directory,{withFileTypes:true})) {
      const relative=prefix+entry.name;
      if(entry.isSymbolicLink())throw new Error('Symlink refused in Android source.');
      if(entry.isDirectory()&&!['build','.gradle','assets','node_modules','.idea'].includes(entry.name))
        await walk(path.join(directory,entry.name),relative+'/');
      else if(entry.isFile()&&mobileSourcePermitted('mobile/'+relative)) {
        const destination=path.join(target,relative);await fs.mkdir(path.dirname(destination),{recursive:true});await fs.copyFile(path.join(directory,entry.name),destination);
      }
    }
  }
  await walk(path.join(source,'android'));
  await fs.writeFile(path.join(target,'README.md'),`# KEYO Studio portable alpha

Runs KEYO's own JavaScript CPU engine in a dedicated worker. Not ONNX, Transformers.js, llama.cpp or a cloud API.

Node >=22.12: npm install, npm run build. For Android: install JDK 21 and Android SDK 36, run npm run android, then cd android && ./gradlew assembleDebug (Windows: gradlew.bat).

Debug APKs are test builds, not Play Store releases. Device execution and signing/release certification are separate from an APK compiling.

Models are not bundled. Explicitly accept each model licence, then download or import the exact pinned files (listed in ../src/portable-catalog.mjs). OPFS stores weights, IndexedDB stores chats. Both are local, not encrypted, and may be cleared by the browser/OS. Request storage persistence and keep your original model files.

CPU-only: F32/F16/BF16, 512 context tokens, at most 128 output tokens, bounded 256 KiB weight scratch space. No GPU, WASM/SIMD or integer quantization is shipped. Qwen2.5 0.5B and SmolLM2 135M have separate numerical evidence; this does not certify other variants or phone speed.

Stop/backgrounding terminates and unloads the worker, retaining model files and interrupted messages. Load again to continue. No SharedArrayBuffer or cross-origin-isolation assumption.

Conversations use an explicit model. Create a new conversation when changing models. The 512-token limit includes history, template and output; shorten your chat if it exceeds this limit.
`);
}
