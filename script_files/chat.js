import { setIsChatting, getState } from "./player.js";
 
export function setupChat(ws, chatInput, chat, sendBtn, username) {
  // ── Wrap input row in a flex container ──────────────────────────────────
  const inputRow = document.createElement("div");
  inputRow.id = "chat-input-row";
 
  // Move chatInput and sendBtn into the row
  const container = chatInput.parentNode;
  container.insertBefore(inputRow, chatInput);
  inputRow.appendChild(chatInput);
  inputRow.appendChild(sendBtn);
 
  // ── Image upload button ──────────────────────────────────────────────────
  const imageLabel = document.createElement("label");
  imageLabel.htmlFor = "chatImageInput";
  imageLabel.textContent = "📎";
  imageLabel.title = "Upload image or GIF";
 
  const imageInput = document.createElement("input");
  imageInput.type = "file";
  imageInput.id = "chatImageInput";
  imageInput.accept = "image/png,image/jpeg,image/gif,image/webp,image/svg+xml";
  imageInput.style.display = "none";
 
  // Append into the same row
  inputRow.appendChild(imageLabel);
  inputRow.appendChild(imageInput);
 
  // ── Text message sending ─────────────────────────────────────────────────
  function sendMessage() {
    const msg = chatInput.value.trim();
    if (!msg) return;
    ws.send(JSON.stringify({ type: "chat", message: msg }));
    chatInput.value = "";
    chatInput.blur();
  }
 
  ws.addEventListener("open", () => {
    const { sprite } = getState();
    ws.send(JSON.stringify({ type: "setName", name: username }));
    ws.send(JSON.stringify({ type: "setSprite", sprite }));
  });
 
  sendBtn.addEventListener("click", sendMessage);
 
  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMessage();
  });
  chatInput.addEventListener("focus", () => setIsChatting(true));
  chatInput.addEventListener("blur",  () => setIsChatting(false));
 
  document.addEventListener("keydown", (e) => {
    if (e.key === "/") chatInput.focus();
  });
 
  // ── Image upload sending ─────────────────────────────────────────────────
  imageInput.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
 
    if (file.size > 1_500_000) {
      alert("Image too large — please upload something under 1.5 MB.");
      imageInput.value = "";
      return;
    }
 
    const reader = new FileReader();
    reader.onload = () => {
      const imageData = reader.result;
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "chatImage", imageData }));
      }
      imageInput.value = "";
    };
    reader.readAsDataURL(file);
  });
 
  // ── Incoming messages ────────────────────────────────────────────────────
  ws.addEventListener("message", (e) => {
    const data = JSON.parse(e.data);
 
    if (data.type === "chat") {
      const div = document.createElement("div");
      div.textContent = `${data.name}: ${data.message}`;
      chat.appendChild(div);
      chat.scrollTop = chat.scrollHeight;
    }
 
    if (data.type === "chatImage") {
      const wrapper = document.createElement("div");
 
      const nameSpan = document.createElement("span");
      nameSpan.textContent = `${data.name}: `;
      nameSpan.style.color = "#aaa";
 
      const img = document.createElement("img");
      img.src = data.imageData;
      img.style.cssText = `
        display: block;
        max-width: 100%;
        max-height: 160px;
        margin-top: 4px;
        border-radius: 4px;
        cursor: pointer;
      `;
      img.addEventListener("click", () => {
        window.open(data.imageData, "_blank");
      });
 
      wrapper.appendChild(nameSpan);
      wrapper.appendChild(img);
      chat.appendChild(wrapper);
      chat.scrollTop = chat.scrollHeight;
    }
  });
}