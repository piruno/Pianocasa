import admin from 'firebase-admin';import webpush from 'web-push';
const svc=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);admin.initializeApp({credential:admin.credential.cert(svc)});const db=admin.firestore();webpush.setVapidDetails(process.env.VAPID_SUBJECT||'mailto:pianocasa@example.com',process.env.VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY);
const now=new Date();const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).reduce((a,x)=>(a[x.type]=x.value,a),{});const today=`${parts.year}-${parts.month}-${parts.day}`, cur=Number(parts.hour)*60+Number(parts.minute);
const hs=await db.collection('households').get();
for(const h of hs.docs){const hid=h.id,hdata=h.data();const members=await db.collection(`households/${hid}/members`).get();const profiles=await db.collection(`households/${hid}/profiles`).get();const pmap=Object.fromEntries(profiles.docs.map(d=>[d.id,d.data()]));

 // Mantiene aggiornato il documento usato dai Comandi Rapidi/Siri anche a PWA chiusa.
 if(hdata.siriToken){
   const siri={householdId:hid,date:today,updatedAt:Date.now()};
   for(const [pid,p] of Object.entries(pmap)){
     const ds=(await db.doc(`households/${hid}/days/${pid}_${today}`).get()).data()||{};
     const s=ds.summary||{};
     const hasMeal=id=>(p.meals||[]).some(m=>m.id===id);
     const say=(id,label,missingText)=>{
       if(!hasMeal(id))return missingText;
       return s[id]?`${label}: ${s[id]}`:`${label}: non ancora compilato`;
     };

     const breakfast=say('breakfast','Colazione','Non hai colazione.');
     const morningSnack=say('morning_snack','Spuntino','Non hai spuntino.');
     const lunch=say('lunch','Pranzo','Non hai pranzo.');
     const afternoonSnack=say('snack','Merenda','Non hai merenda.');
     const dinner=say('dinner','Cena','Non hai cena.');

     siri[`${pid}_breakfast`]=breakfast;
     siri[`${pid}_lunch`]=lunch;
     siri[`${pid}_spuntino`]=morningSnack;
     siri[`${pid}_merenda`]=afternoonSnack;

     // Compatibilità con i vecchi Comandi Rapidi.
     siri[`${pid}_snack`]=morningSnack;
     siri[`${pid}_morning_snack`]=morningSnack;
     siri[`${pid}_afternoon_snack`]=afternoonSnack;

     siri[`${pid}_dinner`]=dinner;

     const full=[];
     if(hasMeal('breakfast'))full.push(breakfast);
     if(hasMeal('morning_snack'))full.push(morningSnack);
     if(hasMeal('lunch'))full.push(lunch);
     if(hasMeal('snack'))full.push(afternoonSnack);
     if(hasMeal('dinner'))full.push(dinner);
     siri[`${pid}_full`]=`${p.displayName||pid}. ${full.join('. ')}`;
   }
   await db.doc(`siriPublic/${hdata.siriToken}`).set(siri);
 }

 for(const md of members.docs){const m=md.data(), [hh,mm]=(m.notifyAt||'07:30').split(':').map(Number), target=hh*60+mm;let delta=cur-target;if(delta<0)delta+=1440;if(delta>35)continue;const logRef=db.doc(`households/${hid}/notificationLog/${md.id}_${today}`);if((await logRef.get()).exists)continue;const own=(await db.doc(`households/${hid}/days/${m.profileId}_${today}`).get()).data();if(!own?.summary)continue;const subs=await db.collection(`households/${hid}/pushSubscriptions`).where('uid','==',md.id).get();const appUrl=`https://${process.env.GH_OWNER}.github.io/${process.env.GH_REPO}/`;
 const messages=[];messages.push({title:`Menu di oggi — ${m.displayName}`,body:summaryText(own.summary,true),url:appUrl});if(m.includePartnerMenu){for(const [pid,p] of Object.entries(pmap)){if(pid===m.profileId)continue;const od=(await db.doc(`households/${hid}/days/${pid}_${today}`).get()).data();if(od?.summary)messages.push({title:`Menu ${p.displayName} — per cucinare`,body:summaryText(od.summary,false),url:appUrl})}}
 for(const sd of subs.docs){const sub=sd.data();for(const msg of messages){try{await webpush.sendNotification({endpoint:sub.endpoint,keys:sub.keys},JSON.stringify(msg))}catch(e){if(e.statusCode===404||e.statusCode===410)await sd.ref.delete();else console.error(e.message)}}}await logRef.set({sentAt:admin.firestore.FieldValue.serverTimestamp()});}}
function summaryText(s,all){const map=[['breakfast','Col'],['morning_snack','Sp'],['lunch','Pr'],['snack','Mer'],['dinner','Ce']];return map.filter(([k])=>all||['lunch','dinner'].includes(k)).filter(([k])=>s[k]).map(([k,l])=>`${l}: ${s[k]}`).join(' · ').slice(0,900)}
