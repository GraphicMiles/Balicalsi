/* =========================================================================
   Kauaʻi Drive — multiplayer server
   - Static file server for /public
   - WebSocket relay + room/lobby/match orchestration
   - Two modes: "dual" (Duo Sprint, 2 players) and "championship" (Island Cup, 6 players)
   - Empty slots stay open (humans only); share the room code to fill them
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

function dropFromRoom(room, me) {
  // remove a player from a room whether they left voluntarily or dropped
  room.players.delete(me.id);
  if (room.players.size === 0) { rooms.delete(room.code); return; }
  if (room.hostId === me.id) {
    const next = [...room.players.values()].sort((a,b)=>a.slot-b.slot)[0];
    room.hostId = next ? next.id : null;
    if (next) broadcast(room, { type: 'host', slot: next.slot });
  }
  if (room.state === 'lobby') lobbyUpdate(room);
  else broadcast(room, { type: 'left', slot: me.slot });
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
                 mode, max, players: publicPlayers(room), host: id, now: Date.now() });
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
                 mode: room.mode, max: room.max, players: publicPlayers(room), host: room.hostId, now: Date.now() });
      lobbyUpdate(room);
    }

    else if (m.type === 'start') {
      const room = rooms.get(me.room);
      if (!room || room.hostId !== id || room.state !== 'lobby') return;
      if (room.players.size < 1) return;
      room.state = 'racing';
      room.startTime = Date.now() + 3800;     // ~3.8s countdown
      room.finishOrder = [];
      room.endAt = 0;
      for (const p of room.players.values()) { p.finTime = 0; p.lastProg = 0; }
      broadcast(room, { type: 'start', startTime: room.startTime, seed: room.seed, max: room.max,
                        players: publicPlayers(room), mode: room.mode, now: Date.now() });
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

    else if (m.type === 'again') {
      // host returns a finished race to the lobby for a rematch
      const room = rooms.get(me.room);
      if (!room || room.hostId !== id) return;
      if (room.state !== 'finished' && room.state !== 'racing') return;
      room.state = 'lobby';
      room.finishOrder = [];
      room.endAt = 0;
      for (const p of room.players.values()) { p.finTime = 0; p.lastProg = 0; }
      broadcast(room, { type: 'again' });
      lobbyUpdate(room);
    }

    else if (m.type === 'leave') {
      const room = rooms.get(me.room);
      if (room) dropFromRoom(room, me);
      me.room = null; me.slot = -1;
      send(ws, { type: 'leftRoom' });
    }

    else if (m.type === 'ping') {
      send(ws, { type: 'pong', t: m.t });
    }
  });

  ws.on('close', () => {
    const me = sockets.get(ws);
    if (!me) return;
    const room = rooms.get(me.room);
    if (room) dropFromRoom(room, me);
    sockets.delete(ws);
  });
});

function maybeFinish(room) {
  // The race ends when everyone finishes, or 45s after the first finisher
  // (latecomers are ranked by progress, like a race time limit). Solo
  // finishes end immediately.
  if (room.state !== 'racing') return;
  const ps = [...room.players.values()];
  if (ps.length && ps.every(p => p.finTime)) {
    room.state = 'finished';
    room.endAt = 0;
    setTimeout(() => finalize(room), 1200);
    return;
  }
  if (!room.endAt && ps.some(p => p.finTime)) {
    room.endAt = Date.now() + 45000;
    const code = room.code;
    setTimeout(() => {
      const r = rooms.get(code);
      if (r && r.state === 'racing') { r.state = 'finished'; finalize(r); }
    }, 45200);
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
  console.log(`Kauaʻi Drive server running on http://0.0.0.0:${PORT}`);
});
