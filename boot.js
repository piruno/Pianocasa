(()=>{
 const b=document.createElement('div');b.className='offlineBar';b.innerHTML='<a href="offline.html">Apri spesa offline</a> <span id="offlineStatus">Apri la Spesa online una volta per preparare la copia locale.</span>';document.querySelector('header').after(b);
 const s=PCOffline.read('pc19_snapshot',null);if(s)document.getElementById('offlineStatus').textContent=`Copia locale: ${new Date(s.at).toLocaleString('it-IT')}`;
 if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{document.getElementById('offlineStatus').textContent='Preparazione offline non riuscita: riprova con connessione.'});
})();
