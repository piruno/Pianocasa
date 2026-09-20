import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, onSnapshot, query, where, writeBatch } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
const $=id=>document.getElementById(id), C=window.PIANOCASA_CONFIG||{};
const badConfig=!C.firebase||String(C.firebase.apiKey||'').startsWith('INCOLLA_');
let app,auth,db,user,userDoc,householdId,member,profiles={},days=[],extras=[],checks={},storeMappings={},portionChecks={},currentProfileId,currentDate=isoToday(),listeners=[],hideDone=false;
let expandedCats=new Set(),scrollAfterRender=null;
let menuOverlayDate=new URLSearchParams(location.search).get('menu')||null;
let shopRangeMode='all',shopCustomStart='',shopCustomEnd='',alphaPeek=null,shoppingModeOpen=false;
const TOSANO_STORE_ID='iper-tosano-pradamano';

if(badConfig){
  $('setupView').classList.remove('hidden')
}else{
  app=initializeApp(C.firebase);
  auth=getAuth(app);
  db=getFirestore(app);
  $('authView').classList.remove('hidden');
  initPersistentAuth();
}

async function initPersistentAuth(){
  try{
    // Mantiene l'accesso tra chiusure e riaperture della PWA/iPhone.
    await setPersistence(auth,browserLocalPersistence);
  }catch(e){
    console.warn('Persistenza login non disponibile:',e);
  }
  onAuthStateChanged(auth,handleAuth);
}
function isoToday(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function parseISO(s){const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)}
function addDays(s,n){const d=parseISO(s);d.setDate(d.getDate()+n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function fmt(s,short=false){if(!s)return'';return new Intl.DateTimeFormat('it-IT',short?{weekday:'short',day:'2-digit',month:'2-digit'}:{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(parseISO(s))}
function datesBetween(a,b){let r=[];if(!a||!b||a>b)return r;for(let d=a;d<=b&&r.length<400;d=addDays(d,1))r.push(d);return r}
function idSafe(s){return btoa(unescape(encodeURIComponent(s))).replaceAll('/','_').replaceAll('+','-').replaceAll('=','')}
function allCats(p){return p.meals.flatMap(m=>m.categories)}
function mealForCat(p,catId){return p.meals.find(m=>m.categories.some(c=>c.id===catId))}
function isFreeMeal(date,meal){
  const dow=parseISO(date).getDay();
  return (dow===6&&meal.id==='dinner')||(dow===0&&meal.id==='lunch');
}
function hasFreeMeal(p,date){return p.meals.some(m=>isFreeMeal(date,m))}
function activeCats(p,date){return p.meals.filter(m=>!isFreeMeal(date,m)).flatMap(m=>m.categories)}
function normalizeProfile(raw){
  const p=structuredClone(raw);
  for(const meal of p.meals||[])for(const c of meal.categories||[])for(const it of c.items||[]){
    if(it.id==='melagrana'||String(it.name||'').toLowerCase()==='melagrana'){
      it.tags=(it.tags||[]).filter(t=>t!=='rich_cheese');
    }
  }
  return p;
}
function itemMap(p){const m={};for(const meal of p.meals)for(const c of meal.categories)for(const it of c.items)m[it.id]=it;return m}
function dayDoc(pid,date){return days.find(x=>x.profileId===pid&&x.date===date)||{profileId:pid,date,selections:{},consumed:{}}}
function selectedItem(p,d,c){const id=d.selections?.[c.id];return id?c.items.find(x=>x.id===id):null}
function totalKcal(p,d){let t=0;for(const c of activeCats(p,d.date)){const i=selectedItem(p,d,c);if(i)t+=i.kcal}return t}
function complete(p,d){return activeCats(p,d.date).every(c=>selectedItem(p,d,c))}
function show(id){['authView','onboardView','appView'].forEach(x=>$(x).classList.toggle('hidden',x!==id));$('signoutBtn').classList.toggle('hidden',id!=='appView')}
$('loginBtn')?.addEventListener('click',async()=>{try{await signInWithEmailAndPassword(auth,$('email').value.trim(),$('password').value);$('authMsg').textContent=''}catch(e){$('authMsg').textContent=e.message}})
$('registerBtn')?.addEventListener('click',async()=>{try{await createUserWithEmailAndPassword(auth,$('email').value.trim(),$('password').value);$('authMsg').textContent=''}catch(e){$('authMsg').textContent=e.message}})
$('signoutBtn').onclick=()=>signOut(auth);
async function handleAuth(u){clearListeners();user=u;if(!u){show('authView');return}const snap=await getDoc(doc(db,'users',u.uid));if(!snap.exists()){show('onboardView');renderOnboard()}else{userDoc=snap.data();householdId=userDoc.householdId;currentProfileId=userDoc.profileId;await startApp()}}
function clearListeners(){listeners.forEach(f=>f());listeners=[]}
function renderOnboard(){show('onboardView');$('onboardBody').innerHTML=`<p>Scegli solo la prima volta.</p><div class="actions"><button id="createHome" class="primary">Sono Vincenzo · crea famiglia</button></div><hr><label>Codice invito<input id="inviteCode" maxlength="14" placeholder="codice da Vincenzo"></label><button id="joinHome" class="primary" style="margin-top:8px">Sono Anna · entra</button><div id="onMsg" class="msg"></div>`;$('createHome').onclick=createHousehold;$('joinHome').onclick=joinHousehold}
async function createHousehold(){try{const hid=crypto.randomUUID();const b=writeBatch(db);b.set(doc(db,'households',hid),{createdAt:Date.now(),label:'Casa'});b.set(doc(db,'households',hid,'members',user.uid),{uid:user.uid,email:user.email,profileId:'vincenzo',displayName:'Vincenzo',notifyAt:'07:30',includePartnerMenu:false,owner:true});b.set(doc(db,'users',user.uid),{householdId:hid,profileId:'vincenzo',email:user.email});await b.commit();location.reload()}catch(e){$('onMsg').textContent=e.message}}
async function joinHousehold(){try{const code=$('inviteCode').value.trim().toUpperCase();const invRef=doc(db,'invites',code),s=await getDoc(invRef);if(!s.exists())throw new Error('Codice non trovato.');const inv=s.data();if(inv.claimedBy)throw new Error('Codice già usato.');await updateDoc(invRef,{claimedBy:user.uid,claimedAt:Date.now()});const b=writeBatch(db);b.set(doc(db,'households',inv.householdId,'members',user.uid),{uid:user.uid,email:user.email,profileId:inv.profileId,displayName:inv.displayName,notifyAt:'07:30',includePartnerMenu:true,owner:false,inviteCode:code});b.set(doc(db,'users',user.uid),{householdId:inv.householdId,profileId:inv.profileId,email:user.email});await b.commit();location.reload()}catch(e){$('onMsg').textContent=e.message}}
async function startApp(){
  show('appView');
  const ms=await getDoc(doc(db,'households',householdId,'members',user.uid));
  member=ms.data();currentProfileId=currentProfileId||member.profileId;
  listeners.push(onSnapshot(collection(db,'households',householdId,'profiles'),s=>{profiles={};s.forEach(x=>profiles[x.id]=normalizeProfile(x.data()));renderAll()}));
  listeners.push(onSnapshot(collection(db,'households',householdId,'days'),s=>{days=s.docs.map(x=>({id:x.id,...x.data()}));renderAll()}));
  listeners.push(onSnapshot(collection(db,'households',householdId,'extras'),s=>{extras=s.docs.map(x=>({id:x.id,...x.data()}));renderShopping();renderPortions()}));
  listeners.push(onSnapshot(collection(db,'households',householdId,'checks'),s=>{checks={};s.forEach(x=>checks[x.id]=x.data());renderShopping();renderPortions()}));
  listeners.push(onSnapshot(collection(db,'households',householdId,'storeMappings'),s=>{storeMappings={};s.forEach(x=>storeMappings[x.id]=x.data());renderShopping()}));
  listeners.push(onSnapshot(collection(db,'households',householdId,'portionChecks'),s=>{portionChecks={};s.forEach(x=>portionChecks[x.id]=x.data());renderPortions()}));
  renderMember();setupAlphaIndex();syncShopPeriodControls();
}
function renderAll(){if(!profiles[currentProfileId]&&profiles[member?.profileId])currentProfileId=member.profileId;renderProfileSelect();renderToday();renderCalendar();renderShopping();renderPortions();renderHistory();renderRules();if(menuOverlayDate)renderMenuOverlay(menuOverlayDate)}
function tab(id){
  document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.id===id));
  document.querySelectorAll('.tabs button').forEach(x=>x.classList.toggle('active',x.dataset.tab===id));
  if(id==='shopping')renderShopping();
  if(id==='portions')renderPortions();
  if(id==='history')renderHistory();
  renderAlphaIndex();
}
document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>tab(b.dataset.tab));
function renderProfileSelect(){const s=$('profileSelect');if(!s)return;s.innerHTML='';Object.values(profiles).forEach(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=p.displayName;o.selected=p.id===currentProfileId;s.appendChild(o)});s.onchange=()=>{currentProfileId=s.value;const p=profiles[currentProfileId];currentDate=p.startDate||isoToday();renderAll()}}
async function saveDay(pid,date,d){const p=profiles[pid];d.summary=buildSummary(p,d);d.kcal=totalKcal(p,d);d.updatedAt=Date.now();await setDoc(doc(db,'households',householdId,'days',`${pid}_${date}`),d,{merge:true})}
function buildSummary(p,d){const out={};for(const meal of p.meals){if(isFreeMeal(d.date,meal)){out[meal.id]='Pasto libero';continue}let arr=[];for(const c of meal.categories){const it=selectedItem(p,d,c);if(it)arr.push(`${it.name}${it.grams!=null?' '+it.grams+' g':''}`)}out[meal.id]=arr.join(' + ')}return out}
function mealTotal(p,d,m){if(isFreeMeal(d.date,m))return 0;let t=0;for(const c of m.categories){const i=selectedItem(p,d,c);if(i)t+=i.kcal}return t}
function missingCategories(p,d){const out=[];for(const meal of p.meals){if(isFreeMeal(d.date,meal))continue;for(const c of meal.categories)if(!selectedItem(p,d,c))out.push({meal,c})}return out}
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
  const cats=activeCats(p,d.date),start=Math.max(0,cats.findIndex(x=>x.id===currentCatId));
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
    if(isFreeMeal(d.date,m))return '';
    const miss=m.categories.filter(c=>!selectedItem(p,d,c));
    return miss.length?`<b>${m.label}</b>: ${miss.map(c=>c.label).join(', ')}`:'';
  }).filter(Boolean).join('<br>');
}
function partnerProfileFor(p){return Object.values(profiles).find(x=>x.id!==p.id)||null}
function equivalentMeal(p,meal){return p.meals.find(m=>m.id===meal.id)||p.meals.find(m=>normalizeName(m.label)===normalizeName(meal.label))||null}
function equivalentCategory(meal,c){
  let pc=meal.categories.find(x=>x.id===c.id)||meal.categories.find(x=>normalizeName(x.label)===normalizeName(c.label));
  if(pc)return pc;
  const kind=categoryMeta(c).kind,cands=meal.categories.filter(x=>categoryMeta(x).kind===kind);
  return kind!=='other'&&cands.length===1?cands[0]:null
}
function partnerChoiceFor(p,meal,c,date){
  const partner=partnerProfileFor(p);if(!partner)return null;
  const pm=equivalentMeal(partner,meal);if(!pm)return{partner,item:null,common:false};
  const pc=equivalentCategory(pm,c);if(!pc)return{partner,item:null,common:false};
  const pd=dayDoc(partner.id,date),item=selectedItem(partner,pd,pc);if(!item)return{partner,item:null,common:false};
  const match=c.items.find(it=>normalizeName(it.name)===normalizeName(item.name));
  return{partner,item,common:!!match,matchId:match?.id||null}
}
function renderToday(){
  const p=profiles[currentProfileId];if(!p)return;
  const d=dayDoc(p.id,currentDate),missing=missingCategories(p,d),total=totalKcal(p,d);
  $('todayTitle').textContent=fmt(currentDate);$('profileLabel').textContent=p.displayName;
  $('kcalTotal').textContent=total;$('kcalBar').style.width=Math.min(100,total/p.targetKcal*100)+'%';
  const ks=$('kcalState');ks.className='pill';
  if(missing.length){ks.textContent=`mancano ${missing.length}`;ks.classList.add('warn')}
  else if(hasFreeMeal(p,currentDate)){ks.textContent='pasto libero';ks.classList.add('good')}
  else if(total>=p.kcalLow&&total<=p.kcalHigh){ks.textContent='centrato';ks.classList.add('good')}
  else{ks.textContent=total>p.kcalHigh?'alto':'basso';ks.classList.add('warn')}

  const banner=$('completionBanner');
  if(missing.length){
    banner.className='completionBanner incomplete';
    banner.innerHTML=`<div><b>⚠️ Giornata incompleta</b><div class="completionCount">Hai ancora ${missing.length} ${missing.length===1?'scelta':'scelte'} da fare.</div><div class="missingList">${missingTextByMeal(p,d)}</div></div><button id="goFirstMissing" class="primary">Vai alla prima mancante</button>`;
    $('goFirstMissing').onclick=()=>{const first=missing[0]?.c;if(first){expandedCats.add(first.id);renderToday();scrollToCategory(first.id)}};
  }else{
    banner.className='completionBanner complete';
    banner.innerHTML=`<div><b>✅ Giornata completa</b><div class="completionCount">${hasFreeMeal(p,currentDate)?'Hai completato tutte le sezioni previste. Il pasto libero è già considerato completo.':'Hai scelto 1 alimento in ogni sezione.'}</div></div><button id="openSummaryFromComplete">Riepilogo menu</button>`;
    $('openSummaryFromComplete').onclick=()=>openMenuOverlay(currentDate);
  }
  $('freqInfo').innerHTML=minimumInfo(p,currentDate);
  $('meals').innerHTML='';

  for(const meal of p.meals){
    const free=isFreeMeal(currentDate,meal);
    const doneCount=free?meal.categories.length:meal.categories.filter(c=>selectedItem(p,d,c)).length;
    const mealMissing=free?0:meal.categories.length-doneCount;
    const sec=document.createElement('section');sec.className='meal'+(free?' freeMeal':'');
    sec.innerHTML=`<div class="mealhead">
      <div><div class="mealEyebrow">PASTO</div><h2>${meal.label}</h2></div>
      <div class="mealStats">${free?'<b>🍽️ Pasto libero</b><span class="mealProgress done">automaticamente completo</span>':`<b>${mealTotal(p,d,meal)} kcal</b><span class="mealProgress ${mealMissing?'pending':'done'}">${doneCount}/${meal.categories.length} scelte</span>`}</div>
    </div>`;

    if(free){
      const freeBox=document.createElement('div');freeBox.className='freeMealBox';
      freeBox.innerHTML='<div class="freeMealIcon">🎉</div><div><b>Pasto libero</b><p>Non devi selezionare alimenti. Questo pasto viene considerato completo automaticamente e non entra nella lista della spesa.</p></div>';
      sec.appendChild(freeBox);
      const footer=document.createElement('div');footer.className='mealFooter done';footer.innerHTML=`✓ <b>${meal.label} completa · pasto libero</b>`;
      sec.appendChild(footer);$('meals').appendChild(sec);continue;
    }

    meal.categories.forEach((c,idx)=>{
      const meta=categoryMeta(c),chosen=selectedItem(p,d,c),isOpen=!chosen||expandedCats.has(c.id),partnerPick=partnerChoiceFor(p,meal,c,currentDate);
      const box=document.createElement('div');
      box.className=`choiceStep ${chosen?'choiceComplete':'choiceMissing'} kind-${meta.kind}`;
      box.id='choice_'+c.id;
      box.innerHTML=`<div class="choiceHeader">
        <div class="stepNumber">${idx+1}</div>
        <div class="choiceTitle"><div class="choiceKicker">SEZIONE ${idx+1} DI ${meal.categories.length}</div><div class="choiceLabel">${meta.icon} ${c.label}</div><div class="choiceHint">${chosen?'Scelta effettuata':'Scegli 1 alternativa'}</div></div>
        <div class="choiceStatus ${chosen?'ok':'todo'}">${chosen?'✓ COMPLETA':'DA SCEGLIERE'}</div>
      </div>
      ${chosen?`<div class="chosenRow"><div><b>${chosen.name}${chosen.grams!=null?' — '+chosen.grams+' g':''}</b><small>${chosen.kcal} kcal</small></div><button class="changeChoice">${isOpen?'Chiudi':'Cambia'}</button></div>`:''}
      ${partnerPick?.item&&!partnerPick.common?`<div class="partnerNotice notCommon"><span class="partnerAvatar">👥</span><div><b>${partnerPick.partner.displayName} ha scelto ${partnerPick.item.name}${partnerPick.item.grams!=null?' — '+partnerPick.item.grams+' g':''}</b><small>ALIMENTO NON IN COMUNE: non compare tra le tue alternative.</small></div></div>`:''}
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
        const partnerSelected=!!(partnerPick?.common&&partnerPick.matchId===it.id);if(partnerSelected)b.classList.add('partnerSelected');
        const block=blockedReason(p,currentDate,c.id,it.id,d);b.disabled=!sel&&!!block;
        b.innerHTML=`${it.name}${it.grams!=null?' — '+it.grams+' g':''}<small>${it.kcal} kcal</small>${partnerSelected?`<span class="partnerPickBadge">👥 ${partnerPick.partner.displayName} ha scelto questo${partnerPick.item.grams!=null?' · '+partnerPick.item.grams+' g':''}</span>`:''}${block&&!sel?`<span class="limit">${block}</span>`:''}`;
        b.onclick=async()=>{
          if(sel){expandedCats.delete(c.id);renderToday();return}
          const nd=structuredClone(dayDoc(p.id,currentDate));nd.selections||={};
          const wasMissing=!selectedItem(p,d,c);nd.selections[c.id]=it.id;
          expandedCats.delete(c.id);
          if(wasMissing){
            const next=nextMissingCategory(p,nd,c.id);
            if(next){expandedCats.add(next.id);scrollAfterRender=next.id}
            else if(missingCategories(p,nd).length===0){scrollAfterRender='__TOP__'}
          }
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

  if(scrollAfterRender){
    const id=scrollAfterRender;scrollAfterRender=null;
    if(id==='__TOP__')requestAnimationFrame(()=>setTimeout(()=>window.scrollTo({top:0,behavior:'smooth'}),180));
    else scrollToCategory(id);
  }
}
function selectedOccurrences(p,tag,excludeDate=null,excludeCat=null){const im=itemMap(p), arr=[];for(const d of days.filter(x=>x.profileId===p.id)){for(const [cat,id] of Object.entries(d.selections||{})){if(d.date===excludeDate&&cat===excludeCat)continue;const meal=mealForCat(p,cat);if(meal&&isFreeMeal(d.date,meal))continue;const it=im[id];if(it?.tags?.includes(tag))arr.push(d.date)}}return arr}
function violatesRolling(existing,candidate,maxCount,windowDays){const a=[...existing,candidate].sort();for(let i=0;i<a.length;i++){let c=0;const start=parseISO(a[i]);for(let j=i;j<a.length;j++){const diff=(parseISO(a[j])-start)/86400000;if(diff<=windowDays-1)c++;else break}if(c>maxCount)return true}return false}
function blockedReason(p,date,catId,itemId,d){const it=itemMap(p)[itemId];if(!it)return'';for(const r of p.rules||[]){if(r.disabledWhen&&p.conditions?.[r.disabledWhen]&&it.tags?.includes(r.tag))return r.label+' non disponibile';if(r.maxCount&&it.tags?.includes(r.tag)){const occ=selectedOccurrences(p,r.tag,date,catId);if(violatesRolling(occ,date,r.maxCount,r.days||7))return `limite ${r.maxCount} ogni ${r.days||7} giorni`}}return''}
function minimumInfo(p,date){let txt=[];for(const r of p.minimums||[]){const from=addDays(date,-6),to=date;const im=itemMap(p);let n=0;for(const d of days.filter(x=>x.profileId===p.id&&x.date>=from&&x.date<=to))for(const [cat,id] of Object.entries(d.selections||{})){const meal=mealForCat(p,cat);if(meal&&isFreeMeal(d.date,meal))continue;if(im[id]?.tags?.includes(r.tag))n++}txt.push(`${r.label}: ${n}/${r.minCount} minimo negli ultimi 7 giorni`)}return txt.join(' · ')}
$('prevDay').onclick=()=>setCurrentDate(addDays(currentDate,-1));$('nextDay').onclick=()=>setCurrentDate(addDays(currentDate,1));
$('copyFirstWeek').onclick=async()=>{
  const p=profiles[currentProfileId];if(!p?.startDate)return;
  const target=addDays(p.startDate,7);
  if(p.endDate&&target>p.endDate){alert('Il periodo non contiene una seconda settimana completa.');return}
  if(!confirm(`Copiare i primi 7 giorni di ${p.displayName} nella seconda settimana?`))return;
  const n=await copyWeekForProfiles([p.id],p.startDate,target);
  alert(`Copiati ${n} giorni nella seconda settimana.`);
};
$('clearDay').onclick=async()=>{if(confirm('Azzero questo giorno?'))await deleteDoc(doc(db,'households',householdId,'days',`${currentProfileId}_${currentDate}`))};
function renderCalendar(){const p=profiles[currentProfileId];if(!p)return;$('startDate').value=p.startDate||'';$('endDate').value=p.endDate||'';const box=$('calendarDays');box.innerHTML='';for(const date of datesBetween(p.startDate,p.endDate)){const d=dayDoc(p.id,date),miss=missingCategories(p,d).length,totalCats=activeCats(p,date).length,free=hasFreeMeal(p,date),row=document.createElement('div');row.className='dayrow';row.innerHTML=`<button><b>${fmt(date)}</b><div class="muted">${miss?`mancano ${miss} scelte su ${totalCats}`:`${totalKcal(p,d)} kcal${free?' + pasto libero':''} · tutte le sezioni complete`}</div></button><span class="pill ${miss?'warn':'good'}">${miss?'incompleto':'completo'}</span>`;row.querySelector('button').onclick=()=>{setCurrentDate(date);tab('today')};box.appendChild(row)}}
$('savePeriod').onclick=async()=>{const p=profiles[currentProfileId],s=$('startDate').value,e=$('endDate').value;if(!s||!e||s>e){alert('Controlla le date');return}await updateDoc(doc(db,'households',householdId,'profiles',p.id),{startDate:s,endDate:e});currentDate=s};
function normalizeName(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
function planBounds(){
  const ps=Object.values(profiles).filter(p=>p.startDate&&p.endDate);
  if(!ps.length)return{from:isoToday(),to:addDays(isoToday(),13)};
  return{from:ps.map(p=>p.startDate).sort()[0],to:ps.map(p=>p.endDate).sort().at(-1)}
}
function shopRange(){
  const b=planBounds();let from=b.from,to=b.to;
  if(shopRangeMode==='week1'){from=b.from;to=addDays(from,6)}
  else if(shopRangeMode==='week2'){from=addDays(b.from,7);to=addDays(from,6)}
  else if(shopRangeMode==='custom'){from=shopCustomStart||b.from;to=shopCustomEnd||b.to}
  if(from<b.from)from=b.from;if(to>b.to)to=b.to;if(from>to)to=from;
  return{from,to}
}
function shopRangeLabel(r=shopRange()){return `${fmt(r.from,true)} → ${fmt(r.to,true)}`}
function dateInProfileRange(p,date,r){return date>=r.from&&date<=r.to&&(!p.startDate||date>=p.startDate)&&(!p.endDate||date<=p.endDate)}
function intersectionDays(p,r){if(!p.startDate||!p.endDate)return 0;const a=p.startDate>r.from?p.startDate:r.from,b=p.endDate<r.to?p.endDate:r.to;return datesBetween(a,b).length}
function syncShopPeriodControls(){
  for(const id of ['shopPeriod','portionPeriod'])if($(id))$(id).value=shopRangeMode;
  for(const prefix of ['shop','portion']){
    const wrap=$(prefix+'CustomRange');if(wrap)wrap.classList.toggle('hidden',shopRangeMode!=='custom');
    const s=$(prefix+'CustomStart'),e=$(prefix+'CustomEnd');if(s)s.value=shopCustomStart||planBounds().from;if(e)e.value=shopCustomEnd||planBounds().to;
  }
}
function setShopPeriod(mode,from=null,to=null){shopRangeMode=mode;if(from)shopCustomStart=from;if(to)shopCustomEnd=to;syncShopPeriodControls();renderShopping();renderPortions()}
function collectShop(range=shopRange()){
  const map=new Map();
  for(const p of Object.values(profiles)){
    for(const d of days.filter(x=>x.profileId===p.id&&dateInProfileRange(p,x.date,range))){
      for(const c of activeCats(p,d.date)){
        const it=selectedItem(p,d,c);if(!it)continue;
        const key=normalizeName(it.name);
        if(!map.has(key))map.set(key,{key,legacyKey:it.name.toLowerCase(),name:it.name,grams:0,count:0,department:it.department||'Altro',extra:false,categoryLabels:[],sourceDepartments:[]});
        const x=map.get(key);x.count++;if(it.grams!=null)x.grams+=Number(it.grams);
        if(c.label&&!x.categoryLabels.includes(c.label))x.categoryLabels.push(c.label);
        if(it.department&&!x.sourceDepartments.includes(it.department))x.sourceDepartments.push(it.department)
      }
    }
    const nd=intersectionDays(p,range);
    for(const sp of p.supplements||[]){
      if(!nd)continue;const key=normalizeName(sp.name);
      if(!map.has(key))map.set(key,{key,legacyKey:sp.name.toLowerCase(),name:sp.name,count:0,grams:null,department:sp.department||'Integratori',extra:false,unit:sp.unit,categoryLabels:[],sourceDepartments:[sp.department||'Integratori']});
      map.get(key).count+=(sp.qtyPerDay||0)*nd
    }
  }
  return [...map.values()]
}
function allShopItems(range=shopRange()){return collectShop(range).concat(extras.map(e=>({...e,key:'extra:'+e.id,extra:true,categoryLabels:[],sourceDepartments:[e.department||'Altro']})))}
function qty(x){if(x.extra)return `${x.qty||''} ${x.unit||''}`.trim();if(x.grams!=null&&x.grams>0)return x.grams>=1000?`${(x.grams/1000).toLocaleString('it-IT',{maximumFractionDigits:2})} kg`:`${Math.round(x.grams)} g`;return `${x.count} ${x.unit||'porzioni'}`}
const PIECE_WEIGHTS={
  'albicocche':[35,50],'arance':[160,220],'banana':[100,140],'carciofi':[180,250],'carote':[80,120],'cavolfiore':[700,1200],'cetrioli':[200,300],
  'cipolle':[120,180],'clementine':[70,100],'fichi':[40,60],"fichi d india":[90,130],'finocchi':[250,350],'mandaranci':[100,150],'mandarini':[80,110],
  'mela':[130,180],'melagrana':[250,400],'melanzane':[250,400],'melone':[900,1500],'nespole':[30,50],'peperoni':[180,280],'pera':[150,220],
  'pesca':[160,220],'pomodori da insalata':[120,200],'pompelmo':[250,400],'pompelmo rosa':[250,400],'porri':[200,350],'prugne':[50,80],
  'broccolo a testa':[400,700],'cavolo broccolo verde':[400,700],'zucchine':[150,250],'uova intere':[55,65],"albume d uovo":null
};
function approxPieces(x){
  if(!x||x.extra||!x.grams||x.grams<=0)return'';const n=normalizeName(x.name);
  if(/cilieg|datter|mirtill|lamp|more|ribes|uva|amarene|asparag|insalata|lattuga|spinaci|rucola|bieta|fagiolini|funghi|cicoria|valeriana|crescione/.test(n))return'';
  let w=null;for(const [k,v] of Object.entries(PIECE_WEIGHTS))if(v&&n===k){w=v;break}if(!w)return'';
  let lo=Math.max(1,Math.round(x.grams/w[1])),hi=Math.max(lo,Math.round(x.grams/w[0]));
  return lo===hi?`≈ ${lo} pz`:`≈ ${lo}–${hi} pz`
}
const GENERAL_DEPTS=['Frutta e verdura','Carne','Pesce','Latticini e uova','Salumi','Cereali e pane','Legumi','Condimenti','Frutta secca e snack','Integratori','Bevande','Casa e pulizia','Igiene','Altro'];
const TOSANO_AISLES=[
  ['0A','Frutta'],['0B','Verdura'],['0C','Carne fresca'],['0D','Carne congelata'],['0E','Pesce fresco'],['0F','Pesce congelato'],
  ['1','Acque · frutta secca'],['2','Bibite · energy drink · tè'],['3','Bibite · succhi'],['4','Birre'],['5','Spumanti · aperitivi'],['6','Vini'],['7','Liquori'],
  ['8','Confetture · caffè · tisane'],['9','Patatine · salatini · gallette'],['10','Merende · biscotti'],['11','Dolci · cereali · miele'],['12','Pane · crackers · grissini'],
  ['13','Pasta'],['14','Riso · legumi · scatolame'],['15','Olio · tonno · acciughe'],['16','Farine · passate · sughi'],['17','Animali'],['18','Casa · giardinaggio'],
  ['19','Detergenti casa'],['20','Detersivi piatti e bucato'],['21','Carta casa'],['22','Tovaglioli · pellicole · plastiche'],['23','Igiene persona'],['24','Parafarmacia · corpo'],
  ['25','Latte speciale · maionese · ketchup'],['26','Uova · salse · panna'],['27','Latticini · fresco'],['28','Salumi · pasta fresca · gelati']
];
const TOSANO_RANK=Object.fromEntries(TOSANO_AISLES.map((x,i)=>[x[0],i]));
function aisleLabel(code){const a=TOSANO_AISLES.find(x=>x[0]===code);return a?`${a[0]} · ${a[1]}`:'❓ Reparto sconosciuto'}
function mappingDocId(name){return idSafe(`${TOSANO_STORE_ID}|${normalizeName(name)}`)}
function manualAisle(name){return storeMappings[mappingDocId(name)]?.aisle||null}
function hasAny(s,words){return words.some(w=>s.includes(w))}
function inferTosanoAisle(x){
  const manual=manualAisle(x.name);if(manual)return manual;
  const n=normalizeName(x.name),dep=normalizeName(x.department),cats=normalizeName((x.categoryLabels||[]).join(' ')),all=`${n} ${dep} ${cats}`;
  const frozen=hasAny(n,['surgel','congel','frozen']);
  if(hasAny(n,['birra','radler']))return'4';
  if(hasAny(n,['spumante','prosecco','champagne','aperitivo','vino liquoroso']))return'5';
  if((n.includes('vino')||n.includes('magnum'))&&!n.includes('aceto'))return'6';
  if(hasAny(n,['vodka','gin','grappa','amaro','liquore','sciroppo']))return'7';
  if(hasAny(n,['carta igienica','tovaglia']))return'21';
  if(hasAny(n,['tovagliol','pellicol','plastica','piatti monouso','bicchieri monouso','picnic','incontinenza']))return'22';
  if(hasAny(n,['detersivo piatti','detersivo bucato','detersivi piatti','detersivi bucato']))return'20';
  if(hasAny(n,['ammorbidente','candeggina','smacchiatore','sgrassatore','detergente casa','wc','anticalcare']))return'19';
  if(hasAny(n,['dentifric','spazzolin','deodorant','shampoo','balsamo capelli','crema viso','crema corpo','depilator']))return'23';
  if(hasAny(n,['fazzolett','sapone intimo','cerott','docciaschiuma','bagnoschiuma','struccant','spugna corpo','parafarmacia']))return'24';
  if(hasAny(n,['lettiera','cibo gatto','cibo cane','crocchette gatto','crocchette cane','guinzaglio','insetticida']))return'17';
  if(hasAny(n,['scopa','tappeto','guanti','sacchi','profumo casa','lumini','cucito','giardinaggio']))return'18';
  if(hasAny(n,['maionese','ketchup','latte infanzia','omogeneizzato']))return'25';
  if(hasAny(n,['panna','latte condensato','cotechino','sottolio','sott oli','salsa']))return'26';
  if(hasAny(n,['sottaceto','sott aceto','pasta fresca','gelato']))return'28';
  if(hasAny(n,['marmellata','confettura','cioccolato spalmabile','caffe','capsule caffe','tisana']))return'8';
  if(hasAny(n,['patatine','salatini','gallette','preparato per dolci','senza glutine']))return'9';
  if(hasAny(n,['biscott','merenda']))return'10';
  if(hasAny(n,['cioccolat','caramell','miele','zucchero','snack','muesli','cereali','fiocchi d avena','avena','flakes','barretta']))return'11';
  if(hasAny(n,['fette biscottate','cracker','grissin','tarall','pane']))return'12';
  if(n.includes('pasta')&&!n.includes('pasta fresca')&&!n.includes('pasta integrale al pomodoro fresco'))return'13';
  if(hasAny(n,['riso','quinoa','lenticch','ceci','fagioli','piselli secchi','legumi','aduki','borlotti','cannellini','dado','piatto pronto','etnico']))return'14';
  if(hasAny(n,['olio','tonno sott olio','tonno in scatola','carne in scatola','acciugh']))return'15';
  if(hasAny(n,['farina','polenta','passata','sugo','pesto']))return'16';
  if(hasAny(n,['acqua naturale','acqua frizzante'])||n==='acqua'||n==='acque')return'1';
  if(hasAny(n,['energy drink','bicarbonato','te freddo','the freddo','ice tea']))return'2';
  if(hasAny(n,['succo','aloe','coca cola','coca-cola','aranciata','bibita']))return'3';
  if(dep.includes('integratori'))return'24';
  if(dep.includes('frutta secca')||hasAny(n,['mandorle','noci','nocciole','pistacchi','anacardi','semi']))return'1';
  if(dep.includes('carne'))return frozen?'0D':'0C';
  if(dep.includes('pesce')){
    if(hasAny(n,['sott olio','in scatola','acciugh']))return'15';
    return frozen?'0F':'0E'
  }
  if(dep.includes('salumi'))return'28';
  if(dep.includes('latticini')||dep.includes('uova')){if(n.includes('uova')||n.includes('albume'))return'26';return'27'}
  if(cats.includes('frutta')&&!cats.includes('frutta secca'))return'0A';
  if(cats.includes('verdura'))return'0B';
  if(dep.includes('frutta e verdura')){
    const FRUIT=['albicoc','amarene','arance','banana','cilieg','clement','cocomero','fichi','lampon','mandar','mela','melagrana','melone','mirtill','more','nespole','pera','pesca','pompelmo','prugne','ribes','uva','frutta fresca'];
    if(hasAny(n,FRUIT))return'0A';return'0B'
  }
  if(dep.includes('legumi')||cats.includes('legume'))return'14';
  if(dep.includes('cereali')||dep.includes('pane'))return'12';
  if(dep.includes('condimenti'))return'16';
  if(dep.includes('bevande'))return'3';
  if(dep.includes('igiene'))return'24';
  if(dep.includes('casa'))return'18';
  return null
}
function generalRank(dep){const i=GENERAL_DEPTS.indexOf(dep||'Altro');return i<0?999:i}
function shopSortMode(){return alphaPeek?'alpha':($('shopSort')?.value||'dept')}
function initialLetter(name){
  const s=String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
  const c=s[0]||'#';return /^[A-Z]$/.test(c)?c:'#'
}
function shopGroup(x,mode){if(mode==='alpha')return initialLetter(x.name);if(mode==='tosano')return inferTosanoAisle(x)||'?';return x.department||'Altro'}
function compareShop(a,b,mode){
  if(mode==='alpha')return a.name.localeCompare(b.name,'it',{sensitivity:'base'});
  if(mode==='tosano'){const aa=inferTosanoAisle(a),bb=inferTosanoAisle(b),ra=aa==null?999:(TOSANO_RANK[aa]??998),rb=bb==null?999:(TOSANO_RANK[bb]??998);return ra-rb||a.name.localeCompare(b.name,'it')}
  return generalRank(a.department)-generalRank(b.department)||(a.department||'').localeCompare(b.department||'','it')||a.name.localeCompare(b.name,'it')
}
function rangeCheckId(x,r=shopRange()){return idSafe(`v9|${r.from}|${r.to}|${x.key}`)}
function itemChecked(x,r=shopRange()){
  const specific=checks[rangeCheckId(x,r)];if(specific)return!!specific.checked;
  const b=planBounds();if(r.from===b.from&&r.to===b.to)return!!(checks[idSafe(x.legacyKey||x.key)]?.checked||checks[idSafe(x.key)]?.checked);
  return false
}
function shopContainer(){return shoppingModeOpen?$('shopModeOverlay'):$('shoppingList')}
function currentShopScroll(){return shoppingModeOpen?$('shopModeOverlay').scrollTop:window.scrollY}
function restoreShopScroll(v){requestAnimationFrame(()=>setTimeout(()=>{if(shoppingModeOpen)$('shopModeOverlay').scrollTop=v;else window.scrollTo({top:v,behavior:'auto'})},30))}
function checkShopItem(x,checked){
  const r=shopRange(),cid=rangeCheckId(x,r),peek=alphaPeek;
  checks[cid]={checked,key:x.key,updatedAt:Date.now()};
  if(peek)alphaPeek=null;
  renderShopping();if(peek)restoreShopScroll(peek.scrollPos);
  setDoc(doc(db,'households',householdId,'checks',cid),{checked,key:x.key,rangeFrom:r.from,rangeTo:r.to,updatedAt:Date.now()});
}
function shopMeta(x,mode){
  if(mode==='tosano'){
    const a=inferTosanoAisle(x);return a?`Iper Tosano · ${aisleLabel(a)}`:'Iper Tosano · reparto da assegnare'
  }
  return x.department||'Altro'
}
function addShopGroupHeader(box,group,mode,fullscreen){
  const h=document.createElement('div');h.className='dept shopGroupHeader'+(fullscreen?' shopGroupBig':'');h.dataset.group=group;
  h.dataset.letterHeader=mode==='alpha'?group:'';
  if(mode==='tosano')h.textContent=group==='?'?'❓ Reparto sconosciuto':`Reparto ${aisleLabel(group)}`;
  else if(mode==='alpha')h.textContent=group;else h.textContent=group;
  box.appendChild(h)
}
function renderShopRow(box,x,r,mode,fullscreen){
  const done=itemChecked(x,r);
  const row=document.createElement('div');row.className='shoprow'+(done?' checked':'')+(fullscreen?' shoprowMode':'');row.dataset.itemKey=x.key;
  const pieces=approxPieces(x),aisle=inferTosanoAisle(x),manual=!!manualAisle(x.name);
  row.innerHTML=`<input type="checkbox" ${done?'checked':''}><div class="shopMain"><b>${x.name}</b>${x.extra?'<span class="extraBadge">EXTRA</span>':''}<div class="muted shopMeta">${shopMeta(x,mode)}</div>${mode==='tosano'?`<button class="aisleEdit ${aisle?'':'unknown'}">${aisle?(manual?'✎ reparto '+aisle:'✎ '+aisle+' automatico'):'Assegna reparto'}</button>`:''}</div><div class="shopQty"><b>${qty(x)}</b>${pieces?`<small>${pieces}</small>`:''}${x.extra?'<button class="danger deleteExtra">Elimina</button>':''}</div>`;
  row.querySelector('input').onchange=e=>checkShopItem(x,e.target.checked);
  row.querySelector('.aisleEdit')?.addEventListener('click',()=>openAisleModal(x));
  row.querySelector('.deleteExtra')?.addEventListener('click',async()=>{if(!confirm(`Eliminare "${x.name}" dagli EXTRA?`))return;await deleteDoc(doc(db,'households',householdId,'extras',x.id))});
  box.appendChild(row)
}
function renderShopList(box,{fullscreen=false}={}){
  if(!box)return;
  const r=shopRange(),mode=shopSortMode();
  let arr=allShopItems(r).sort((a,b)=>compareShop(a,b,mode));
  if(hideDone)arr=arr.filter(x=>!itemChecked(x,r));
  box.innerHTML='';

  if(alphaPeek){
    const bar=document.createElement('div');bar.className='alphaPeekBar';
    bar.innerHTML=`<span>Ricerca rapida A–Z</span><button>Torna a ${$('shopSort')?.selectedOptions?.[0]?.textContent||'lista'}</button>`;
    bar.querySelector('button').onclick=()=>{const p=alphaPeek;alphaPeek=null;renderShopping();restoreShopScroll(p.scrollPos)};
    box.appendChild(bar)
  }

  if(mode==='alpha'){
    const byLetter=Object.fromEntries(ALPHABET.map(l=>[l,[]]));
    for(const x of arr){
      const l=initialLetter(x.name);
      if(byLetter[l])byLetter[l].push(x)
    }
    for(const letter of ALPHABET){
      addShopGroupHeader(box,letter,'alpha',fullscreen);
      const items=byLetter[letter];
      if(!items.length){
        const empty=document.createElement('div');
        empty.className='alphaEmptySection';
        empty.textContent=`Nessun prodotto con la lettera ${letter}`;
        box.appendChild(empty);
      }else{
        for(const x of items)renderShopRow(box,x,r,mode,fullscreen)
      }
    }
    return
  }

  let last='';
  for(const x of arr){
    const group=shopGroup(x,mode);
    if(group!==last){last=group;addShopGroupHeader(box,group,mode,fullscreen)}
    renderShopRow(box,x,r,mode,fullscreen)
  }
  if(!arr.length)box.innerHTML='<div class="emptyHistory">Nessun prodotto nel periodo selezionato.</div>'
}
function renderShopping(){
  if(!householdId)return;syncShopPeriodControls();const r=shopRange(),arr=allShopItems(r);
  renderShopList($('shoppingList'));
  if($('shopInfo'))$('shopInfo').textContent=`${arr.length} voci · ${shopRangeLabel(r)}`;
  if(shoppingModeOpen){renderShopList($('shopModeList'),{fullscreen:true});$('shopModeInfo').textContent=`${$('shopSort').selectedOptions[0].textContent} · ${shopRangeLabel(r)}`;$('shopModeRemaining').textContent=`${arr.filter(x=>!itemChecked(x,r)).length} da prendere`}
  renderAlphaIndex()
}
function openAisleModal(x){
  const sel=$('aisleSelect');sel.innerHTML='<option value="AUTO">Automatico</option>'+TOSANO_AISLES.map(a=>`<option value="${a[0]}">${a[0]} · ${a[1]}</option>`).join('');
  sel.value=manualAisle(x.name)||'AUTO';$('aisleItemName').textContent=x.name;$('aisleModal').dataset.itemName=x.name;$('aisleModal').classList.remove('hidden')
}
$('cancelAisle')?.addEventListener('click',()=>$('aisleModal').classList.add('hidden'));
$('saveAisle')?.addEventListener('click',async()=>{const name=$('aisleModal').dataset.itemName,v=$('aisleSelect').value,ref=doc(db,'households',householdId,'storeMappings',mappingDocId(name));if(v==='AUTO')await deleteDoc(ref);else await setDoc(ref,{storeId:TOSANO_STORE_ID,name,aisle:v,updatedAt:Date.now()});$('aisleModal').classList.add('hidden')});
$('shopSort').onchange=()=>{alphaPeek=null;renderShopping()};
$('hideChecked').onclick=()=>{hideDone=!hideDone;$('hideChecked').textContent='Nascondi presi: '+(hideDone?'SÌ':'NO');renderShopping()};
$('addExtra').onclick=()=>$('modal').classList.remove('hidden');$('cancelExtra').onclick=()=>$('modal').classList.add('hidden');
$('saveExtra').onclick=async()=>{const name=$('extraName').value.trim();if(!name)return;const ref=doc(collection(db,'households',householdId,'extras'));await setDoc(ref,{name,qty:Number($('extraQty').value||1),unit:$('extraUnit').value.trim()||'pz',department:$('extraDept').value,createdAt:Date.now()});$('modal').classList.add('hidden');$('extraName').value=''};
$('shareShop').onclick=async()=>{const r=shopRange(),arr=allShopItems(r);const text=['LISTA DELLA SPESA',shopRangeLabel(r),'',...arr.map(x=>`• ${x.name}: ${qty(x)}${approxPieces(x)?' · '+approxPieces(x):''}${x.extra?' [EXTRA]':''}`)].join('\n');if(navigator.share)try{await navigator.share({title:'Spesa PianoCasa',text})}catch{}else{await navigator.clipboard.writeText(text);alert('Lista copiata')}};
for(const id of ['shopPeriod','portionPeriod'])$(id)?.addEventListener('change',e=>setShopPeriod(e.target.value));
for(const prefix of ['shop','portion']){
  $(prefix+'CustomStart')?.addEventListener('change',e=>{shopCustomStart=e.target.value;setShopPeriod('custom')});
  $(prefix+'CustomEnd')?.addEventListener('change',e=>{shopCustomEnd=e.target.value;setShopPeriod('custom')});
}
$('startShopping')?.addEventListener('click',()=>{shoppingModeOpen=true;$('shopModeOverlay').classList.remove('hidden');document.body.classList.add('shoppingModeOpen');$('shopModeOverlay').scrollTop=0;renderShopping()});
$('closeShopMode')?.addEventListener('click',()=>{shoppingModeOpen=false;alphaPeek=null;$('shopModeOverlay').classList.add('hidden');document.body.classList.remove('shoppingModeOpen');renderAlphaIndex()});
$('nextShopGroup')?.addEventListener('click',()=>{
  const ov=$('shopModeOverlay'),heads=[...$('shopModeList').querySelectorAll('.shopGroupHeader')];if(!heads.length)return;
  const top=ov.getBoundingClientRect().top+95,next=heads.find(h=>h.getBoundingClientRect().top>top+25);(next||heads[0]).scrollIntoView({behavior:'smooth',block:'start'})
});
const ALPHABET='ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
function visibleAlphaCounts(){
  const r=shopRange(),counts=Object.fromEntries(ALPHABET.map(l=>[l,0]));
  for(const x of allShopItems(r)){
    if(hideDone&&itemChecked(x,r))continue;
    const l=initialLetter(x.name);
    if(counts[l]!=null)counts[l]++
  }
  return counts
}
function renderAlphaIndex(){
  const btn=$('alphaQuickBtn');if(!btn)return;
  const visible=!!(document.querySelector('#shopping.tab.active')||shoppingModeOpen);
  btn.classList.toggle('hidden',!visible)
}
function refreshAlphaPicker(){
  const grid=$('alphaGrid');if(!grid)return;
  const counts=visibleAlphaCounts();
  grid.innerHTML=ALPHABET.map(l=>{
    const n=counts[l]||0;
    return `<button type="button" data-letter="${l}" aria-label="${n?`${l}, ${n} prodotti`:`${l}, nessun prodotto`}"><span>${l}</span><small>${n}</small></button>`
  }).join('')
}
function setupAlphaIndex(){
  const btn=$('alphaQuickBtn'),picker=$('alphaPicker'),grid=$('alphaGrid'),close=$('closeAlphaPicker');
  if(!btn||!picker||!grid||btn.dataset.ready)return;btn.dataset.ready='1';
  const shut=()=>picker.classList.add('hidden');
  btn.onclick=()=>{
    refreshAlphaPicker();
    picker.classList.remove('hidden');
    requestAnimationFrame(()=>grid.querySelector('button:not(:disabled)')?.focus({preventScroll:true}))
  };
  close.onclick=shut;
  picker.addEventListener('click',e=>{if(e.target===picker)shut()});
  grid.addEventListener('click',e=>{
    const b=e.target.closest('[data-letter]');
    if(!b)return;
    const l=b.dataset.letter;shut();jumpAlpha(l)
  })
}
function scrollToExactAlphaHeader(letter){
  const c=shoppingModeOpen?$('shopModeList'):$('shoppingList');
  if(!c)return false;
  const target=[...c.querySelectorAll('[data-letter-header]')].find(x=>x.dataset.letterHeader===letter);
  if(!target)return false;

  if(shoppingModeOpen){
    const scroller=$('shopModeOverlay');
    const topBar=scroller.querySelector('.shopModeTop');
    const offset=(topBar?.offsetHeight||86)+8;
    const srect=scroller.getBoundingClientRect(),trect=target.getBoundingClientRect();
    const y=Math.max(0,scroller.scrollTop+(trect.top-srect.top)-offset);
    scroller.scrollTo({top:y,behavior:'auto'})
  }else{
    const nav=document.querySelector('.tabs');
    const desired=(nav?.getBoundingClientRect().bottom||0)+8;
    const y=Math.max(0,window.scrollY+target.getBoundingClientRect().top-desired);
    window.scrollTo({top:y,behavior:'auto'})
  }
  target.classList.add('alphaTargetFlash');
  setTimeout(()=>target.classList.remove('alphaTargetFlash'),650);
  return true
}
function jumpAlpha(letter){
  if(!ALPHABET.includes(letter))return;

  const base=$('shopSort')?.value||'dept';
  if(base!=='alpha'&&!alphaPeek){
    alphaPeek={base,scrollPos:currentShopScroll(),letter}
  }else if(alphaPeek){
    alphaPeek.letter=letter
  }

  renderShopping();

  // Due frame: prima il DOM viene ricostruito, poi misuriamo la posizione reale.
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    const ok=scrollToExactAlphaHeader(letter);
    if(!ok&&alphaPeek){
      const p=alphaPeek;alphaPeek=null;renderShopping();restoreShopScroll(p.scrollPos)
    }
  }))
}

function portionableItem(it){const d=it.department||'';return ['Carne','Pesce','Salumi','Latticini e uova','Cereali e pane','Legumi','Frutta secca e snack'].includes(d)}
function collectPortions(range=shopRange()){
  const map=new Map();
  for(const p of Object.values(profiles))for(const d of days.filter(x=>x.profileId===p.id&&dateInProfileRange(p,x.date,range)))for(const c of activeCats(p,d.date)){
    const it=selectedItem(p,d,c);if(!it||it.grams==null||!portionableItem(it))continue;const key=normalizeName(it.name);
    if(!map.has(key))map.set(key,{key,name:it.name,total:0,department:it.department,profiles:{}});const x=map.get(key);x.total+=Number(it.grams);
    if(!x.profiles[p.id])x.profiles[p.id]={name:p.displayName,total:0,sizes:{}};const pp=x.profiles[p.id];pp.total+=Number(it.grams);pp.sizes[it.grams]=(pp.sizes[it.grams]||0)+1
  }
  return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name,'it'))
}
function portionCheckId(range,itemKey,pid,grams){return idSafe(`portion|${range.from}|${range.to}|${itemKey}|${pid}|${grams}`)}
function renderPortions(){
  const box=$('portionList');if(!box||!householdId)return;syncShopPeriodControls();const r=shopRange(),arr=collectPortions(r),shopMap=Object.fromEntries(allShopItems(r).map(x=>[x.key,x]));
  $('portionInfo').textContent=`${arr.length} alimenti · ${shopRangeLabel(r)}`;box.innerHTML='';
  if(!arr.length){box.innerHTML='<div class="emptyHistory">Completa i menu del periodo per vedere le porzioni da preparare.</div>';return}
  for(const x of arr){const bought=shopMap[x.key]?itemChecked(shopMap[x.key],r):false,card=document.createElement('section');card.className='portionCard';
    const groups=[];let totalGroups=0,doneGroups=0;
    for(const [pid,pp] of Object.entries(x.profiles))for(const [g,count] of Object.entries(pp.sizes)){const cid=portionCheckId(r,x.key,pid,g),done=!!portionChecks[cid]?.checked;totalGroups++;if(done)doneGroups++;groups.push({pid,pp,g:Number(g),count,cid,done})}
    card.innerHTML=`<div class="portionHead"><div><h3>${x.name}</h3><div class="muted">Totale ${x.total>=1000?(x.total/1000).toLocaleString('it-IT',{maximumFractionDigits:2})+' kg':Math.round(x.total)+' g'}</div></div><div class="portionStatus ${bought?'bought':'waiting'}">${bought?'✓ Acquistato':'Da acquistare'}</div></div><div class="portionProgress"><div style="width:${totalGroups?doneGroups/totalGroups*100:0}%"></div></div>`;
    for(const [pid,pp] of Object.entries(x.profiles)){
      const sec=document.createElement('div');sec.className='portionPerson';sec.innerHTML=`<div class="portionPersonHead"><b>${pp.name}</b><span>${Math.round(pp.total)} g</span></div>`;
      for(const g of groups.filter(z=>z.pid===pid).sort((a,b)=>a.g-b.g)){
        const row=document.createElement('label');row.className='portionRow'+(g.done?' done':'');row.innerHTML=`<input type="checkbox" ${g.done?'checked':''}><span><b>${g.g} g</b> × ${g.count} ${g.count===1?'porzione':'porzioni'}</span>`;
        row.querySelector('input').onchange=e=>{portionChecks[g.cid]={checked:e.target.checked,updatedAt:Date.now()};renderPortions();setDoc(doc(db,'households',householdId,'portionChecks',g.cid),{checked:e.target.checked,itemKey:x.key,profileId:pid,grams:g.g,rangeFrom:r.from,rangeTo:r.to,updatedAt:Date.now()})};sec.appendChild(row)
      }
      card.appendChild(sec)
    }
    box.appendChild(card)
  }
}


function sanitizeSelectionsForDate(p,date,selections={}){
  const allowed=new Set(activeCats(p,date).map(c=>c.id));
  const out={};
  for(const [cat,id] of Object.entries(selections||{}))if(allowed.has(cat))out[cat]=id;
  return out;
}
async function copyDayTo(pid,srcDate,dstDate){
  const p=profiles[pid],src=days.find(x=>x.profileId===pid&&x.date===srcDate);
  if(!p||!src)return false;
  const nd={profileId:pid,date:dstDate,selections:sanitizeSelectionsForDate(p,dstDate,structuredClone(src.selections||{})),consumed:{}};
  await saveDay(pid,dstDate,nd);return true;
}
async function copyWeekForProfiles(profileIds,srcStart,dstStart){
  let copied=0;
  for(const pid of profileIds){
    for(let i=0;i<7;i++)if(await copyDayTo(pid,addDays(srcStart,i),addDays(dstStart,i)))copied++;
  }
  return copied;
}
function dayHistorySummary(p,date,d){
  return p.meals.map(meal=>{
    if(isFreeMeal(date,meal))return `<div class="historyMeal"><b>${meal.label}</b><span>🎉 Pasto libero</span></div>`;
    const parts=meal.categories.map(c=>{const it=selectedItem(p,d,c);return it?`${it.name}${it.grams!=null?' '+it.grams+' g':''}`:'⚠️ mancante'}).join(' · ');
    return `<div class="historyMeal"><b>${meal.label}</b><span>${parts}</span></div>`;
  }).join('');
}
function renderHistory(){
  const box=$('historyList'),sel=$('historyProfile');if(!box||!sel||!Object.keys(profiles).length)return;
  if(!$('historyWeekSource').value){
    const p=profiles[currentProfileId]||Object.values(profiles)[0];
    if(p?.startDate){$('historyWeekSource').value=p.startDate;$('historyWeekTarget').value=addDays(p.startDate,7)}
  }
  const prev=sel.value||'all';
  sel.innerHTML='<option value="all">Entrambi</option>'+Object.values(profiles).sort((a,b)=>a.displayName.localeCompare(b.displayName,'it')).map(p=>`<option value="${p.id}">${p.displayName}</option>`).join('');
  if([...sel.options].some(o=>o.value===prev))sel.value=prev;
  const ids=sel.value==='all'?Object.keys(profiles):[sel.value];
  const entries=days.filter(d=>ids.includes(d.profileId)).sort((a,b)=>b.date.localeCompare(a.date)||profiles[a.profileId]?.displayName.localeCompare(profiles[b.profileId]?.displayName,'it'));
  box.innerHTML='';
  if(!entries.length){box.innerHTML='<div class="emptyHistory">Nessun menu salvato.</div>';return}
  for(const d of entries){
    const p=profiles[d.profileId];if(!p)continue;
    const miss=missingCategories(p,d).length,card=document.createElement('section');card.className='historyCard';
    card.innerHTML=`<div class="historyHead"><div><span class="profileBadge">${p.displayName}</span><h3>${fmt(d.date)}</h3></div><span class="pill ${miss?'warn':'good'}">${miss?`mancano ${miss}`:'completo'}</span></div>
      <div class="historyMeals">${dayHistorySummary(p,d.date,d)}</div>
      <div class="historyCopy"><label>Copia questo giorno a<input type="date" value="${addDays(d.date,7)}"></label><button class="copyHistoryDay">Copia giorno</button></div>`;
    const input=card.querySelector('input');
    card.querySelector('.copyHistoryDay').onclick=async()=>{if(!input.value)return;if(!confirm(`Copiare il menu di ${fmt(d.date,true)} al ${fmt(input.value,true)}?`))return;await copyDayTo(p.id,d.date,input.value);alert('Giorno copiato.')};
    box.appendChild(card)
  }
}
$('historyProfile')?.addEventListener('change',renderHistory);
$('copyHistoryWeek')?.addEventListener('click',async()=>{
  const src=$('historyWeekSource').value,dst=$('historyWeekTarget').value,mode=$('historyProfile').value;
  if(!src||!dst){alert('Scegli settimana origine e destinazione.');return}
  const ids=mode==='all'?Object.keys(profiles):[mode];
  if(!confirm(`Copiare 7 giorni dal ${fmt(src,true)} al ${fmt(dst,true)} per ${mode==='all'?'entrambi i profili':profiles[mode]?.displayName}?`))return;
  const n=await copyWeekForProfiles(ids,src,dst);alert(`Copiati ${n} giorni.`);
});
$('historyWeekSource')?.addEventListener('change',e=>{if(e.target.value&&!$('historyWeekTarget').value)$('historyWeekTarget').value=addDays(e.target.value,7)});


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
      if(isFreeMeal(date,meal)){
        block.innerHTML=`<div class="menuMealTitle"><b>${meal.label}</b><span>PASTO LIBERO</span></div><div class="menuFreeMeal">🎉 Pasto libero · nessuna selezione richiesta</div>`;
      }else{
        const rows=meal.categories.map(c=>{const it=selectedItem(p,d,c);return `<div class="menuCatRow ${it?'':'missing'}"><span>${c.label}</span><b>${it?`${it.name}${it.grams!=null?' — '+it.grams+' g':''}`:'⚠️ Da scegliere'}</b></div>`}).join('');
        block.innerHTML=`<div class="menuMealTitle"><b>${meal.label}</b><span>${mealTotal(p,d,meal)} kcal</span></div>${rows}`;
      }
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
