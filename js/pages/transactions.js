import {supabase,money,formatDate,escapeHtml} from '../supabase.js';
import {requireUser,logout,$,nav,wireHeaderBadge} from './common.js';

const transactionsRunId = (window.__nexusTransactionsRunId = (window.__nexusTransactionsRunId || 0) + 1);
const isCurrentTransactionsRun = () => window.__nexusTransactionsRunId === transactionsRunId;

const isTransactionsRoute = () => {
  const route = (location.hash || '').replace(/^#\/?/, '').split(/[/?]/)[0];
  return route === 'transactions';
};

const setText = (id, value) => {
  const element = $(id);
  if (element) element.textContent = value;
};

const logoutButton = $('logoutBtn');
if (logoutButton) logoutButton.onclick = logout;

const navElement = $('nav');
if (navElement) navElement.innerHTML = nav('history');

function receipt(t) {
  // The user may have navigated away while a transaction query was pending.
  if (!isTransactionsRoute() || !isCurrentTransactionsRun()) return;
  const receiptElement = $('receipt');
  const modal = $('receiptModal');
  if (!receiptElement || !modal || !t) return;

  const meta = t.metadata || {};
  receiptElement.innerHTML = `<div class="receipt"><div style="text-align:center"><h2>NEXUS Transaction Receipt</h2><div class="status-pill ${t.status==='pending'?'pending':''}">${escapeHtml(t.status||'completed')}</div></div><div class="receipt-row"><span>Date</span><strong>${formatDate(t.display_transaction_at||t.created_at)}</strong></div><div class="receipt-row"><span>Type</span><strong>${escapeHtml(String(t.type||'—').replace(/_/g,' '))}</strong></div><div class="receipt-row"><span>Description</span><strong>${escapeHtml(t.description||'—')}</strong></div>${meta.bank_name?`<div class="receipt-row"><span>Bank</span><strong>${escapeHtml(meta.bank_name)}</strong></div>`:''}${meta.recipient_name?`<div class="receipt-row"><span>Recipient</span><strong>${escapeHtml(meta.recipient_name)}</strong></div>`:''}<div class="receipt-row"><span>Amount</span><strong>${money(Math.abs(t.amount),t.currency)}</strong></div><div class="receipt-row"><span>Reference</span><strong>${escapeHtml(t.reference||t.id)}</strong></div></div>`;
  modal.classList.add('show');
}

const closeReceipt = $('closeReceipt');
if (closeReceipt) closeReceipt.onclick = () => {
  const modal = $('receiptModal');
  if (modal) modal.classList.remove('show');
};

requireUser(async u => {
  // This module can finish an async query after the SPA has moved to another
  // route. Only update DOM elements while the transactions screen is active.
  if (!isTransactionsRoute() || !isCurrentTransactionsRun()) return;

  const {data:a, error:accountError} = await supabase
    .from('accounts').select('id').eq('user_id',u.id)
    .is('deleted_at',null).maybeSingle();

  if (!isTransactionsRoute() || !isCurrentTransactionsRun()) return;
  const rows = $('rows');
  if (!rows) return;

  if (accountError) {
    rows.innerHTML = '<div class="notice notice-error">Account details are temporarily unavailable. Please try again.</div>';
    console.warn('[NEXUS transactions] Account lookup failed:', accountError);
    return;
  }
  if (!a) {
    rows.innerHTML = '<div class="hint">No account was found for this profile.</div>';
    return;
  }

  rows.innerHTML = '<div class="hint">Loading…</div>';
  const {data,error} = await supabase.from('transactions').select('*')
    .eq('account_id',a.id)
    .limit(500);

  if (!isTransactionsRoute() || !isCurrentTransactionsRun()) return;
  const currentRows = $('rows');
  if (!currentRows) return;

  if (error) {
    currentRows.innerHTML = '<div class="notice notice-error">Transaction history is temporarily unavailable.</div>';
    console.warn('[NEXUS transactions] Transaction lookup failed:', error);
    return;
  }

  const dataRows = (data || []).sort((left,right)=>{
    const leftTime=Date.parse(left.display_transaction_at||left.created_at||0)||0;
    const rightTime=Date.parse(right.display_transaction_at||right.created_at||0)||0;
    return rightTime-leftTime;
  });
  currentRows.innerHTML = dataRows.length ? dataRows.map(t =>
    `<button class="list-item" style="text-align:left;cursor:pointer" data-id="${t.id}"><div><strong>${escapeHtml(t.description||t.type||'Transaction')}</strong><div class="muted">${formatDate(t.display_transaction_at||t.created_at)} · ${escapeHtml(t.reference||'')}</div></div><div class="amount-col"><strong class="${['deposit','credit','received'].includes(t.type)?'positive':'negative'}">${['deposit','credit','received'].includes(t.type)?'+':'−'}${money(Math.abs(t.amount),t.currency)}</strong><br><span class="status-pill ${t.status==='pending'?'pending':''}">${escapeHtml(t.status||'completed')}</span></div></button>`
  ).join('') : '<div class="hint">No transactions yet.</div>';

  currentRows.querySelectorAll('[data-id]').forEach(button => {
    button.onclick = () => receipt(dataRows.find(item => String(item.id) === button.dataset.id));
  });

  const target = (location.hash || '').replace(/^#\/?transactions\/?/, '');
  if (target) {
    let decodedTarget = target;
    try { decodedTarget = decodeURIComponent(target); } catch {}
    const transaction = dataRows.find(item => String(item.id) === decodedTarget);
    if (transaction) receipt(transaction);
  }

  try {
    if (isTransactionsRoute()) await wireHeaderBadge(u.id);
  } catch (error) {
    console.warn('[NEXUS transactions] Header notification badge could not be refreshed:', error);
  }
});
