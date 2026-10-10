import { supabase } from '../supabase.js';
import { requireUser, logout, $, nav } from './common.js';

// This module can finish an async request after the single-page app has navigated
// elsewhere. Only update the DOM while the Add Money route is still active.
const isCurrentPage = () => location.hash.replace(/\?.*$/, '').replace(/\/$/, '') === '#/add-money';
const byId = (id) => document.getElementById(id);
const setText = (id, value) => {
  const el = byId(id);
  if (el) el.textContent = value == null || value === '' ? '—' : String(value);
};

const logoutButton = byId('logoutBtn');
if (logoutButton) logoutButton.onclick = logout;
const navElement = byId('nav');
if (navElement) navElement.innerHTML = nav('deposit');

requireUser(async (u) => {
  try {
    const [{ data: account, error: accountError }, { data: profile, error: profileError }] = await Promise.all([
      supabase.from('accounts').select('*').eq('user_id', u.id).is('deleted_at', null).maybeSingle(),
      supabase.from('profiles').select('full_name').eq('id', u.id).maybeSingle()
    ]);
    if (!isCurrentPage()) return;
    if (accountError) throw accountError;
    if (profileError) console.warn('[NEXUS Add Money] Could not load profile name:', profileError.message);
    if (!account) {
      setText('copyStatus', 'Receiving account details are not available. Please contact Customer Care.');
      return;
    }
    setText('bankName', account.bank_name || 'NEXUS');
    setText('accountName', profile?.full_name || account.full_name || '—');
    setText('accountNumber', account.account_number || '—');
    setText('currency', account.currency || '—');
    setText('routing', account.routing_number || account.routing_identifier || '—');
  } catch (error) {
    console.error('[NEXUS Add Money] Could not load receiving details:', error);
    if (isCurrentPage()) setText('copyStatus', 'Could not load receiving details. Please refresh or contact Customer Care.');
  }
});

document.querySelectorAll('.copy-btn[data-copy]').forEach((button) => {
  button.onclick = async () => {
    if (!isCurrentPage()) return;
    const valueElement = byId(button.dataset.copy);
    const value = valueElement?.textContent?.trim();
    if (!value || value === '—') return;
    const status = byId('copyStatus');
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(value);
      if (status && isCurrentPage()) status.textContent = `Copied ${value}`;
    } catch {
      if (status && isCurrentPage()) status.textContent = 'Copy is unavailable; press and hold the value to copy it.';
    }
  };
});
