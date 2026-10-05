/* =========================================================================
   Beach Buggy Online — multiplayer server
   - Static file server for /public
   - WebSocket relay + room/lobby/match orchestration
   - Two modes: "dual" (2 players) and "championship" (6 players)
   - Empty slots are filled by LOCAL bots on each client (server stays lean)
   - The server is authoritative only for: lobby, countdown, finish order,
     and relaying each human's car state to the other humans.
   ========================================================================= */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');

const MIME = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8',
  '.png':'image/png', '.jpg':'image/jpeg', '.ico':'image/x-icon',
  '.svg':'image/svg+xml', '.map':'application/json'
};

/* ---------------- static file server ---------------- */
const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.join(PUBLIC, path.normalize(urlPath));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

/* ---------------- websocket server ---------------- */
const wss = new WebSocketServer({ server });

const rooms = new Map();          // code -> room
const sockets = new Map();        // ws -> { id, room, slot }
let nextId = 1;

function genCode() {
  let c;
  do { c = Math.random().toString(36).slice(2, 6).toUpperCase(); } while (rooms.has(c));
  return c;
}
function send(ws, obj) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}
function broadcast(room, obj, exceptId) {
  const msg = JSON.stringify(obj);
  for (const p of room.players.values()) {
    if (p.id !== exceptId && p.ws && p.ws.readyState === p.ws.OPEN) p.ws.send(msg);
  }
}
function publicPlayers(room) {
  return [...room.players.values()].map(p => ({
    id: p.id, name: p.name, color: p.color, slot: p.slot, host: p.id === room.hostId
  }));
}
function lobbyUpdate(room) {
  broadcast(room, { type: 'lobby', mode: room.mode, max: room.max, players: publicPlayers(room), host: room.hostId });
}
function freeSlot(room) {
  const used = new Set([...room.players.values()].map(p => p.slot));
  for (let i = 0; i < room.max; i++) if (!used.has(i)) return i;
  return -1;
}

