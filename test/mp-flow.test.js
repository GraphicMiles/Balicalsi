/* Integration test: two synthetic clients drive the full multiplayer flow
   against a live server. Run: node test/mp-flow.test.js (server must be on :3000,
   or pass PORT). Exits 0 on success, 1 on failure. */
'use strict';
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const URL = `ws://localhost:${PORT}`;
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok  ' : ' FAIL ') + msg); if (!cond) fails++; };

function cli() {
  const c = { ws: new WebSocket(URL), inbox: [], waiters: [] };
  c.ws.on('message', raw => {
    const m = JSON.parse(raw);
    const i = c.waiters.findIndex(w => w.pred(m));
    if (i >= 0) c.waiters.splice(i, 1)[0].resolve(m); else c.inbox.push(m);
  });
  c.ws.on('error', e => { console.log('  ws error', e.message); process.exit(1); });
  c.open = () => new Promise(r => c.ws.on('open', r));
  c.send = o => c.ws.send(JSON.stringify(o));
  c.expect = (pred, label, ms = 4000) => new Promise((resolve, reject) => {
    const i = c.inbox.findIndex(pred);
    if (i >= 0) { ok(true, label); return resolve(c.inbox.splice(i, 1)[0]); }
    const t = setTimeout(() => { ok(false, label + ' (timeout)'); reject(new Error(label)); }, ms);
    c.waiters.push({ pred, resolve: m => { clearTimeout(t); ok(true, label); resolve(m); } });
  });
  return c;
}

const has = t => m => m.type === t;

(async () => {
  const A = cli(), B = cli(), C = cli();
  await Promise.all([A.open(), B.open(), C.open()]);
  console.log('two clients + a third connected');

  // error path first: join a nonexistent room
  C.send({ type: 'join', code: 'ZZZZ', name: 'Carol' });
  await C.expect(m => m.type === 'error' && /not found/i.test(m.msg), 'join bad code -> error');

  // create + join
  A.send({ type: 'create', mode: 'dual', name: 'Alice', color: '#e62b1f' });
  const created = await A.expect(has('created'), 'host created room');
  ok(created.slot === 0 && created.max === 2 && created.mode === 'dual', 'created: slot 0, max 2, mode dual');
  ok(typeof created.now === 'number', 'created carries server clock (now)');
  ok(created.players.length === 1 && created.players[0].host, 'created: host flagged');

  B.send({ type: 'join', code: created.code, name: 'Bob', color: '#2f7dff' });
  const joined = await B.expect(has('joined'), 'guest joined room');
  ok(joined.slot === 1 && joined.you !== created.you, 'joined: slot 1, distinct id');
  await A.expect(m => m.type === 'lobby' && m.players.length === 2, 'host sees lobby with 2 players');

  // full room
  C.send({ type: 'join', code: created.code, name: 'Carol' });
  await C.expect(m => m.type === 'error' && /full/i.test(m.msg), 'third join rejected: room full');

  // non-host cannot start
  B.send({ type: 'start' });
  await new Promise(r => setTimeout(r, 250));
  ok(!A.inbox.some(has('start')), 'non-host start ignored');

  // start
  A.send({ type: 'start' });
  const sA = await A.expect(has('start'), 'host received start'),
        sB = await B.expect(has('start'), 'guest received start');
  ok(sA.startTime > Date.now() && sA.startTime - Date.now() < 4000, 'countdown window ~3.8s');
  ok(typeof sA.now === 'number', 'start carries server clock (now)');
  ok(sA.players.length === 2 && sA.seed === sB.seed && sA.startTime === sB.startTime, 'both starts agree (seed, t0, players)');

  // state relay
  A.send({ type: 'sync', s: { x: 10, y: 1, z: 20, th: 0.5, vf: 12, pg: 0.125, fn: 0 } });
  const p = await B.expect(m => m.type === 'peer' && m.slot === 0, 'peer state relayed to guest, tagged by slot');
  ok(p.s.x === 10 && p.s.pg === 0.125, 'peer payload passes through intact');
  B.send({ type: 'sync', s: { x: -5, y: 1, z: 8, th: 1.1, vf: 30, pg: 0.375, fn: 0 } });
  await A.expect(m => m.type === 'peer' && m.slot === 1, 'peer state relayed to host');

  // both finish -> results, ordered by time
  A.send({ type: 'sync', s: { x: 0, y: 1, z: 0, th: 0, vf: 0, pg: 3, fn: 187.4 } });
  B.send({ type: 'sync', s: { x: 1, y: 1, z: 1, th: 0, vf: 0, pg: 3, fn: 143.9 } });
  const rA = await A.expect(has('results'), 'host received results');
  await B.expect(has('results'), 'guest received results');
  ok(rA.order.length === 2, 'results list both drivers');
  ok(rA.order[0].name === 'Bob' && rA.order[0].rank === 1 && rA.order[0].time === 143.9, 'rank 1 = Bob (143.9)');
  ok(rA.order[1].name === 'Alice' && rA.order[1].finished && rA.order[1].rank === 2, 'rank 2 = Alice, finished flag');

  // rematch
  B.send({ type: 'again' });
  await new Promise(r => setTimeout(r, 250));
  ok(!A.inbox.some(has('again')), 'non-host again ignored');
  A.send({ type: 'again' });
  await A.expect(has('again'), 'host again -> again to host');
  await B.expect(has('again'), 'host again -> again to guest');
  await A.expect(m => m.type === 'lobby' && m.players.length === 2, 'lobby restored after rematch');

  // host can re-start after rematch (race state was reset)
  A.send({ type: 'start' });
  await A.expect(m => m.type === 'start' && m.startTime > Date.now(), 'second race starts after rematch');

  // leave mid-race
  B.ws.close();
  await A.expect(m => m.type === 'left' && m.slot === 1, 'host told guest slot freed mid-race');

  // A leaves; room should be deleted (code reusable)
  A.send({ type: 'leave' });
  await A.expect(has('leftRoom'), 'leaver gets leftRoom ack');
  await new Promise(r => setTimeout(r, 250));
  C.send({ type: 'join', code: created.code, name: 'Carol' });
  await C.expect(m => m.type === 'error' && /not found/i.test(m.msg), 'empty room is deleted');

  console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('aborted:', e.message); process.exit(1); });
