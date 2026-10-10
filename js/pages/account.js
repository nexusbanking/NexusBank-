import { supabase } from '../supabase.js';
import { requireUser, logout, $, nav } from './common.js';

const isAccountRoute = () => {
  const route = (location.hash || '').replace(/^#\/?/, '').split(/[/?]/)[0];
  return route === 'account';
};
const byId = (id) => document.getElementById(id);
const setText = (id, value) => {
  const el = byId(id);
  if (el) el.textContent = value == null || value === '' ? '—' : String(value);
};

const logoutButton = byId('logoutBtn');
if (logoutButton) logoutButton.onclick = logout;
const navElement = byId('nav');
if (navElement) navElement.innerHTML = nav('home');

const runId = (window.__nexusAccountRunId = (window.__nexusAccountRunId || 0) + 1);
const isCurrentRun = () => window.__nexusAccountRunId === runId && isAccountRoute();

window.addEventListener('nexus-account-state', (event) => {
  if (!isCurrentRun()) return;
  const account = event.detail?.account;
  if (account) setText('status', account.status || '—');
});

requireUser(async (user) => {
  if (!isCurrentRun()) return;

  try {
    const [profileResult, accountResult] = await Promise.all([
      supabase.from('profiles').select('full_name,status').eq('id', user.id).maybeSingle(),
      supabase.from('accounts').select('account_number,currency,routing_identifier,routing_number,status')
        .eq('user_id', user.id).is('deleted_at', null).maybeSingle()
    ]);

    // Navigation may replace the account screen while requests are pending.
    if (!isCurrentRun()) return;

    if (profileResult.error) throw profileResult.error;
    if (accountResult.error) throw accountResult.error;

    const profile = profileResult.data;
    const account = accountResult.data;

    setText('email', user.email || '—');
    setText('name', profile?.full_name || '—');
    setText('account', account?.account_number || '—');
    setText('currency', account?.currency || '—');
    setText('routing', account?.routing_number || account?.routing_identifier || '—');
    setText('status', account?.status || profile?.status || '—');
  } catch (error) {
    if (!isCurrentRun()) return;
    console.error('[NEXUS account] Could not load account details:', error);
    setText('status', 'Account details temporarily unavailable');
  }
});
