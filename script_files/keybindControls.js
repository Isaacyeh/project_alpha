let keysRef = null;
let mouseRef = null;

export const keybinds = {
  moveForward: "w",
  moveBackward: "s",
  moveLeft: "a",
  moveRight: "d",
  shoot: "leftClick",
  secondaryShoot: "q",
  sneak: "c",
  jump: " ",
  turnLeft: "ArrowLeft",
  turnRight: "ArrowRight",
  sprint: "Shift",
};

const defaults = { ...keybinds };

const labelMap = {
  moveForward:    "Move forward",
  moveBackward:   "Move backward",
  moveLeft:       "Move left",
  moveRight:      "Move right",
  shoot:          "Shoot",
  secondaryShoot: "Secondary shoot",
  sneak:          "Sneak",
  jump:           "Jump",
  turnLeft:       "Turn left",
  turnRight:      "Turn right",
  sprint:         "Sprint",
};

export function isPressed(bind) {
  if (bind === "leftClick")   return mouseRef.buttons[0];
  if (bind === "middleClick") return mouseRef.buttons[1];
  if (bind === "rightClick")  return mouseRef.buttons[2];

  return (keysRef[bind] || keysRef[bind.toLowerCase()] || keysRef[bind.toUpperCase()])
}

export function initKeyMouseRef(keys, mouse) {
  keysRef = keys;
  mouseRef = mouse;
}

function displayKey(k) {
  const map = { " ": "Space", leftClick: "Left click", ArrowLeft: "Left Arrow", ArrowRight: "Right Arrow", ArrowUp: "Up Arrow", ArrowDown: "Down Arrow" };
  return map[k] || (k.length === 1 ? k.toUpperCase() : k);
}

let listeningId = null;

function renderKeybinds() {
  const list = document.getElementById("kbList");
  list.innerHTML = "";
  Object.entries(labelMap).forEach(([id, label]) => {
    const row = document.createElement("div");
    row.className = "kb-row";

    const lbl = document.createElement("span");
    lbl.className = "kb-label";
    lbl.textContent = label;

    const btn = document.createElement("button");
    btn.className = "kb-bind-btn" + (listeningId === id ? " listening" : "");
    btn.textContent = listeningId === id ? "Press a key…" : displayKey(keybinds[id]);
    btn.onclick = () => startListening(id, btn);

    row.appendChild(lbl);
    row.appendChild(btn);
    list.appendChild(row);
  });
}

function startListening(id, btn) {
  if (listeningId === id) { listeningId = null; renderKeybinds(); return; }
  listeningId = id;
  renderKeybinds();

  const onKey = (e) => { e.preventDefault(); keybinds[id] = e.key; listeningId = null; cleanup(); renderKeybinds(); };
  const onMouse = (e) => { if (e.target === btn) return; keybinds[id] = "leftClick"; listeningId = null; cleanup(); renderKeybinds(); };
  const cleanup = () => { window.removeEventListener("keydown", onKey); window.removeEventListener("mousedown", onMouse); };

  window.addEventListener("keydown", onKey);
  setTimeout(() => window.addEventListener("mousedown", onMouse), 50);
}

export function initKeybindMenu(onClose) {
  document.getElementById("closeKeybinds").addEventListener("click", onClose);
  document.getElementById("kbReset").addEventListener("click", () => {
    Object.assign(keybinds, defaults);
    listeningId = null;
    renderKeybinds();
  });

  document.getElementById("closeKeybinds").addEventListener("click", () => {
    document.getElementById("keybindsOverlay").classList.add("hidden");
  });

  renderKeybinds();
}

//No repeats
function validKeybinds() {
  const values = Object.values(keybinds);
  return new Set(values).size === values.length;
}