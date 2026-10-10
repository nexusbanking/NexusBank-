import {supabase,money,formatDate,escapeHtml,restoreNexusSession,profileFor} from '../supabase.js';
export const $=id=>document.getElementById(id);
export {money,formatDate,escapeHtml,supabase};

let customerStateChannel=null;
let customerVisibilityHandler=null;
let lastCustomerAccountStatus=null;

function customerStatusMessage(status){
  if(status==='frozen') return ['Account frozen','Your account is currently frozen. Transfers and restricted transactions are unavailable. Contact Customer Care for assistance.','error'];
  if(status==='pending') return ['Account pending','Your account is currently pending. New money and cryptocurrency transactions may remain pending until the account is active.','warning'];
  if(status==='active') return ['Account active','Your account is active and normal operations are available.','success'];
  return null;
}

async function checkCustomerState(userId,showStatus=false){
  // A temporary network/Auth/RLS error during browser resume must never be
  // interpreted as an inactive/deactivated account. Only an explicit,
  // successfully-read profile status can send the customer to unavailable.
  // Use the same server-side profile RPC as the root router so RLS/direct-table
  // differences cannot make the customer appear deactivated on browser resume.
  const profilePromise=profileFor(userId);
  const accountPromise=supabase.from('accounts').select('status,deleted_at')
    .eq('user_id',userId).is('deleted_at',null).order('created_at',{ascending:false}).limit(1).maybeSingle();
  const [p,accountResult]=await Promise.all([profilePromise,accountPromise]);
  if(accountResult.error) throw accountResult.error;
  const a=accountResult.data;

  // No row is not proof of deactivation. Keep the current screen and let a
  // later successful check resolve it; do not redirect on a transient miss.
  if(!p){
    console.warn('[NEXUS customer state] Profile row was not returned; preserving current route.');
    return null;
  }

  if(p.status==='deactivated' || !!p.deleted_at){
    location.replace('#/unavailable');
    return null;
  }

  if(a){
    window.dispatchEvent(new CustomEvent('nexus-account-state',{detail:{profile:p,account:a}}));
  }

  if(showStatus && a){
    const notice=customerStatusMessage(a.status);
    if(notice) toast(notice[0],notice[1],notice[2]);
  }

  return {profile:p,account:a};
}

function watchCustomerState(userId){
  if(customerStateChannel) clearInterval(customerStateChannel);

  customerStateChannel=setInterval(async()=>{
    try{
      const state=await checkCustomerState(userId,false);
      if(!state)return;
      const nextStatus=state.account?.status||null;
      if(nextStatus!==lastCustomerAccountStatus){
        lastCustomerAccountStatus=nextStatus;
        const notice=customerStatusMessage(nextStatus);
        if(notice) toast(notice[0],notice[1],notice[2]);
      }
    }catch(e){
      console.warn('[NEXUS customer state]',e);
    }
  },15000);

  if(customerVisibilityHandler) document.removeEventListener('visibilitychange',customerVisibilityHandler);
  customerVisibilityHandler=async()=>{
    if(document.visibilityState==='visible'){
      try{
        const state=await checkCustomerState(userId,false);
        if(!state)return;
        const nextStatus=state.account?.status||null;
        if(nextStatus!==lastCustomerAccountStatus){
          lastCustomerAccountStatus=nextStatus;
          const notice=customerStatusMessage(nextStatus);
          if(notice) toast(notice[0],notice[1],notice[2]);
        }
      }catch(e){
        console.warn('[NEXUS customer state wake]',e);
      }
    }
  };
  document.addEventListener('visibilitychange',customerVisibilityHandler);
}

export async function requireUser(cb){
  const session=await restoreNexusSession().catch(()=>null);
  if(!session){location.replace('#/login');return;}

  let p;
  try{p=await profileFor(session.user.id);}catch(error){
    console.warn('[NEXUS customer state] Profile lookup failed; preserving the login/session flow:',error);
    location.replace('#/login');
    return;
  }
  if(!p){location.replace('#/login');return;}
  if(String(p.status||'').toLowerCase()==='deactivated'||Boolean(p.deleted_at)){location.replace('#/unavailable');return;}

  const state=await checkCustomerState(session.user.id,false).catch(()=>null);
  if(state===null)return;

  watchCustomerState(session.user.id);

  lastCustomerAccountStatus=state.account?.status||null;
  const notice=customerStatusMessage(state.account?.status);
  if(notice && state.account?.status!=='active') toast(notice[0],notice[1],notice[2]);

  cb(session.user,p);
}
export async function logout(){
  if(customerStateChannel){clearInterval(customerStateChannel);customerStateChannel=null;}
  if(customerVisibilityHandler){document.removeEventListener('visibilitychange',customerVisibilityHandler);customerVisibilityHandler=null;}
  try{localStorage.removeItem('nexus_trusted_device_token_v1');try{localStorage.removeItem('nexus_trusted_device')}catch{};}catch{};try{localStorage.removeItem('nexus_pending_login_v1');try{localStorage.removeItem('nexus_login_verification_email')}catch{};}catch{};try{sessionStorage.removeItem('nexus_pending_login_v1');try{sessionStorage.removeItem('nexus_login_verification_email')}catch{};}catch{};try{sessionStorage.removeItem('nexus_login_verified')}catch{};await supabase.auth.signOut();location.replace('#/login');}
