'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const Module=require('node:module');
const path=require('node:path');
let ts;
try{ts=require('typescript')}catch{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}
const source=fs.readFileSync(path.join(__dirname,'../lib/financial-core.ts'),'utf8');
const tr=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},reportDiagnostics:true,fileName:'financial-core.ts'});
const failures=(tr.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
assert.equal(failures.length,0,failures.map(x=>ts.flattenDiagnosticMessageText(x.messageText,' ')).join('; '));
const m=new Module('financial-core',module);m.filename=path.join(__dirname,'../lib/financial-core.ts');m.paths=module.paths;m._compile(tr.outputText,m.filename);
const e=m.exports;
function tx(type,fields={}){return {type,amount:100,category:'Groceries',from_account_id:'bank1',to_account_id:null,contact_id:null,loan_id:null,principal_component:0,interest_component:0,...fields}}
const sample=[
 tx('expense'),
 tx('income',{to_account_id:'bank1',from_account_id:null}),
 tx('transfer',{to_account_id:'card',from_account_id:'bank1'}),
 tx('receivable',{contact_id:'p1'}),
 tx('repayment_in',{from_account_id:null,to_account_id:'bank1',contact_id:'p1'}),
 tx('payable',{from_account_id:null,to_account_id:'bank1',contact_id:'p1'}),
 tx('repayment_out',{contact_id:'p1'}),
 tx('loan_payment',{loan_id:'loan',principal_component:80,interest_component:20})
];
let assertions=0;
for(const t of sample){const lines=e.createJournal(t);assert.equal(e.sumPaise(lines.map(l=>l.debit)),e.sumPaise(lines.map(l=>l.credit)));assert.equal(e.sumPaise(e.reverseJournal(lines).map(l=>l.debit)),e.sumPaise(lines.map(l=>l.credit)));assertions+=2;}
assert.equal(e.paise('0.10')+e.paise('0.20'),30n);assertions++;
assert.equal(e.rupees(e.paise('1234567.89')),1234567.89);assertions++;
assert.throws(()=>e.paise('100.999'));assertions++;
assert.throws(()=>e.createJournal(tx('loan_payment',{loan_id:'x',principal_component:99,interest_component:3})));assertions++;
assert.equal(e.accountPositions({accounts:[{id:'bank1',opening_balance:0},{id:'card',opening_balance:-2000}],transactions:[tx('expense',{amount:250,from_account_id:'card'}),tx('transfer',{amount:500,to_account_id:'card',from_account_id:'bank1'})]}).card,-1750);assertions++;
const cc=e.cardPosition(-12500,20000);assert.equal(cc.utilized,12500);assert.equal(cc.available,7500);assertions+=2;
const free=e.amortize(1200,0,100);assert.equal(free.length,12);assert.equal(free.at(-1).remaining,0);assertions+=2;
const pre=e.amortize(1200,12,110,100);assert(pre.length<e.amortize(1200,12,110).length);assertions++;
assert.throws(()=>e.amortize(100000,20,100));assertions++;
assert.equal(e.goalRequiredPerMonth(100,200,'2026-12-31',new Date('2026-10-11T12:00:00')),33.34);assertions++;
console.log(`FINPILOT V2 financial core: ${assertions} assertions PASS`);
