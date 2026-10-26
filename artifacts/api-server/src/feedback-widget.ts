export function injectFeedbackWidget(html: string, subdomain: string): string {
  const widget = `
<style id="afro-fb-style">
  #afro-fb-btn{position:fixed;bottom:20px;right:20px;z-index:2147483646;background:linear-gradient(135deg,#d4af37,#b8941f);color:#000;border:none;border-radius:999px;padding:12px 18px;font:600 14px system-ui,-apple-system,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.25);cursor:pointer;display:flex;align-items:center;gap:8px;}
  #afro-fb-btn:hover{transform:translateY(-2px);box-shadow:0 12px 28px rgba(0,0,0,.35);}
  #afro-fb-modal{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:2147483647;display:none;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(4px);}
  #afro-fb-modal.open{display:flex;}
  #afro-fb-card{background:#fff;color:#111;border-radius:14px;max-width:420px;width:100%;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.4);font:14px system-ui,-apple-system,sans-serif;}
  #afro-fb-card h3{margin:0 0 4px;font-size:18px;font-weight:700;color:#111;}
  #afro-fb-card .sub{color:#666;font-size:13px;margin-bottom:14px;}
  #afro-fb-card label{display:block;font-size:12px;font-weight:600;color:#444;margin:10px 0 4px;}
  #afro-fb-card input,#afro-fb-card textarea{width:100%;border:1px solid #ddd;border-radius:8px;padding:10px;font:14px inherit;color:#111;background:#fafafa;box-sizing:border-box;}
  #afro-fb-card textarea{min-height:90px;resize:vertical;}
  #afro-fb-card input:focus,#afro-fb-card textarea:focus{outline:none;border-color:#d4af37;background:#fff;}
  #afro-fb-card .row{display:flex;gap:8px;justify-content:flex-end;margin-top:14px;}
  #afro-fb-card button{border:none;border-radius:8px;padding:10px 16px;font:600 14px inherit;cursor:pointer;}
  #afro-fb-cancel{background:#f0f0f0;color:#444;}
  #afro-fb-send{background:#d4af37;color:#000;}
  #afro-fb-send:disabled{opacity:.6;cursor:not-allowed;}
  #afro-fb-pick{background:#f7f3e6;color:#7a5d00;border:1px dashed #d4af37 !important;width:100%;margin-top:6px;padding:8px !important;font-size:12px !important;}
  #afro-fb-target{display:none;background:#fff8e1;border:1px solid #d4af37;color:#7a5d00;padding:6px 10px;border-radius:6px;font-size:12px;margin-top:6px;word-break:break-all;}
  #afro-fb-target.show{display:block;}
  #afro-fb-thanks{display:none;text-align:center;padding:8px 0;}
  #afro-fb-thanks.show{display:block;}
  #afro-fb-form.hide{display:none;}
  .afro-fb-hover{outline:3px dashed #d4af37 !important;outline-offset:2px;cursor:crosshair !important;}
  @media (max-width:480px){#afro-fb-btn{padding:10px 14px;font-size:13px;bottom:14px;right:14px;}}
</style>
<button id="afro-fb-btn" type="button" aria-label="Leave feedback">
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
  Leave feedback
</button>
<div id="afro-fb-modal" role="dialog" aria-modal="true">
  <div id="afro-fb-card">
    <div id="afro-fb-form">
      <h3>Help improve this site</h3>
      <div class="sub">Your feedback goes straight to the owner.</div>
      <label for="afro-fb-name">Your name (optional)</label>
      <input id="afro-fb-name" type="text" maxlength="80" placeholder="e.g. Amina"/>
      <label for="afro-fb-msg">What would you change or add?</label>
      <textarea id="afro-fb-msg" maxlength="2000" placeholder="e.g. Make the booking button bigger and add WhatsApp."></textarea>
      <button id="afro-fb-pick" type="button">📍 Click on a section to point it out (optional)</button>
      <div id="afro-fb-target"></div>
      <div class="row">
        <button id="afro-fb-cancel" type="button">Cancel</button>
        <button id="afro-fb-send" type="button">Send</button>
      </div>
    </div>
    <div id="afro-fb-thanks">
      <h3 style="color:#0a8a3a;">✅ Thank you!</h3>
      <div class="sub">The owner will see your message.</div>
      <div class="row" style="justify-content:center;"><button id="afro-fb-close" type="button" style="background:#d4af37;color:#000;">Close</button></div>
    </div>
  </div>
</div>
<script>(function(){
  try{
    var p = new URLSearchParams(location.search);
    if(p.get('feedback') !== '1') return;
    var SUBDOMAIN = ${JSON.stringify(subdomain)};
    var btn=document.getElementById('afro-fb-btn');
    var modal=document.getElementById('afro-fb-modal');
    var form=document.getElementById('afro-fb-form');
    var thanks=document.getElementById('afro-fb-thanks');
    var sendBtn=document.getElementById('afro-fb-send');
    var cancelBtn=document.getElementById('afro-fb-cancel');
    var closeBtn=document.getElementById('afro-fb-close');
    var pickBtn=document.getElementById('afro-fb-pick');
    var targetBox=document.getElementById('afro-fb-target');
    var nameI=document.getElementById('afro-fb-name');
    var msgI=document.getElementById('afro-fb-msg');
    var selector=null;
    function open(){modal.classList.add('open');form.classList.remove('hide');thanks.classList.remove('show');}
    function close(){modal.classList.remove('open');selector=null;targetBox.classList.remove('show');targetBox.textContent='';msgI.value='';nameI.value='';}
    btn.addEventListener('click',open);
    cancelBtn.addEventListener('click',close);
    closeBtn && closeBtn.addEventListener('click',close);
    modal.addEventListener('click',function(e){if(e.target===modal)close();});
    function buildSelector(el){
      if(!el || el===document.body) return 'body';
      if(el.id) return '#'+el.id;
      var path=[];
      while(el && el.nodeType===1 && el!==document.body && path.length<4){
        var name=el.tagName.toLowerCase();
        if(el.className && typeof el.className==='string'){
          var c=el.className.trim().split(/\\s+/)[0];
          if(c) name+='.'+c;
        }
        path.unshift(name);
        el=el.parentElement;
      }
      return path.join(' > ');
    }
    var picking=false, lastHover=null;
    function hover(e){if(!picking)return;if(lastHover)lastHover.classList.remove('afro-fb-hover');lastHover=e.target;e.target.classList.add('afro-fb-hover');}
    function pickClick(e){if(!picking)return;e.preventDefault();e.stopPropagation();selector=buildSelector(e.target);var preview=(e.target.innerText||e.target.alt||'').trim().slice(0,60);targetBox.textContent='Picked: '+selector+(preview?' — "'+preview+'"':'');targetBox.classList.add('show');stopPick();open();}
    function startPick(){picking=true;modal.classList.remove('open');document.body.style.cursor='crosshair';document.addEventListener('mouseover',hover,true);document.addEventListener('click',pickClick,true);}
    function stopPick(){picking=false;document.body.style.cursor='';if(lastHover){lastHover.classList.remove('afro-fb-hover');lastHover=null;}document.removeEventListener('mouseover',hover,true);document.removeEventListener('click',pickClick,true);}
    pickBtn.addEventListener('click',startPick);
    sendBtn.addEventListener('click',async function(){
      var msg=(msgI.value||'').trim();
      if(msg.length<2){msgI.focus();msgI.style.borderColor='#c33';return;}
      sendBtn.disabled=true;sendBtn.textContent='Sending…';
      try{
        var r=await fetch('/api/feedback/'+SUBDOMAIN,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({visitorName:(nameI.value||'').trim()||'Anonymous',message:msg,elementSelector:selector,pageUrl:location.pathname+location.search})});
        if(!r.ok)throw new Error('http '+r.status);
        form.classList.add('hide');thanks.classList.add('show');
      }catch(err){
        sendBtn.disabled=false;sendBtn.textContent='Send';
        alert('Could not send. Please check your connection and try again.');
      }
    });
  }catch(e){console.warn('[afro-feedback]',e);}
})();</script>
`;
  if (html.includes("</body>")) return html.replace("</body>", widget + "</body>");
  return html + widget;
}
