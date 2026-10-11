/* Finpilot source & finance-engine smoke tests. Run after npm install: npm run test:smoke */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const sources = ['app/layout.tsx','app/page.tsx','components/app-shell.tsx','components/forms.tsx','components/views.tsx','components/ui.tsx','lib/finance.tsx','lib/logic.ts','lib/demo.ts','lib/types.ts'];
for(const file of sources){
 const output=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{fileName:file,reportDiagnostics:true,compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}});
 const errors=(output.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
 assert.equal(errors.length,0,`${file}: ${errors.map(e=>ts.flattenDiagnosticMessageText(e.messageText,' ')).join('; ')}`);
}
const month=(d)=>new Date(d.getFullYear(),d.getMonth(),1,12);
const addMonths=(d,n)=>{const day=d.getDate();const start=new Date(d.getFullYear(),d.getMonth()+n,1,12);const last=new Date(start.getFullYear(),start.getMonth()+1,0).getDate();start.setDate(Math.min(day,last));return start};
const format=(d,p)=>{d=new Date(d);const year=d.getFullYear(),mm=String(d.getMonth()+1).padStart(2,'0'),dd=String(d.getDate()).padStart(2,'0');const mmm=d.toLocaleDateString('en-US',{month:'short'});if(p==='yyyy-MM-dd')return `${year}-${mm}-${dd}`;if(p==='yyyy-MM')return `${year}-${mm}`;if(p==='yyyyMMdd')return `${year}${mm}${dd}`;if(p==='yyyyMMdd\'T\'HHmmss\'Z\'')return `${year}${mm}${dd}T000000Z`;if(p==='dd MMM yyyy')return `${dd} ${mmm} ${year}`;if(p==='MMM')return mmm;return `${year}-${mm}-${dd}`};
const dateFns={format,subMonths:(d,n)=>addMonths(d,-n),subDays:(d,n)=>new Date(d.getTime()-n*86400000),startOfMonth:month,endOfMonth:(d)=>new Date(d.getFullYear(),d.getMonth()+1,0,12),addMonths,isBefore:(a,b)=>a<b,isAfter:(a,b)=>a>b};
function load(source){const transpiled=ts.transpileModule(fs.readFileSync(path.join(root,source),'utf8'),{fileName:source,compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.None,target:ts.ScriptTarget.ES2022}}).outputText;const exports={};const mod={exports};const fakeRequire=(name)=>{if(name==='date-fns')return dateFns;if(name==='./types')return{};throw new Error('Unexpected import '+name)};vm.runInNewContext(`(function(require,exports,module,Blob,URL,document){${transpiled}\n})`,{Blob, URL,console,Intl,Date,Math,Set,Map,RegExp}, {filename:source})(fakeRequire,exports,mod,Blob,URL,{});return mod.exports;}
const demo=load('lib/demo.ts'),finance=load('lib/logic.ts');const data=demo.seedDemo();
assert.equal(Object.values(finance.accountBalances(data)).reduce((s,n)=>s+n,0),182752,'Balance net of all movements');
assert.equal(finance.personBalance(data.transactions,'p1'),7000,'Money to collect Rahul');
assert.equal(finance.personBalance(data.transactions,'p2'),-5000,'Money owed Sneha');
assert.equal(finance.loanBalance(data.loans[0],data.transactions),309500,'Loan principal excludes interest');
const current=finance.thisMonth();
const monthly=data.transactions.filter(t=>t.occurred_at.slice(0,7)===current);
const expectedIncome=monthly.filter(t=>t.type==='income').reduce((sum,t)=>sum+t.amount,0);
const expectedExpenses=monthly.reduce((sum,t)=>sum+(t.type==='expense'?t.amount:t.type==='loan_payment'?t.interest_component:0),0);
assert.equal(finance.totals(data).income,expectedIncome);
assert.equal(finance.totals(data).expenses,expectedExpenses);
assert.equal(finance.totals(data).balance,182752);
assert.equal(finance.guessCategory('REFUND GROCERY SHOP','income'),'Refund');
assert.equal(finance.guessCategory('Netflix plan','expense'),'Entertainment');
assert.equal(finance.parseCSV('Date,Desc,Amount,Type\r\n2026-10-01,"Tea, snacks",120,debit').length,2);
assert.equal(finance.parseCSV('a,b\n"x""y",z')[1][0],'x"y');
const insight=finance.getInsights(data);assert(insight.some(i=>i.title==='Money to collect'));
const sql=fs.readFileSync(path.join(root,'supabase/schema.sql'),'utf8');
for(const table of ['accounts','contacts','loans','budgets','transactions','attachments','recurring_rules']) assert(sql.includes(`alter table public.${table} enable row level security;`),`No RLS: ${table}`);
assert(sql.includes("insert into storage.buckets(id,name,public,file_size_limit"));
assert(sql.includes('check_transaction_ownership()'));
assert(sql.includes('check_recurring_ownership()'));
assert(!fs.readFileSync(path.join(root,'.env.example'),'utf8').includes('service_role'));
console.log(`PASS: ${sources.length} TS/TSX syntax modules; 13 finance, parsing, and schema assertions.`);
