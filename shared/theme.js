/* 2901班 官网 · 共用主题切换（自动 / 亮色 / 暗色），所有页面和游戏共用 localStorage 的 theme。
   在 <head> 里最先引入，避免刷新时闪一下；然后 Theme.mount(元素) 放一个切换按钮。 */
(function () {
  'use strict';
  var ORDER = ['auto', 'light', 'dark'];
  var LABEL = { auto: '自动', light: '亮色', dark: '暗色' };
  var ICON = { auto: '🌓', light: '☀️', dark: '🌙' };
  var buttons = [];

  function get() {
    try { var v = localStorage.getItem('theme'); return v === 'light' || v === 'dark' ? v : 'auto'; } catch (e) { return 'auto'; }
  }
  function apply(t) {
    var root = document.documentElement;
    if (t === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', t);
  }
  function set(t) {
    try { localStorage.setItem('theme', t); } catch (e) {}
    apply(t); paint();
  }
  function paint() {
    var t = get();
    buttons.forEach(function (b) {
      b.textContent = ICON[t];
      b.title = '主题：' + LABEL[t] + '（点击切换）';
      b.setAttribute('aria-label', '主题：' + LABEL[t] + '，点击切换');
    });
  }
  apply(get());
  window.addEventListener('storage', function (e) { if (e.key === 'theme') { apply(get()); paint(); } });

  window.Theme = {
    get: get, set: set,
    cycle: function () { set(ORDER[(ORDER.indexOf(get()) + 1) % ORDER.length]); },
    mount: function (el) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'pill theme-btn';
      b.addEventListener('click', function () { window.Theme.cycle(); });
      el.appendChild(b); buttons.push(b); paint();
    }
  };
})();
