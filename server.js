const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));

const players = {}; // id => { x, y, angle, z, username. projectiles, health }

function broadcastPlayers() {
  const data = JSON.stringify({ type: "players", players });
  wss.clients.forEach((c) => {
    if (c.readyState === WebSocket.OPEN) c.send(data);
  });
}

function broadcastChat(name, message) {
  const data = JSON.stringify({ type: "chat", name, message });
  wss.clients.forEach((c) => {
    if (c.readyState === WebSocket.OPEN) c.send(data);
  });
}

wss.on("connection", (ws) => {
  const id = Math.random().toString(36).slice(2);
  ws.id = id;
  ws.username = "Anonymous";
  players[id] = {
    x: 3,
    y: 17,
    angle: 0,
    z: 0,
    username: ws.username,
    projectiles: [],
    health: 1,
  };

  ws.send(JSON.stringify({ type: "init", id }));

  ws.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch {
      return;
    }

    if (data.type === "chat") {
      broadcastChat(ws.username, data.message);
      return;
    }
    if (data.type === "setName") {
      ws.username = String(data.name || "Anonymous").trim() || "Anonymous";
      if (players[id]) players[id].username = ws.username;
      return;
    }
    if (players[id]) {
      players[id] = { ...players[id], ...data };
      broadcastPlayers();
    }
  });

  ws.on("close", () => {
    delete players[id];
    broadcastPlayers();
  });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
