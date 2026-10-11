/** Deterministic personal-finance calculations. No network, AI or float addition. */
import type {FinanceData,Transaction,Loan} from './types';
export type Posting={ledger:string;debit:bigint;credit:bigint};
export function paise(input:string|number):bigint {
 const text=String(input).trim();
 if(!/^-?\d+(\.\d{1,2})?$/.test(text))throw new Error(`Invalid money amount: ${text}`);
 const negative=text.startsWith('-');
 const [major,fraction='']=text.replace('-','').split('.');
 const v=BigInt(major)*100n+BigInt(fraction.padEnd(2,'0'));
 return negative?-v:v;
}
export function rupees(value:bigint):number {
 if(value>BigInt(Number.MAX_SAFE_INTEGER)||value< -BigInt(Number.MAX_SAFE_INTEGER))throw new Error('Money exceeds safe display range');
 return Number(value)/100;
}
export function sumPaise(values:Iterable<bigint>):bigint {let total=0n;for(const x of values)total+=x;return total;}
function posting(ledger:string,debit=0n,credit=0n):Posting{
 if((debit>0n)===(credit>0n))throw new Error('Journal line must contain exactly one side');
 return {ledger,debit,credit};
}
export function createJournal(tx:Pick<Transaction,'type'|'amount'|'category'|'from_account_id'|'to_account_id'|'contact_id'|'loan_id'|'principal_component'|'interest_component'>):Posting[]{
 const amount=paise(tx.amount), principal=paise(tx.principal_component||0), interest=paise(tx.interest_component||0);
 if(amount<=0n)throw new Error('Transaction amount must be positive');
 const from=tx.from_account_id?`asset:${tx.from_account_id}`:null;
 const to=tx.to_account_id?`asset:${tx.to_account_id}`:null;
 const party=tx.contact_id?`counterparty:${tx.contact_id}`:null;
 const loan=tx.loan_id?`liability:loan:${tx.loan_id}`:null;
 const need=(x:string|null,label:string)=>{if(!x)throw new Error(`Missing ${label}`);return x;};
 let lines:Posting[]=[];
 switch(tx.type){
  case 'expense':lines=[posting(`expense:${tx.category||'Other'}`,amount),posting(need(from,'source account'),0n,amount)];break;
  case 'income':lines=[posting(need(to,'destination account'),amount),posting(`income:${tx.category||'Other'}`,0n,amount)];break;
  case 'transfer':{
   const a=need(to,'destination account'),b=need(from,'source account');if(a===b)throw new Error('Cannot transfer to same account');lines=[posting(a,amount),posting(b,0n,amount)];break;
  }
  case 'receivable':lines=[posting(`receivable:${need(party,'counterparty')}`,amount),posting(need(from,'source account'),0n,amount)];break;
  case 'repayment_in':lines=[posting(need(to,'destination account'),amount),posting(`receivable:${need(party,'counterparty')}`,0n,amount)];break;
  case 'payable':lines=[posting(need(to,'destination account'),amount),posting(`payable:${need(party,'counterparty')}`,0n,amount)];break;
  case 'repayment_out':lines=[posting(`payable:${need(party,'counterparty')}`,amount),posting(need(from,'source account'),0n,amount)];break;
  case 'loan_payment':{
   if(principal<0n||interest<0n||principal+interest!==amount)throw new Error('EMI split does not reconcile');
   if(principal>0n)lines.push(posting(need(loan,'loan'),principal));
   if(interest>0n)lines.push(posting('expense:Loan Interest',interest));
   lines.push(posting(need(from,'source account'),0n,amount));break;
  }
 }
 const d=sumPaise(lines.map(l=>l.debit)),c=sumPaise(lines.map(l=>l.credit));
 if(d!==c||d===0n||lines.length<2)throw new Error('Unbalanced journal');
 return lines;
}
export function reverseJournal(lines:Posting[]):Posting[]{return lines.map(l=>({ledger:l.ledger,debit:l.credit,credit:l.debit}));}
export function accountPositions(data:Pick<FinanceData,'accounts'|'transactions'>):Record<string,number>{
 const balances:Record<string,bigint>={};
 for(const a of data.accounts)balances[a.id]=paise(a.opening_balance);
 for(const t of data.transactions){const amount=paise(t.amount);
  if(t.from_account_id&&Object.prototype.hasOwnProperty.call(balances,t.from_account_id))balances[t.from_account_id]-=amount;
  if(t.to_account_id&&Object.prototype.hasOwnProperty.call(balances,t.to_account_id))balances[t.to_account_id]+=amount;
 }
 return Object.fromEntries(Object.entries(balances).map(([id,p])=>[id,rupees(p)]));
}
export interface AmortizedPayment{installment:number;principal:number;interest:number;emi:number;extraPaid:number;remaining:number}
/** Planning only: monthly reducing balance, nominal APR/12, payment at period end. Actual lender schedules may differ. */
export function amortize(principalInput:number,annualRate:number,emiInput:number,extraInitial=0,extraMonthly=0,maxMonths=600):AmortizedPayment[]{
 let principal=paise(principalInput), emi=paise(emiInput);
 if(principal<=0n||emi<=0n||annualRate<0||annualRate>200||!Number.isFinite(annualRate))throw new Error('Invalid loan terms');
 const rateUnits=BigInt(Math.round(annualRate*10000));
 const divisor=1200n*10000n;
 const result:AmortizedPayment[]=[];
 for(let month=1;month<=maxMonths&&principal>0n;month++){
  const interest=(principal*rateUnits+divisor/2n)/divisor;
  if(emi<=interest)throw new Error('EMI is too low to cover monthly interest');
  const principalPaid=emi-interest>principal?principal:emi-interest;
  const paid=interest+principalPaid;
  principal-=principalPaid;
  const extra=Math.min(rupees(principal),Math.max(0,(month===1?extraInitial:0)+extraMonthly));
  const extraP=paise(extra);principal-=extraP;
  result.push({installment:month,principal:rupees(principalPaid),interest:rupees(interest),emi:rupees(paid),extraPaid:extra,remaining:rupees(principal)});
 }
 if(principal>0n)throw new Error('Loan does not amortize within configured horizon');
 return result;
}
export function comparePrepayment(loan:Loan,extra:number){
 const original=amortize(Number(loan.principal),Number(loan.annual_rate),Number(loan.emi_amount));
 const alternative=amortize(Number(loan.principal),Number(loan.annual_rate),Number(loan.emi_amount),extra);
 const interest=(items:AmortizedPayment[])=>rupees(sumPaise(items.map(p=>paise(p.interest))));
 return {originalMonths:original.length,newMonths:alternative.length,originalInterest:interest(original),newInterest:interest(alternative),interestSaved:rupees(paise(interest(original))-paise(interest(alternative)))};
}
export function cardPosition(balance:number,limit:number){
 const utilized=Math.max(0,-balance);
 return {utilized,available:Math.max(0,limit-utilized),utilizationPct:limit>0?Math.round(utilized/limit*100):0,overLimit:Math.max(0,utilized-limit)};
}
export function goalRequiredPerMonth(saved:number,target:number,targetDate:string,asOf=new Date()){
 const [y,m]=targetDate.slice(0,7).split('-').map(Number);
 if(!y||!m||m>12)return 0;
 const months=Math.max(1,(y-asOf.getFullYear())*12+(m-1-asOf.getMonth())+1);
 const left=paise(target)-paise(saved);
 return rupees(left<=0n?0n:(left+BigInt(months)-1n)/BigInt(months));
}
