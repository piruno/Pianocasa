const CACHE="pianocasa-v14";
const ASSETS=["./","./index.html","./style.css","./app.js","./config.js","./manifest.webmanifest","./icon-192.png","./icon-512.png"];

self.addEventListener("install",e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});

self.addEventListener("activate",e=>{
  e.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET") return;
  e.respondWith(
    fetch(e.request)
      .then(res=>{
        const copy=res.clone();
        caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{});
        return res;
      })
      .catch(()=>caches.match(e.request))
  );
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
