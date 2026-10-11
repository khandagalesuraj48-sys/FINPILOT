import {FinanceData,Transaction,TxType} from './types';
import {format,subMonths,subDays} from 'date-fns';
const uid='demo-user';
const date=(d:Date)=>d.toISOString();
const now=new Date();
const a=(id:string,name:string,kind:'bank'|'cash'|'wallet',opening_balance:number)=>({id,user_id:uid,name,kind,opening_balance,created_at:date(now)});
const c=(id:string,name:string)=>({id,user_id:uid,name,phone:null,notes:null,created_at:date(now)});
const tx=(id:string,type:TxType,amount:number,desc:string,category:string,daysAgo:number,from:string|null,to:string|null,contact:string|null=null,loan:string|null=null,p=0,interest=0):Transaction=>({id,user_id:uid,type,amount,description:desc,category,occurred_at:date(subDays(now,daysAgo)),from_account_id:from,to_account_id:to,contact_id:contact,loan_id:loan,principal_component:p,interest_component:interest,source:'manual',import_hash:null,due_date:null,created_at:date(now)});
export function seedDemo():FinanceData{const transactions:Transaction[]=[
 tx('d01','income',85000,'Monthly salary','Salary',8,null,'a1'),
 tx('d02','expense',3450,'Groceries at D-Mart','Groceries',1,'a1',null),
 tx('d03','expense',1250,'Dinner at restaurant','Food & Drinks',2,'a1',null),
 tx('d04','expense',2999,'Online shopping','Shopping',3,'a1',null),
 tx('d05','expense',1850,'Fuel refill','Transport',4,'a1',null),
 tx('d06','expense',999,'Internet bill','Bills & Utilities',4,'a1',null),
 tx('d07','receivable',10000,'Personal loan to Rahul','Other',6,'a1',null,'p1'),
 tx('d08','repayment_in',3000,'Rahul paid back part','Other',3,null,'a1','p1'),
 tx('d09','payable',5000,'Borrowed from Sneha','Other',9,null,'a1','p2'),
 tx('d10','transfer',5000,'Cash withdrawal','Transfer',3,'a1','a2'),
 tx('d11','expense',450,'Tea and snacks','Food & Drinks',1,'a2',null),
 tx('d12','loan_payment',12500,'Car loan EMI','Loan Interest',12,'a1',null,null,'l1',10500,2000),
 tx('d13','income',85000,'Last month salary','Salary',35,null,'a1'),
 tx('d14','expense',8000,'Rent payment','Rent',37,'a1',null),
 tx('d15','expense',3100,'Groceries','Groceries',38,'a1',null),
 tx('d16','expense',2150,'Grocery delivery','Groceries',1,'a1',null),
 ];return {accounts:[a('a1','HDFC Savings','bank',50000),a('a2','Cash Wallet','cash',1500)],contacts:[c('p1','Rahul Sharma'),c('p2','Sneha Patil')],loans:[{id:'l1',user_id:uid,name:'Car Loan',lender:'Bank',principal:320000,annual_rate:9.5,emi_amount:12500,due_day:25,start_date:format(subMonths(now,3),'yyyy-MM-dd'),created_at:date(now)}],budgets:[{id:'b1',user_id:uid,category:'Food & Drinks',month:format(now,'yyyy-MM'),amount:6000,created_at:date(now)},{id:'b2',user_id:uid,category:'Groceries',month:format(now,'yyyy-MM'),amount:7000,created_at:date(now)}],recurring_rules:[],transactions,attachments:[]};}
