const CACHE='fatuma-v5';
const ASSETS=['/','index.html','style.css','manifest.json'];
self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',e=>{
  const u=e.request.url;
  if(u.includes('/api/')||u.includes('groq')||u.includes('googleapis')||u.includes('mistral')||u.includes('openrouter')||u.includes('together')){
    e.respondWith(fetch(e.request).catch(()=>new Response('{"error":{"message":"Offline."}}',{headers:{'Content-Type':'application/json'}})));
    return;
  }
  e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request).then(r=>{
    if(r&&r.ok&&r.type!=='opaque'){const cl=r.clone();caches.open(CACHE).then(cc=>cc.put(e.request,cl));}
    return r;
  })));
});
