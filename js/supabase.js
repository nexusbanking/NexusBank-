import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const SUPABASE_URL = 'https://uzsjjdkvqdqndxapkluz.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_z79qq5tGH14Bptpwc5pY6Q_GY8uTNZo';

// TrebEdit/Android can keep a page alive while backgrounding it, but its
// localStorage quota can be very small. Supabase's default localStorage
// adapter can therefore fail while saving a perfectly valid auth session.
// Use IndexedDB for the persistent auth store instead. IndexedDB has a much
// larger quota and survives page reloads/backgrounding without filling the
// small localStorage bucket.
const AUTH_DB_NAME = 'nexus-auth-storage-v2';
const AUTH_STORE_NAME = 'kv';
const AUTH_STORAGE_KEY = 'nexus-supabase-auth-v1';
const RECOVERY_STORAGE_KEY = 'nexus-auth-recovery-v2';
const OLD_RECOVERY_STORAGE_KEY = 'nexus-auth-recovery-v1';
const OLD_AUTH_STORAGE_KEY = 'nexus-supabase-auth-v1';

let dbPromise = null;

function openAuthDb(){
  if(dbPromise) return dbPromise;
  dbPromise = new Promise((resolve,reject)=>{
    if(!('indexedDB' in window)){
      reject(new Error('IndexedDB is unavailable.'));
      return;
    }
    const request=indexedDB.open(AUTH_DB_NAME,1);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains(AUTH_STORE_NAME)) db.createObjectStore(AUTH_STORE_NAME);
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error('Could not open NEXUS auth storage.'));
  });
  return dbPromise;
}

async function idbGet(key){
  const db=await openAuthDb();
  return await new Promise((resolve,reject)=>{
    const tx=db.transaction(AUTH_STORE_NAME,'readonly');
    const req=tx.objectStore(AUTH_STORE_NAME).get(key);
    req.onsuccess=()=>resolve(req.result ?? null);
    req.onerror=()=>reject(req.error||new Error('Could not read NEXUS auth storage.'));
  });
}

async function idbSet(key,value){
  const db=await openAuthDb();
  return await new Promise((resolve,reject)=>{
    const tx=db.transaction(AUTH_STORE_NAME,'readwrite');
    tx.objectStore(AUTH_STORE_NAME).put(value,key);
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error||new Error('Could not save NEXUS auth storage.'));
    tx.onabort=()=>reject(tx.error||new Error('Could not save NEXUS auth storage.'));
  });
}

async function idbRemove(key){
  const db=await openAuthDb();
  return await new Promise((resolve,reject)=>{
    const tx=db.transaction(AUTH_STORE_NAME,'readwrite');
    tx.objectStore(AUTH_STORE_NAME).delete(key);
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error||new Error('Could not clear NEXUS auth storage.'));
    tx.onabort=()=>reject(tx.error||new Error('Could not clear NEXUS auth storage.'));
  });
}

function sessionStorageFallback(){
  return window.sessionStorage;
}

const nexusAuthStorage={
  async getItem(key){
    try{
      const value=await idbGet(key);
      if(value!=null) return value;
    }catch(e){
      console.warn('[NEXUS auth] IndexedDB read unavailable; using sessionStorage.',e);
      try{return sessionStorageFallback().getItem(key);}catch{return null;}
    }

    // One-time migration from the previous localStorage auth store. This
    // prevents existing logged-in admins/customers from being unnecessarily
    // logged out when this version is installed.
    try{
      const legacy=window.localStorage.getItem(key);
      if(legacy!=null){
        try{await idbSet(key,legacy);}catch{}
        try{window.localStorage.removeItem(key);}catch{}
        return legacy;
      }
    }catch{}

    return null;
  },

  async setItem(key,value){
    try{
      await idbSet(key,value);
      // Remove only the old copy. Never write auth tokens back to localStorage.
      try{window.localStorage.removeItem(key);}catch{}
      return;
    }catch(e){
      console.warn('[NEXUS auth] IndexedDB write unavailable; using sessionStorage.',e);
      try{
        sessionStorageFallback().setItem(key,value);
        return;
      }catch(storageError){
        throw storageError;
      }
    }
  },

  async removeItem(key){
    try{await idbRemove(key);}catch{}
    try{window.localStorage.removeItem(key);}catch{}
    try{sessionStorageFallback().removeItem(key);}catch{}
  }
};

