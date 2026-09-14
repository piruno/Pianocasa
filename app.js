import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, onSnapshot, query, where, writeBatch } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
const $=id=>document.getElementById(id), C=window.PIANOCASA_CONFIG||{};
const badConfig=!C.firebase||String(C.firebase.apiKey||'').startsWith('INCOLLA_');
let app,auth,db,user,userDoc,householdId,member,profiles={},days=[],extras=[],checks={},currentProfileId,currentDate=isoToday(),listeners=[],hideDone=false;
let expandedCats=new Set(),scrollAfterRender=null;
let menuOverlayDate=new URLSearchParams(location.search).get('menu')||null;
if(badConfig){$('setupView').classList.remove('hidden')}else{app=initializeApp(C.firebase);auth=getAuth(app);db=getFirestore(app);$('authView').classList.remove('hidden');onAuthStateChanged(auth,handleAuth)}
function isoToday(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function parseISO(s){const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)}
function addDays(s,n){const d=parseISO(s);d.setDate(d.getDate()+n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function fmt(s,short=false){if(!s)return'';return new Intl.DateTimeFormat('it-IT',short?{weekday:'short',day:'2-digit',month:'2-digit'}:{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(parseISO(s))}
function datesBetween(a,b){let r=[];if(!a||!b||a>b)return r;for(let d=a;d<=b&&r.length<400;d=addDays(d,1))r.push(d);return r}
function idSafe(s){return btoa(unescape(encodeURIComponent(s))).replaceAll('/','_').replaceAll('+','-').replaceAll('=','')}
function allCats(p){return p.meals.flatMap(m=>m.categories)}
function itemMap(p){const m={};for(const meal of p.meals)for(const c of meal.categories)for(const it of c.items)m[it.id]=it;return m}
function dayDoc(pid,date){return days.find(x=>x.profileId===pid&&x.date===date)||{profileId:pid,date,selections:{},consumed:{}}}
function selectedItem(p,d,c){const id=d.selections?.[c.id];return id?c.items.find(x=>x.id===id):null}
function totalKcal(p,d){let t=0;for(const c of allCats(p)){const i=selectedItem(p,d,c);if(i)t+=i.kcal}return t}
function complete(p,d){return allCats(p).every(c=>selectedItem(p,d,c))}
function show(id){['authView','onboardView','appView'].forEach(x=>$(x).classList.toggle('hidden',x!==id));$('signoutBtn').classList.toggle('hidden',id!=='appView')}
$('loginBtn')?.addEventListener('click',async()=>{try{await signInWithEmailAndPassword(auth,$('email').value.trim(),$('password').value);$('authMsg').textContent=''}catch(e){$('authMsg').textContent=e.message}})
$('registerBtn')?.addEventListener('click',async()=>{try{await createUserWithEmailAndPassword(auth,$('email').value.trim(),$('password').value);$('authMsg').textContent=''}catch(e){$('authMsg').textContent=e.message}})
$('signoutBtn').onclick=()=>signOut(auth);
async function handleAuth(u){clearListeners();user=u;if(!u){show('authView');return}const snap=await getDoc(doc(db,'users',u.uid));if(!snap.exists()){show('onboardView');renderOnboard()}else{userDoc=snap.data();householdId=userDoc.householdId;currentProfileId=userDoc.profileId;await startApp()}}
function clearListeners(){listeners.forEach(f=>f());listeners=[]}
function renderOnboard(){show('onboardView');$('onboardBody').innerHTML=`<p>Scegli solo la prima volta.</p><div class="actions"><button id="createHome" class="primary">Sono Vincenzo · crea famiglia</button></div><hr><label>Codice invito<input id="inviteCode" maxlength="14" placeholder="codice da Vincenzo"></label><button id="joinHome" class="primary" style="margin-top:8px">Sono Anna · entra</button><div id="onMsg" class="msg"></div>`;$('createHome').onclick=createHousehold;$('joinHome').onclick=joinHousehold}
async function createHousehold(){try{const hid=crypto.randomUUID();const b=writeBatch(db);b.set(doc(db,'households',hid),{createdAt:Date.now(),label:'Casa'});b.set(doc(db,'households',hid,'members',user.uid),{uid:user.uid,email:user.email,profileId:'vincenzo',displayName:'Vincenzo',notifyAt:'07:30',includePartnerMenu:false,owner:true});b.set(doc(db,'users',user.uid),{householdId:hid,profileId:'vincenzo',email:user.email});await b.commit();location.reload()}catch(e){$('onMsg').textContent=e.message}}
async function joinHousehold(){try{const code=$('inviteCode').value.trim().toUpperCase();const invRef=doc(db,'invites',code),s=await getDoc(invRef);if(!s.exists())throw new Error('Codice non trovato.');const inv=s.data();if(inv.claimedBy)throw new Error('Codice già usato.');await updateDoc(invRef,{claimedBy:user.uid,claimedAt:Date.now()});const b=writeBatch(db);b.set(doc(db,'households',inv.householdId,'members',user.uid),{uid:user.uid,email:user.email,profileId:inv.profileId,displayName:inv.displayName,notifyAt:'07:30',includePartnerMenu:true,owner:false,inviteCode:code});b.set(doc(db,'users',user.uid),{householdId:inv.householdId,profileId:inv.profileId,email:user.email});await b.commit();location.reload()}catch(e){$('onMsg').textContent=e.message}}
async function startApp(){show('appView');const ms=await getDoc(doc(db,'households',householdId,'members',user.uid));member=ms.data();currentProfileId=currentProfileId||member.profileId;listeners.push(onSnapshot(collection(db,'households',householdId,'profiles'),s=>{profiles={};s.forEach(x=>profiles[x.id]=x.data());renderAll()}));listeners.push(onSnapshot(collection(db,'households',householdId,'days'),s=>{days=s.docs.map(x=>({id:x.id,...x.data()}));renderAll()}));listeners.push(onSnapshot(collection(db,'households',householdId,'extras'),s=>{extras=s.docs.map(x=>({id:x.id,...x.data()}));renderShopping()}));listeners.push(onSnapshot(collection(db,'households',householdId,'checks'),s=>{checks={};s.forEach(x=>checks[x.id]=x.data());renderShopping()}));renderMember();}
function renderAll(){if(!profiles[currentProfileId]&&profiles[member?.profileId])currentProfileId=member.profileId;renderProfileSelect();renderToday();renderCalendar();renderShopping();renderRules();if(menuOverlayDate)renderMenuOverlay(menuOverlayDate)}
function tab(id){document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.id===id));document.querySelectorAll('.tabs button').forEach(x=>x.classList.toggle('active',x.dataset.tab===id));if(id==='shopping')renderShopping()}
document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>tab(b.dataset.tab));
function renderProfileSelect(){const s=$('profileSelect');if(!s)return;s.innerHTML='';Object.values(profiles).forEach(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=p.displayName;o.selected=p.id===currentProfileId;s.appendChild(o)});s.onchange=()=>{currentProfileId=s.value;const p=profiles[currentProfileId];currentDate=p.startDate||isoToday();renderAll()}}
async function saveDay(pid,date,d){const p=profiles[pid];d.summary=buildSummary(p,d);d.kcal=totalKcal(p,d);d.updatedAt=Date.now();await setDoc(doc(db,'households',householdId,'days',`${pid}_${date}`),d,{merge:true})}
function buildSummary(p,d){const out={};for(const meal of p.meals){let arr=[];for(const c of meal.categories){const it=selectedItem(p,d,c);if(it)arr.push(`${it.name}${it.grams!=null?' '+it.grams+' g':''}`)}out[meal.id]=arr.join(' + ')}return out}
function mealTotal(p,d,m){let t=0;for(const c of m.categories){const i=selectedItem(p,d,c);if(i)t+=i.kcal}return t}
function missingCategories(p,d){const out=[];for(const meal of p.meals)for(const c of meal.categories)if(!selectedItem(p,d,c))out.push({meal,c});return out}
function categoryMeta(c){
  const s=(c.label||'').toLowerCase();
  if(s.includes('frutta secca')||s.includes('semi')||s.includes('cioccolato'))return{kind:'fat',icon:'🥜'};
  if(s.includes('protein'))return{kind:'protein',icon:'🍗'};
  if(s.includes('verd'))return{kind:'veg',icon:'🥬'};
  if(s.includes('condim')||s.includes('olio'))return{kind:'condiment',icon:'🫒'};
  if(s.includes('cereal')||s.includes('carbo')||s.includes('legum')||s.includes('pane'))return{kind:'carb',icon:'🌾'};
  if(s.includes('frutta'))return{kind:'fruit',icon:'🍎'};
  return{kind:'other',icon:'•'};
}
function nextMissingCategory(p,d,currentCatId){
  const cats=allCats(p),start=Math.max(0,cats.findIndex(x=>x.id===currentCatId));
  for(let i=start+1;i<cats.length;i++)if(!selectedItem(p,d,cats[i]))return cats[i];
  for(let i=0;i<=start;i++)if(!selectedItem(p,d,cats[i]))return cats[i];
  return null;
}
function setCurrentDate(date){currentDate=date;expandedCats.clear();scrollAfterRender=null;renderToday()}
function scrollToCategory(id){
  if(!id)return;
  requestAnimationFrame(()=>setTimeout(()=>{
    const el=document.getElementById('choice_'+id);if(!el)return;
    const head=document.querySelector('header');
    const offset=(head?.getBoundingClientRect().height||64)+10;
    const top=window.scrollY+el.getBoundingClientRect().top-offset;
    window.scrollTo({top:Math.max(0,top),behavior:'smooth'});
  },120));
}
function missingTextByMeal(p,d){
  return p.meals.map(m=>{
    const miss=m.categories.filter(c=>!selectedItem(p,d,c));
    return miss.length?`<b>${m.label}</b>: ${miss.map(c=>c.label).join(', ')}`:'';
  }).filter(Boolean).join('<br>');
}
function renderToday(){
  const p=profiles[currentProfileId];if(!p)return;
  const d=dayDoc(p.id,currentDate),missing=missingCategories(p,d),total=totalKcal(p,d);
  $('todayTitle').textContent=fmt(currentDate);$('profileLabel').textContent=p.displayName;
  $('kcalTotal').textContent=total;$('kcalBar').style.width=Math.min(100,total/p.targetKcal*100)+'%';
  const ks=$('kcalState');ks.className='pill';
  if(missing.length){ks.textContent=`mancano ${missing.length}`;ks.classList.add('warn')}
  else if(total>=p.kcalLow&&total<=p.kcalHigh){ks.textContent='centrato';ks.classList.add('good')}
  else{ks.textContent=total>p.kcalHigh?'alto':'basso';ks.classList.add('warn')}

  const banner=$('completionBanner');
  if(missing.length){
    banner.className='completionBanner incomplete';
    banner.innerHTML=`<div><b>⚠️ Giornata incompleta</b><div class="completionCount">Hai ancora ${missing.length} ${missing.length===1?'scelta':'scelte'} da fare.</div><div class="missingList">${missingTextByMeal(p,d)}</div></div><button id="goFirstMissing" class="primary">Vai alla prima mancante</button>`;
    $('goFirstMissing').onclick=()=>{const first=missing[0]?.c;if(first){expandedCats.add(first.id);renderToday();scrollToCategory(first.id)}};
  }else{
    banner.className='completionBanner complete';
    banner.innerHTML=`<div><b>✅ Giornata completa</b><div class="completionCount">Hai scelto 1 alimento in ogni sezione.</div></div><button id="openSummaryFromComplete">Riepilogo menu</button>`;
    $('openSummaryFromComplete').onclick=()=>openMenuOverlay(currentDate);
  }
  $('freqInfo').innerHTML=minimumInfo(p,currentDate);
  $('meals').innerHTML='';

  for(const meal of p.meals){
    const doneCount=meal.categories.filter(c=>selectedItem(p,d,c)).length;
    const mealMissing=meal.categories.length-doneCount;
    const sec=document.createElement('section');sec.className='meal';
    sec.innerHTML=`<div class="mealhead">
      <div><div class="mealEyebrow">PASTO</div><h2>${meal.label}</h2></div>
      <div class="mealStats"><b>${mealTotal(p,d,meal)} kcal</b><span class="mealProgress ${mealMissing?'pending':'done'}">${doneCount}/${meal.categories.length} scelte</span></div>
    </div>`;

    meal.categories.forEach((c,idx)=>{
      const meta=categoryMeta(c),chosen=selectedItem(p,d,c),isOpen=!chosen||expandedCats.has(c.id);
      const box=document.createElement('div');
      box.className=`choiceStep ${chosen?'choiceComplete':'choiceMissing'} kind-${meta.kind}`;
      box.id='choice_'+c.id;
      box.innerHTML=`<div class="choiceHeader">
        <div class="stepNumber">${idx+1}</div>
        <div class="choiceTitle"><div class="choiceKicker">SEZIONE ${idx+1} DI ${meal.categories.length}</div><div class="choiceLabel">${meta.icon} ${c.label}</div><div class="choiceHint">${chosen?'Scelta effettuata':'Scegli 1 alternativa'}</div></div>
        <div class="choiceStatus ${chosen?'ok':'todo'}">${chosen?'✓ COMPLETA':'DA SCEGLIERE'}</div>
      </div>
      ${chosen?`<div class="chosenRow"><div><b>${chosen.name}${chosen.grams!=null?' — '+chosen.grams+' g':''}</b><small>${chosen.kcal} kcal</small></div><button class="changeChoice">${isOpen?'Chiudi':'Cambia'}</button></div>`:''}
      <div class="options ${isOpen?'':'collapsed'}"></div>`;
      const opts=box.querySelector('.options');

      if(chosen){
        box.querySelector('.changeChoice').onclick=()=>{
          if(expandedCats.has(c.id))expandedCats.delete(c.id);else expandedCats.add(c.id);
          renderToday();if(!isOpen)scrollToCategory(c.id);
        };
      }

      const sortedItems=[...c.items].sort((a,b)=>a.name.localeCompare(b.name,'it',{sensitivity:'base'}));
      for(const it of sortedItems){
        const b=document.createElement('button');b.className='opt';
        const sel=d.selections?.[c.id]===it.id;if(sel)b.classList.add('selected');
        const block=blockedReason(p,currentDate,c.id,it.id,d);b.disabled=!sel&&!!block;
        b.innerHTML=`${it.name}${it.grams!=null?' — '+it.grams+' g':''}<small>${it.kcal} kcal</small>${block&&!sel?`<span class="limit">${block}</span>`:''}`;
        b.onclick=async()=>{
          if(sel){expandedCats.delete(c.id);renderToday();return}
          const nd=structuredClone(dayDoc(p.id,currentDate));nd.selections||={};
          const wasMissing=!selectedItem(p,d,c);nd.selections[c.id]=it.id;
          expandedCats.delete(c.id);
          if(wasMissing){const next=nextMissingCategory(p,nd,c.id);if(next){expandedCats.add(next.id);scrollAfterRender=next.id}}
          await saveDay(p.id,currentDate,nd);
        };
        opts.appendChild(b)
      }
      sec.appendChild(box)
    });

    const footer=document.createElement('div');footer.className=`mealFooter ${mealMissing?'pending':'done'}`;
    footer.innerHTML=mealMissing?`⚠️ <b>${meal.label} incompleta:</b> mancano ${mealMissing} ${mealMissing===1?'scelta':'scelte'}.`:`✓ <b>${meal.label} completa</b>`;
    sec.appendChild(footer);$('meals').appendChild(sec)
  }

  if(scrollAfterRender){const id=scrollAfterRender;scrollAfterRender=null;scrollToCategory(id)}
}
function selectedOccurrences(p,tag,excludeDate=null,excludeCat=null){const im=itemMap(p), arr=[];for(const d of days.filter(x=>x.profileId===p.id)){for(const [cat,id] of Object.entries(d.selections||{})){if(d.date===excludeDate&&cat===excludeCat)continue;const it=im[id];if(it?.tags?.includes(tag))arr.push(d.date)}}return arr}
function violatesRolling(existing,candidate,maxCount,windowDays){const a=[...existing,candidate].sort();for(let i=0;i<a.length;i++){let c=0;const start=parseISO(a[i]);for(let j=i;j<a.length;j++){const diff=(parseISO(a[j])-start)/86400000;if(diff<=windowDays-1)c++;else break}if(c>maxCount)return true}return false}
function blockedReason(p,date,catId,itemId,d){const it=itemMap(p)[itemId];if(!it)return'';for(const r of p.rules||[]){if(r.disabledWhen&&p.conditions?.[r.disabledWhen]&&it.tags?.includes(r.tag))return r.label+' non disponibile';if(r.maxCount&&it.tags?.includes(r.tag)){const occ=selectedOccurrences(p,r.tag,date,catId);if(violatesRolling(occ,date,r.maxCount,r.days||7))return `limite ${r.maxCount} ogni ${r.days||7} giorni`}}return''}
function minimumInfo(p,date){let txt=[];for(const r of p.minimums||[]){const from=addDays(date,-6),to=date;const im=itemMap(p);let n=0;for(const d of days.filter(x=>x.profileId===p.id&&x.date>=from&&x.date<=to))for(const id of Object.values(d.selections||{}))if(im[id]?.tags?.includes(r.tag))n++;txt.push(`${r.label}: ${n}/${r.minCount} minimo negli ultimi 7 giorni`)}return txt.join(' · ')}
$('prevDay').onclick=()=>setCurrentDate(addDays(currentDate,-1));$('nextDay').onclick=()=>setCurrentDate(addDays(currentDate,1));$('copyPrev').onclick=async()=>{const p=profiles[currentProfileId],src=dayDoc(p.id,addDays(currentDate,-1));const nd={profileId:p.id,date:currentDate,selections:structuredClone(src.selections||{}),consumed:{}};await saveDay(p.id,currentDate,nd)};$('clearDay').onclick=async()=>{if(confirm('Azzero questo giorno?'))await deleteDoc(doc(db,'households',householdId,'days',`${currentProfileId}_${currentDate}`))};
function renderCalendar(){const p=profiles[currentProfileId];if(!p)return;$('startDate').value=p.startDate||'';$('endDate').value=p.endDate||'';const box=$('calendarDays');box.innerHTML='';for(const date of datesBetween(p.startDate,p.endDate)){const d=dayDoc(p.id,date),miss=missingCategories(p,d).length,totalCats=allCats(p).length,row=document.createElement('div');row.className='dayrow';row.innerHTML=`<button><b>${fmt(date)}</b><div class="muted">${miss?`mancano ${miss} scelte su ${totalCats}`:`${totalKcal(p,d)} kcal · tutte le sezioni complete`}</div></button><span class="pill ${miss?'warn':'good'}">${miss?'incompleto':'completo'}</span>`;row.querySelector('button').onclick=()=>{setCurrentDate(date);tab('today')};box.appendChild(row)}}
$('savePeriod').onclick=async()=>{const p=profiles[currentProfileId],s=$('startDate').value,e=$('endDate').value;if(!s||!e||s>e){alert('Controlla le date');return}await updateDoc(doc(db,'households',householdId,'profiles',p.id),{startDate:s,endDate:e});currentDate=s};
function collectShop(){const map=new Map();for(const p of Object.values(profiles)){const im=itemMap(p);for(const d of days.filter(x=>x.profileId===p.id&&(!p.startDate||x.date>=p.startDate)&&(!p.endDate||x.date<=p.endDate))){for(const id of Object.values(d.selections||{})){const it=im[id];if(!it)continue;const key=it.name.toLowerCase();if(!map.has(key))map.set(key,{key,name:it.name,grams:0,count:0,department:it.department,extra:false});const x=map.get(key);x.count++;if(it.grams!=null)x.grams+=it.grams}}for(const sp of p.supplements||[]){if(!p.startDate||!p.endDate)continue;const nd=datesBetween(p.startDate,p.endDate).length,key=sp.name.toLowerCase();if(!map.has(key))map.set(key,{key,name:sp.name,count:0,grams:null,department:sp.department||'Integratori',extra:false,unit:sp.unit});const x=map.get(key);x.count+=(sp.qtyPerDay||0)*nd}}return [...map.values()]}
function qty(x){if(x.extra)return `${x.qty||''} ${x.unit||''}`.trim();if(x.grams!=null&&x.grams>0)return x.grams>=1000?`${(x.grams/1000).toLocaleString('it-IT',{maximumFractionDigits:2})} kg`:`${x.grams} g`;return `${x.count} ${x.unit||'porzioni'}`}
function renderShopping(){if(!householdId)return;let arr=collectShop().concat(extras.map(e=>({...e,key:'extra:'+e.id,extra:true})));const sort=$('shopSort')?.value||'dept';arr.sort((a,b)=>sort==='alpha'?a.name.localeCompare(b.name,'it'):(a.department||'Altro').localeCompare(b.department||'Altro','it')||a.name.localeCompare(b.name,'it'));const box=$('shoppingList');if(!box)return;box.innerHTML='';let last='';for(const x of arr){const cid=idSafe(x.key),done=!!checks[cid]?.checked;if(hideDone&&done)continue;if(sort==='dept'&&(x.department||'Altro')!==last){last=x.department||'Altro';const h=document.createElement('div');h.className='dept';h.textContent=last;box.appendChild(h)}const r=document.createElement('div');r.className='shoprow'+(done?' checked':'');r.innerHTML=`<input type="checkbox" ${done?'checked':''}><div><b>${x.name}</b>${x.extra?'<span class="extraBadge">EXTRA</span>':''}<div class="muted">${x.department||'Altro'}</div></div><div style="text-align:right"><b>${qty(x)}</b>${x.extra?'<div><button class="danger deleteExtra" style="margin-top:6px;padding:5px 8px;font-size:11px">Elimina</button></div>':''}</div>`;r.querySelector('input').onchange=async e=>setDoc(doc(db,'households',householdId,'checks',cid),{checked:e.target.checked,key:x.key,updatedAt:Date.now()});if(x.extra){r.querySelector('.deleteExtra').onclick=async()=>{if(!confirm(`Eliminare "${x.name}" dagli EXTRA?`))return;await deleteDoc(doc(db,'households',householdId,'extras',x.id));try{await deleteDoc(doc(db,'households',householdId,'checks',cid))}catch{}}}box.appendChild(r)}$('shopInfo').textContent=`${arr.length} voci · somma dei due profili`}
$('shopSort').onchange=renderShopping;$('hideChecked').onclick=()=>{hideDone=!hideDone;$('hideChecked').textContent='Nascondi presi: '+(hideDone?'SÌ':'NO');renderShopping()};$('addExtra').onclick=()=>$('modal').classList.remove('hidden');$('cancelExtra').onclick=()=>$('modal').classList.add('hidden');$('saveExtra').onclick=async()=>{const name=$('extraName').value.trim();if(!name)return;const ref=doc(collection(db,'households',householdId,'extras'));await setDoc(ref,{name,qty:Number($('extraQty').value||1),unit:$('extraUnit').value.trim()||'pz',department:$('extraDept').value,createdAt:Date.now()});$('modal').classList.add('hidden');$('extraName').value=''};$('shareShop').onclick=async()=>{const arr=collectShop().concat(extras.map(e=>({...e,key:'extra:'+e.id,extra:true})));const text=['LISTA DELLA SPESA','',...arr.map(x=>`• ${x.name}: ${qty(x)}${x.extra?' [EXTRA]':''}`)].join('\n');if(navigator.share)try{await navigator.share({title:'Spesa PianoCasa',text})}catch{}else{await navigator.clipboard.writeText(text);alert('Lista copiata')}};

