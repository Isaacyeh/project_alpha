// loader.js — handles all pre-game initialization and connection retries
// Injected BEFORE script.js in index.html
 
(function () {
  // ── Config ──────────────────────────────────────────────────────────────
  const WS_TIMEOUT_MS     = 8000;   // give up on a single WS attempt after 8s
  const WS_MAX_RETRIES    = 10;     // retry up to 10 times
  const WS_RETRY_BASE_MS  = 1500;   // first retry after 1.5s
  const WS_RETRY_MAX_MS   = 8000;   // cap backoff at 8s
 
  // ── Build the overlay immediately (before DOM ready) ─────────────────────
  const style = document.createElement("style");
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
      transition: opacity 0.5s ease;
    }
    #game-loader.fade-out {
      opacity: 0;
      pointer-events: none;
    }
 
    .loader-title {
      font-size: clamp(28px, 6vw, 56px);
      font-weight: 900;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: #fff;
      text-shadow: 0 0 30px rgba(119,136,153,0.8), 0 0 60px rgba(119,136,153,0.4);
      margin-bottom: 12px;
    }
 
    .loader-subtitle {
      font-size: 13px;
      letter-spacing: 0.25em;
      text-transform: uppercase;
      color: #778899;
      margin-bottom: 48px;
    }
 
    .loader-bar-wrap {
      width: min(420px, 80vw);
      height: 6px;
      background: rgba(255,255,255,0.08);
      border-radius: 3px;
      overflow: hidden;
      margin-bottom: 20px;
      border: 1px solid rgba(119,136,153,0.25);
    }
 
    .loader-bar {
      height: 100%;
      width: 0%;
      background: linear-gradient(90deg, #778899, #b0c4d8);
      border-radius: 3px;
      transition: width 0.35s ease;
      box-shadow: 0 0 12px rgba(119,136,153,0.6);
    }
 
    .loader-status {
      font-size: 12px;
      letter-spacing: 0.15em;
      color: #778899;
      min-height: 18px;
      text-transform: uppercase;
    }
 
    .loader-retry-info {
      margin-top: 24px;
      font-size: 11px;
      color: #555;
      letter-spacing: 0.1em;
    }
 
    .loader-error {
      margin-top: 32px;
      display: none;
      flex-direction: column;
      align-items: center;
      gap: 12px;
    }
    .loader-error.visible {
      display: flex;
    }
    .loader-error-msg {
      color: #cc4444;
      font-size: 13px;
      letter-spacing: 0.1em;
      text-align: center;
      max-width: 360px;
      line-height: 1.6;
    }
    .loader-retry-btn {
      padding: 10px 28px;
      background: transparent;
      border: 1px solid #778899;
      color: #fff;
      font-family: 'Courier New', monospace;
      font-size: 13px;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      cursor: pointer;
      transition: background 0.2s, box-shadow 0.2s;
    }
    .loader-retry-btn:hover {
      background: rgba(119,136,153,0.2);
      box-shadow: 0 0 12px rgba(119,136,153,0.4);
    }
 
    /* scanline texture for that retro-FPS vibe */
    #game-loader::before {
      content: '';
      position: absolute;
      inset: 0;
      background: repeating-linear-gradient(
        0deg,
        transparent,
        transparent 2px,
        rgba(0,0,0,0.08) 2px,
        rgba(0,0,0,0.08) 4px
      );
      pointer-events: none;
    }
 
    /* hide the real game content until loaded */
    body.game-loading > *:not(#game-loader) {
      visibility: hidden;
    }
  `;
  document.head.appendChild(style);
 
  // ── DOM for the overlay ───────────────────────────────────────────────────
  const loader = document.createElement("div");
  loader.id = "game-loader";
  loader.innerHTML = `
    <div class="loader-title">PROJECT ALPHA</div>
    <div class="loader-subtitle">Initializing</div>
    <div class="loader-bar-wrap">
      <div class="loader-bar" id="loader-bar"></div>
    </div>
    <div class="loader-status" id="loader-status">Starting up...</div>
    <div class="loader-retry-info" id="loader-retry-info"></div>
    <div class="loader-error" id="loader-error">
      <div class="loader-error-msg" id="loader-error-msg"></div>
      <button class="loader-retry-btn" id="loader-retry-btn">Try Again</button>
    </div>
  `;
 
  // Inject as first child of body (body may not exist yet if script is in <head>)
  function injectLoader() {
    document.body.classList.add("game-loading");
    document.body.insertBefore(loader, document.body.firstChild);
  }
 
  if (document.body) {
    injectLoader();
  } else {
    document.addEventListener("DOMContentLoaded", injectLoader);
  }
 
  // ── UI helpers ────────────────────────────────────────────────────────────
  const bar      = () => document.getElementById("loader-bar");
  const status   = () => document.getElementById("loader-status");
  const retryInfo= () => document.getElementById("loader-retry-info");
  const errBox   = () => document.getElementById("loader-error");
  const errMsg   = () => document.getElementById("loader-error-msg");
  const retryBtn = () => document.getElementById("loader-retry-btn");
 
  function setProgress(pct, msg) {
    const b = bar(); if (b) b.style.width = pct + "%";
    const s = status(); if (s) s.textContent = msg;
  }
 
  function showError(msg) {
    const s = status(); if (s) s.textContent = "Connection failed";
    const e = errBox(); if (e) e.classList.add("visible");
    const m = errMsg(); if (m) m.textContent = msg;
  }
 
  function hideError() {
    const e = errBox(); if (e) e.classList.remove("visible");
  }
 
  function setRetryInfo(msg) {
    const r = retryInfo(); if (r) r.textContent = msg;
  }
 
  function dismissLoader() {
    const l = document.getElementById("game-loader");
    if (!l) return;
    document.body.classList.remove("game-loading");
    l.classList.add("fade-out");
    setTimeout(() => l.remove(), 600);
  }
 
  // ── WebSocket connection with retry + backoff ─────────────────────────────
  let retryCount = 0;
  let retryTimer = null;
  let activeWs = null;
 
  // Expose the resolved WS so script.js can use it instead of creating its own
  window.__gameWsPromise = new Promise((resolve, reject) => {
 
    function attempt() {
      hideError();
      const attempt_n = retryCount + 1;
      setProgress(
        Math.min(30 + retryCount * 7, 75),
        retryCount === 0
          ? "Connecting to server..."
          : `Retrying connection... (${attempt_n}/${WS_MAX_RETRIES})`
      );
 
      const wsProtocol = location.protocol === "https:" ? "wss://" : "ws://";
      const ws = new WebSocket(wsProtocol + location.host);
      activeWs = ws;
 
      // Timeout if open never fires
      const timeout = setTimeout(() => {
        ws.close();
        onFail("Server took too long to respond.");
      }, WS_TIMEOUT_MS);
 
      ws.addEventListener("open", () => {
        clearTimeout(timeout);
        retryCount = 0;
        setRetryInfo("");
        setProgress(85, "Connected! Loading game...");
        // Give the game modules a beat to initialize
        setTimeout(() => {
          setProgress(100, "Ready!");
          setTimeout(dismissLoader, 400);
        }, 600);
        resolve(ws);
      });
 
      ws.addEventListener("error", () => {
        clearTimeout(timeout);
        // 'close' will fire after 'error', handle there
      });
 
      ws.addEventListener("close", (e) => {
        clearTimeout(timeout);
        // If we already resolved (game was running) — show reconnect UI
        // without breaking the running game (script.js handles its own reconnect)
        if (retryCount === 0 && e.code !== 1000 && e.code !== 1001) {
          // first failure after successful connect — don't show loader again,
          // let the game's own error handling deal with it
          return;
        }
        onFail(`Server unavailable (code ${e.code || "unknown"}).`);
      });
    }
 
    function onFail(reason) {
      if (retryCount >= WS_MAX_RETRIES) {
        showError(
          `Could not reach the game server after ${WS_MAX_RETRIES} attempts.\n` +
          `The server may be starting up — please wait 30–60 seconds and try again.\n\n` +
          `(${reason})`
        );
        retryBtn().onclick = () => {
          retryCount = 0;
          attempt();
        };
        return;
      }
 
      retryCount++;
      const delay = Math.min(WS_RETRY_BASE_MS * retryCount, WS_RETRY_MAX_MS);
      let remaining = Math.ceil(delay / 1000);
 
      setRetryInfo(`Retrying in ${remaining}s...`);
      const countdown = setInterval(() => {
        remaining--;
        if (remaining > 0) setRetryInfo(`Retrying in ${remaining}s...`);
        else { clearInterval(countdown); setRetryInfo(""); }
      }, 1000);
 
      retryTimer = setTimeout(() => {
        clearInterval(countdown);
        attempt();
      }, delay);
    }
 
    attempt();
  });
 
  // ── CSS load check ────────────────────────────────────────────────────────
  // Verify that style.css loaded (catches the "HTML but no styling" symptom)
  setProgress(10, "Loading assets...");
  const cssLink = document.querySelector('link[rel="stylesheet"]');
  if (cssLink) {
    cssLink.addEventListener("load", () => setProgress(20, "Assets loaded."));
    cssLink.addEventListener("error", () => {
      // CSS failed — reload the page which often fixes transient fetch failures
      console.warn("[loader] CSS failed to load, reloading...");
      setTimeout(() => location.reload(), 1000);
    });
  }
 
})();