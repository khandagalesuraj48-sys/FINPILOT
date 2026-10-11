export type AccountKind = 'bank'|'cash'|'wallet'|'credit_card';
export type TxType = 'expense'|'income'|'transfer'|'receivable'|'payable'|'repayment_in'|'repayment_out'|'loan_payment';
export interface Account {id:string;user_id:string;name:string;kind:AccountKind;opening_balance:number;created_at:string}
export interface Contact {id:string;user_id:string;name:string;phone:string|null;notes:string|null;created_at:string}
export interface Loan {id:string;user_id:string;name:string;lender:string;principal:number;annual_rate:number;emi_amount:number;due_day:number;start_date:string;created_at:string}
export interface Budget {id:string;user_id:string;category:string;month:string;amount:number;created_at:string}
export interface RecurringRule {id:string;user_id:string;name:string;type:'expense'|'income';amount:number;category:string;account_id:string;day_of_month:number;starts_on:string;ends_on:string|null;active:boolean;created_at:string}
export interface Transaction {id:string;user_id:string;type:TxType;amount:number;description:string;category:string;occurred_at:string;from_account_id:string|null;to_account_id:string|null;contact_id:string|null;loan_id:string|null;principal_component:number;interest_component:number;source:string;import_hash:string|null;due_date:string|null;created_at:string}
export interface Attachment {id:string;user_id:string;transaction_id:string;storage_path:string;file_name:string;mime_type:string;file_size:number;created_at:string;demo_data?:string}
export interface CardProfile {id:string;user_id:string;account_id:string;issuer:string;last_four:string;credit_limit:number;statement_day:number;due_day:number;annual_rate:number;created_at:string}
export interface SavingsGoal {id:string;user_id:string;name:string;target_amount:number;saved_amount:number;target_date:string|null;color:string;created_at:string}
export interface FinanceData {accounts:Account[];contacts:Contact[];loans:Loan[];budgets:Budget[];recurring_rules:RecurringRule[];transactions:Transaction[];attachments:Attachment[];card_profiles:CardProfile[];savings_goals:SavingsGoal[]}
export type TxDraft=Omit<Transaction,'id'|'user_id'|'created_at'|'import_hash'|'source'|'due_date'> & {import_hash?:string|null;source?:string;due_date?:string|null};
export type EntityDraft<T> = Omit<T,'id'|'user_id'|'created_at'>;
export const EXPENSE_CATEGORIES=['Food & Drinks','Shopping','Transport','Bills & Utilities','Rent','Healthcare','Education','Entertainment','Travel','Groceries','Insurance','Subscriptions','Fees & Charges','Other'];
export const INCOME_CATEGORIES=['Salary','Business','Freelance','Investments','Gift','Refund','Other'];
export const TX_LABELS:Record<TxType,string>={expense:'Expense',income:'Income',transfer:'Transfer',receivable:'Money lent',payable:'Money borrowed',repayment_in:'Received back',repayment_out:'Repaid',loan_payment:'EMI payment'};
