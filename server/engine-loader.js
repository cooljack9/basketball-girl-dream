/**
 * engine-loader.js
 * --------------------------------------------------------------------------
 * 后端「数据 + 引擎」所有权层。
 *
 * 设计取舍（Batch-1 的务实方案，已在需求文档 GAP 注释中记录）：
 *   现有游戏逻辑全部写在 basketball-girl.html 的 <script> 里（~5200 行原生 JS）。
 *   为避免对 3000+ 行互相耦合的纯逻辑做高风险的手工移植，本加载器用 Node `vm`
 *   把这份脚本跑在一个受控沙箱里，复用其 100% 的确定性引擎（mulberry32 /
 *   rollTalent / genSchools / newGame / pickDream / simMatch ...）。
 *
 *   后端因此成为：
 *     · 状态(G) 的唯一真实来源（single source of truth）
 *     · 世界数据 / 配置表的所有者
 *     · 持久化层（JSON 落盘，见 store.js）
 *   前端只通过 REST 读取状态、并派发「动作」让后端计算，自己不做数据裁决。
 *
 *   后续 Batch 会把沙箱里的引擎抽取成独立的 server/engine.js 模块（去除 DOM 依赖），
 *   届时本文件可直接替换为 `require('./engine')`，接口不变。
 */

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const HTML_PATH = path.resolve(__dirname, '..', 'basketball-girl.html');

/** 构造一个足够让客户端脚本在 Node 下「无头启动」的浏览器环境桩 */
function makeSandbox() {
  function ctx2d() {
    // canvas 2d 上下文：所有方法 no-op，属性读写均可
    return new Proxy({}, { get: () => () => {}, set: () => true });
  }
  function fakeEl() {
    const base = {
      value: '小岚',
      style: {},
      dataset: {},
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      width: 320, height: 240,
    };
    return new Proxy(base, {
      get(t, p) {
        if (p in t) return t[p];
        if (p === 'innerHTML' || p === 'textContent' || p === 'outerHTML') return '';
        if (p === 'getContext') return () => ctx2d();
        if (p === 'getBoundingClientRect') return () => ({ width: 0, height: 0, top: 0, left: 0 });
        if (p === 'querySelector') return () => fakeEl();
        if (p === 'querySelectorAll') return () => [];
        if (p === 'appendChild' || p === 'removeChild' || p === 'insertBefore') return () => fakeEl();
        if (p === 'addEventListener' || p === 'removeEventListener' || p === 'setAttribute' || p === 'focus' || p === 'blur' || p === 'click') return () => {};
        if (p === 'getAttribute') return () => null;
        return () => {};
      },
      set(t, p, v) { t[p] = v; return true; },
    });
  }

  const store = {};
  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  const documentMock = {
    getElementById: () => fakeEl(),
    querySelector: () => fakeEl(),
    querySelectorAll: () => [],
    createElement: () => fakeEl(),
    addEventListener: () => {},
    body: fakeEl(),
  };

  const sandbox = {
    document: documentMock,
    localStorage,
    console,
    Math, JSON, Date, Proxy, Reflect,
    performance: { now: () => Date.now() },
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    setTimeout: () => 0,
    clearTimeout: () => {},
    navigator: { userAgent: 'node' },
    addEventListener: () => {},
  };
  sandbox.window = sandbox; // 客户端用 window.__GAME 暴露调试 API；window===global
  return sandbox;
}

function loadEngine() {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const blocks = (html.match(/<script>([\s\S]*?)<\/script>/g) || [])
    .map((s) => s.replace(/<\/?script>/g, ''));
  if (!blocks.length) throw new Error('未在 basketball-girl.html 中找到 <script>');
  // 取最大的脚本块（主游戏逻辑）
  const code = blocks.sort((a, b) => b.length - a.length)[0];

  const sandbox = makeSandbox();
  vm.createContext(sandbox);

  // 屏蔽脚本末尾的自动 boot（newGame + render），避免启动即落一个无关存档；
  // 我们手动用 API 构建对局，更可控。
  const sanitized = code.replace(/newGame\('小岚',\s*12345,\s*'guard'\);\s*render\(\);/, '/* boot suppressed by backend */');
  vm.runInContext(sanitized, sandbox);

  const api = sandbox.window.__GAME || sandbox.window.__game || {};

  return {
    api,
    /** 读取当前沙箱中的全局状态 G */
    getG: () => sandbox.G,
    /** 用外部（如从磁盘读回的）状态覆盖沙箱 G */
    setG: (g) => { sandbox.G = g; },
    /** 通用动作派发：调用引擎暴露的函数，返回其原始返回值 */
    call(action, args) {
      // 优先用 window.__GAME 暴露的受控接口；兜底直接取 vm 全局函数声明，
      // 这样引擎里任意全局函数（含未显式挂到 __GAME 的）都可被前端派发。
      const fn = api[action] || sandbox[action];
      if (typeof fn !== 'function') throw new Error('unknown action: ' + action);
      return fn.apply(null, Array.isArray(args) ? args : []);
    },
    sandbox,
  };
}

module.exports = { loadEngine, HTML_PATH };