function openMenuOverlay(date=currentDate){
  menuOverlayDate=date;
  const u=new URL(location.href);u.searchParams.set('menu',date);history.replaceState({},'',u);
  renderMenuOverlay(date)
}
function closeMenuOverlay(){
  menuOverlayDate=null;$('menuOverlay')?.classList.add('hidden');
  const u=new URL(location.href);u.searchParams.delete('menu');history.replaceState({},'',u.pathname+u.search+u.hash)
}
function renderMenuOverlay(date){
  const ov=$('menuOverlay'),body=$('menuOverlayBody');if(!ov||!body||!Object.keys(profiles).length)return;
  ov.classList.remove('hidden');$('menuOverlayDate').textContent=fmt(date);
  body.innerHTML='';
  const ordered=Object.values(profiles).sort((a,b)=>(a.id===member?.profileId?-1:b.id===member?.profileId?1:a.displayName.localeCompare(b.displayName,'it')));
  for(const p of ordered){
    const d=dayDoc(p.id,date),miss=missingCategories(p,d),card=document.createElement('section');card.className='menuProfileCard';
    card.innerHTML=`<div class="menuProfileHead"><div><span class="profileBadge">${p.id===member?.profileId?'IL TUO PROFILO':'ALTRO PROFILO'}</span><h3>${p.displayName}</h3></div><div class="menuKcal">${totalKcal(p,d)} kcal</div></div>`;
    for(const meal of p.meals){
      const block=document.createElement('div');block.className='menuMealSummary';
      const rows=meal.categories.map(c=>{const it=selectedItem(p,d,c);return `<div class="menuCatRow ${it?'':'missing'}"><span>${c.label}</span><b>${it?`${it.name}${it.grams!=null?' — '+it.grams+' g':''}`:'⚠️ Da scegliere'}</b></div>`}).join('');
      block.innerHTML=`<div class="menuMealTitle"><b>${meal.label}</b><span>${mealTotal(p,d,meal)} kcal</span></div>${rows}`;
      card.appendChild(block)
    }
    if(miss.length){const w=document.createElement('div');w.className='menuWarning';w.textContent=`Giornata incompleta: mancano ${miss.length} scelte.`;card.appendChild(w)}
    body.appendChild(card)
  }
}
$('closeMenuOverlay')?.addEventListener('click',closeMenuOverlay);
$('menuPrev')?.addEventListener('click',()=>openMenuOverlay(addDays(menuOverlayDate||currentDate,-1)));
$('menuNext')?.addEventListener('click',()=>openMenuOverlay(addDays(menuOverlayDate||currentDate,1)));
$('openMenuSummary')?.addEventListener('click',()=>openMenuOverlay(currentDate));

