/* 后端地址管理：按 shared/api-config.json 里的顺序当优先级——先用排在前面的（原来的地址），连不上才用后面的（如 Supabase 中转）。
 * 改地址、改顺序只要改 shared/api-config.json（和网页一起放在 github.io 上），不用改代码。
 * 用法：ApiBase.fetch('/api/xxx', init) 代替 fetch(API + '/api/xxx', init)；ApiBase.get() 取当前地址。
 *
 * 规则：
 *  1. 第一次打开（或记录里的地址已不在列表里）：先探测第一个地址的 /api/ping，它不通（或 1.5 秒没回应）才探测下一个，用能通的里面排得最靠前的。
 *  2. 平时用上次选定的地址；用着用着连不上（网络错误或 12 秒没响应），重新探测其余地址，换一个并把这次请求重发一次。
 *  3. 如果现在用的不是排第一的地址，每隔 5 分钟在后台悄悄探测排在前面的地址，通了就自动切回去（不影响正在进行的请求）。 */
(function () {
  'use strict';
  var DEFAULTS = ['https://api.ssy2901.abrdns.com'];       // 配置文件读不到时的兜底
  var KEY = 'api_base', TIMEOUT = 12000, PROBE = 4000, STAGGER = 1500, RECHECK = 5 * 60 * 1000;
  var list = DEFAULTS.slice(), cur = DEFAULTS[0], rechecking = false;
  var script = document.currentScript && document.currentScript.src;
  function lsGet(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
  function clean(u) { u = String(u || '').trim().replace(/\/+$/, ''); return /^https:\/\/[^\s\/?#]+(\/[^\s?#]*)?$/.test(u) ? u : ''; }   // 允许带路径，如 https://xxx.supabase.co/functions/v1/api-proxy
  function load() {   // 记录格式 {u: 地址, t: 上次检查排在前面的地址的时间}；兼容旧版只存地址字符串
    var raw = lsGet(KEY); if (!raw) return null;
    try { var j = JSON.parse(raw); if (j && typeof j === 'object') return { u: clean(j.u), t: +j.t || 0 }; } catch (e) { }
    return { u: clean(raw), t: 0 };
  }
  function save(u, t) { lsSet(KEY, JSON.stringify({ u: u, t: t })); }
  function set(u) { cur = u; save(u, Date.now()); }

  function withTimeout(url, init, ms) {
    if (init && (init.signal || init.keepalive) || !window.AbortController) return fetch(url, init);
    var ac = new AbortController(), timer = setTimeout(function () { ac.abort(); }, ms);
    var o = {}; for (var k in init) o[k] = init[k]; o.signal = ac.signal;
    return fetch(url, o).then(function (r) { clearTimeout(timer); return r; }, function (e) { clearTimeout(timer); throw e; });
  }
  function ping(u) { return withTimeout(u + '/api/ping', { cache: 'no-store' }, PROBE).then(function (r) { return r.ok; }, function () { return false; }); }
  // 按列表顺序探测 cands，取“能通的里面排最前的”：先只探测第一个；它失败，或 1.5 秒还没回应，才开始探测下一个。
  // 所以原地址正常时，后面的（如 Supabase）一次请求都不会碰；都不通返回 null
  function best(cands) {
    return new Promise(function (resolve) {
      var n = cands.length, res = new Array(n), started = 0, over = false;
      if (!n) return resolve(null);
      function finish(u) { if (!over) { over = true; resolve(u); } }
      function check() { for (var i = 0; i < n; i++) { if (res[i] === undefined) return; if (res[i]) return finish(cands[i]); } finish(null); }
      function start(i) {
        if (i >= n || started > i) return; started = i + 1;
        var timer = setTimeout(function () { start(i + 1); }, STAGGER);
        ping(cands[i]).then(function (ok) { res[i] = ok; clearTimeout(timer); if (!ok) start(i + 1); check(); });
      }
      start(0);
    });
  }
  // 现在用的不是排第一的：后台看看排在前面的通了没有，通了就切回去
  function maybeRecheck() {
    var idx = list.indexOf(cur); if (idx <= 0 || rechecking) return;
    var s = load(); if (s && s.u === cur && Date.now() - s.t < RECHECK) return;
    rechecking = true; save(cur, Date.now());
    best(list.slice(0, idx)).then(function (u) { rechecking = false; if (u) set(u); });
  }

  // 读配置文件（最多等 1.5 秒，读不到就用兜底），然后确定用哪个地址
  var ready = new Promise(function (resolve) {
    function init() {
      var s = load(), idx = s ? list.indexOf(s.u) : -1;
      if (idx >= 0) { cur = s.u; maybeRecheck(); return resolve(); }
      cur = list[0];
      best(list).then(function (u) { if (u) set(u); }).then(resolve);
    }
    if (!script || !window.fetch) return init();
    var done = false, fin = function () { if (!done) { done = true; init(); } };
    setTimeout(fin, 1500);
    fetch(new URL('api-config.json', script).href, { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      var arr = j && Array.isArray(j.bases) ? j.bases.map(clean).filter(Boolean) : [];
      if (arr.length && !done) list = arr.filter(function (u, i) { return arr.indexOf(u) === i; });
    }).catch(function () { }).then(fin);
  });

  window.ApiBase = {
    get: function () { return cur; },
    list: function () { return list.slice(); },
    ready: ready,
    set: set,
    /* 和 fetch 一样，path 以 / 开头。连不上（网络错误或超时）时换其它地址重试一次。
       keepalive 请求（退出登录等）和带流式请求体的请求不重试。 */
    fetch: function (path, init) {
      init = init || {};
      return ready.then(function () {
        maybeRecheck();
        var base = cur;
        return withTimeout(base + path, init, TIMEOUT).catch(function (err) {
          if (init.keepalive || (init.body && typeof init.body !== 'string')) throw err;
          return best(list.filter(function (u) { return u !== base; })).then(function (u) {
            if (!u) throw err;
            set(u); return withTimeout(u + path, init, TIMEOUT);
          });
        });
      });
    }
  };
})();
