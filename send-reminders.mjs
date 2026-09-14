import admin from 'firebase-admin';
import webpush from 'web-push';

const svc=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({credential:admin.credential.cert(svc)});
const db=admin.firestore();

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT||'mailto:pianocasa@example.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

const force=process.env.GITHUB_EVENT_NAME==='workflow_dispatch';
const now=new Date();
const parts=new Intl.DateTimeFormat('en-CA',{
  timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',hourCycle:'h23'
}).formatToParts(now).reduce((a,x)=>(a[x.type]=x.value,a),{});
const today=`${parts.year}-${parts.month}-${parts.day}`;
const cur=Number(parts.hour)*60+Number(parts.minute);

const hs=await db.collection('households').get();

for(const h of hs.docs){
  const hid=h.id;
  const members=await db.collection(`households/${hid}/members`).get();
  const profiles=await db.collection(`households/${hid}/profiles`).get();
  const pmap=Object.fromEntries(profiles.docs.map(d=>[d.id,d.data()]));

  for(const md of members.docs){
    const m=md.data();
    const [hh,mm]=(m.notifyAt||'07:30').split(':').map(Number);
    const target=hh*60+mm;

    if(!force){
      let delta=cur-target;
      if(delta<0)delta+=1440;
      if(delta>35)continue;
    }

    const logRef=db.doc(`households/${hid}/notificationLog/${md.id}_${today}`);
    if(!force && (await logRef.get()).exists)continue;

    const own=(await db.doc(`households/${hid}/days/${m.profileId}_${today}`).get()).data();
    if(!own?.summary)continue;

    const subs=await db.collection(`households/${hid}/pushSubscriptions`).where('uid','==',md.id).get();
    if(subs.empty)continue;

    const appUrl=`https://${process.env.GH_OWNER}.github.io/${process.env.GH_REPO}/?menu=${today}`;

    let title=`Menu di oggi — ${m.displayName}`;
    let body='Il menu di oggi è pronto. Tocca per vedere tutti i pasti e le grammature.';

    if(m.includePartnerMenu){
      const partnerNames=Object.values(pmap).filter(p=>p.id!==m.profileId).map(p=>p.displayName);
      if(partnerNames.length){
        title=`Menu di oggi — ${m.displayName} + ${partnerNames.join(' + ')}`;
        body='I menu di oggi sono pronti. Tocca per vedere entrambi, con pasti e grammature.';
      }
    }

    const msg={title,body,url:appUrl};

    for(const sd of subs.docs){
      const sub=sd.data();
      try{
        await webpush.sendNotification(
          {endpoint:sub.endpoint,keys:sub.keys},
          JSON.stringify(msg)
        );
      }catch(e){
        if(e.statusCode===404||e.statusCode===410)await sd.ref.delete();
        else console.error(e.message);
      }
    }

    // I test manuali possono essere ripetuti e non devono "consumare"
    // la notifica automatica del giorno.
    if(!force)await logRef.set({sentAt:admin.firestore.FieldValue.serverTimestamp()});
  }
}
