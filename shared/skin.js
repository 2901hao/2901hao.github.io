/* 2901班 官网 · 全站「界面风格」切换（所有页面共用，要放在 i18n.js 之后）
   三套完整的全站风格：
     paper  纸白宋体风 —— 首页的样子：纸白底、深海军蓝 + 正红、思源宋体 / Times New Roman、方正边框
     glass  玻璃风     —— 论坛 / 运动会的样子：暖白底 + 光斑、毛玻璃卡片、圆角、ZCOOL 快乐体 + 思源黑体
     material Material 风 —— 参照谷歌设计语言（Material Design 3）：白 / 灰底、蓝色强调、胶囊按钮、描边卡片、Roboto + Noto Sans
   选择保存在 localStorage 的 skin，长期有效，所有页面共用。想改默认风格，改下面的 DEFAULT 即可。
   实际样式在 shared/skins.css（用 html[data-skin] 区分）。 */
(function () {
  'use strict';
  var DEFAULT = 'paper';
  var SKINS = ['paper', 'glass', 'material'];
  var ICON = { paper: '📜', glass: '🫧', material: '🔷' };
  var buttons = [];
  var base = (function () {
    var s = document.currentScript && document.currentScript.src;
    return s ? s.replace(/[^\/]*$/, '') : 'shared/';
  })();

  function ls(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function get() { var v = ls('skin'); return SKINS.indexOf(v) >= 0 ? v : DEFAULT; }
  function label(s) { return window.I18n ? I18n.t('skin.' + s) : s; }

  function link(href, id) {
    if (document.getElementById(id)) return;
    var l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = href; l.id = id;
    (document.head || document.documentElement).appendChild(l);
  }
  /* 按需加载字体：纸白风 → 当前语言对应的思源宋体 / Tinos（打包在 shared/fonts，按字切片，只下载用到的）；玻璃风 → 站酷快乐体 + 思源黑体（同样打包在 shared/fonts，不依赖 Google Fonts） */
  function fonts() {
    var s = get(), lang = window.I18n ? I18n.lang : 'zh-CN';
    if (s === 'paper') {
      var map = { 'zh-CN': 'sc', 'zh-TW': 'tc', 'nan': 'tc', 'yue': 'hk', 'ja': 'jp', 'ko': 'kr' };
      var f = map[lang];
      if (f) link(base + 'fonts/noto-serif-' + f + '-600.css', 'skin-font-' + f);
      else link(base + 'fonts/tinos.css', 'skin-font-tinos');
    } else if (s === 'material') {
      // Material：Roboto + 思源黑体 SC，都打包在 shared/fonts（国内访问不了 Google Fonts，所以不外链）；繁体 / 日 / 韩用系统字体
      link(base + 'fonts/roboto.css', 'skin-font-roboto');
      link(base + 'fonts/noto-sans-sc.css', 'skin-font-notosans');
    } else {
      link(base + 'fonts/zcool-kuaile.css', 'skin-font-zcool');
      link(base + 'fonts/noto-sans-sc.css', 'skin-font-notosans');
    }
  }
  function apply() {
    document.documentElement.setAttribute('data-skin', get());
    fonts(); paint();
  }
  function set(s) {
    if (SKINS.indexOf(s) < 0) return;
    try { localStorage.setItem('skin', s); } catch (e) {}
    apply();
  }
  function paint() {
    var s = get();
    buttons.forEach(function (b) {
      b.textContent = ICON[s];
      var t = window.I18n ? I18n.t('skin.title', { v: label(s) }) : label(s);
      b.title = t; b.setAttribute('aria-label', t);
    });
  }
  apply();   // 在 <head> 里最先执行，避免刷新时闪一下
  window.addEventListener('storage', function (e) { if (e.key === 'skin') apply(); });
  if (window.I18n) I18n.onChange(function () { fonts(); paint(); });

  window.Skin = {
    get: get, set: set,
    toggle: function () { set(SKINS[(SKINS.indexOf(get()) + 1) % SKINS.length]); },
    mount: function (el) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'pill theme-btn skin-btn';
      b.addEventListener('click', function () { window.Skin.toggle(); });
      el.appendChild(b); buttons.push(b); paint();
    }
  };
})();
