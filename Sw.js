const CACHE='fatuma-v3';
const STATIC=['/','index.html','style.css','manifest.json'];
self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(STATIC)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',e=>{
  const url=e.request.url;
  if(url.includes('/api/')||url.includes('groq.com')||url.includes('googleapis.com')||url.includes('mistral.ai')||url.includes('openrouter')||url.includes('together')){
    e.respondWith(fetch(e.request).catch(()=>new Response('{"error":{"message":"You are offline. Please check your connection."}}',{headers:{'Content-Type':'application/json'}})));
    return;
  }
  e.respondWith(caches.match(e.request).then(cached=>{
    if(cached)return cached;
    return fetch(e.request).then(r=>{
      if(r&&r.ok&&r.type!=='opaque'){const cl=r.clone();caches.open(CACHE).then(c=>c.put(e.request,cl));}
      return r;
    });
  }));
});
