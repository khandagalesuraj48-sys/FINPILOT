import {Account, FinanceData, Loan, Transaction, TxType} from './types';
import {accountPositions,paise,rupees,sumPaise} from './financial-core';
import {format, startOfMonth, endOfMonth, addMonths, isAfter, isBefore} from 'date-fns';
export const money=(n:number,compact=false)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:compact?0:2,minimumFractionDigits:0}).format(Number.isFinite(n)?n:0);
export const shortDate=(d:string)=> {try{return format(new Date(d),'dd MMM yyyy')}catch{return d}};
export const thisMonth=()=>format(new Date(),'yyyy-MM');
export function accountBalances(data:FinanceData):Record<string,number>{return accountPositions(data);}
export function totals(data:FinanceData,month=thisMonth()){
 const tx=data.transactions.filter(t=>t.occurred_at.slice(0,7)===month);
 const income=rupees(sumPaise(tx.filter(t=>t.type==='income').map(t=>paise(t.amount))));
 const expenses=rupees(sumPaise(tx.map(t=>t.type==='expense'?paise(t.amount):t.type==='loan_payment'?paise(t.interest_component):0n)));
 const outflow=rupees(sumPaise(tx.map(t=>['expense','receivable','repayment_out','loan_payment'].includes(t.type)?paise(t.amount):0n)));
 const balances=accountBalances(data);const balance=rupees(sumPaise(Object.values(balances).map(paise)));
 const cashBalance=rupees(sumPaise(data.accounts.filter(a=>a.kind!=='credit_card').map(a=>paise(balances[a.id]||0))));
 return {income,expenses,outflow,balance,cashBalance,balances,tx};
}
export function personBalance(tx:Transaction[],contactId:string){
 return rupees(sumPaise(tx.filter(t=>t.contact_id===contactId).map(t=>t.type==='receivable'||t.type==='repayment_out'?paise(t.amount):t.type==='repayment_in'||t.type==='payable'?-paise(t.amount):0n)));
}
export function loanBalance(loan:Loan,tx:Transaction[]){return rupees((v=>v>0n?v:0n)(paise(loan.principal)-sumPaise(tx.filter(t=>t.loan_id===loan.id&&t.type==='loan_payment').map(t=>paise(t.principal_component||0)))));}
export function nextLoanDue(loan:Loan,tx:Transaction[],now=new Date()){
 const dueDay=Math.max(1,Math.min(28,Number(loan.due_day)));
 const start=new Date(`${loan.start_date.slice(0,10)}T12:00:00`);
 let d=new Date(now.getFullYear(),now.getMonth(),dueDay,12);
 if(isBefore(d,start)) d=new Date(start.getFullYear(),start.getMonth(),dueDay,12);
 const paidForMonth=tx.some(t=>t.loan_id===loan.id&&t.type==='loan_payment'&&t.occurred_at.slice(0,7)===format(d,'yyyy-MM'));
 if(paidForMonth) d=addMonths(d,1);
 return d;
}
export function expenseBreakdown(data:FinanceData,month=thisMonth()){
 const group:Record<string,bigint>={};
 data.transactions.filter(t=>t.type==='expense'&&t.occurred_at.slice(0,7)===month).forEach(t=>group[t.category||'Other']=(group[t.category||'Other']||0n)+paise(t.amount));
 const interest=sumPaise(data.transactions.filter(t=>t.type==='loan_payment'&&t.occurred_at.slice(0,7)===month).map(t=>paise(t.interest_component)));
 if(interest>0n)group['Loan Interest']=(group['Loan Interest']||0n)+interest;
 return Object.entries(group).map(([name,value])=>({name,value:rupees(value)})).sort((a,b)=>b.value-a.value);
}
export function monthlyChart(data:FinanceData){return Array.from({length:6},(_,i)=>{
 const month=format(addMonths(startOfMonth(new Date()),i-5),'yyyy-MM');const m=totals(data,month);
 return {name:format(new Date(`${month}-01T12:00:00`),'MMM'),income:m.income,expenses:m.expenses};
});}
export function getInsights(data:FinanceData){
 const now=new Date(), t=totals(data), insights:{kind:'warning'|'info'|'success';title:string;body:string}[]=[];
 const pending=data.loans.filter(l=>loanBalance(l,data.transactions)>0).map(l=>({l,due:nextLoanDue(l,data.transactions)}));
 const soon=pending.filter(x=>(x.due.getTime()-now.getTime())/(86400000)<=7);
 const needed=soon.reduce((s,x)=>s+Number(x.l.emi_amount),0);
 if(needed>0&&t.cashBalance<needed)insights.push({kind:'warning',title:'Upcoming EMI shortfall',body:`${money(needed)} is due soon, but the tracked balance is ${money(t.cashBalance)}. Verify bank balances before payment.`});
 else if(soon.length)insights.push({kind:'info',title:'Upcoming EMIs',body:`${soon.length} upcoming payment(s) totalling ${money(needed)}. Ensure sufficient cleared funds.`});
 // Due dates on personal receivables are prompts to review the ledger, never proof of non-payment.
 for(const contact of data.contacts){const net=personBalance(data.transactions,contact.id);
  if(net<=0)continue;
  const due=data.transactions.filter(t=>t.contact_id===contact.id&&t.type==='receivable'&&t.due_date).map(t=>t.due_date!).sort()[0];
  if(due && due <= format(now,'yyyy-MM-dd')) insights.push({kind:'warning',title:`Follow up with ${contact.name}`,body:`${money(net)} is still recorded as receivable. Its recorded reminder date was ${due}. Verify partial settlements before contacting.`});
 }
 const month=format(now,'yyyy-MM'),today=format(now,'yyyy-MM-dd');
 const recurringDue=data.recurring_rules.filter(r=>r.active && `${month}-${String(r.day_of_month).padStart(2,'0')}`<=today && `${month}-${String(r.day_of_month).padStart(2,'0')}`>=r.starts_on && (!r.ends_on || `${month}-${String(r.day_of_month).padStart(2,'0')}`<=r.ends_on) && !data.transactions.some(t=>t.import_hash===`recurring:${r.id}:${month}`));
 if(recurringDue.length) insights.push({kind:'info',title:'Recurring records to review',body:`${recurringDue.length} scheduled transaction(s) are ready for your approval. Open Recurring bills to record them.`});
 // A forecast of scheduled outflows; account balance remains only a tracked estimate.
 const upcomingRules=data.recurring_rules.filter(r=>r.active && r.type==='expense' && `${month}-${String(r.day_of_month).padStart(2,'0')}`>=today && !data.transactions.some(t=>t.import_hash===`recurring:${r.id}:${month}`));
 const futureOutflows=upcomingRules.reduce((s,r)=>s+Number(r.amount),0);
 if(futureOutflows>0&&t.cashBalance<futureOutflows+needed)insights.push({kind:'warning',title:'Potential cash shortfall',body:`Upcoming scheduled expenses and near-term EMIs total ${money(futureOutflows+needed)} versus a tracked cash balance of ${money(t.cashBalance)}. Verify cleared funds.`});
 const cats=expenseBreakdown(data);
 if(cats[0]&&t.expenses>0&&cats[0].value/t.expenses>=.4)insights.push({kind:'info',title:`${cats[0].name} is your biggest category`,body:`${money(cats[0].value)} represents ${Math.round(cats[0].value/t.expenses*100)}% of this month's expenses.`});
 const owed=data.contacts.map(c=>personBalance(data.transactions,c.id)).filter(x=>x>0).reduce((a,b)=>a+b,0);
 if(owed>0)insights.push({kind:'info',title:'Money to collect',body:`You have ${money(owed)} tracked as receivable. Review your people ledger for follow-ups.`});
 if(!insights.length) insights.push({kind:'success',title:'You are all set',body:'Add a few transactions or an EMI to unlock insights specific to your cash flow.'});
 return insights;
}
export function guessCategory(description:string,type:TxType){if(type==='income')return /refund|cashback|reversal/i.test(description)?'Refund':'Other';const x=description.toLowerCase();
 const map:[RegExp,string][]=[[/swiggy|zomato|cafe|restaurant|tea|coffee|food/,'Food & Drinks'],[/amazon|flipkart|myntra|shopping/,'Shopping'],[/uber|ola|petrol|diesel|fuel|metro|auto/,'Transport'],[/electric|recharge|mobile|internet|jio|airtel|bill/,'Bills & Utilities'],[/hospital|medicine|pharmacy|doctor/,'Healthcare'],[/school|college|tuition|fees/,'Education'],[/netflix|movie|spotify|prime/,'Entertainment'],[/grocery|mart|dmart|vegetable/,'Groceries'],[/rent|house/,'Rent']];return map.find(([re])=>re.test(x))?.[1]||'Other';}
