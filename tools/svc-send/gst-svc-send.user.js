// ==UserScript==
// @name         GST 대시보드로 보내기 (SVC)
// @namespace    https://gstcsglobal-cloud.github.io/
// @version      1.0
// @description  회사 SVC 화면에서 받은 수선·자재실적 엑셀을 대시보드 업로드 화면으로 넘긴다. 적재는 대시보드에서 사람이 확인하고 누른다.
// @match        *://*/*
// @run-at       document-start
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// ==/UserScript==

/* 왜 이렇게 짰나 (tools/svc-send/README.md 에 사용법)
   · 회사 주소를 이 파일에 적지 않는다 — 저장소가 공개다. 「이 사이트에서 켜기」(Tampermonkey 메뉴)로 고른 사이트에서만 돈다.
   · 로그인은 하지 않는다 — 이미 로그인해 둔 그 탭 안에서 돈다. 아이디·비밀번호를 읽지도 저장하지도 않는다.
   · 파일을 «건네기만» 한다 — 검사·열 맵핑·넣는 방식·적재는 대시보드 업로드 화면 한 벌이 한다(두 벌이면 숫자가 갈린다).
   · SVC 의 엑셀 단추를 누르면 그 파일을 «잡아» 두고(브라우저 안에서 만들어지는 파일일 때), 못 잡으면 받은 파일을 끌어다 놓는다. */
