// Central debug toggle store.
// Import debugLog() anywhere instead of using console.log directly.
// Toggles are controlled from the Settings menu in the UI.
 
export const debugToggles = {
  playerMovement:  { label: "Player movement logs",    enabled: false },
  projectileFire:  { label: "Projectile fire logs",    enabled: false },
  shotPlacement:   { label: "Shot placement logs",     enabled: false },
  bulletHoles:     { label: "Bullet hole rendering",   enabled: false },
  pitchLabel:      { label: "Pitch label display",     enabled: false },
  networkLagLabel: { label: "Network lag label",       enabled: false },
  networkSend:     { label: "Network send logs",       enabled: false },
  fpsLabel:        { label: "FPS counter display",     enabled: false },
  hitDetection:    { label: "Hit detection logs",      enabled: false },
  spawnInvincible: { label: "Spawn invincibility logs", enabled: false },
};
 
/**
 * Log a debug message to the on-screen chat console if the named toggle is on.
 * @param {string} key   - key from debugToggles
 * @param {string} msg   - message to display
 */
export function debugLog(key, msg) {
  if (!debugToggles[key] || !debugToggles[key].enabled) return;
  const chat = document.getElementById("chat");
  if (!chat) {
    console.log(`[DEBUG:${key}] ${msg}`);
    return;
  }
  const div = document.createElement("div");
  div.style.color = "#ff0";
  div.style.fontStyle = "italic";
  div.textContent = `[${key}] ${msg}`;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}