/** Escape spreadsheet formulas when opening exported CSV in Excel or Sheets. */
export function csvEscape(v:unknown){
 const input=String(v??'');
 const safe=(typeof v==='string' && /^[\s]*[=+@-]/.test(input))?"'"+input:input;
 return /[",\n\r]/.test(safe)?'"'+safe.replaceAll('"','""')+'"':safe;
}
export function downloadCSV(file:string,rows:(string|number|null|undefined)[][]){const csv=rows.map(r=>r.map(csvEscape).join(',')).join('\r\n');const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=file;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function parseCSV(s:string){let rows:string[][]=[],row:string[]=[],col='',quoted=false;for(let i=0;i<s.length;i++){const ch=s[i];if(ch==='"'&&quoted&&s[i+1]==='"'){col+='"';i++;}else if(ch==='"')quoted=!quoted;else if(ch===','&&!quoted){row.push(col);col='';}else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&s[i+1]==='\n')i++;row.push(col);if(row.some(x=>x.trim()))rows.push(row);row=[];col='';}else col+=ch;}row.push(col);if(row.some(x=>x.trim()))rows.push(row);return rows;}


/** Export twelve calendar reminders for the user's own calendar app; no push server needed. */
export function downloadEmiCalendar(loan:Loan, firstDue:Date){
 const escape=(s:string)=>s.replaceAll('\\','\\\\').replaceAll(';','\\;').replaceAll(',','\\,').replaceAll('\n','\\n');
 const date=(d:Date)=>format(d,'yyyyMMdd');
 const stamp=format(new Date(),'yyyyMMdd')+'T000000Z';
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//FINPILOT AI//EMI Reminder//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH'];
 for(let i=0;i<12;i++){
  const due=addMonths(firstDue,i);const next=new Date(due.getFullYear(),due.getMonth(),due.getDate()+1);
  lines.push('BEGIN:VEVENT',`UID:finpilot-${loan.id}-${date(due)}@local`,`DTSTAMP:${stamp}`,`DTSTART;VALUE=DATE:${date(due)}`,`DTEND;VALUE=DATE:${date(next)}`,`SUMMARY:${escape(loan.name)} - EMI ${money(Number(loan.emi_amount))}`,`DESCRIPTION:Verify EMI due date and exact amount with ${escape(loan.lender||'lender')}. No payment is initiated.`,
  'BEGIN:VALARM','TRIGGER:-P3D','ACTION:DISPLAY','DESCRIPTION:EMI coming up in 3 days','END:VALARM',
  'BEGIN:VALARM','TRIGGER:-P1D','ACTION:DISPLAY','DESCRIPTION:EMI due tomorrow','END:VALARM','END:VEVENT');
 }
 lines.push('END:VCALENDAR');
 const blob=new Blob([lines.join('\r\n')+'\r\n'],{type:'text/calendar;charset=utf-8'});
 const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`finpilot-emi-${loan.name.toLowerCase().replace(/[^a-z0-9-]/g,'-')}.ics`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