export const supabase=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{
  auth:{
    persistSession:true,
    autoRefreshToken:true,
    detectSessionInUrl:true,
    flowType:'pkce',
    storage:nexusAuthStorage,
    storageKey:AUTH_STORAGE_KEY
  }
});

async function saveRecoverySession(session){
  if(!session?.access_token || !session?.refresh_token) return;
  try{
    await nexusAuthStorage.setItem(RECOVERY_STORAGE_KEY,JSON.stringify({
      access_token:session.access_token,
      refresh_token:session.refresh_token,
      expires_at:session.expires_at||null,
      saved_at:Date.now()
    }));
  }catch(e){
    console.warn('[NEXUS auth] Could not save session recovery copy.',e);
  }
}

export async function clearRecoverySession(){
  await nexusAuthStorage.removeItem(RECOVERY_STORAGE_KEY);
  // Clean up the previous recovery key as well.
  await nexusAuthStorage.removeItem(OLD_RECOVERY_STORAGE_KEY);
}

export async function getRecoverySession(){
  try{
    let raw=await nexusAuthStorage.getItem(RECOVERY_STORAGE_KEY);
    if(!raw) raw=await nexusAuthStorage.getItem(OLD_RECOVERY_STORAGE_KEY);
    if(!raw) return null;
    const value=JSON.parse(raw);
    if(!value?.access_token || !value?.refresh_token) return null;
    return value;
  }catch{
    return null;
  }
}

// Keep the recovery copy synchronized with Supabase token refreshes.
supabase.auth.onAuthStateChange((_event,session)=>{
  if(session){
    // Do not block Supabase's auth event pipeline on the recovery write.
    void saveRecoverySession(session);
  }else{
    void clearRecoverySession();
  }
});

export async function restoreNexusSession(){
  // First let Supabase restore its normal persistent IndexedDB session.
  try{
    const {data,error}=await supabase.auth.getSession();
    if(error) throw error;
    if(data?.session){
      await saveRecoverySession(data.session);
      return data.session;
    }
  }catch(e){
    console.warn('[NEXUS auth] Normal session restore failed.',e);
  }

  // Recover from the independent IndexedDB copy if the normal auth restore
  // was interrupted while TrebEdit was backgrounded.
  const recovery=await getRecoverySession();
  if(!recovery) return null;

  try{
    const {data,error}=await supabase.auth.setSession({
      access_token:recovery.access_token,
      refresh_token:recovery.refresh_token
    });
    if(error) throw error;
    if(data?.session){
      await saveRecoverySession(data.session);
      return data.session;
    }
  }catch(e){
    console.warn('[NEXUS auth] Recovery session restore failed.',e);
  }

  // Final attempt: refresh the Supabase session using its persisted refresh token.
  try{
    const {data,error}=await supabase.auth.refreshSession();
    if(error) throw error;
    if(data?.session){
      await saveRecoverySession(data.session);
      return data.session;
    }
  }catch(e){
    console.warn('[NEXUS auth] Token refresh failed.',e);
  }

  return null;
}

export async function currentUser(){
  const session=await restoreNexusSession();
  if(!session) return null;
  const {data:{user},error}=await supabase.auth.getUser();
  if(error) throw error;
  return user||null;
}

export async function signOut(){
  try{localStorage.removeItem('nexus_trusted_device_token_v1');try{localStorage.removeItem('nexus_trusted_device')}catch{};}catch{}
  try{localStorage.removeItem('nexus_pending_login_v1');try{localStorage.removeItem('nexus_login_verification_email')}catch{};}catch{};try{sessionStorage.removeItem('nexus_pending_login_v1');try{sessionStorage.removeItem('nexus_login_verification_email')}catch{};}catch{}
  await clearRecoverySession();
  try{try{sessionStorage.removeItem('nexus_login_verified')}catch{};await supabase.auth.signOut();}finally{location.replace('#/login');}
}

export function money(value,currency='USD'){
  return `${Number(value||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})} ${currency}`.trim();
}

