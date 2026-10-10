import {supabase,restoreNexusSession,profileFor,profileIsActive,profileIsDeleted} from './supabase.js';
import {clearTrustedDevice} from './nexus-device-storage.js';

export function showMessage(message,type='error'){
  const box=document.querySelector('[data-auth-message]');
  if(!box)return;
  box.textContent=message;
  box.className=`auth-message ${type}`;
  box.hidden=false;
}

export function clearMessage(){
  const b=document.querySelector('[data-auth-message]');
  if(b){b.hidden=true;b.textContent='';}
}

export function setBusy(btn,busy,label='Sign in'){
  if(!btn)return;
  btn.disabled=busy;
  btn.setAttribute('aria-busy',busy?'true':'false');
  btn.innerHTML=busy?'<span class="spinner" aria-hidden="true"></span> Signing in…':label;
}

export async function routeAuthenticatedUser(){
  const session=await restoreNexusSession();
  if(!session)throw new Error('Your login session could not be restored on this device.');
  const {data:{user},error:userError}=await supabase.auth.getUser();
  if(userError)throw userError;
  if(!user)throw new Error('Your session could not be established. Please sign in again.');

  const p=await profileFor(user.id);
  if(!p)throw new Error('Your NEXUS profile could not be found. Ask a NEXUS administrator to create or repair your profile.');

  if(!profileIsActive(p)||profileIsDeleted(p)){
    location.replace('#/unavailable');
    return true;
  }

  if(p.role==='admin'||p.role==='super_admin'){
    location.replace('#/admin');
    return true;
  }

  location.replace('#/dashboard');
  return true;
}

export async function signOut(){
  await clearTrustedDevice();
  try{localStorage.removeItem('nexus_pending_login_v1');}catch{}
  try{localStorage.removeItem('nexus_login_verification_email');}catch{}
  try{sessionStorage.removeItem('nexus_pending_login_v1');}catch{}
  try{sessionStorage.removeItem('nexus_login_verification_email');}catch{}
  try{sessionStorage.removeItem('nexus_login_verified');}catch{}
  await supabase.auth.signOut();
  location.replace('#/login');
}