(function () {
  'use strict';
  const DASH = 'https://gstcsglobal-cloud.github.io';
  const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const host = location.host;
  const sites = () => { try { return JSON.parse(GM_getValue('sites', '[]')); } catch (e) { return []; } };
  const on = sites().indexOf(host) >= 0;

  GM_registerMenuCommand(on ? '이 사이트에서 «대시보드로 보내기» 끄기' : '이 사이트에서 «대시보드로 보내기» 켜기', () => {
    const a = sites().filter(h => h !== host); if (!on) a.push(host);
    GM_setValue('sites', JSON.stringify(a)); location.reload();
  });
  if (!on) return;

  /* ── 받은 파일 잡기 — SVC 가 브라우저 안에서 파일을 만들어 내려받게 하는 경우(blob) ── */
  const XL = /spreadsheet|excel|ms-excel|csv|octet-stream/i;
  let caught = null;                     // {file, at}
  const blobOf = new Map();               // blob URL → Blob
  try {
    const mk = W.URL.createObjectURL;
    W.URL.createObjectURL = function (o) {
      const u = mk.apply(this, arguments);
      try { if (o instanceof W.Blob && o.size > 0 && XL.test(o.type || 'application/octet-stream')) blobOf.set(u, o); } catch (e) {}
      return u;
    };
    const ck = W.HTMLAnchorElement.prototype.click;
    W.HTMLAnchorElement.prototype.click = function () {
      try { grab(this); } catch (e) {}
      return ck.apply(this, arguments);
    };
    W.document.addEventListener('click', e => { const a = e.target && e.target.closest && e.target.closest('a[download]'); if (a) try { grab(a); } catch (er) {} }, true);
  } catch (e) { console.warn('[GST] 파일 잡기를 걸지 못했습니다 — 끌어다 놓기로 쓰세요', e); }
  function grab(a) {
    const b = blobOf.get(a.href); if (!b) return;
    let name = a.getAttribute('download') || '';
    if (!/\.(xlsx|xlsm|xls|csv)$/i.test(name)) name = (name || 'svc_export') + (/csv/i.test(b.type) ? '.csv' : '.xlsx');
    caught = { file: new File([b], name, { type: b.type }), at: Date.now() };
    draw();
  }

  /* ── 화면 오른쪽 아래 작은 판 ── */
  let box, picked = null;
  function el(h) { const d = document.createElement('div'); d.innerHTML = h; return d.firstElementChild; }
  function draw() {
    if (!box) return;
    const f = picked || (caught && Date.now() - caught.at < 30 * 60 * 1000 ? caught.file : null);
    box.querySelector('[data-f]').innerHTML = f
      ? '보낼 파일: <b>' + esc(f.name) + '</b> (' + Math.max(1, Math.round(f.size / 1024)).toLocaleString() + 'KB)'
      : 'SVC 에서 엑셀을 받으면 여기에 잡힙니다.<br>안 잡히면 받은 파일을 이 상자에 끌어다 놓으세요.';
    box.querySelector('[data-go]').disabled = !f;
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function mount() {
    if (box || !document.body) return;
    box = el('<div id="gstSvcSend" style="position:fixed;right:16px;bottom:16px;z-index:2147483646;width:300px;background:#fff;color:#1d2433;'
      + 'border:1px solid #d0d5dd;border-radius:12px;box-shadow:0 8px 24px rgba(16,24,40,.18);font:13px/1.55 \'Malgun Gothic\',sans-serif;padding:12px 14px">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><b>GST 대시보드로 보내기</b>'
      + '<span data-x style="cursor:pointer;color:#98a2b3">✕</span></div>'
      + '<label style="font-size:12px;color:#5b6576">어느 표에 <select data-t style="margin-left:4px"><option value="wk">수선실적</option><option value="mat">자재실적</option></select></label>'
      + '<div data-f style="margin:8px 0;padding:10px;border:1px dashed #98a2b3;border-radius:8px;font-size:12px;color:#5b6576"></div>'
      + '<input type="file" data-i accept=".xlsx,.xlsm,.xls,.csv" style="display:none">'
      + '<div style="display:flex;gap:6px"><button data-p style="flex:1;padding:7px;border:1px solid #d0d5dd;border-radius:8px;background:#fff;cursor:pointer">파일 고르기</button>'
      + '<button data-go style="flex:1.4;padding:7px;border:0;border-radius:8px;background:#2F6FED;color:#fff;font-weight:700;cursor:pointer">대시보드로 보내기</button></div>'
      + '<div data-m style="margin-top:6px;font-size:11.5px;color:#5b6576"></div></div>');
    document.body.appendChild(box);
    const zone = box.querySelector('[data-f]'), inp = box.querySelector('[data-i]');
    try { box.querySelector('[data-t]').value = GM_getValue('tbl', 'wk'); } catch (e) {}
    box.querySelector('[data-t]').onchange = e => GM_setValue('tbl', e.target.value);
    box.querySelector('[data-x]').onclick = () => { box.style.display = 'none'; };
    box.querySelector('[data-p]').onclick = () => inp.click();
    inp.onchange = () => { if (inp.files[0]) { picked = inp.files[0]; draw(); } };
    zone.ondragover = e => { e.preventDefault(); zone.style.background = '#eef4ff'; };
    zone.ondragleave = () => { zone.style.background = ''; };
    zone.ondrop = e => { e.preventDefault(); zone.style.background = ''; const f = e.dataTransfer.files[0]; if (f) { picked = f; draw(); } };
    box.querySelector('[data-go]').onclick = send;
    draw();
  }

  /* ── 보내기 — 업로드 화면을 새 창으로 열고, «준비됐다»가 오면 그 창에만 파일을 건넨다 ── */
  function send() {
    const f = picked || (caught && caught.file); if (!f) return;
    const rid = box.querySelector('[data-t]').value;
    const msg = box.querySelector('[data-m]');
    const win = window.open(DASH + '/upload/?from=ext&rid=' + rid, 'gstUploadSvc');   // 단추 누름 안에서 열어야 팝업이 안 막힌다
    if (!win) { msg.textContent = '새 창이 막혔습니다 — 이 사이트의 팝업을 허용해 주세요.'; return; }
    msg.textContent = '대시보드를 여는 중… (로그인이 필요하면 그 창에서 로그인하세요)';
    let sent = false;
    const onMsg = e => {
      if (e.origin !== DASH || e.source !== win || !e.data) return;
      if (e.data.type === 'gst-upload-ready' && !sent) {
        sent = true;
        win.postMessage({ type: 'gst-upload-file', file: f, rid: rid }, DASH);
        msg.textContent = '보냈습니다 — 대시보드 창에서 검사 결과를 확인하고 «올리기»를 누르세요.';
      }
      if (e.data.type === 'gst-upload-done') { msg.textContent = '대시보드 적재가 끝났습니다.'; window.removeEventListener('message', onMsg); }
    };
    window.addEventListener('message', onMsg);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