export function escapeHtml(v=''){
  return String(v).replace(/[&<>\'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));
}

export function formatDate(v){
  const d=new Date(v);
  return Number.isNaN(d.getTime())?'—':d.toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
}

export async function profileFor(userId){
  if(!userId) return null;
  const {data,error}=await supabase.rpc('nexus_get_my_profile');
  if(error) throw error;
  const row=Array.isArray(data)?data[0]:data;
  if(!row||row.id!==userId) return null;
  return row;
}

export async function accountForUser(userId){
  const {data,error}=await supabase.from('accounts').select('*').eq('user_id',userId).is('deleted_at',null).limit(1).maybeSingle();
  if(error) throw error;
  return data;
}

export function profileIsActive(p){
  if(!p) return false;

  // The explicit account status is authoritative. Older profile rows can
  // retain is_active=false even after status has been restored to active.
  // Do not send an active or pending customer to unavailable/ because
  // of that stale legacy flag.
  if(p.status==='deactivated') return false;
  if(p.status==='active' || p.status==='pending' || p.status==='frozen') return true;

  // Only use the legacy flag when no recognized status is stored.
  if(typeof p.is_active==='boolean') return p.is_active;
  return true;
}

export function profileIsDeleted(p){return !!p?.deleted_at;}

export async function enforceAccountAccess(user){
  const p=await profileFor(user.id).catch(()=>null);
  if(!p) return {profile:null,account:null,allowed:false};
  if(!profileIsActive(p)||profileIsDeleted(p)) return {profile:p,account:null,allowed:false,reason:'deactivated'};
  const a=await accountForUser(user.id).catch(()=>null);
  return {profile:p,account:a,allowed:true};
}

export async function invokeAdminFunction(action,payload={}){
  const {data,error}=await supabase.functions.invoke('nexus-admin',{
    body:{action,...payload}
  });

  const extractErrorMessage=async(error)=>{
    const fallback='NEXUS admin function failed.';

    const fromValue=value=>{
      if(value==null) return '';
      if(typeof value==='string') return value.trim();
      if(value instanceof Error && value.message) return value.message.trim();
      if(typeof value==='object'){
        const direct=value.error??value.message??value.msg??value.details??value.hint;
        if(typeof direct==='string'&&direct.trim()) return direct.trim();
        if(direct&&typeof direct==='object'){
          const nested=fromValue(direct);
          if(nested) return nested;
        }
      }
      return '';
    };

    // FunctionsHttpError normally exposes the actual HTTP Response in
    // error.context. Read that FIRST so the useful server message is not
    // hidden by the wrapper error object.
    try{
      const context=error?.context;
      if(context){
        if(typeof context.clone==='function'){
          const response=context.clone();
          try{
            const body=await response.json();
            const message=fromValue(body);
            if(message) return message;
          }catch{}
          try{
            const text=await response.text();
            if(text){
              try{
                const body=JSON.parse(text);
                const message=fromValue(body);
                if(message) return message;
              }catch{
                return text.trim();
              }
            }
          }catch{}
        }

        try{
          const body=typeof context.json==='function'?await context.json():null;
          const message=fromValue(body);
          if(message) return message;
        }catch{}

        try{
          const text=typeof context.text==='function'?await context.text():'';
          if(text){
            try{
              const body=JSON.parse(text);
              const message=fromValue(body);
              if(message) return message;
            }catch{
              return text.trim();
            }
          }
        }catch{}
      }
    }catch(parseError){
      console.warn('[NEXUS] Could not read admin Edge Function response:',parseError);
    }

    const direct=fromValue(error);
    if(direct) return direct;

    const status=error?.status ?? error?.context?.status;
    if(status) return `${fallback} HTTP ${status}.`;
    return fallback;
  };

  if(error){
    throw new Error(await extractErrorMessage(error));
  }

  if(data?.error){
    const message=typeof data.error==='string'
      ? data.error
      : (data.error?.message||data.error?.error||JSON.stringify(data.error));
    throw new Error(message||'NEXUS admin function failed.');
  }

  return data;
}

export async function invokeAdminOperations(action,payload={}){
  const {data,error}=await supabase.functions.invoke('nexus-admin-operations',{
    body:{action,...payload}
  });
  if(error) throw error;
  if(data?.error){
    const message=typeof data.error==='string'
      ?data.error
      :(data.error?.message||data.error?.error||JSON.stringify(data.error));
    throw new Error(message||'NEXUS admin operations function failed.');
  }
  return data;
}
