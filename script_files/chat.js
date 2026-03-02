import { setIsChatting } from "./player.js";

export function setupChat(ws, chatInput, chat, sendBtn, username) {
  function sendMessage() {
    const msg = chatInput.value.trim();
    if (!msg) return;
    ws.send(JSON.stringify({ type: "chat", message: msg }));
    chatInput.value = "";
    chatInput.blur();
  }

  ws.addEventListener("open", () => {
    ws.send(JSON.stringify({ type: "setName", name: username }));
  });

  sendBtn.addEventListener("click", sendMessage);

  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMessage();
  });
  chatInput.addEventListener("focus", () => {
    setIsChatting(true);
  });
  chatInput.addEventListener("blur", () => {
    setIsChatting(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "/") {
      chatInput.focus();
    }
  });
  ws.addEventListener("message", (e) => {
    const data = JSON.parse(e.data);

    if (data.type === "chat") {
      const div = document.createElement("div");
      div.textContent = `${data.name}: ${data.message}`;
      chat.appendChild(div);
      chat.scrollTop = chat.scrollHeight;
    }
  });
}