export function nav(active){
 // Folder-based pages use index.html. The <base> element on each page
 // keeps these paths relative to the site's root on GitHub Pages and locally.
 const inCustomerPages=/\/pages\//.test(location.pathname);
 const homePath='#/dashboard';
 const pagePath=name=>`pages/${name}/`;
 const items=[
   ['home','Home',homePath,'⌂'],
   ['send','Transfer',pagePath('send-money'),'↗'],
   ['deposit','Deposit',pagePath('add-money'),'＋'],
   ['history','History',pagePath('transactions'),'◷'],
   ['cards','Cards',pagePath('card'),'▣']
 ];
 return `<nav class="bottom-nav">${items.map(x=>`<a class="${active===x[0]?'active':''}" href="${x[2]}"><div>${x[3]}</div>${x[1]}</a>`).join('')}</nav>`;
}
export function toast(title,message,type='error',opts={}){
 let wrap=document.querySelector('.toast-wrap');
 if(!wrap){wrap=document.createElement('div');wrap.className='toast-wrap';document.body.appendChild(wrap);}
 const el=document.createElement('div');el.className=`toast ${type}`;
 const href=opts.href||'support/';
 el.innerHTML=`<div class="toast-icon">${type==='success'?'✓':type==='warning'?'!':'i'}</div><div style="flex:1"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(message)}</p>${opts.support?`<a class="btn btn-light toast-support" href="${href}">Customer Care</a>`:''}</div><button class="btn btn-light toast-close" aria-label="Close">×</button>`;
 el.querySelector('.toast-close').onclick=()=>el.remove();
 wrap.appendChild(el);setTimeout(()=>el.remove(),9000);
}
export async function accountFor(userId){const {data,error}=await supabase.from('accounts').select('*').eq('user_id',userId).is('deleted_at',null).limit(1).maybeSingle();if(error)throw error;return data;}
export async function customerSettings(){
  const fallback={
    customer_care_email:'support@example.com',
    customer_care_whatsapp:''
  };

  try{
    const {data,error}=await supabase.rpc('get_customer_care_settings');

    if(error){
      console.warn('[NEXUS customer care] Settings RPC failed:',error);
      return fallback;
    }

    if(!data || typeof data!=='object') return fallback;

    return {
      customer_care_email:String(data.customer_care_email||''),
      customer_care_whatsapp:String(data.customer_care_whatsapp||'')
    };
  }catch(error){
    console.warn('[NEXUS customer care] Settings lookup failed:',error);
    return fallback;
  }
}

export async function unreadCount(userId){
  const {count,error}=await supabase
    .from('notifications')
    .select('id',{count:'exact',head:true})
    .eq('user_id',userId)
    .eq('is_read',false)
    .eq('is_deleted',false);

  if(error){
    console.warn('[NEXUS notifications] Unread count lookup failed:',error);
    return 0;
  }

  return Number(count||0);
}

export function injectHeader(title,subtitle='Online Banking',showNotifications=true){
 return `<header class="topbar"><div class="brand-block"><div class="brand-mark">N</div><div><div class="brand">NEXUS</div><small>${escapeHtml(subtitle)}</small></div></div><div class="topbar-actions">${showNotifications?`<a class="icon-btn" href="notifications/" aria-label="Notifications">♧<span id="headerUnread" class="badge">0</span></a>`:''}<a class="icon-btn" href="support/" aria-label="Customer Care">?</a><button id="logoutBtn" class="btn btn-danger">Sign out</button></div></header>`;
}

export async function wireHeaderBadge(userId){
  const badge=document.getElementById('headerUnread') || document.getElementById('unreadBadge');
  if(!badge || !userId) return;

  // Hash navigation can initialize this module repeatedly. Use one polling
  // loop per user so Realtime CHANNEL_ERROR does not break the page.
  const pollKey=`__nexusBadgePoll_${userId}`;
  if(window[pollKey]) {
    window[pollKey].run();
    return;
  }

  let stopped=false;
  let running=false;
  const run=async()=>{
    if(stopped || running) return;
    running=true;
    try {
      const count=await unreadCount(userId);
      if(!stopped && badge.isConnected) {
        badge.textContent=String(count);
        badge.hidden=count===0;
      }
    } catch(error) {
      console.warn('[NEXUS notifications] Badge refresh failed; will retry:',error);
    } finally {
      running=false;
    }
  };
  const timer=setInterval(()=>{ if(document.visibilityState==='visible') void run(); },30000);
  window[pollKey]={run,stop:()=>{stopped=true;clearInterval(timer);}};
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void run();});
  await run();
}
