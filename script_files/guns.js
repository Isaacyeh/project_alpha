// script_files/guns.js

// Global projectile physics constants
export const PROJECTILE_SPEED = 0.15;           // world units per frame
export const PROJECTILE_LIFETIME = 300;         // frames before expiration
export const PROJECTILE_START_Z = 0.15;         // z-offset when spawned from player
export const HIT_DAMAGE = 0.1;                  // health damage per hit
export const PROJECTILE_HIT_RADIUS = 0.225;     // hit detection radius
export const TRACER_MAX_RANGE = 18;             // max range for tracer/raycast
export const SHOOT_COOLDOWN = 10;               // default cooldown frames

export const GUNS = {
  rifle: {
    name: "Rifle",
    damage: 10,
    projectileSpeed: 2,
    range: 18,
    cooldown: 10,
    projectileRadius: 0.0125,
    color: "#4db8ff"
  },
  shotgun: {
    name: "Shotgun",
    damage: 20,
    projectileSpeed: 3,
    range: 12,
    cooldown: 25,
    projectileRadius: 0.1,
    color: "#7f4dff"
  },
  sniper: {
    name: "Sniper",
    damage: 35,
    projectileSpeed: 4,
    range: 25,
    cooldown: 30,
    projectileRadius: 0.005,
    color: "#4dff62"
  },
  machinegun: {
    name: "Machine Gun",
    damage: 5,
    projectileSpeed: 3,
    range: 15,
    cooldown: 4,
    projectileRadius: 0.01,
    color: "#ff504d"
  },
};

export function getGun(gunId) {
  return GUNS[gunId] || GUNS.rifle;
}

export const selectedGun = { current: GUNS.rifle };
let onGunSelectCallback = null;

export function getSelectedGunId() {
  return Object.keys(GUNS).find((k) => GUNS[k] === selectedGun.current) || "rifle";
}

function renderGuns() {
  const list = document.getElementById("gunMenu");
  list.innerHTML = "";

  Object.entries(GUNS).forEach(([id, gunData]) => {
    const btn = document.createElement("button");
    btn.className = "gun-btn" + (selectedGun.current === gunData ? " selected" : "");
    btn.textContent = gunData.name;
    btn.addEventListener("click", () => selectGun(id));
    list.appendChild(btn);
  });
}

function selectGun(id) {
  selectedGun.current = GUNS[id];
  renderGuns();
  if (typeof onGunSelectCallback === "function") onGunSelectCallback(id);
}

export function initGunMenu(onClose, onSelectGun) {
  onGunSelectCallback = typeof onSelectGun === "function" ? onSelectGun : null;

  document.getElementById("closeGuns").addEventListener("click", onClose);

  document.getElementById("gunReset").addEventListener("click", () => {
    selectedGun.current = GUNS.rifle;
    renderGuns();
    if (typeof onGunSelectCallback === "function") onGunSelectCallback("rifle");
  });

  document.getElementById("gunSave").addEventListener("click", () => {
    const id = Object.keys(GUNS).find(k => GUNS[k] === selectedGun.current) || "rifle";
    localStorage.setItem("selectedGun", id);
  });

  // Restore from localStorage on load
  const saved = localStorage.getItem("selectedGun");
  if (saved && GUNS[saved]) selectedGun.current = GUNS[saved];

  renderGuns();
}