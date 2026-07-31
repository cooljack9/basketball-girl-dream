/**
 * server.js — 真实 HTTP 后端（零依赖，Node 内置 http 模块）
 *
 * 数据所有权：本服务是游戏状态(G) 的唯一真实来源 + 持久化层 + 世界数据所有者。
 * 前端只通过以下 REST 接口读取状态、派发动作，自身不做数据裁决。
 *
 *   GET  /                     -> 托管 basketball-girl.html（同域，免 CORS）
 *   GET  /api/health           -> {ok:true}
 *   POST /api/games            -> 新建对局（后端用确定性引擎构造 G）{name,seed?,template?}
 *   GET  /api/games/active     -> 读取当前活动对局状态
 *   PUT  /api/games/active/sync-> 前端将当前状态回写（过渡期；最终由后端动作计算）
 *   POST /api/games/active/actions -> 派发一个引擎动作 {action, args} -> 返回新状态
 *   DELETE /api/games/active   -> 清除活动对局
 */

const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

const { loadEngine, HTML_PATH } = require('./engine-loader');
// 前端瘦客户端（只读取后端返回的状态），与后端引擎源文件(basketball-girl.html)分离
const CLIENT_PATH = path.resolve(__dirname, '..', 'bbg-client.html');
const store = require('./store');

const eng = loadEngine();

function send(res, code, obj, extraHeaders) {
  res.writeHead(code, Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }, extraHeaders || {}));
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', (c) => { d += c; if (d.length > 1e7) req.destroy(); });
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
function serveHtml(res) {
  try {
    const html = fs.readFileSync(CLIENT_PATH);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  } catch (e) {
    send(res, 500, { error: 'html load failed: ' + e.message });
  }
}
function serveFile(res, p) {
  try {
    const html = fs.readFileSync(p);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  } catch (e) {
    send(res, 500, { error: 'file load failed: ' + e.message });
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const u = url.parse(req.url, true);
    const p = u.pathname;
    const method = req.method;

    if (method === 'OPTIONS') return send(res, 204, {});

    // 静态托管前端（瘦客户端）
    if (method === 'GET' && (p === '/' || p === '/index.html')) return serveHtml(res);
    // 原始完整版（单机可双击打开，含内联引擎）——仅作参考/回退
    if (method === 'GET' && (p === '/standalone' || p === '/standalone.html' || p === '/engine.html')) return serveFile(res, HTML_PATH);

    // 健康检查
    if (method === 'GET' && p === '/api/health') return send(res, 200, { ok: true });

    // 新建对局
    if (method === 'POST' && p === '/api/games') {
      const b = await readBody(req);
      const seed = (b.seed != null) ? b.seed : Math.floor(Math.random() * 1e9);
      const g = eng.api.newGame(b.name || '小岚', seed, b.template || 'guard', (typeof b.grow === 'number' ? b.grow : 1));
      const id = 'g_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e4).toString(36);
      store.write(id, g);
      store.setActive(id);
      return send(res, 200, { id, state: g });
    }

    // 读取活动对局
    if (method === 'GET' && p === '/api/games/active') {
      const id = store.getActive();
      if (!id) return send(res, 404, { error: 'no active game' });
      const g = store.read(id);
      if (!g) return send(res, 404, { error: 'save not found' });
      eng.setG(g);
      return send(res, 200, { id, state: g });
    }

    // 前端回写（过渡期同步）
    if (method === 'PUT' && p === '/api/games/active/sync') {
      const id = store.getActive();
      if (!id) return send(res, 400, { error: 'no active game to sync' });
      const g = await readBody(req);
      if (!g || !g.screen) return send(res, 400, { error: 'invalid state' });
      store.write(id, g);
      return send(res, 200, { ok: true });
    }

    // 派发引擎动作（前端只读、后端计算的落地方式）
    if (method === 'POST' && p === '/api/games/active/actions') {
      const b = await readBody(req);
      const id = store.getActive();
      if (!id) return send(res, 400, { error: 'no active game' });
      const g0 = store.read(id);
      if (!g0) return send(res, 404, { error: 'save not found' });
      eng.setG(g0);
      let out;
      try {
        out = eng.call(b.action, b.args || []);
      } catch (e) {
        return send(res, 400, { error: 'action failed: ' + (e && e.message || e) });
      }
      const g = eng.getG();
      const emit = g._fanq || [];   // 取出待展示的“爽点”庆祝事件，返回给客户端一次性呈现
      g._fanq = [];                 // 服务端已"发出"，清空，避免下次请求重复弹出
      store.write(id, g);
      return send(res, 200, { state: Object.assign({}, g, { _fanq: emit }), result: out });
    }

    // 清除活动对局
    if (method === 'DELETE' && p === '/api/games/active') {
      const id = store.getActive();
      if (id) store.remove(id);
      store.setActive(null);
      return send(res, 200, { ok: true });
    }

    return send(res, 404, { error: 'not found: ' + method + ' ' + p });
  } catch (e) {
    send(res, 500, { error: String((e && e.stack) || e) });
  }
});

const PORT = process.env.PORT || 8787;
server.listen(PORT, () => {
  console.log('[bbg-backend] listening on http://localhost:' + PORT);
  console.log('[bbg-backend] serving frontend from ' + HTML_PATH);
});
