/* Pure data helpers: prices in cents; no images retained. */
(function(root){
 const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 function number(s){const v=String(s??'').trim().replace(/€/g,'').replace(/\s/g,'');const n=Number(v.includes(',')?v.replace(/\./g,'').replace(',','.'):v);if(!Number.isFinite(n))throw Error('Numero non valido: '+s);return n}
 const cents=s=>Math.round(number(s)*100);
 const sum=rows=>rows.reduce((s,r)=>s+r.cents,0);
 function receipt(text){let total=null,date='',rows=[],pending=null,ended=false;for(const raw of text.split(/\r?\n/)){
 const line=raw.trim().replace(/(\d)[.,]\s+(\d{2})\b/g,'$1,$2').replace(/\s*[|]\s*$/,'');const dt=line.match(/\b(\d{2})[-/.](\d{2})[-/.](20\d{2})\b/);if(dt)date=`${dt[3]}-${dt[2]}-${dt[1]}`;
 const money=line.match(/(-?\d+[.,]\d{2})\s*€?\s*$/);
 if(/^totale\b/i.test(line)&&money){total=cents(money[1]);ended=true;continue}
 if(ended)continue;
 if(/pagament|importo pagato|ticket|di cui iva|resto|contant|bancomat|carta credito|subtotale|totale/i.test(line))continue;
 const mul=line.match(/^\s*(\d+)\s*[xX×]\s*(\d+[.,]\d{2})\s*$/);if(mul){pending={count:Number(mul[1]),unitCents:cents(mul[2])};continue}
 if(!money||!/[A-Za-zÀ-ÿ]/.test(line))continue;
 const label=line.slice(0,money.index).replace(/^[|}]+\s*/,'').replace(/\s+(4|5|10|22)\s*$/,'').trim();if(!label)continue;
 let cost=cents(money[1]);if(/sconto|buono sconto|coupon/i.test(label))cost=-Math.abs(cost);
 rows.push({name:label,cents:cost,quantity:pending?.count||1,product:'',packAmount:null,packUnit:'',discount:cost<0,verified:false});pending=null;
 }return {date,store:'',rows,totalCents:total,text:text.slice(0,60000),verified:false}}
 const signature=list=>JSON.stringify([list.range,list.items.map(x=>[x.key,x.quantity,x.basis]).sort((a,b)=>a[0].localeCompare(b[0]))]);
 function validateReport(report,request){
 if(report.schema!=='pianocasa-comparison-v1'||report.requestId!==request.id)throw Error('Risposta non associata a questa ricerca.');
 if(!Array.isArray(report.stores)||!report.stores.length||report.stores.length>30)throw Error('Elenco supermercati non valido.');
 const keys=new Set(request.list.items.map(x=>x.key));
 function price(p){if(!p||!Number.isSafeInteger(p.totalCents)||p.totalCents<0||!Number.isFinite(p.amount)||p.amount<=0||!Number.isInteger(p.packages)||p.packages<1||typeof p.unit!=='string'||typeof p.product!=='string')throw Error('Prezzo, prodotto o confezioni non validi.');if(!/^https:\/\//.test(p.source||''))throw Error('Ogni prezzo deve avere un link HTTPS alla fonte.');if(!/^\d{4}-\d{2}-\d{2}$/.test(p.validUntil||''))throw Error('Manca la validità del prezzo.');}
 for(const s of report.stores){if(!s.name||!s.address||!Array.isArray(s.items))throw Error('Negozio incompleto.');const used=new Set();for(const x of s.items){if(!keys.has(x.key)||used.has(x.key))throw Error('Prodotto estraneo o duplicato.');used.add(x.key);if(x.base)price(x.base);if(x.offer)price(x.offer);}}
 if(report.suggestions){if(!Array.isArray(report.suggestions)||report.suggestions.length>100)throw Error('Suggerimenti non validi');for(const p of report.suggestions)price(p);}
 return report;
 }
 function offerBetter(base,offer){return !!(base&&offer&&base.unit===offer.unit&&offer.totalCents/offer.amount<base.totalCents/base.amount&&offer.amount>=base.amount)}
 function priceValid(p,date){return !!p&&p.validUntil>=date&&(!p.validFrom||p.validFrom<=date)}
 root.PCCore={norm,number,cents,sum,receipt,signature,validateReport,offerBetter,priceValid};
 if(typeof module!=='undefined')module.exports=root.PCCore;
})(typeof window!=='undefined'?window:globalThis);
