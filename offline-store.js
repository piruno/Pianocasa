/* Small durable outbox: account and household scoped; never stores photographs. */
window.PCOffline={
 read(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}},
 write(key,value){localStorage.setItem(key,JSON.stringify(value))},
 pending(){return this.read('pc19_outbox',[])},
 queue(uid,hid,kind,id,data){if(!uid||!hid)throw Error('Account non disponibile');const list=this.pending().filter(q=>!(q.uid===uid&&q.hid===hid&&q.kind===kind&&q.id===id));list.push({uid,hid,kind,id,data,token:crypto.randomUUID()});this.write('pc19_outbox',list)},
 ack(token){this.write('pc19_outbox',this.pending().filter(q=>q.token!==token))}
};
