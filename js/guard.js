import {supabase,profileFor} from './supabase.js';
const page=document.body.dataset.page;
const {data:{subscription}}=supabase.auth.onAuthStateChange(async(_e,session)=>{
 if(!session){location.replace('#/login');return}
 const p=await profileFor(session.user.id).catch(()=>null);
 if(!p){location.replace('#/login');return}
 if(p.status==='deactivated'||p.deleted_at){location.replace('#/unavailable');return}
 if(page==='admin'&&p.role!=='admin'){location.replace('#/dashboard');return}
 if(page==='customer'&&p.role==='admin'){location.replace('#/admin');return}
 document.querySelectorAll('[data-user-email]').forEach(e=>e.textContent=session.user.email||'');
 document.documentElement.classList.add('app-ready');
});
window.addEventListener('beforeunload',()=>subscription.unsubscribe());
