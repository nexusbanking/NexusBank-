/*
 * NEXUS trusted-device storage.
 *
 * Trusted-device tokens are stored in IndexedDB instead of localStorage so
 * Android/TrebEdit browsers with a small localStorage quota do not fail after
 * a successful login verification. localStorage is used only as a fallback
 * when IndexedDB is genuinely unavailable.
 */

const DB_NAME='nexus-device-storage-v1';
const STORE_NAME='kv';
const DEVICE_KEY='trusted-device';

let dbPromise=null;

function openDb(){
  if(dbPromise)return dbPromise;
  dbPromise=new Promise((resolve,reject)=>{
    if(!('indexedDB' in window)){
      reject(new Error('IndexedDB is unavailable.'));
      return;
    }
    const request=indexedDB.open(DB_NAME,1);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains(STORE_NAME))db.createObjectStore(STORE_NAME);
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error('Could not open trusted-device storage.'));
  });
  return dbPromise;
}

async function getIdb(){
  const db=await openDb();
  return await new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE_NAME,'readonly');
    const req=tx.objectStore(STORE_NAME).get(DEVICE_KEY);
    req.onsuccess=()=>resolve(req.result??null);
    req.onerror=()=>reject(req.error||new Error('Could not read trusted-device storage.'));
  });
}

async function setIdb(value){
  const db=await openDb();
  return await new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE_NAME,'readwrite');
    tx.objectStore(STORE_NAME).put(value,DEVICE_KEY);
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error||new Error('Could not save trusted-device storage.'));
    tx.onabort=()=>reject(tx.error||new Error('Could not save trusted-device storage.'));
  });
}

async function removeIdb(){
  try{
    const db=await openDb();
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE_NAME,'readwrite');
      tx.objectStore(STORE_NAME).delete(DEVICE_KEY);
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error||new Error('Could not clear trusted-device storage.'));
      tx.onabort=()=>reject(tx.error||new Error('Could not clear trusted-device storage.'));
    });
  }catch{}
}

export async function getTrustedDevice(){
  try{
    const value=await getIdb();
    if(value?.email&&value?.token)return value;
  }catch{}

  try{
    const value=JSON.parse(localStorage.getItem('nexus_trusted_device')||'null');
    if(value?.email&&value?.token)return value;
  }catch{}

  return null;
}

export async function setTrustedDevice(value){
  try{
    await setIdb(value);
    // Remove the old localStorage copy. Do not write a new token there.
    try{localStorage.removeItem('nexus_trusted_device');}catch{}
    return true;
  }catch(error){
    console.warn('[NEXUS trusted device] IndexedDB unavailable; using localStorage fallback.',error);
    try{
      localStorage.setItem('nexus_trusted_device',JSON.stringify(value));
      return true;
    }catch(storageError){
      console.error('[NEXUS trusted device] Could not save trusted device.',storageError);
      return false;
    }
  }
}

export async function clearTrustedDevice(){
  await removeIdb();
  try{localStorage.removeItem('nexus_trusted_device');}catch{}
  try{localStorage.removeItem('nexus_trusted_device_token_v1');}catch{}
}
