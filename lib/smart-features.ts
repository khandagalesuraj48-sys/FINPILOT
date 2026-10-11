/** FINPILOT Smart Hub: deterministic analysis only. No bank connection or SMS permissions. */
import type {FinanceData, Transaction} from './types';
import {paise,rupees,sumPaise,accountPositions} from './financial-core';

export type ParsedBankAlert={direction:'debit'|'credit';amount:number;maskedAccount:string|null;reference:string|null;merchant:string|null;confidence:'high'|'review';warnings:string[]};
export type SmartEvent={id:string;date:string;type:'emi'|'recurring'|'card'|'receivable';title:string;amount:number;direction:'in'|'out'|'review';note:string;estimated:boolean};

const dstr=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const day=(iso:string)=>{const [y,m,d]=iso.slice(0,10).split('-').map(Number);return new Date(y,m-1,d,12)};
const normalized=(v:string)=>v.toLowerCase().replace(/[^a-z0-9]/g,' ').replace(/\s+/g,' ').trim();
const MONEY=/(?:₹|\b(?:INR|Rs\.?))\s*([\d,]+(?:\.\d{1,2})?)/gi;
/** Parses a manually pasted bank alert. Original SMS never leaves this function. */
export function parseBankAlert(raw:string):ParsedBankAlert|null{
 const text=raw.replace(/\s+/g,' ').trim();
 if(text.length<12||text.length>3000)return null;
 // Protect against payment requests, OTP, pending/failed transactions and security messages.
 if(/\b(otp|one.time.password|verification code|payment request|collect request|mandate request|failed|declined|unsuccessful|pending|attempted|cancelled|canceled)\b/i.test(text))return null;
 const verbs:Array<{kind:'debit'|'credit';re:RegExp}>=[
  {kind:'debit',re:/\b(debit(?:ed)?|spent|withdrawn|paid|sent)\b/gi},
  {kind:'credit',re:/\b(credit(?:ed)?|received|deposited)\b/gi}
 ];
 const tokens:{kind:'debit'|'credit';at:number}[]=[];
 for(const x of verbs){for(const m of text.matchAll(x.re))tokens.push({kind:x.kind,at:m.index??0});}
 if(!tokens.length)return null;
 const values=[...text.matchAll(MONEY)].map(m=>({at:m.index??0,amount:m[1]}));
 if(!values.length)return null;
 const choices=tokens.flatMap(t=>values.map(v=>({kind:t.kind,value:v,dist:Math.abs(t.at-v.at)}))).filter(x=>x.dist<=90).sort((a,b)=>a.dist-b.dist);
 if(!choices.length)return null;
 const chosen=choices[0];
 let amount:bigint;
 try{amount=paise(chosen.value.amount.replaceAll(',',''));if(amount<=0n)return null;}catch{return null;}
 const ref=text.match(/\b(?:UTR|RRN|UPI\s*(?:REF|TXN)?|REF(?:ERENCE)?(?:\s*(?:NO|NUMBER))?|TXN\s*(?:ID|NO)?)\s*(?:[:#-]|\s)\s*([0-9]{8,22})\b/i)?.[1]||null;
 const masked=text.match(/(?:a\/?c|account|acct|card)\s*(?:no\.?|number|ending|xx|x|\*)*\s*[:\-]?\s*([xX*]{1,8}[\s-]*\d{2,4})\b/i)?.[1]?.replaceAll(' ','')||null;
 // Prefer actual counterparty phrases; do not mistake "debited from A/c" for a merchant.
 // End at a reference keyword or punctuation; otherwise the old greedy parser
 // swallowed "UPI Ref ..." into the merchant's name.
 const merchantMatch=text.match(/\b(?:paid to|sent to|transferred to|to|at)\s+([a-z0-9@ &_()+/-]{2,75}?)(?=\s+(?:on|via|upi|ref|utr|rrn|avl|bal|available|txn|a\/c)\b|[.,;]|$)/i)
   ||text.match(/\b(?:received from|credited from)\s+([a-z0-9@ &_()+/-]{2,75}?)(?=\s+(?:on|via|upi|ref|utr|rrn|avl|bal|available|txn|a\/c)\b|[.,;]|$)/i);
 const candidate=merchantMatch?.[1]?.trim()||'';
 const merchant=candidate&&!/^(?:a\/?c|account|acct|card)\b/i.test(candidate)?candidate:null;
 const warnings:string[]=[];
 if(!ref)warnings.push('No unique bank reference detected; review for duplicates.');
 if(!merchant)warnings.push('Counterparty could not be confidently identified.');
 if(tokens.some(x=>x.kind!==chosen.kind))warnings.push('Both debit and credit words found; verify transaction direction.');
 return {direction:chosen.kind,amount:rupees(amount),maskedAccount:masked,reference:ref,merchant,confidence:ref&&warnings.length===0?'high':'review',warnings};
}
export function alertReferenceHash(a:ParsedBankAlert,accountId:string):string|null{
 if(!a.reference)return null;
 // Bank-issued reference + selected account. Never store raw alert text or OTP.
 const raw=`${accountId}|${a.direction}|${a.reference}|${paise(a.amount)}`;
 let h=2166136261;for(let i=0;i<raw.length;i++){h^=raw.charCodeAt(i);h=Math.imul(h,16777619)}
 return `alert-${(h>>>0).toString(16)}-${raw.length}`;
}
export function similarRecordedTransactions(a:ParsedBankAlert,records:Transaction[],accountId:string,dateISO:string,kind?:'expense'|'income'):Transaction[]{
 const aDay=dateISO.slice(0,10);
 return records.filter(t=>t.type===(kind||(a.direction==='debit'?'expense':'income'))&&
  ((kind==='income'||(!kind&&a.direction==='credit'))?t.to_account_id:t.from_account_id)===accountId&&
  paise(t.amount)===paise(a.amount)&&
  Math.abs(day(t.occurred_at).getTime()-day(aDay).getTime())<=2*86400000)
  .slice(0,8);
}
export function buildSmartEvents(data:FinanceData,horizon=30,asOf=new Date()):SmartEvent[]{
 if(![7,30,60,90].includes(horizon))throw new Error('Unsupported forecast horizon');
 const today=day(dstr(asOf));const start=new Date(today);start.setDate(start.getDate()-14);
 const end=new Date(today);end.setDate(end.getDate()+horizon);
 const events:SmartEvent[]=[];
 const tx=data.transactions;
 const dates:Date[]=[];for(let i=0;i<5;i++)dates.push(new Date(today.getFullYear(),today.getMonth()+i,1,12));
 for(const month of dates){const key=dstr(month).slice(0,7);
  for(const loan of data.loans){
   const outstanding=paise(loan.principal)-sumPaise(tx.filter(t=>t.type==='loan_payment'&&t.loan_id===loan.id).map(t=>paise(t.principal_component||0)));
   if(outstanding<=0n)continue;
   const due=new Date(month.getFullYear(),month.getMonth(),Math.min(28,Math.max(1,loan.due_day)),12);
   if(due<start||due>end||dstr(due)<loan.start_date.slice(0,10))continue;
   const alreadyPaid=tx.some(t=>t.loan_id===loan.id&&t.type==='loan_payment'&&t.occurred_at.slice(0,7)===key);
   if(!alreadyPaid)events.push({id:`loan-${loan.id}-${key}`,date:dstr(due),type:'emi',title:`${loan.name} EMI`,amount:Number(loan.emi_amount),direction:'out',estimated:true,note:'Scheduled estimate; verify exact amount and due date with lender.'});
  }
  for(const r of data.recurring_rules){if(!r.active)continue;
   const due=new Date(month.getFullYear(),month.getMonth(),Math.min(28,Math.max(1,r.day_of_month)),12);const date=dstr(due);
   if(due<start||due>end||date<r.starts_on.slice(0,10)||(r.ends_on&&date>r.ends_on.slice(0,10)))continue;
   if(tx.some(t=>t.import_hash===`recurring:${r.id}:${key}`))continue;
   events.push({id:`repeat-${r.id}-${key}`,date,type:'recurring',title:r.name,amount:Number(r.amount),direction:r.type==='income'?'in':'out',estimated:true,note:'Expected recurring entry; may need review before posting.'});
  }
 }
 const balances=accountPositions(data);
 for(const card of data.card_profiles){const balance=balances[card.account_id]||0;if(balance>=0)continue;
  let due=new Date(today.getFullYear(),today.getMonth(),Math.min(28,Math.max(1,card.due_day)),12);
  if(due<today)due=new Date(today.getFullYear(),today.getMonth()+1,Math.min(28,Math.max(1,card.due_day)),12);
  if(due<=end)events.push({id:`card-${card.id}-${dstr(due)}`,date:dstr(due),type:'card',title:`${card.issuer||'Credit card'} — estimated payment`,amount:rupees(-paise(balance)),direction:'out',estimated:true,note:'Entire tracked outstanding shown for planning; actual statement due/minimum due may differ.'});
 }
 for(const contact of data.contacts){const delta=sumPaise(tx.filter(t=>t.contact_id===contact.id).map(t=>t.type==='receivable'||t.type==='repayment_out'?paise(t.amount):t.type==='repayment_in'||t.type==='payable'?-paise(t.amount):0n));if(delta<=0n)continue;
  const dates=tx.filter(t=>t.contact_id===contact.id&&t.type==='receivable'&&t.due_date).map(t=>t.due_date!).sort();
  if(!dates.length)continue;
  const due=day(dates[0]);if(due<=end)events.push({id:`owed-${contact.id}`,date:dates[0].slice(0,10),type:'receivable',title:`Follow up: ${contact.name}`,amount:rupees(delta),direction:'review',estimated:true,note:'Receivable reminder only; not counted as cash until received. Confirm settlements.'});
 }
 return events.sort((a,b)=>a.date.localeCompare(b.date)||a.title.localeCompare(b.title));
}
export function summarizeForecast(data:FinanceData,events:SmartEvent[],asOf=new Date()){
 const balances=accountPositions(data),starting=sumPaise(data.accounts.filter(a=>a.kind!=='credit_card').map(a=>paise(balances[a.id]||0)));
 const today=dstr(asOf);const upcoming=events.filter(e=>e.date>=today&&e.direction!=='review');
 const incoming=sumPaise(upcoming.filter(e=>e.direction==='in').map(e=>paise(e.amount)));
 const outgoing=sumPaise(upcoming.filter(e=>e.direction==='out').map(e=>paise(e.amount)));
 return {cash:rupees(starting),income:rupees(incoming),outgoing:rupees(outgoing),projected:rupees(starting+incoming-outgoing),review:events.filter(e=>e.direction==='review').length};
}
export type SpendingSignal={kind:'budget'|'spike'|'high-card';title:string;detail:string};
export function spendingSignals(data:FinanceData,asOf=new Date()):SpendingSignal[]{
 const month=dstr(asOf).slice(0,7);const signals:SpendingSignal[]=[];
 const sumCategory=(key:string,mm:string)=>sumPaise(data.transactions.filter(t=>t.type==='expense'&&t.category===key&&t.occurred_at.slice(0,7)===mm).map(t=>paise(t.amount)));
 for(const b of data.budgets.filter(x=>x.month===month)){
  const spent=sumCategory(b.category,month),limit=paise(b.amount);
  if(limit>0n&&spent>=limit*9n/10n)signals.push({kind:'budget',title:`${b.category}: ${spent>limit?'Over budget':'Near budget'}`,detail:`Tracked ₹${rupees(spent).toFixed(2)} against ₹${rupees(limit).toFixed(2)} budget.`});
 }
 const prevMonths=Array.from({length:3},(_,i)=>{const dt=new Date(asOf.getFullYear(),asOf.getMonth()-i-1,1,12);return dstr(dt).slice(0,7)});
 const categories=new Set(data.transactions.filter(t=>t.type==='expense'&&t.occurred_at.slice(0,7)===month).map(t=>t.category));
 for(const cat of categories){const current=sumCategory(cat,month),prev=prevMonths.map(m=>sumCategory(cat,m)),prior=sumPaise(prev);
  if(prior>=150000n&&current>prior/2n&&current-prior/3n>50000n){ // current > 150% prior 3-month average
   signals.push({kind:'spike',title:`Unusual ${cat} spending`,detail:'This month is over 50% above your last 3 months average. Review individual expenses.'});
  }
 }
 const balances=accountPositions(data);
 for(const card of data.card_profiles){const outstanding=balances[card.account_id]||0;if(Number(card.credit_limit)>0&&-outstanding/Number(card.credit_limit)>=0.8)signals.push({kind:'high-card',title:`${card.issuer||'Credit card'} near limit`,detail:'Tracked utilization is at least 80%. Reconcile with bank statement.'});}
 return signals;
}
