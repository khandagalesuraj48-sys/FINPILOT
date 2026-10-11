/** Bank CSV mapping helpers. No file upload occurs until the user explicitly imports. */
import type {TxDraft} from './types';
import {paise,rupees} from './financial-core';
export interface ColumnMap{date:number;description:number;amount:number;type:number;debit:number;credit:number;reference:number}
export function detectColumns(headers:string[]):ColumnMap{
 const at=(re:RegExp)=>headers.findIndex(h=>re.test(h.trim().toLowerCase().replace(/[\s_]+/g,' ')));
 return {date:at(/^(transaction date|date|value date|txn date|posted date)$/),description:at(/^(narration|particulars|description|remarks|merchant|details)$/),amount:at(/^(amount|transaction amount|txn amount)$/),type:at(/^(type|transaction type|dr\/cr|debit\/credit|direction)$/),debit:at(/^(debit|withdrawal|debit amount|withdrawal amount|dr amount)$/),credit:at(/^(credit|deposit|credit amount|deposit amount|cr amount)$/),reference:at(/^(reference|utr|rrn|transaction id|txn id|ref no)$/)};
}
export function parseBankDate(value:string):string|null{
 const val=value.trim(),ymd=val.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/),dmy=val.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
 const [y,m,d]=ymd?[+ymd[1],+ymd[2],+ymd[3]]:dmy?[+dmy[3],+dmy[2],+dmy[1]]:[];
 if(!y||!m||!d)return null;
 const dt=new Date(y,m-1,d,12);
 if(dt.getFullYear()!==y||dt.getMonth()!==m-1||dt.getDate()!==d)return null;
 return dt.toISOString();
}
const cell=(r:string[],i:number)=>i<0?'':(r[i]||'').trim();
function value(s:string):bigint|null{
 const clean=s.trim().replace(/[₹,\s]/g,'').replace(/^(?:INR|Rs\.?)\s*/i,'').replace(/^\((.*)\)$/,'-$1');
 if(!clean||clean==='-'||clean==='0'||clean==='0.00')return null;
 try{const v=paise(clean);return v<0n?-v:v}catch{return null}
}
function rawHash(s:string){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return `csv-${(h>>>0).toString(16)}-${s.length}`;}
/** Strict: ambiguous or malformed rows are refused, not silently guessed. */
export function parseStatementRow(row:string[],map:ColumnMap,accountId:string):TxDraft|null{
 const date=parseBankDate(cell(row,map.date));if(!date||!accountId)return null;
 const debit=value(cell(row,map.debit)),credit=value(cell(row,map.credit)),hasSeparate=map.debit>=0&&map.credit>=0;
 let amount:bigint|null=null,kind:'expense'|'income'|null=null;
 if(hasSeparate){if(debit&&credit)return null;if(debit){amount=debit;kind='expense'}if(credit){amount=credit;kind='income'}}
 else{amount=value(cell(row,map.amount));const type=cell(row,map.type).toLowerCase();
  if(['debit','dr','expense','paid','out','withdrawal'].includes(type))kind='expense';
  else if(['credit','cr','income','received','in','deposit'].includes(type))kind='income';
  else return null;
 }
 if(!amount||!kind)return null;
 const description=cell(row,map.description).slice(0,250)||'Imported bank transaction';
 const ref=cell(row,map.reference).replace(/[^a-zA-Z0-9-]/g,'').slice(0,64);
 const rawKey=[accountId,date.slice(0,10),kind,amount.toString(),ref||description.toLowerCase()].join('|');
 return {type:kind,amount:rupees(amount),description,category:'Other',occurred_at:date,from_account_id:kind==='expense'?accountId:null,to_account_id:kind==='income'?accountId:null,contact_id:null,loan_id:null,principal_component:0,interest_component:0,source:'csv',import_hash:rawHash(rawKey)};
}
