import {supabase} from './supabase.js';

const form=document.querySelector('#verify-form');
const button=document.querySelector('#verify-button');
const message=document.querySelector('[data-auth-message]');
const emailInput=document.querySelector('#email');
const codeInput=document.querySelector('#code');

function showMessage(text,type='error'){
  if(!message)return;
  message.textContent=text;
  message.className=`auth-message ${type}`;
  message.hidden=false;
}

function busy(value){
  if(!button)return;
  button.disabled=value;
  button.setAttribute('aria-busy',value?'true':'false');
  button.textContent=value?'Verifying…':'Verify email';
}

try{
  const fromSearch=new URLSearchParams(location.search).get('email');
  const fromHash=new URLSearchParams((location.hash.split('?')[1]||'')).get('email');
  const pending=sessionStorage.getItem('nexus_pending_verification_email');
  const email=fromHash||fromSearch||pending;
  if(email && emailInput) emailInput.value=email.trim().toLowerCase();
}catch{}

codeInput?.addEventListener('input',()=>{
  codeInput.value=codeInput.value.replace(/\D/g,'').slice(0,6);
});

form?.addEventListener('submit',async e=>{
  e.preventDefault();
  if(message){message.hidden=true;message.textContent='';}

  const email=emailInput?.value.trim().toLowerCase()||'';
  const code=codeInput?.value.trim()||'';
  if(!email||!email.includes('@')){showMessage('Enter the email address used for your NEXUS account.');return;}
  if(!/^\d{6}$/.test(code)){showMessage('Enter the 6-digit verification code.');return;}

  busy(true);
  try{
    const {data,error}=await supabase.functions.invoke('nexus-email-verify',{body:{email,code}});
    if(error) throw error;
    if(data?.error) throw new Error(data.error);

    sessionStorage.removeItem('nexus_pending_verification_email');
    showMessage('Email verified successfully. Redirecting to sign in…','ok');
    setTimeout(()=>location.replace('#/login'),900);
  }catch(e){
    console.error('[NEXUS email verification]',e);
    showMessage(String(e?.message||'Verification failed. Please try again.'));
    busy(false);
  }
});
