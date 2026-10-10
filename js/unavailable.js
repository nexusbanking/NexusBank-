
import {supabase} from './supabase.js';
const care=document.querySelector('#care');
const careBtn=document.querySelector('#careBtn');
const escapeHtml=(value)=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

async function loadCustomerCare(){
  let email='support@example.com';
  let whatsapp='';
  try{
    // Use the same RPC as the working customer-side support page and read
    // from public.customer_care_settings, which the Admin panel updates.
    const {data,error}=await supabase.rpc('get_customer_care_settings');
    if(error) throw error;
    if(data && typeof data==='object'){
      email=String(data.customer_care_email||email).trim();
      whatsapp=String(data.customer_care_whatsapp||'').trim();
    }
  }catch(error){
    console.warn('[NEXUS unavailable] Customer Care settings could not be loaded:',error);
  }
  const digits=whatsapp.replace(/\D/g,'');
  // SPA navigation can replace the page while this RPC is pending.
  if (!document.body || document.body.dataset.page !== 'customer' || !document.getElementById('care') || !document.getElementById('careBtn')) return;
  const currentCare=document.getElementById('care');
  const currentCareBtn=document.getElementById('careBtn');
  currentCare.innerHTML=`<strong>Customer Care</strong><br>Email: ${escapeHtml(email||'Not configured')}<br>WhatsApp: ${escapeHtml(whatsapp||'Not configured')}`;
  currentCareBtn.href=digits?`https://wa.me/${digits}`:`mailto:${email||'support@example.com'}`;
  currentCareBtn.target='_blank';
  currentCareBtn.rel='noopener noreferrer';
}
loadCustomerCare();
const signOutButton=document.querySelector('#signOut');
if(signOutButton) signOutButton.onclick=async()=>{await supabase.auth.signOut();location.replace('#/login')};
