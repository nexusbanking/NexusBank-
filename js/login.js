import {supabase,restoreNexusSession} from './supabase.js';
import {clearMessage,routeAuthenticatedUser,setBusy,showMessage} from './auth.js';
import {getTrustedDevice,setTrustedDevice,clearTrustedDevice} from './nexus-device-storage.js';

const form=document.querySelector('#login-form');
const button=document.querySelector('#login-button');
const password=document.querySelector('#password');
const toggle=document.querySelector('#toggle-password');

const LOGIN_EMAIL_KEY='nexus_login_verification_email';

function clearVerificationEmail(){try{localStorage.removeItem(LOGIN_EMAIL_KEY);}catch{};try{sessionStorage.removeItem(LOGIN_EMAIL_KEY);}catch{}}
function saveVerificationEmail(email){try{localStorage.setItem(LOGIN_EMAIL_KEY,email);}catch{};try{sessionStorage.setItem(LOGIN_EMAIL_KEY,email);}catch{}}

async function functionErrorDetail(error,fallback='Login verification failed.'){
  let detail=error?.message||fallback;
  try{
    const context=error?.context;
    if(context&&typeof context.json==='function'){
      const parsed=await context.json();
      if(parsed?.error)detail=String(parsed.error);
      else if(parsed?.message)detail=String(parsed.message);
      else if(parsed?.msg)detail=String(parsed.msg);
      return detail;
    }
  }catch{}
  try{
    const body=error?.context?.body;
    if(body){
      const parsed=typeof body==='string'?JSON.parse(body):body;
      if(parsed?.error)detail=String(parsed.error);
      else if(parsed?.message)detail=String(parsed.message);
      else if(parsed?.msg)detail=String(parsed.msg);
    }
  }catch{}
  return detail;
}

async function loginVerificationAction(action,email,session,deviceToken=''){
  const {data,error}=await supabase.functions.invoke('nexus-login-verify',{
    body:{action,email,device_token:deviceToken},
    headers:session?.access_token?{Authorization:`Bearer ${session.access_token}`}:{ }
  });
  if(error){
    const detail=await functionErrorDetail(error);
    console.error('[NEXUS login verification] Edge Function error:',error,detail);
    throw new Error(detail);
  }
  return data||{};
}

toggle?.addEventListener('click',()=>{
  const v=password.type==='text';
  password.type=v?'password':'text';
  toggle.textContent=v?'Show':'Hide';
  toggle.setAttribute('aria-pressed',String(!v));
  password.focus();
});

async function restoreSession(){
  try{
    const session=await restoreNexusSession();
    if(!session)return;

    const verified=sessionStorage.getItem('nexus_login_verified')==='1';
    if(verified){
      setBusy(button,true);
      await routeAuthenticatedUser();
      return;
    }

    const email=String(session.user?.email||'').toLowerCase();
    const trusted=await getTrustedDevice();
    if(trusted?.email===email&&trusted?.token){
      try{
        const result=await loginVerificationAction('check',email,session,trusted.token);
        if(result?.trusted===true){
          sessionStorage.setItem('nexus_login_verified','1');
          setBusy(button,true);
          await routeAuthenticatedUser();
          return;
        }
      }catch(e){console.warn('[NEXUS trusted device restore]',e);}
      await clearTrustedDevice();
    }

    await supabase.auth.signOut();
  }catch(e){
    console.error('[NEXUS session restore]',e);
    setBusy(button,false);
  }
}

restoreSession();

form?.addEventListener('submit',async e=>{
  e.preventDefault();
  clearMessage();

  const email=String(document.querySelector('#email')?.value||'').trim().toLowerCase();
  const pass=password?.value||'';
  if(!email||!pass){showMessage('Enter your email and password.');return;}

  setBusy(button,true);

  try{
    const {data,error}=await supabase.auth.signInWithPassword({email,password:pass});
    if(error)throw error;
    if(!data?.session?.access_token||!data?.session?.refresh_token)
      throw new Error('Supabase did not return a valid login session.');

    const session=data.session;
    const trusted=await getTrustedDevice();

    if(trusted?.email===email&&trusted?.token){
      try{
        const result=await loginVerificationAction('check',email,session,trusted.token);
        if(result?.trusted===true){
          sessionStorage.setItem('nexus_login_verified','1');
          await routeAuthenticatedUser();
          return;
        }
      }catch(e){console.warn('[NEXUS trusted device]',e);}
      await clearTrustedDevice();
    }

    // New browser/device, or a login after logout: send a fresh code.
    const result=await loginVerificationAction('send',email,session);
    if(result?.success!==true)
      throw new Error(result?.error||'NEXUS could not send the login verification code.');

    saveVerificationEmail(email);
    sessionStorage.removeItem('nexus_login_verified');
    location.replace(`#/login-verify?email=${encodeURIComponent(email)}`);
  }catch(e){
    const raw=String(e?.message||'').trim();
    let message=raw||'Sign-in failed. Please try again.';
    if(/invalid login credentials/i.test(raw))message='The email or password is incorrect.';
    else if(/email not confirmed/i.test(raw)){
      sessionStorage.setItem('nexus_pending_verification_email',email);
      location.replace(`#/verify-email?email=${encodeURIComponent(email)}`);
      return;
    }else if(/failed to fetch|network|fetch/i.test(raw))
      message='NEXUS could not reach Supabase. Check your internet connection and project configuration.';
    console.error('[NEXUS login]',e);
    showMessage(message);
    setBusy(button,false);
  }
});
