// Only bundled, public static files are precached. Never cache API responses,
// conversations or model weights. Vary: Origin differs between precache fetches
// and browser module requests on hosts such as Hugging Face.
export function keyoShellSource(version,files) {
  return `const PREFIX='keyo-shell:'+self.registration.scope+':';const CACHE=PREFIX+${JSON.stringify(version)};const FILES=${JSON.stringify(files)};
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||!e.request.url.startsWith(self.registration.scope))return;e.respondWith(caches.open(CACHE).then(c=>c.match(e.request,{ignoreSearch:true,ignoreVary:true}).then(r=>r||fetch(e.request))));});`;
}
