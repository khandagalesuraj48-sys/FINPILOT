'use client';
import React,{createContext,useCallback,useContext,useEffect,useMemo,useRef,useState} from 'react';
import {createClient,SupabaseClient,User} from '@supabase/supabase-js';
import {Account,Attachment,Budget,CardProfile,Contact,EntityDraft,FinanceData,Loan,RecurringRule,SavingsGoal,Transaction,TxDraft} from './types';
import {seedDemo} from './demo';
import {accountPositions,paise} from './financial-core';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL||'';
const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||'';
export const isConfigured=Boolean(url && key && url.startsWith('https://') && !url.includes('YOUR_PROJECT') && !key.includes('YOUR_'));
let cached:SupabaseClient|null=null;
function db(){if(!isConfigured)throw new Error('Configure Supabase environment variables first.');if(!cached)cached=createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});return cached;}
const TABLES=['accounts','contacts','loans','budgets','transactions','attachments','recurring_rules','card_profiles','savings_goals'] as const;
/** Avoid Supabase's server max-row truncation silently corrupting financial totals. */
async function fetchFinanceRows(uid:string):Promise<FinanceData>{
 const client=db();const groups=await Promise.all(TABLES.map(async table=>{
  const records:Record<string,unknown>[]=[];const pageSize=500;
  for(let start=0;start<20000;start+=pageSize){
   const {data,error}=await client.from(table).select('*').eq('user_id',uid).order('created_at',{ascending:false}).range(start,start+pageSize-1);
   if(error)throw error;
   records.push(...(data||[]));
   if(!data||data.length<pageSize)return records;
  }
  throw new Error(`Your ${table} contains more than 20,000 records. Please contact support to enable the large-account query service. Financial totals were not displayed from incomplete data.`);
 }));
 const result={accounts:groups[0] as unknown as Account[],contacts:groups[1] as unknown as Contact[],loans:groups[2] as unknown as Loan[],budgets:groups[3] as unknown as Budget[],transactions:groups[4] as unknown as Transaction[],attachments:groups[5] as unknown as Attachment[],recurring_rules:groups[6] as unknown as RecurringRule[],card_profiles:groups[7] as unknown as CardProfile[],savings_goals:groups[8] as unknown as SavingsGoal[]};
 // Server-side NUMERIC balance must match the local integer-paise calculation.
 const {data:verified,error:balanceError}=await client.rpc('my_account_balances');
 if(balanceError)throw new Error(`Finance reconciliation unavailable: ${balanceError.message}. Run the V2 SQL migration before using live mode.`);
 const local=accountPositions(result);
 for(const item of (verified||[]) as {account_id:string;balance:number|string}[]){
  if(!(item.account_id in local)||paise(local[item.account_id])!==paise(item.balance)){
   throw new Error('Local and database account balances disagree. Financial totals have not been accepted. Contact support.');
  }
 }
 if((verified||[]).length!==result.accounts.length)throw new Error('Server account reconciliation is incomplete. Financial totals were not accepted.');
 return result;
}
const empty:FinanceData={accounts:[],contacts:[],loans:[],budgets:[],recurring_rules:[],transactions:[],attachments:[],card_profiles:[],savings_goals:[]};
type Model = 'accounts'|'contacts'|'loans'|'budgets'|'recurring_rules'|'transactions'|'card_profiles'|'savings_goals';
interface FinanceContextValue {data:FinanceData; user:User|null;demo:boolean;configured:boolean;loading:boolean;busy:boolean;error:string|null;passwordRecovery:boolean;
 login:(email:string,password:string)=>Promise<void>;signup:(email:string,password:string)=>Promise<string>;resetPassword:(email:string)=>Promise<void>;resendConfirmation:(email:string)=>Promise<void>;setNewPassword:(password:string)=>Promise<void>;logout:()=>Promise<void>;startDemo:()=>void;stopDemo:()=>void;reload:()=>Promise<void>;
 create:<T extends Account|Contact|Loan|Budget|RecurringRule|CardProfile|SavingsGoal>(table:Exclude<Model,'transactions'>,draft:EntityDraft<T>)=>Promise<void>;
 update:<T extends Account|Contact|Loan|Budget|RecurringRule|CardProfile|SavingsGoal>(table:Exclude<Model,'transactions'>,id:string,draft:Partial<EntityDraft<T>>)=>Promise<void>;
 remove:(table:Model,id:string)=>Promise<void>;
 addTransaction:(draft:TxDraft,files?:File[])=>Promise<Transaction>;
 updateTransaction:(id:string,draft:TxDraft,files?:File[])=>Promise<void>;
 addAttachment:(txId:string,file:File)=>Promise<void>;
 removeAttachment:(attachment:Attachment)=>Promise<void>;
 attachmentUrl:(attachment:Attachment)=>Promise<string>;
 importTransactions:(drafts:TxDraft[])=>Promise<{added:number;duplicates:number;failed:number}>;
 deleteAccount:()=>Promise<void>;
}
const C=createContext<FinanceContextValue|null>(null);
export function useFinance(){const ctx=useContext(C);if(!ctx)throw new Error('FinanceProvider missing');return ctx;}
const demoKey='finpilot-demo-v1';
const guid=()=>typeof crypto!=='undefined'&&'randomUUID'in crypto?crypto.randomUUID():`demo-${Math.random().toString(36).slice(2)}-${Date.now()}`;
const permitted=['image/jpeg','image/png','image/webp','application/pdf'];
function checkFile(file:File,demo:boolean){if(!permitted.includes(file.type))throw new Error('Only JPG, PNG, WEBP or PDF files are supported.');if(file.size>10*1024*1024)throw new Error('Maximum attachment size is 10 MB.');if(demo&&file.size>1*1024*1024)throw new Error('Demo receipts must be under 1 MB. Live accounts support 10 MB.');}
function readFile(file:File):Promise<string>{return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('Could not read attachment'));reader.readAsDataURL(file);});}
function safeDemoLoad(){try{const value=localStorage.getItem(demoKey);return value?{...seedDemo(),...JSON.parse(value) as FinanceData}:seedDemo();}catch{return seedDemo();}}
export function FinanceProvider({children}:{children:React.ReactNode}){
 const [data,setData]=useState<FinanceData>(empty);const [user,setUser]=useState<User|null>(null);const [demo,setDemo]=useState(!isConfigured);const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const [error,setError]=useState<string|null>(null);const [passwordRecovery,setPasswordRecovery]=useState(false);
 const demoRef=useRef(demo);demoRef.current=demo;const userRef=useRef(user);userRef.current=user;
 const applyDemo=useCallback((fn:(prev:FinanceData)=>FinanceData)=>{setData(prev=>{const next=fn(prev);try{localStorage.setItem(demoKey,JSON.stringify(next));}catch{/* browser storage quota for demo files */}return next;});},[]);
 const reload=useCallback(async()=>{
  if(demoRef.current){setData(safeDemoLoad());return;}
  const u=userRef.current;if(!u){setData(empty);return;}
  setError(null);
  const next=await fetchFinanceRows(u.id);setData(next);
 },[]);
 useEffect(()=>{
  let active=true;
  if(!isConfigured){setData(safeDemoLoad());setLoading(false);return;}
  const client=db();client.auth.getUser().then(async({data:{user:u}})=>{if(!active)return;userRef.current=u;setUser(u);setLoading(false);if(u){try{const next=await fetchFinanceRows(u.id);if(active)setData(next);}catch(e){if(active)setError((e as Error).message);}}}).catch(e=>{if(active){setError(e.message);setLoading(false);}});
  const {data:listener}=client.auth.onAuthStateChange((event,session)=>{if(!active||demoRef.current)return;const next=session?.user||null;userRef.current=next;setUser(next);if(event==='PASSWORD_RECOVERY')setPasswordRecovery(true);if(event==='SIGNED_OUT'){setData(empty);setPasswordRecovery(false);}});
  return()=>{active=false;listener.subscription.unsubscribe()};
 },[]);
 const login=async(email:string,password:string)=>{setBusy(true);try{const {data:r,error:e}=await db().auth.signInWithPassword({email,password});if(e)throw e;if(!r.user)throw new Error('Login failed');setDemo(false);demoRef.current=false;userRef.current=r.user;setUser(r.user);await reload();}finally{setBusy(false)}};
 const signup=async(email:string,password:string)=>{setBusy(true);try{const {data:r,error:e}=await db().auth.signUp({email,password});if(e)throw e;if(r.session&&r.user){setDemo(false);demoRef.current=false;userRef.current=r.user;setUser(r.user);await reload();return 'Your account is ready.';}return 'Check your email for the confirmation link, then sign in.';}finally{setBusy(false)}};
 const resetPassword=async(email:string)=>{const {error:e}=await db().auth.resetPasswordForEmail(email,{redirectTo:typeof window!=='undefined'?window.location.origin:undefined});if(e)throw e;};
 const resendConfirmation=async(email:string)=>{const {error:e}=await db().auth.resend({type:'signup',email,options:{emailRedirectTo:typeof window!=='undefined'?window.location.origin:undefined}});if(e)throw e;};
 const setNewPassword=async(password:string)=>{if(password.length<8)throw new Error('Please choose at least 8 characters.');const {error:e}=await db().auth.updateUser({password});if(e)throw e;setPasswordRecovery(false);};
 const logout=async()=>{if(demo){setDemo(false);demoRef.current=false;setUser(null);setData(empty);return;}const {error:e}=await db().auth.signOut();if(e)throw e;setUser(null);userRef.current=null;setData(empty)};
 const startDemo=()=>{demoRef.current=true;setDemo(true);setData(safeDemoLoad());setLoading(false);};
 const stopDemo=()=>{demoRef.current=false;setDemo(false);setData(empty);};
 const create:FinanceContextValue['create']=async(table,draft)=>{
  if(demo){applyDemo(prev=>({...prev,[table]:[{...draft,id:guid(),user_id:'demo-user',created_at:new Date().toISOString()},...prev[table]]} as FinanceData));return;}
  const {error:e}=await db().from(table).insert({...draft,user_id:userRef.current!.id});if(e)throw e;await reload();
 };
 const update:FinanceContextValue['update']=async(table,id,draft)=>{
  if(demo){applyDemo(prev=>({...prev,[table]:prev[table].map(t=>t.id===id?{...t,...draft}:t)} as FinanceData));return;}
  // Supabase's untyped dynamic-table update has an over-restrictive generic constraint; runtime payload is unchanged.
  const {error:e}=await db().from(table).update(draft as never).eq('id',id).eq('user_id',userRef.current!.id);if(e)throw e;await reload();
 };
 const remove=async(table:Model,id:string)=>{
  if(table==='transactions'){const associated=data.attachments.filter(a=>a.transaction_id===id);if(!demo&&associated.length){const {error:e}=await db().storage.from('receipts').remove(associated.map(a=>a.storage_path));if(e)throw e;}}
  if(demo){applyDemo(prev=>({...prev,[table]:prev[table].filter(t=>t.id!==id),attachments:table==='transactions'?prev.attachments.filter(a=>a.transaction_id!==id):prev.attachments} as FinanceData));return;}
  const {error:e}=await db().from(table).delete().eq('id',id).eq('user_id',userRef.current!.id);if(e)throw e;await reload();
 };
 const addAttachment=async(txId:string,file:File)=>{
  checkFile(file,demo);const attachmentName=file.name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,100);const storagePath=`${demo?'demo-user':userRef.current!.id}/${txId}/${guid()}-${attachmentName}`;
  if(demo){const demo_data=await readFile(file);const item:Attachment={id:guid(),user_id:'demo-user',transaction_id:txId,storage_path:storagePath,file_name:file.name,mime_type:file.type,file_size:file.size,created_at:new Date().toISOString(),demo_data};applyDemo(prev=>({...prev,attachments:[item,...prev.attachments]}));return;}
  const client=db();const {error:uploadErr}=await client.storage.from('receipts').upload(storagePath,file,{contentType:file.type,cacheControl:'3600',upsert:false});if(uploadErr)throw uploadErr;
  const {error:e}=await client.from('attachments').insert({user_id:userRef.current!.id,transaction_id:txId,storage_path:storagePath,file_name:file.name,mime_type:file.type,file_size:file.size});
  if(e){await client.storage.from('receipts').remove([storagePath]);throw e;}await reload();
 };
 const removeAttachment=async(attachment:Attachment)=>{
  if(demo){applyDemo(prev=>({...prev,attachments:prev.attachments.filter(a=>a.id!==attachment.id)}));return;}
  const client=db();const {error:e}=await client.storage.from('receipts').remove([attachment.storage_path]);if(e)throw e;const {error:dbErr}=await client.from('attachments').delete().eq('id',attachment.id);if(dbErr)throw dbErr;await reload();
 };
 const attachmentUrl=async(attachment:Attachment)=>{if(demo)return attachment.demo_data||'';const {data:r,error:e}=await db().storage.from('receipts').createSignedUrl(attachment.storage_path,120);if(e)throw e;return r.signedUrl;};
 const addTransaction=async(draft:TxDraft,files:File[]=[])=>{
  files.forEach(f=>checkFile(f,demo));const value={...draft,due_date:draft.due_date||null,amount:Number(draft.amount),principal_component:Number(draft.principal_component)||0,interest_component:Number(draft.interest_component)||0,source:draft.source||'manual'};
  let result:Transaction;
  if(demo){result={...value,id:guid(),user_id:'demo-user',created_at:new Date().toISOString(),import_hash:draft.import_hash||null};applyDemo(prev=>({...prev,transactions:[result,...prev.transactions]}));}
  else{const {data:r,error:e}=await db().from('transactions').insert({...value,user_id:userRef.current!.id}).select('*').single();if(e)throw e;result=r as Transaction;await reload();}
  const failures:string[]=[];for(const file of files){try{await addAttachment(result.id,file);}catch(e){failures.push(`${file.name}: ${(e as Error).message}`);}}
  if(failures.length)setError(`Transaction saved, but some attachments failed: ${failures.join('; ')}. Open the transaction to retry.`);
  return result;
 };
 const updateTransaction=async(id:string,draft:TxDraft,files:File[]=[])=>{
  files.forEach(f=>checkFile(f,demo));const value={...draft,due_date:draft.due_date||null,amount:Number(draft.amount),principal_component:Number(draft.principal_component)||0,interest_component:Number(draft.interest_component)||0};
  if(demo)applyDemo(prev=>({...prev,transactions:prev.transactions.map(t=>t.id===id?{...t,...value}:t)}));
  else{const {error:e}=await db().from('transactions').update(value).eq('id',id).eq('user_id',userRef.current!.id);if(e)throw e;await reload();}
  const failures:string[]=[];for(const f of files){try{await addAttachment(id,f)}catch(e){failures.push(`${f.name}: ${(e as Error).message}`)}}if(failures.length)setError(`Changes saved but attachments failed: ${failures.join('; ')}. Open the transaction to retry.`);
 };
 const importTransactions=async(drafts:TxDraft[])=>{
  let added=0,duplicates=0,failed=0;const hashes=new Set(data.transactions.filter(t=>t.import_hash).map(t=>t.import_hash));
  const fresh=drafts.filter(d=>{if(d.import_hash && hashes.has(d.import_hash)){duplicates++;return false;}if(d.import_hash)hashes.add(d.import_hash);return true;});
  if(demo){const now=new Date().toISOString();applyDemo(prev=>({...prev,transactions:[...fresh.map(d=>({...d,id:guid(),user_id:'demo-user',source:'csv',created_at:now,import_hash:d.import_hash||null} as Transaction)),...prev.transactions]}));return {added:fresh.length,duplicates,failed};}
  const client=db(),uid=userRef.current!.id;
  // Import sequentially without re-fetching six tables per record. Conflicts count as duplicates.
  for(const draft of fresh){const {error:e}=await client.from('transactions').insert({...draft,source:'csv',user_id:uid});
   if(!e)added++;else if(e.code==='23505')duplicates++;else failed++;
  }
  await reload();return{added,duplicates,failed};
 };
 const deleteAccount=async()=>{
  if(demo){localStorage.removeItem(demoKey);stopDemo();return;}
  const client=db(),uid=userRef.current!.id;
  // Clean receipt blobs BEFORE deleting auth identity. Paginate defensively by refusing giant folders.
  const {data:folders,error:folderErr}=await client.storage.from('receipts').list(uid,{limit:1000});if(folderErr)throw folderErr;
  if((folders||[]).length>=1000)throw new Error('Large account: please contact support to complete secure deletion.');
  const paths:string[]=[];
  for(const folder of folders||[]){if(folder.id){paths.push(`${uid}/${folder.name}`);continue;}
   const {data:files,error:e}=await client.storage.from('receipts').list(`${uid}/${folder.name}`,{limit:1000});if(e)throw e;if((files||[]).length>=1000)throw new Error('Large account: please contact support to complete secure deletion.');
   for(const file of files||[])if(file.id)paths.push(`${uid}/${folder.name}/${file.name}`);
  }
  for(let i=0;i<paths.length;i+=100){const {error:e}=await client.storage.from('receipts').remove(paths.slice(i,i+100));if(e)throw e;}
  const {error:e}=await client.rpc('delete_my_account');if(e)throw e;
  await client.auth.signOut();userRef.current=null;setUser(null);setData(empty);
 };
 const value=useMemo(()=>({data,user,demo,configured:isConfigured,loading,busy,error,passwordRecovery,login,signup,resetPassword,resendConfirmation,setNewPassword,logout,startDemo,stopDemo,reload,create,update,remove,addTransaction,updateTransaction,addAttachment,removeAttachment,attachmentUrl,importTransactions,deleteAccount}),[data,user,demo,loading,busy,error,passwordRecovery,reload,applyDemo]);
 return <C.Provider value={value}>{children}</C.Provider>;
}
