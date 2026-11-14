/* 后端地址管理：支持多个备用地址，被封或连不上时自动切换。
 * 地址列表放在 shared/api-config.json（和网页一起放在 github.io 上），改完那个文件就能换地址，不用改代码。
 * 用法：ApiBase.fetch('/api/xxx', init) 代替 fetch(API + '/api/xxx', init)；ApiBase.get() 取当前地址。 */
(function () {
  'use strict';
  var DEFAULTS = ['https://api.ssy2901.abrdns.com'];       // 配置文件读不到时的兜底
  var KEY = 'api_base', TIMEOUT = 12000, PROBE = 6000;
  var list = DEFAULTS.slice(), cur = '';
  var script = document.currentScript && document.currentScript.src;
  function lsGet(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
  function clean(u) { u = String(u || '').trim().replace(/\/+$/, ''); return /^https:\/\/[^\s/]+$/.test(u) ? u : ''; }
  function pick() {
    var saved = clean(lsGet(KEY));
    cur = list.indexOf(saved) >= 0 ? saved : list[0];
  }
  pick();

  // 读配置文件（最多等 1.5 秒，读不到就用兜底，不影响页面）
  var ready = new Promise(function (resolve) {
    if (!script || !window.fetch) return resolve();
    var done = false, fin = function () { if (!done) { done = true; resolve(); } };
    setTimeout(fin, 1500);
    fetch(new URL('api-config.json', script).href, { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      var arr = j && Array.isArray(j.bases) ? j.bases.map(clean).filter(Boolean) : [];
      if (arr.length) { list = arr.filter(function (u, i) { return arr.indexOf(u) === i; }); pick(); }
    }).catch(function () { }).then(fin);
  });

  function withTimeout(url, init, ms) {
    if (init && (init.signal || init.keepalive) || !window.AbortController) return fetch(url, init);
    var ac = new AbortController(), timer = setTimeout(function () { ac.abort(); }, ms);
    var o = {}; for (var k in init) o[k] = init[k]; o.signal = ac.signal;
    return fetch(url, o).then(function (r) { clearTimeout(timer); return r; }, function (e) { clearTimeout(timer); throw e; });
  }
  // 并行探测所有备用地址的 /api/ping，谁先回应就用谁
  function probe() {
    var others = list.filter(function (u) { return u !== cur; });
    if (!others.length) return Promise.reject(new Error('no-alt'));
    return new Promise(function (resolve, reject) {
      var left = others.length;
      others.forEach(function (u) {
        withTimeout(u + '/api/ping', { cache: 'no-store' }, PROBE).then(function (r) {
          if (r.ok) resolve(u); else if (!--left) reject(new Error('none'));
        }).catch(function () { if (!--left) reject(new Error('none')); });
      });
    });
  }
  function set(u) { cur = u; lsSet(KEY, u); }

  window.ApiBase = {
    get: function () { return cur; },
    list: function () { return list.slice(); },
    ready: ready,
    set: set,
    /* 和 fetch 一样，path 以 / 开头。连不上（网络错误或超时）时换备用地址重试一次。
       keepalive 请求（退出登录等）和带流式请求体的请求不重试。 */
    fetch: function (path, init) {
      init = init || {};
      return ready.then(function () {
        var base = cur;
        return withTimeout(base + path, init, TIMEOUT).catch(function (err) {
          if (init.keepalive || (init.body && typeof init.body !== 'string')) throw err;
          return probe().then(function (u) { set(u); return withTimeout(u + path, init, TIMEOUT); }, function () { throw err; });
        });
      });
    }
  };
})();
