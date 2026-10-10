import {supabase,money,formatDate,escapeHtml,restoreNexusSession} from '../supabase.js';
import {accountFor,nav,logout,toast,wireHeaderBadge} from './common.js';
const $=id=>document.getElementById(id);
const isDashboardRoute=()=>/^#\/?dashboard(?:[/?]|$)/i.test(location.hash||'');
const setText=(id,value)=>{const el=$(id);if(el)el.textContent=value==null?'':String(value);};
const setHTML=(id,value)=>{const el=$(id);if(el)el.innerHTML=value;};
const logoutButton=$('logoutBtn');if(logoutButton)logoutButton.onclick=logout;setHTML('nav',nav('home'));
async function init(){
 if(!isDashboardRoute())return;
 const session=await restoreNexusSession().catch(()=>null);if(!isDashboardRoute())return;if(!session)return location.replace('#/login');
 let lastAccountStatus=null;
 const {data:p}=await supabase.from('profiles').select('*').eq('id',session.user.id).single();
 if(!isDashboardRoute())return;
 if(!p)return location.replace('#/login');if(p.status==='deactivated'||p.deleted_at)return location.replace('#/unavailable');
 const a=await accountFor(session.user.id);if(!isDashboardRoute())return;if(!a){setText('status','No account has been assigned yet.');return;}
 setText('balance',money(a.balance,a.currency));setText('currency',a.currency||'USD');setText('accountNumber',a.account_number||'—');setText('routing',(a.routing_number||a.routing_identifier)||'—');
 const state=a.status==='frozen'?'Frozen — transfers are unavailable.':a.status==='pending'?'Pending — new transactions may remain pending.':'Active — normal operations available.';setText('status',state);
 lastAccountStatus=a.status||null;
 const {data:txRows,error:txError}=await supabase.from('transactions').select('*').eq('account_id',a.id).limit(200);
 if(txError) throw txError;
 const txs=(txRows||[]).sort((left,right)=>{
  const leftTime=Date.parse(left.display_transaction_at||left.created_at||0)||0;
  const rightTime=Date.parse(right.display_transaction_at||right.created_at||0)||0;
  return rightTime-leftTime;
 }).slice(0,8);
 let income=0,expenses=0;(txRows||[]).forEach(t=>{if(['deposit','credit','received'].includes(String(t.type||'').toLowerCase()))income+=Number(t.amount||0);if(['transfer','withdrawal','debit','sent'].includes(String(t.type||'').toLowerCase()))expenses+=Number(t.amount||0)});
 setText('income',money(income,a.currency));setText('expenses',money(expenses,a.currency));setText('savings',money(Math.max(Number(a.balance||0),0),a.currency));
 setHTML('txBody',txs?.length?txs.map(t=>`<a class="list-item" href="#/transactions/${encodeURIComponent(String(t.id))}"><div><strong>${escapeHtml(t.description||t.type||'Transaction')}</strong><div class="muted">${formatDate(t.display_transaction_at||t.created_at)}</div></div><div class="amount-col"><strong class="${['deposit','credit','received'].includes(String(t.type||'').toLowerCase())?'positive':'negative'}">${['deposit','credit','received'].includes(String(t.type||'').toLowerCase())?'+':'−'}${money(Math.abs(t.amount),t.currency||a.currency)}</strong><span class="status-pill ${t.status==='pending'?'pending':''}">${escapeHtml(t.status||'completed')}</span></div></a>`).join(''):'<div class="hint">No transactions yet.</div>');
 if(!isDashboardRoute())return;
 await wireHeaderBadge(session.user.id);
 if(!isDashboardRoute())return;
 // Poll notifications instead of relying on Supabase Realtime, which can
 // report CHANNEL_ERROR when Realtime is disabled or unavailable. The dashboard
 // remains usable, and new notifications still appear as toasts.
 const toastPollKey=`__nexusLiveToastPoll_${session.user.id}`;
 if(!window[toastPollKey]){
  let lastSeenNotification=null;
  let pollRunning=false;
  const pollNewNotifications=async()=>{
   if(!isDashboardRoute()||pollRunning || document.visibilityState!=='visible') return;
   pollRunning=true;
   try{
    const {data,error}=await supabase.from('notifications')
      .select('id,title,message,created_at')
      .eq('user_id',session.user.id)
      .order('created_at',{ascending:false})
      .limit(1);
    if(error) throw error;
    const latest=data?.[0];
    if(latest?.id){
     if(lastSeenNotification!==null && latest.id!==lastSeenNotification && latest.title){
      toast(latest.title,latest.message||'New NEXUS notification','success');
     }
     lastSeenNotification=latest.id;
    }
   }catch(error){
    console.warn('[NEXUS notifications] Notification refresh failed; will retry:',error);
   }finally{pollRunning=false;}
  };
  const timer=setInterval(()=>void pollNewNotifications(),30000);
  window[toastPollKey]={run:pollNewNotifications,stop:()=>clearInterval(timer)};
  void pollNewNotifications();
 }
 const refreshDashboardState=async()=>{
  if(!isDashboardRoute())return false;
  try{
   const {data:profile}=await supabase.from('profiles').select('status,deleted_at').eq('id',session.user.id).maybeSingle();
   // Only an explicit deactivated/deleted profile may trigger the unavailable page.
   // A missing row or temporary read failure is not proof that the account was deactivated.
   if(!isDashboardRoute())return false;
   if(profile && (String(profile.status||'').toLowerCase()==='deactivated' || Boolean(profile.deleted_at))){location.replace('#/unavailable');return false;}
   const {data:current}=await supabase.from('accounts').select('status,deleted_at,balance,currency,account_number,routing_identifier').eq('user_id',session.user.id).is('deleted_at',null).maybeSingle();
   if(!current)return true;
   setText('balance',money(current.balance,current.currency));
   setText('currency',current.currency||'USD');
   setText('accountNumber',current.account_number||'—');
   setText('routing',(current.routing_number||current.routing_identifier)||'—');
   setText('status',current.status==='frozen'?'Frozen — transfers are unavailable.':current.status==='pending'?'Pending — new transactions may remain pending.':'Active — normal operations available.');
   const statusChanged=current.status!==lastAccountStatus;
   lastAccountStatus=current.status||null;
   if(statusChanged){
    if(current.status==='frozen')toast('Account frozen','Your account is currently frozen. Transfers and restricted transactions are unavailable. Contact Customer Care for assistance.','error');
    else if(current.status==='pending')toast('Account pending','Your account is currently pending. New money and cryptocurrency transactions may remain pending until the account is active.','warning');
    else if(current.status==='active')toast('Account active','Your NEXUS account is active and normal operations are available.','success');
   }
   return true;
  }catch(e){console.warn('[NEXUS dashboard state]',e);return true;}
 };
 const dashboardStateTimer=setInterval(()=>{if(isDashboardRoute())void refreshDashboardState();},15000);
 const onDashboardVisibility=()=>{if(document.visibilityState==='visible'&&isDashboardRoute())void refreshDashboardState();};
 const stopDashboardTimers=()=>{clearInterval(dashboardStateTimer);const poll=window[toastPollKey];if(poll?.stop)poll.stop();document.removeEventListener('visibilitychange',onDashboardVisibility);};
 window.addEventListener('hashchange',()=>{if(!isDashboardRoute())stopDashboardTimers();},{once:true});
 window.addEventListener('beforeunload',stopDashboardTimers,{once:true});
 document.addEventListener('visibilitychange',onDashboardVisibility);
}
init().catch(e=>{if(isDashboardRoute()){console.error('[NEXUS dashboard] Initialization failed:',e);toast('Dashboard unavailable',e?.message||'Please refresh.','error');}});
