const CACHE="pianocasa-v19";
const ASSETS=["./","./index.html","./style.css","./app.js","./config.js","./manifest.webmanifest","./icon-192.png","./icon-512.png","./offline.html","./offline.js","./offline-store.js","./boot.js","./savings.js","./savings-core.js"];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('pianocasa-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET')return;const u=new URL(e.request.url);
 // Cache only app assets and versioned libraries, never Firebase API/user responses or photos.
 const local=u.origin===self.location.origin&&ASSETS.some(p=>new URL(p,self.registration.scope).pathname===u.pathname);
 const library=u.hostname==='www.gstatic.com'&&u.pathname.startsWith('/firebasejs/10.14.1/');
 if(!local&&!library)return;
 e.respondWith((async()=>{const cache=await caches.open(CACHE);const key=e.request.mode==='navigate'?new URL(u.pathname,self.location.origin).href:e.request;const hit=await cache.match(key);if(hit)return hit;try{const r=await fetch(e.request);if(r.ok)await cache.put(key,r.clone());return r}catch{if(e.request.mode==='navigate')return cache.match('./offline.html');return Response.error()}})());
});
self.addEventListener("push",e=>{
  let d={};
  try{d=e.data.json()}catch{d={title:"PianoCasa",body:e.data?.text()||"Hai un promemoria"}}
  e.waitUntil(self.registration.showNotification(d.title||"PianoCasa",{
    body:d.body||"Tocca per aprire il menu completo.",
    icon:"./icon-192.png",
    badge:"./icon-192.png",
    data:{url:d.url||"./"}
  }));
});

self.addEventListener("notificationclick",e=>{
  e.notification.close();
  const target=new URL(e.notification.data?.url||"./",self.location.href);
  const date=target.searchParams.get('menu');
  e.waitUntil((async()=>{
    const wins=await clients.matchAll({type:"window",includeUncontrolled:true});
    const appClient=wins.find(c=>c.url.startsWith(self.registration.scope));
    if(appClient){
      await appClient.focus();
      appClient.postMessage({type:'OPEN_MENU',date,url:target.href});
      return;
    }
    return clients.openWindow(target.href);
  })());
});
