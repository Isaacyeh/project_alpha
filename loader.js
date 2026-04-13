// loader.js — visual loading screen ONLY.
// Does NOT open WebSockets or touch any game logic.
// Exposes window.__loader so script.js can drive the progress bar/status
// and call dismiss(onComplete) when the connection is confirmed open.
//
// NEW: addStep(id, label) / updateStep(id, state, label?) for a live step log.
// Step states: 'wait' | 'ok' | 'fail' | 'info'
//
// NOTE: <body class="loading"> is set directly in index.html, and a matching
// CSS rule in index.html's <style> block hides everything except #game-loader.
// This means content is hidden from the very first browser paint — no flash.
 
(function () {
  var FADE_MS = 500;
 
  var style = document.createElement("style");
  style.textContent = `
    #game-loader {
      position: fixed;
      inset: 0;
      z-index: 99999;
      background: #0a0a0a;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-family: 'Courier New', monospace;
      color: #fff;
      transition: opacity ${FADE_MS}ms ease;
    }
    #game-loader.fade-out {
      opacity: 0;
      pointer-events: none;
    }
    #game-loader::before {
      content: '';
      position: absolute;
      inset: 0;
      background: repeating-linear-gradient(
        0deg, transparent, transparent 2px,
        rgba(0,0,0,0.07) 2px, rgba(0,0,0,0.07) 4px
      );
      pointer-events: none;
    }
    .gl-title {
      font-size: clamp(26px, 5.5vw, 54px);
      font-weight: 900;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: #fff;
      text-shadow: 0 0 28px rgba(119,136,153,0.9), 0 0 56px rgba(119,136,153,0.4);
      margin-bottom: 10px;
    }
    .gl-sub {
      font-size: 11px;
      letter-spacing: 0.28em;
      text-transform: uppercase;
      color: #778899;
      margin-bottom: 40px;
    }
    .gl-bar-wrap {
      width: min(400px, 78vw);
      height: 5px;
      background: rgba(255,255,255,0.07);
      border-radius: 3px;
      overflow: hidden;
      margin-bottom: 14px;
      border: 1px solid rgba(119,136,153,0.2);
    }
    .gl-bar {
      height: 100%;
      width: 0%;
      background: linear-gradient(90deg, #778899, #b0c4d8);
      border-radius: 3px;
      transition: width 0.4s cubic-bezier(0.4,0,0.2,1);
      box-shadow: 0 0 10px rgba(119,136,153,0.5);
    }
    .gl-status {
      font-size: 11px;
      letter-spacing: 0.18em;
      color: #778899;
      min-height: 16px;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .gl-retry-info {
      font-size: 10px;
      color: #444;
      letter-spacing: 0.1em;
      min-height: 14px;
      margin-bottom: 0;
    }
 
    /* ── Step log ─────────────────────────────────────────── */
    .gl-log {
      width: min(400px, 78vw);
      margin-top: 20px;
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .gl-log-entry {
      display: flex;
      align-items: center;
      gap: 9px;
      font-size: 10px;
      letter-spacing: 0.07em;
      animation: gl-fadein 0.2s ease;
      line-height: 1.5;
    }
    @keyframes gl-fadein {
      from { opacity: 0; transform: translateY(3px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .gl-log-icon {
      flex-shrink: 0;
      width: 14px;
      height: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-style: normal;
    }
    .gl-log-text { }
 
    /* ok */
    .gl-log-entry.ok .gl-log-icon { color: #3a9; }
    .gl-log-entry.ok .gl-log-text { color: #3a9; }
 
    /* in progress — spinning ring */
    .gl-log-entry.wait .gl-log-icon::before {
      content: '';
      display: block;
      width: 9px;
      height: 9px;
      border: 1.5px solid #556677;
      border-top-color: #99aabb;
      border-radius: 50%;
      animation: gl-spin 0.65s linear infinite;
    }
    .gl-log-entry.wait .gl-log-text { color: #778899; }
    @keyframes gl-spin { to { transform: rotate(360deg); } }
 
    /* fail */
    .gl-log-entry.fail .gl-log-icon { color: #c44; font-size: 12px; }
    .gl-log-entry.fail .gl-log-text { color: #e66; }
 
    /* info / skipped */
    .gl-log-entry.info .gl-log-icon { color: #445; font-size: 10px; }
    .gl-log-entry.info .gl-log-text { color: #4a5a6a; }
 
    /* ── Error box ──────────────────────────────────────────── */
    .gl-error {
      margin-top: 22px;
      display: none;
      flex-direction: column;
      align-items: center;
      gap: 14px;
    }
    .gl-error.show { display: flex; }
    .gl-error-msg {
      color: #cc4444;
      font-size: 12px;
      letter-spacing: 0.08em;
      text-align: center;
      max-width: 340px;
      line-height: 1.7;
      white-space: pre-line;
    }
    .gl-retry-btn {
      padding: 9px 26px;
      background: transparent;
      border: 1px solid #778899;
      color: #ddd;
      font-family: 'Courier New', monospace;
      font-size: 11px;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      cursor: pointer;
      transition: background 0.2s, box-shadow 0.2s;
    }
    .gl-retry-btn:hover {
      background: rgba(119,136,153,0.18);
      box-shadow: 0 0 10px rgba(119,136,153,0.35);
    }
  `;
  document.head.appendChild(style);
 
  var el = document.createElement("div");
  el.id = "game-loader";
  el.innerHTML = [
    '<div class="gl-title">PROJECT ALPHA</div>',
    '<div class="gl-sub">Loading</div>',
    '<div class="gl-bar-wrap"><div class="gl-bar" id="gl-bar"></div></div>',
    '<div class="gl-status" id="gl-status">Starting...</div>',
    '<div class="gl-retry-info" id="gl-retry-info"></div>',
    '<div class="gl-log" id="gl-log"></div>',
    '<div class="gl-error" id="gl-error">',
    '  <div class="gl-error-msg" id="gl-error-msg"></div>',
    '  <button class="gl-retry-btn" id="gl-retry-btn">Retry</button>',
    '</div>',
  ].join("");
 
  // Inject overlay as soon as <body> exists.
  function inject() {
    document.body.insertBefore(el, document.body.firstChild);
  }
  if (document.body) {
    inject();
  } else {
    document.addEventListener("DOMContentLoaded", inject);
  }
 
  function gid(id) { return document.getElementById(id); }
 
  // ── Step log state ──────────────────────────────────────────────────────────
  var steps = {}; // id -> { el, iconEl, textEl }
 
  var ICONS = {
    ok:   "✓",
    fail: "✗",
    wait: "",   // rendered via CSS ::before spinner
    info: "–",
  };
 
  window.__loader = {
    setProgress: function (pct, msg) {
      var b = gid("gl-bar");    if (b) b.style.width = pct + "%";
      var s = gid("gl-status"); if (s) s.textContent = msg || "";
    },
 
    setRetryInfo: function (msg) {
      var r = gid("gl-retry-info"); if (r) r.textContent = msg || "";
    },
 
    /**
     * Add a new step row to the log.
     * @param {string} id       unique key
     * @param {string} label    display text
     * @param {string} [state]  'wait'|'ok'|'fail'|'info'  (default 'wait')
     */
    addStep: function (id, label, state) {
      var log = gid("gl-log");
      if (!log) return;
      if (steps[id]) { this.updateStep(id, state || "wait", label); return; }
 
      var st = state || "wait";
      var entry = document.createElement("div");
      entry.className = "gl-log-entry " + st;
 
      var icon = document.createElement("span");
      icon.className = "gl-log-icon";
      icon.textContent = ICONS[st] || "";
 
      var text = document.createElement("span");
      text.className = "gl-log-text";
      text.textContent = label;
 
      entry.appendChild(icon);
      entry.appendChild(text);
      log.appendChild(entry);
 
      steps[id] = { el: entry, iconEl: icon, textEl: text };
    },
 
    /**
     * Update an existing step's state and optionally its label.
     * @param {string} id
     * @param {string} state  'wait'|'ok'|'fail'|'info'
     * @param {string} [label]
     */
    updateStep: function (id, state, label) {
      var s = steps[id];
      if (!s) { this.addStep(id, label || id, state); return; }
      // swap class
      s.el.className = "gl-log-entry " + state;
      s.iconEl.textContent = ICONS[state] || "";
      if (label !== undefined) s.textEl.textContent = label;
    },
 
    showError: function (msg, onRetry) {
      var s = gid("gl-status");    if (s) s.textContent = "Connection failed";
      var e = gid("gl-error");     if (e) e.classList.add("show");
      var m = gid("gl-error-msg"); if (m) m.textContent = msg;
      var b = gid("gl-retry-btn"); if (b) b.onclick = function () {
        var er = gid("gl-error"); if (er) er.classList.remove("show");
        onRetry();
      };
    },
 
    /**
     * Fade the loader out, then reveal the page and call onComplete.
     */
    dismiss: function (onComplete) {
      var l = gid("game-loader");
      if (!l) {
        document.body.classList.remove("loading");
        if (typeof onComplete === "function") onComplete();
        return;
      }
      l.classList.add("fade-out");
      setTimeout(function () {
        if (l.parentNode) l.parentNode.removeChild(l);
        document.body.classList.remove("loading");
        if (typeof onComplete === "function") onComplete();
      }, FADE_MS);
    }
  };
})();
 