wss.on('connection', (ws) => {
  const id = nextId++;
  sockets.set(ws, { id, room: null, slot: -1 });

  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    const me = sockets.get(ws);
    if (!me) return;

    if (m.type === 'create') {
      const mode = m.mode === 'championship' ? 'championship' : 'dual';
      const max = mode === 'championship' ? 6 : 2;
      const code = genCode();
      const room = { code, mode, max, state: 'lobby', players: new Map(), hostId: id,
                     startTime: 0, seed: (Math.random() * 1e9) | 0, finishOrder: [] };
      rooms.set(code, room);
      const slot = 0;
      room.players.set(id, { id, ws, name: (m.name || 'Player').slice(0, 16), color: m.color || '#ff5a1f', slot, host: true });
      me.room = code; me.slot = slot;
      send(ws, { type: 'created', code, slot, you: id, seed: room.seed,
                 mode, max, players: publicPlayers(room), host: id });
    }

    else if (m.type === 'join') {
      const room = rooms.get((m.code || '').toUpperCase());
      if (!room) { send(ws, { type: 'error', msg: 'Room not found' }); return; }
      if (room.state !== 'lobby') { send(ws, { type: 'error', msg: 'Race already started' }); return; }
      const slot = freeSlot(room);
      if (slot < 0) { send(ws, { type: 'error', msg: 'Room is full' }); return; }
      room.players.set(id, { id, ws, name: (m.name || 'Player').slice(0, 16), color: m.color || '#1d4ed8', slot, host: false });
      me.room = room.code; me.slot = slot;
      send(ws, { type: 'joined', code: room.code, slot, you: id, seed: room.seed,
                 mode: room.mode, max: room.max, players: publicPlayers(room), host: room.hostId });
      lobbyUpdate(room);
    }

    else if (m.type === 'start') {
      const room = rooms.get(me.room);
      if (!room || room.hostId !== id || room.state !== 'lobby') return;
      if (room.players.size < 1) return;
      room.state = 'racing';
      room.startTime = Date.now() + 3800;     // ~3.8s countdown
      room.finishOrder = [];
      broadcast(room, { type: 'start', startTime: room.startTime, seed: room.seed,
                        players: publicPlayers(room), mode: room.mode });
    }

    else if (m.type === 'sync') {
      const room = rooms.get(me.room);
      if (!room || room.state !== 'racing') return;
      const p = room.players.get(id);
      if (!p) return;
      if (m.s) p.lastProg = m.s.pg;       // for DNF ranking
      // record finish order
      if (m.s && m.s.fn > 0 && !p.finTime) {
        p.finTime = m.s.fn;
        room.finishOrder.push(id);
        maybeFinish(room);
      }
      // relay to others (tagged with sender slot)
      broadcast(room, { type: 'peer', slot: p.slot, s: m.s }, id);
    }

    else if (m.type === 'hit') {
      const room = rooms.get(me.room);
      if (!room || room.state !== 'racing') return;
      // relay hit to everyone except shooter (shooter already shows its own fx)
      broadcast(room, { type: 'hit', by: me.slot, target: m.target, x: m.x, z: m.z, t: m.t }, id);
    }

    else if (m.type === 'chat') {
      const room = rooms.get(me.room);
      if (!room) return;
      broadcast(room, { type: 'chat', from: me.slot, name: (room.players.get(id)||{}).name, text: (''+m.text).slice(0,80) });
    }

    else if (m.type === 'ping') {
      send(ws, { type: 'pong', t: m.t });
    }
  });

  ws.on('close', () => {
    const me = sockets.get(ws);
    if (!me) return;
    const room = rooms.get(me.room);
    if (room) {
      room.players.delete(me.id);
      if (room.state === 'lobby') {
        // reassign host if needed
        if (room.hostId === me.id) {
          const next = [...room.players.values()].sort((a,b)=>a.slot-b.slot)[0];
          room.hostId = next ? next.id : null;
        }
        if (room.players.size === 0) { rooms.delete(room.code); }
        else lobbyUpdate(room);
      } else {
        // mid-race: tell others this slot freed (becomes a local bot on their side)
        broadcast(room, { type: 'left', slot: me.slot });
        if (room.hostId === me.id) {
          const next = [...room.players.values()].sort((a,b)=>a.slot-b.slot)[0];
          if (next) { room.hostId = next.id; broadcast(room, { type: 'host', slot: next.slot }); }
        }
        if (room.players.size === 0) { rooms.delete(room.code); }
      }
    }
    sockets.delete(ws);
  });
});

function maybeFinish(room) {
  // Race ends shortly after the HOST finishes, or when everyone is done.
  const host = room.players.get(room.hostId);
  const allDone = [...room.players.values()].every(p => p.finTime);
  if ((host && host.finTime) || allDone) {
    if (room.state === 'racing') {
      room.state = 'finished';
      setTimeout(() => finalize(room), 1500);
    }
  }
}

function finalize(room) {
  const arr = [...room.players.values()];
  arr.sort((a, b) => {
    if (a.finTime && b.finTime) return a.finTime - b.finTime;
    if (a.finTime) return -1;
    if (b.finTime) return 1;
    const pa = a.lastProg || 0, pb = b.lastProg || 0;
    return pb - pa;   // more progress ranks higher among DNFs
  });
  // also fold in any progress updates we saw for finishing detection
  broadcast(room, { type: 'results', order: arr.map((p, i) => ({
    slot: p.slot, name: p.name, color: p.color, time: p.finTime || 0, finished: !!p.finTime, rank: i + 1
  })) });
}

// keep latest progress for DNF ranking
wss.on('connection', () => {}); // (noop placeholder; progress stored below)

// augment sync handler to store lastProg (patched by wrapping)
const _on = wss.emit.bind(wss);
// store progress inside the sync branch already runs; add a tiny hook:
setInterval(() => {
  for (const room of rooms.values()) {
    if (room.state !== 'racing') continue;
    for (const p of room.players.values()) {
      if (p.lastProg !== undefined) { /* already */ }
    }
  }
}, 4000);

// heartbeat
const interval = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { ws.terminate(); continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  }
}, 30000);
wss.on('connection', (ws) => { ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; }); });
wss.on('close', () => clearInterval(interval));

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Beach Buggy Online server running on http://0.0.0.0:${PORT}`);
});
