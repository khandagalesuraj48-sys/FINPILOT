'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
let ts;try{ts=require('typescript')}catch{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}
function load(rel,deps={}){
 const file=path.join(__dirname,'..',rel);const code=fs.readFileSync(file,'utf8');
 const tr=ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX},fileName:file,reportDiagnostics:true});
 const errors=(tr.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error);
 assert.equal(errors.length,0,errors.map(x=>ts.flattenDiagnosticMessageText(x.messageText,' ')).join('; '));
 const mod=new Module(file,module);mod.filename=file;mod.paths=module.paths;
 const original=mod.require.bind(mod);mod.require=(id)=>Object.prototype.hasOwnProperty.call(deps,id)?deps[id]:original(id);
 mod._compile(tr.outputText,file);return mod.exports;
}
const core=load('lib/financial-core.ts');
const alert=load('lib/smart-features.ts',{'./financial-core':core});
const csv=load('lib/statement-parser.ts',{'./financial-core':core});
const logic=load('lib/logic.ts',{'./financial-core':core,'date-fns':{}});
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++};const ok=a=>{assert.ok(a);checks++};
let p=alert.parseBankAlert('INR 850.00 debited from A/c XX1234 for UPI to Grocery Store. UPI Ref 123456789012. Avl bal Rs 2000');
ok(p);eq(p.direction,'debit');eq(p.amount,850);eq(p.reference,'123456789012');
eq(alert.parseBankAlert('OTP 812839 for purchase of INR 5000'),null);
eq(alert.parseBankAlert('Your UPI request of INR 1000 is pending'),null);
eq(alert.parseBankAlert('Transaction of INR 100 failed and was declined'),null);
eq(alert.parseBankAlert('Your balance is INR 2000'),null);
const c=alert.parseBankAlert('Rs. 1,234.50 credited to account XX9876. RRN: 123456789999');ok(c);eq(c.direction,'credit');eq(c.amount,1234.5);
eq(alert.alertReferenceHash(p,'bank'),alert.alertReferenceHash(p,'bank'));ok(alert.alertReferenceHash(p,'bank')!==alert.alertReferenceHash(p,'another'));
const cols=csv.detectColumns(['Date','Narration','Debit','Credit','Reference']);eq(cols.debit,2);eq(cols.credit,3);eq(cols.date,0);
const bankDebit=csv.parseStatementRow(['11/10/2026','Fuel','300.50','','ABC123'],cols,'bank');ok(bankDebit);eq(bankDebit.type,'expense');eq(bankDebit.amount,300.5);
const bankCredit=csv.parseStatementRow(['2026-10-11','Salary','','50000','ABC999'],cols,'bank');ok(bankCredit);eq(bankCredit.type,'income');
eq(csv.parseStatementRow(['2026-10-11','Invalid both','100','100',''],cols,'bank'),null);
eq(csv.parseStatementRow(['2026-02-30','Invalid date','100','',''],cols,'bank'),null);
const data={
 accounts:[{id:'bank',kind:'bank',opening_balance:10000},{id:'card',kind:'credit_card',opening_balance:-3000}],
 transactions:[],
 loans:[{id:'loan',name:'Car',lender:'Bank',principal:10000,emi_amount:1000,due_day:15,start_date:'2026-01-01'}],
 recurring_rules:[{id:'rent',name:'Rent',amount:2000,type:'expense',active:true,day_of_month:12,starts_on:'2026-01-01',ends_on:null}],
 card_profiles:[{id:'cc',account_id:'card',issuer:'TestBank',due_day:25}],contacts:[],budgets:[],attachments:[],savings_goals:[]
};
const items=alert.buildSmartEvents(data,30,new Date(2026,9,11,12));ok(items.some(x=>x.type==='emi'));ok(items.some(x=>x.type==='recurring'));ok(items.some(x=>x.type==='card'));
const result=alert.summarizeForecast(data,items,new Date(2026,9,11,12));eq(result.cash,10000);ok(result.outgoing>=6000);eq(result.review,0);
const idem=alert.buildSmartEvents({...data,transactions:[{type:'expense',amount:2000,import_hash:'recurring:rent:2026-10'}]},30,new Date(2026,9,11,12));ok(!idem.some(x=>x.id==='repeat-rent-2026-10'));
const budgetData={...data,transactions:[{type:'expense',category:'Food & Drinks',amount:1000,occurred_at:'2026-10-11'}],budgets:[{month:'2026-10',category:'Food & Drinks',amount:1000}]};ok(alert.spendingSignals(budgetData,new Date(2026,9,11,12)).some(x=>x.kind==='budget'));
eq(logic.csvEscape('=SUM(A1:A2)'),"'=SUM(A1:A2)");
eq(logic.csvEscape('@cmd'),"'@cmd");
eq(logic.csvEscape(123.45),'123.45');
// Static syntax validation for the newly added UI and integration files.
for(const file of ['components/smart-hub.tsx','components/app-shell.tsx','components/views.tsx','lib/logic.ts']){
 const src=fs.readFileSync(path.join(__dirname,'..',file),'utf8');const tr=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.Preserve},fileName:file,reportDiagnostics:true});
 eq(tr.diagnostics.filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);
}
console.log(`FINPILOT Smart Hub: ${checks} assertions PASS`);
