import {supabase,escapeHtml,formatDate} from '../supabase.js'; import {requireUser,logout,$,nav,toast,wireHeaderBadge,accountFor} from './common.js'; $('logoutBtn').onclick=logout; $('nav').innerHTML=nav('home'); function msg(id,text,type=''){ const e=$(id); e.style.display='block'; e.className=`notice ${type?'notice-'+type:''}`; e.textContent=text; } function syncNetwork(){ const a=$('sendAsset').value; const n=$('sendNetwork'); [...n.options].forEach(o=>{ o.hidden=a==='BTC' ?o.value!=='BTC' :o.value==='BTC'; }); if(a==='BTC'){ n.value='BTC'; }else if(n.value==='BTC'){ n.value='TRC20'; } } $('sendAsset').onchange=syncNetwork; async function refresh(u){ const a=await accountFor(u.id); if(!a)return; const b=a.crypto_balances||{}; $('btc').textContent= Number(b.BTC?.balance||0).toFixed(8); $('usdt').textContent= Number(b.USDT?.balance||0).toFixed(2); const wallets=a.crypto_wallets||{};   const walletEntries=Object.values(wallets);

  $('wallets').innerHTML=
    walletEntries.length
      ?walletEntries.map((w,i)=>{
        const address=String(w.address||'').trim();
        return `
          <div class="list-item wallet-address-card">
            <div class="wallet-address-heading">
              <div class="wallet-asset-details">
                <strong>${escapeHtml(w.asset||'')}</strong>
                <div class="muted">${escapeHtml(w.network||'')}</div>
                ${w.label?`<div class="muted wallet-label">${escapeHtml(w.label)}</div>`:''}
              </div>
            </div>

            <div class="wallet-address-block">
              <div class="wallet-address-label">Wallet address</div>
              <code class="wallet-address-text">${escapeHtml(address||'Not configured')}</code>
              ${address?`
                <button type="button" class="btn btn-primary wallet-copy-btn" data-wallet-copy="${i}">
                  Copy address
                </button>
                <span class="wallet-copy-feedback" data-wallet-feedback="${i}" aria-live="polite"></span>
              `:''}
            </div>
          </div>
        `;
      }).join('')
      :'<div class="hint">No provider-issued crypto wallets have been configured yet.</div>';

  // Copy the exact address for the selected wallet without changing wallet data.
  $('wallets').querySelectorAll('[data-wallet-copy]').forEach(button=>{
    button.onclick=async()=>{
      const index=Number(button.dataset.walletCopy);
      const address=String(walletEntries[index]?.address||'').trim();
      const feedback=$('wallets').querySelector(`[data-wallet-feedback="${index}"]`);
      if(!address)return;

      try{
        if(navigator.clipboard && window.isSecureContext){
          await navigator.clipboard.writeText(address);
        }else{
          const temp=document.createElement('textarea');
          temp.value=address;
          temp.setAttribute('readonly','');
          temp.style.position='fixed';
          temp.style.opacity='0';
          document.body.appendChild(temp);
          temp.select();
          const copied=document.execCommand('copy');
          temp.remove();
          if(!copied)throw Error('Copy is not supported by this browser.');
        }
        button.textContent='Copied!';
        if(feedback)feedback.textContent='Address copied to clipboard.';
        setTimeout(()=>{button.textContent='Copy address';},1800);
      }catch(copyError){
        if(feedback)feedback.textContent='Copy failed. Press and hold the address to copy it.';
      }
    };
  });
const {data:tx}=await supabase .from('crypto_transactions') .select('*') .eq('user_id',u.id) .order('created_at',{ascending:false}) .limit(30); $('activity').innerHTML= tx?.length ?tx.map(t=>` <div class="list-item"> <div> <strong>${escapeHtml(t.type||'Crypto transaction')}</strong> <div class="muted"> ${formatDate(t.created_at)} · ${escapeHtml(t.network||'')} </div> </div> <div style="text-align:right"> <strong> ${Number(t.amount||0)} ${escapeHtml(t.asset||'')} </strong> <br> <span class="status-pill ${t.status==='pending'?'pending':''}"> ${escapeHtml(t.status||'pending')} </span> </div> </div> `).join('') :'<div class="hint">No crypto activity yet.</div>'; return a; } /* ============================================================ CRYPTO CONVERSION — EXISTING FUNCTION PRESERVED ============================================================ */ $('convertBtn').onclick=async()=>{ try{ const amount=Number($('cryptoAmount').value); const pin=$('cryptoPin').value.trim(); if(!amount||amount<=0) throw Error('Enter a valid amount.'); if(!/^\d{4,6}$/.test(pin)) throw Error('Enter your 4–6 digit transaction PIN.'); $('convertBtn').disabled=true; const {data,error}=await supabase.rpc( 'submit_crypto_conversion', { p_direction:$('direction').value, p_asset:$('asset').value, p_amount:amount, p_pin:pin } ); if(error)throw error; if(!data?.success) throw Error(data?.message||'Conversion failed.'); msg( 'cryptoMsg', data.message||'Crypto conversion completed.', 'ok' ); $('cryptoAmount').value=''; $('cryptoPin').value=''; await refresh(window.nexusUser); }catch(e){ msg( 'cryptoMsg', e.message||'Conversion failed.', 'error' ); }finally{ $('convertBtn').disabled=false; } }; /* ============================================================ CRYPTO OTP MODAL ============================================================ */ function createCryptoOtpModal(){ let modal=document.getElementById('nexusCryptoOtpModal'); if(modal)return modal; modal=document.createElement('div'); modal.id='nexusCryptoOtpModal'; modal.style.cssText=` position:fixed; inset:0; background:rgba(0,0,0,.72); display:flex; align-items:center; justify-content:center; padding:20px; z-index:99999; `; modal.innerHTML=` <div style=" width:100%; max-width:430px; background:#111827; border-radius:18px; padding:24px; box-shadow:0 20px 60px rgba(0,0,0,.45); color:#fff; "> <div style=" font-size:22px; font-weight:700; margin-bottom:10px; ">Verify Crypto Transfer</div> <div id="nexusCryptoOtpMessage" style=" color:#cbd5e1; line-height:1.55; margin-bottom:20px; "> A 6-digit verification code was sent to your registered email. </div> <input id="nexusCryptoOtpInput" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="Enter 6-digit code" style=" width:100%; box-sizing:border-box; padding:14px; border-radius:10px; border:1px solid #374151; background:#0b1220; color:#fff; font-size:20px; text-align:center; letter-spacing:6px; outline:none; margin-bottom:15px; " /> <div style="display:flex;gap:10px;"> <button type="button" id="nexusCryptoOtpCancel" style=" flex:1;padding:13px;border:0;border-radius:10px; background:#374151;color:#fff;font-weight:600; " >Cancel</button> <button type="button" id="nexusCryptoOtpVerify" style=" flex:1;padding:13px;border:0;border-radius:10px; background:#2563eb;color:#fff;font-weight:600; " >Verify Code</button> </div> <div id="nexusCryptoOtpError" style=" display:none;color:#fca5a5;margin-top:15px;text-align:center; "></div> </div> `; document.body.appendChild(modal); return modal; } function openCryptoOtpModal(challengeId,asset){ const modal=createCryptoOtpModal(); const input=document.getElementById('nexusCryptoOtpInput'); const verifyBtn=document.getElementById('nexusCryptoOtpVerify'); const cancelBtn=document.getElementById('nexusCryptoOtpCancel'); const errorBox=document.getElementById('nexusCryptoOtpError'); const message=document.getElementById('nexusCryptoOtpMessage'); message.textContent= 'A 6-digit verification code was sent to your registered email. Enter the code below to complete your crypto transfer.'; errorBox.style.display='none'; errorBox.textContent=''; input.value=''; modal.style.display='flex'; setTimeout(()=>input.focus(),100); cancelBtn.onclick=()=>{ modal.style.display='none'; verifyBtn.disabled=false; cancelBtn.disabled=false; verifyBtn.textContent='Verify Code'; input.value=''; }; verifyBtn.onclick=async()=>{ const code=input.value.trim(); if(!/^\d{6}$/.test(code)){ errorBox.textContent='Enter the 6-digit verification code.'; errorBox.style.display='block'; input.focus(); return; } verifyBtn.disabled=true; cancelBtn.disabled=true; errorBox.style.display='none'; verifyBtn.textContent='Verifying...'; try{ const {data,error}= await supabase.functions.invoke( 'nexus-crypto-otp', { body:{ action:'verify_otp', challenge_id:challengeId, code:code } } ); if(error){ console.error('[NEXUS CRYPTO OTP] Verification request error:',error); let serverMessage= error?.message||'Crypto verification failed.'; try{ if(error?.context){ const responseData=await error.context.clone().json(); console.error('[NEXUS CRYPTO OTP] Server response:',responseData); if(responseData?.message) serverMessage=responseData.message; if(responseData?.code) console.error('[NEXUS CRYPTO OTP] Server error code:',responseData.code); } }catch(parseError){ console.warn('[NEXUS CRYPTO OTP] Could not read server error:',parseError); } throw Error(serverMessage); } if(!data?.success){ throw Error(data?.message||'Crypto verification failed.'); } modal.style.display='none'; verifyBtn.disabled=false; cancelBtn.disabled=false; verifyBtn.textContent='Verify Code'; const selectedAsset=String(asset||'crypto').toUpperCase(); if(data.status==='pending'){ msg( 'sendMsg', `${selectedAsset} transfer is pending.`, 'ok' ); }else{ msg( 'sendMsg', `${selectedAsset} sent successfully.`, 'ok' ); } $('sendAmount').value=''; $('sendPin').value=''; $('destination').value=''; await refresh(window.nexusUser); }catch(e){ errorBox.textContent=e?.message||'Crypto verification failed.'; errorBox.style.display='block'; verifyBtn.disabled=false; cancelBtn.disabled=false; verifyBtn.textContent='Verify Code'; } }; } /* ============================================================ SEND CRYPTO — PIN → EMAIL OTP → VERIFY ============================================================ */ $('sendCryptoBtn').onclick=async()=>{ try{ const amount=Number($('sendAmount').value); const pin=$('sendPin').value.trim(); const destination=$('destination').value.trim(); const asset=$('sendAsset').value; const network=$('sendNetwork').value; if(!amount||amount<=0||!destination){ throw Error('Enter a valid amount and destination.'); } if(!/^\d{4,6}$/.test(pin)){ throw Error('Enter your 4–6 digit transaction PIN.'); } if(asset==='BTC'&&network!=='BTC'){ throw Error('BTC must use the BTC network.'); } if(asset==='USDT'&&network!=='TRC20'){ throw Error('USDT must use the TRC20 network.'); } $('sendCryptoBtn').disabled=true; msg('sendMsg','Verifying your transaction PIN...',''); const {data,error}= await supabase.functions.invoke( 'nexus-crypto-otp', { body:{ action:'request_otp', asset:asset, network:network, amount:amount, destination:destination, pin:pin } } ); if(error){ console.error('[NEXUS CRYPTO] OTP request error:',error); let serverMessage= error?.message||'Crypto verification request failed.'; try{ if(error?.context){ const responseData=await error.context.clone().json(); console.error('[NEXUS CRYPTO] Server response:',responseData); if(responseData?.message) serverMessage=responseData.message; if(responseData?.code) console.error('[NEXUS CRYPTO] Server error code:',responseData.code); } }catch(parseError){ console.warn('[NEXUS CRYPTO] Could not read server error:',parseError); } throw Error(serverMessage); } if(!data?.success){ throw Error(data?.message||'Could not start crypto verification.'); } const challengeId=data.challenge_id; if(!challengeId){ throw Error('Crypto verification request was created without a challenge ID.'); } msg( 'sendMsg', 'A 6-digit verification code has been sent to your registered email.', 'ok' ); openCryptoOtpModal(challengeId,asset); }catch(e){ console.error('[NEXUS CRYPTO] Send error:',e); msg( 'sendMsg', e?.message||'Crypto transaction failed.', 'error' ); }finally{ $('sendCryptoBtn').disabled=false; } }; requireUser(async u=>{ window.nexusUser=u; await refresh(u); await wireHeaderBadge(u.id); syncNetwork(); }); 