import {supabase,restoreNexusSession} from './supabase.js';
import {clearMessage,routeAuthenticatedUser,showMessage} from './auth.js';
import {setTrustedDevice} from './nexus-device-storage.js';

const form=document.querySelector('#login-verify-form');
const codeInput=document.querySelector('#login-code');
const button=document.querySelector('#verify-login-button');
const backButton=document.querySelector('#back-login-button');
const intro=document.querySelector('#verifyIntro');

const LOGIN_EMAIL_KEY='nexus_login_verification_email';

function getEmail(){
  try{
    // The SPA keeps routes and query parameters in the hash, e.g.
    // index.html#/login-verify?email=user%40example.com. Also support
    // normal query strings for compatibility with a standalone page.
    const fromUrl=new URLSearchParams(location.search).get('email');
    if(fromUrl)return fromUrl.trim().toLowerCase();
    const hashQuery=(location.hash.split('?')[1]||'');
    const fromHash=new URLSearchParams(hashQuery).get('email');
    if(fromHash)return fromHash.trim().toLowerCase();
  }catch{}
  try{
    const local=localStorage.getItem(LOGIN_EMAIL_KEY);
    if(local)return local.trim().toLowerCase();
  }catch{}
  try{
    return (sessionStorage.getItem(LOGIN_EMAIL_KEY)||'').trim().toLowerCase();
  }catch{return '';}
}

function saveEmail(email){try{localStorage.setItem(LOGIN_EMAIL_KEY,email);}catch{};try{sessionStorage.setItem(LOGIN_EMAIL_KEY,email);}catch{}}
function clearEmail(){try{localStorage.removeItem(LOGIN_EMAIL_KEY);}catch{};try{sessionStorage.removeItem(LOGIN_EMAIL_KEY);}catch{}}
function setBusy(value){if(!button)return;button.disabled=value;button.setAttribute('aria-busy',value?'true':'false');button.textContent=value?'Verifying…':'Verify and sign in';}

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

const email=getEmail();
if(email){
  saveEmail(email);
  if(intro)intro.textContent=`Enter the 6-digit code sent to ${email}.`;
}

codeInput?.addEventListener('input',()=>{
  codeInput.value=codeInput.value.replace(/\D/g,'').slice(0,6);
});

backButton?.addEventListener('click',async()=>{
  clearEmail();
  try{sessionStorage.removeItem('nexus_login_verified');}catch{}
  location.replace('#/login');
});

(async()=>{
  try{
    if(!email)throw new Error('The login verification email is missing. Please sign in again.');
    const session=await restoreNexusSession();
    if(!session)throw new Error('Your sign-in session has expired. Please sign in again.');
    if(String(session.user?.email||'').toLowerCase()!==email)
      throw new Error('The verification email does not match this sign-in session.');
    codeInput?.focus();
  }catch(e){
    showMessage(e.message||'Please sign in again.');
    setTimeout(()=>location.replace('#/login'),1200);
  }
})();

form?.addEventListener('submit',async e=>{
  e.preventDefault();
  clearMessage();
  const code=String(codeInput?.value||'').trim();

  if(!email){showMessage('The login email address is missing. Please sign in again.');return;}
  if(!/^\d{6}$/.test(code)){showMessage('Enter the 6-digit login verification code.');codeInput?.focus();return;}

  setBusy(true);
  try{
    const session=await restoreNexusSession();
    if(!session)throw new Error('Your sign-in session has expired. Please sign in again.');

    const {data,error}=await supabase.functions.invoke('nexus-login-verify',{
      body:{action:'verify',email,code},
      headers:{Authorization:`Bearer ${session.access_token}`}
    });

    if(error){
      const detail=await functionErrorDetail(error);
      console.error('[NEXUS login verification] Edge Function error:',error,detail);
      throw new Error(detail);
    }

    if(!data?.success||!data?.device_token)
      throw new Error(data?.error||'The verification code could not be accepted.');

    const saved=await setTrustedDevice({email,token:data.device_token});
    if(!saved){
      // Verification itself succeeded. Do not deny the login just because
      // trusted-device persistence is unavailable on this browser.
      console.warn('[NEXUS login verification] Trusted device could not be persisted; login will continue without trusted-device persistence.');
    }

    sessionStorage.setItem('nexus_login_verified','1');
    clearEmail();
    showMessage('Login verified successfully. Opening your NEXUS account…','success');
    await new Promise(r=>setTimeout(r,300));
    await routeAuthenticatedUser();
  }catch(e){
    const raw=String(e?.message||'').trim();
    const message=/wrong|incorrect|invalid.*code|expired.*code|no active login verification/i.test(raw)
      ?'Wrong login verification code. Please enter the code sent to your email.'
      :raw||'Login verification failed. Please try again.';
    console.error('[NEXUS login verification]',e);
    showMessage(message);
    setBusy(false);
    codeInput?.focus();
    codeInput?.select();
  }
});