async function renderMember(){const s=await getDoc(doc(db,'households',householdId,'members',user.uid));member=s.data();$('memberInfo').innerHTML=`<b>${member.displayName}</b><div class="muted">${user.email}</div>`;$('notifyAt').value=member.notifyAt||'07:30';$('includePartner').checked=!!member.includePartnerMenu;renderInvite()}
$('saveNotify').onclick=async()=>{await updateDoc(doc(db,'households',householdId,'members',user.uid),{notifyAt:$('notifyAt').value,includePartnerMenu:$('includePartner').checked});$('pushMsg').textContent='Impostazioni salvate.';renderMember()};
async function renderInvite(){const area=$('inviteArea');if(!member?.owner){area.innerHTML='<div class="muted">Sei collegata alla famiglia.</div>';return}const qs=await getDocs(query(collection(db,'invites'),where('householdId','==',householdId),where('profileId','==','anna')));let active=qs.docs.find(x=>!x.data().claimedBy);if(active){area.innerHTML=`Codice per Anna: <b>${active.id}</b>`;return}area.innerHTML='<button id="makeInvite">Genera codice per Anna</button>';$('makeInvite').onclick=async()=>{const code=Math.random().toString(36).slice(2,10).toUpperCase();await setDoc(doc(db,'invites',code),{householdId,profileId:'anna',displayName:'Anna',createdBy:user.uid,createdAt:Date.now(),claimedBy:null});renderInvite()}}
$('enablePush').onclick=async()=>{try{if(!('serviceWorker'in navigator)||!('PushManager'in window))throw new Error('Push non supportato. Su iPhone installa prima l’app nella schermata Home.');const reg=await navigator.serviceWorker.register('./sw.js');const perm=await Notification.requestPermission();if(perm!=='granted')throw new Error('Permesso notifiche non concesso.');const sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlB64(C.vapidPublicKey)});const j=sub.toJSON(),id=idSafe(user.uid+'_'+j.endpoint);await setDoc(doc(db,'households',householdId,'pushSubscriptions',id),{uid:user.uid,profileId:member.profileId,endpoint:j.endpoint,keys:j.keys,createdAt:Date.now()});$('pushMsg').textContent='Notifiche attive su questo iPhone.'}catch(e){$('pushMsg').textContent=e.message}}
function urlB64(s){const pad='='.repeat((4-s.length%4)%4),b64=(s+pad).replace(/-/g,'+').replace(/_/g,'/'),raw=atob(b64),out=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out}
$('importSeed').onclick=async()=>{try{const f=$('seedFile').files[0];if(!f)throw new Error('Seleziona il file JSON privato.');const seed=JSON.parse(await f.text());const b=writeBatch(db);for(const p of seed.profiles)b.set(doc(db,'households',householdId,'profiles',p.id),{...p,startDate:p.startDate||isoToday(),endDate:p.endDate||addDays(isoToday(),13)});await b.commit();$('seedMsg').textContent='Diete importate nel cloud privato.'}catch(e){$('seedMsg').textContent=e.message}}
function renderRules(){const p=profiles[currentProfileId],box=$('rulesList');if(!p||!box)return;box.innerHTML='';for(const r of p.rules||[]){const d=document.createElement('div');d.className='rule';d.innerHTML=`<b>${r.label}</b><span class="muted">${r.disabledWhen?'bloccato quando '+r.disabledWhen:`massimo ${r.maxCount} ogni ${r.days} giorni`} · ${r.source||''}</span>`;box.appendChild(d)}for(const mn of p.minimums||[]){const d=document.createElement('div');d.className='rule';d.innerHTML=`<b>${mn.label}</b><span class="muted">obiettivo ${mn.minCount}${mn.targetMax?'–'+mn.targetMax:''} ogni ${mn.days} giorni</span>`;box.appendChild(d)}}
function handleMenuDeepLink(date){
  const d=date||new URL(location.href).searchParams.get('menu')||isoToday();
  menuOverlayDate=d;currentDate=d;
  const u=new URL(location.href);u.searchParams.set('menu',d);history.replaceState({},'',u);
  if(Object.keys(profiles).length)renderMenuOverlay(d);
}
if('serviceWorker'in navigator){
  navigator.serviceWorker.addEventListener('message',e=>{
    if(e.data?.type==='OPEN_MENU')handleMenuDeepLink(e.data.date);
  });
  navigator.serviceWorker.register('./sw.js').catch(()=>{});
}
window.addEventListener('pageshow',()=>{
  const d=new URL(location.href).searchParams.get('menu');if(d)handleMenuDeepLink(d);
});
