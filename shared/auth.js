/* 2901班 官网 · 共用登录模块
   与游戏使用同一个后端、同一份 localStorage（user / token），所以任何一个页面登录，其它页面自动是登录状态。
   用法：<script src="../shared/auth.js"></script>，然后 Auth.mountBar(元素) 即可得到“登录 / 账号菜单”。 */
(function () {
  'use strict';
  var API = 'https://api.ssy2901.abrdns.com';   // 与游戏一致，末尾不要带斜杠
  var HIDDEN = ['admin', 'root'];                // 这两个账号不允许注销（后端也会拒绝）
  var listeners = [];

  function ls(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

  var Auth = {
    API: API,
    user: function () { return ls('user'); },
    token: function () { return ls('token'); },
    isLoggedIn: function () { return !!(ls('user') && ls('token')); },
    isAdmin: function () { return HIDDEN.indexOf(ls('user').trim().toLowerCase()) >= 0; },
    onChange: function (fn) { listeners.push(fn); },
    _emit: function () { listeners.forEach(function (fn) { try { fn(); } catch (e) {} }); render(); },

    /* 统一的后端请求：自动带 token，401 时清掉登录状态 */
    api: function (path, payload, keep) {
      var body = Object.assign({ token: Auth.token() }, payload || {});
      return fetch(API + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: !!keep
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (r.status === 401 && Auth.isLoggedIn()) { Auth.clear(); }
          return { status: r.status, body: d };
        });
      });
    },

    clear: function () { lsDel('user'); lsDel('token'); lsDel('av'); Auth._emit(); },

    /* 头像：name 用户名；v 头像版本（后端返回的 av，没有头像传空）；size 像素。
       没有头像时显示首字母 + 按用户名固定的颜色 */
    avatar: function (name, v, size) {
      var COLORS = ['#2D9CDB', '#3FB27F', '#E8A200', '#FF6B5E', '#8E6BD8', '#E0509A', '#12A3BF', '#7FA31F'];
      var hsh = 0; for (var i = 0; i < name.length; i++) hsh = (hsh * 31 + name.charCodeAt(i)) >>> 0;
      var el = document.createElement('span');
      el.className = 'ax-av'; el.textContent = Array.from(name)[0] ? Array.from(name)[0].toUpperCase() : '?';
      el.style.background = COLORS[hsh % COLORS.length];
      if (size) { el.style.width = el.style.height = size + 'px'; el.style.fontSize = Math.round(size * 0.46) + 'px'; }
      if (v) {
        var img = document.createElement('img');
        img.alt = ''; img.loading = 'lazy';
        img.src = API + '/api/avatar/' + encodeURIComponent(name) + '?v=' + encodeURIComponent(v);
        img.onerror = function () { if (img.parentNode) img.parentNode.removeChild(img); };
        el.appendChild(img);
      }
      return el;
    },
    myAvatarVersion: function () { return ls('av') || '0'; },

    /* 密码规则（与后端一致，后端为准）：admin/root 可用中文；其他账号只能是英文字母、数字、符号，至少 6 位 */
    pwError: function (username, pw) {
      var n = Array.from(pw).length;
      if (n > 64) return '密码太长（最多 64 位）';
      if (n < 6) return '密码至少 6 位';
      if (HIDDEN.indexOf(String(username).trim().toLowerCase()) < 0 && !/^[\x21-\x7E]+$/.test(pw)) return '密码只能包含英文字母、数字和符号，不能有中文或空格';
      return '';
    },
    login: function (u, p) {
      return fetch(API + '/api/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p })
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (d.ok) { lsSet('user', d.username); lsSet('token', d.token || ''); Auth._emit(); }
        return d;
      });
    },
    register: function (u, p) {
      return fetch(API + '/api/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p })
      }).then(function (r) { return r.json(); });
    },
    logout: function () {
      var t = Auth.token();
      if (t) { fetch(API + '/api/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: t }), keepalive: true }).catch(function () {}); }
      Auth.clear();
    },
    deleteAccount: function () {
      return Auth.api('/api/delete', {}).then(function (res) {
        if (res.body && res.body.ok) { Auth.clear(); }
        return res;
      });
    }
  };

  /* 别的标签页登录/退出时同步 */
  window.addEventListener('storage', function (e) { if (e.key === 'user' || e.key === 'token') Auth._emit(); });

  /* ---------- 样式 ---------- */
  var css = [
    '.ax-bar{display:flex;align-items:center;gap:8px;position:relative}',
    '.ax-chip{max-width:60vw}',
    '.ax-chip b{max-width:9em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700}',
    '.ax-av{position:relative;overflow:hidden;width:22px;height:22px;border-radius:50%;background:var(--color-sky,#2D9CDB);color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;user-select:none}',
    '.ax-av img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#fff}',
    '.ax-prev{display:flex;flex-direction:column;align-items:center;gap:8px;margin:6px 0 12px}',
    '.ax-hint{font-size:12px;color:var(--color-ink-soft,#5B6B8C);text-align:center;line-height:1.5}',
    '.ax-file{display:none}',
    '.ax-row.col{flex-direction:column}',
    '.ax-menu{position:absolute;right:0;top:calc(100% + 8px);min-width:150px;padding:6px;z-index:60;display:none;flex-direction:column;gap:2px;border-radius:14px;background:var(--color-card,#fff);border:1px solid var(--color-line,#F0E6D2);box-shadow:0 18px 40px -12px rgba(27,42,74,.4)}',
    '.ax-menu.open{display:flex}',
    '.ax-menu button{font:500 14px "Noto Sans SC",sans-serif;text-align:left;padding:10px 12px;border:0;border-radius:9px;background:transparent;color:var(--color-ink,#1B2A4A);cursor:pointer}',
    '.ax-menu button:hover{background:var(--color-bg-alt,#FFF6E4)}',
    '.ax-menu button.warn{color:var(--danger,#D9402F)}',
    '.ax-mask{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(10,16,32,.5);backdrop-filter:blur(4px)}',
    '.ax-dlg{width:min(100%,360px);padding:22px 20px 18px;border-radius:20px;background:var(--color-card,#fff);color:var(--color-ink,#1B2A4A);border:1px solid var(--color-line,#F0E6D2);box-shadow:0 30px 80px -20px rgba(0,0,0,.5);font-family:"Noto Sans SC",sans-serif}',
    '.ax-dlg h3{margin:0 0 4px;font-size:20px;font-family:"ZCOOL KuaiLe","Noto Sans SC",sans-serif;font-weight:400}',
    '.ax-dlg p{margin:0 0 12px;font-size:13px;line-height:1.6;color:var(--color-ink-soft,#5B6B8C)}',
    '.ax-tabs{display:flex;gap:6px;margin:10px 0 12px;padding:4px;border-radius:12px;background:var(--color-bg-alt,#FFF6E4)}',
    '.ax-tabs button{flex:1;padding:8px;border:0;border-radius:9px;background:transparent;font:700 14px "Noto Sans SC",sans-serif;color:var(--color-ink-soft,#5B6B8C);cursor:pointer}',
    '.ax-tabs button.on{background:var(--color-card,#fff);color:var(--color-ink,#1B2A4A);box-shadow:0 2px 8px rgba(27,42,74,.15)}',
    '.ax-dlg input{width:100%;margin-bottom:10px;padding:12px 14px;font:16px "Noto Sans SC",sans-serif;border-radius:12px;border:1px solid var(--color-line,#F0E6D2);background:var(--field-bg,#fff);color:var(--color-ink,#1B2A4A)}',
    '.ax-dlg input:focus{outline:2px solid var(--color-sky,#2D9CDB);outline-offset:1px}',
    '.ax-msg{min-height:20px;margin:0 0 8px;font-size:13px;color:var(--danger,#D9402F)}',
    '.ax-msg.ok{color:var(--color-grass,#3FB27F)}',
    '.ax-row{display:flex;gap:10px}',
    '.ax-row button{flex:1;padding:12px;border-radius:12px;border:1px solid var(--color-line,#F0E6D2);background:var(--color-card,#fff);color:var(--color-ink,#1B2A4A);font:700 15px "Noto Sans SC",sans-serif;cursor:pointer}',
    '.ax-row button.go{background:var(--color-sky,#2D9CDB);border-color:var(--color-sky,#2D9CDB);color:#fff}',
    '.ax-row button.bad{background:var(--danger,#D9402F);border-color:var(--danger,#D9402F);color:#fff}',
    '.ax-row button:disabled{opacity:.6;cursor:default}'
  ].join('\n');
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  /* ---------- 小工具 ---------- */
  function h(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k === 'class') n.className = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { n.appendChild(c); });
    return n;
  }
  function closeMask(m) { if (m && m.parentNode) m.parentNode.removeChild(m); }

  /* ---------- 登录 / 注册弹窗 ---------- */
  Auth.openLogin = function (opts) {
    opts = opts || {};
    var mode = opts.mode || 'login';
    var mask = h('div', { class: 'ax-mask', role: 'dialog', 'aria-modal': 'true' });
    var title = h('h3'), sub = h('p');
    var tLogin = h('button', { type: 'button', text: '登录' });
    var tReg = h('button', { type: 'button', text: '注册' });
    var u = h('input', { type: 'text', placeholder: '用户名', autocomplete: 'username', maxlength: '32' });
    var p = h('input', { type: 'password', placeholder: '密码', autocomplete: 'current-password' });
    var p2 = h('input', { type: 'password', placeholder: '再输入一次密码', autocomplete: 'new-password' });
    var msg = h('div', { class: 'ax-msg' });
    var cancel = h('button', { type: 'button', text: '取消' });
    var go = h('button', { type: 'button', class: 'go' });
    var busy = false;

    function setMode(m) {
      mode = m;
      tLogin.className = m === 'login' ? 'on' : '';
      tReg.className = m === 'register' ? 'on' : '';
      title.textContent = m === 'login' ? '欢迎回来' : '创建账号';
      sub.textContent = m === 'login' ? '与“辽宁省中学大战”共用同一个账号。' : '注册后自动登录，游戏和论坛通用。密码至少 6 位，只能用英文字母、数字和符号。请不要使用常用密码，在服务器的数据库中，可以反解出密码。';
      go.textContent = m === 'login' ? '登录' : '注册并登录';
      p2.style.display = m === 'register' ? '' : 'none';
      p.setAttribute('autocomplete', m === 'login' ? 'current-password' : 'new-password');
      msg.textContent = ''; msg.className = 'ax-msg';
    }
    function say(t, ok) { msg.textContent = t; msg.className = 'ax-msg' + (ok ? ' ok' : ''); }
    function submit() {
      if (busy) return;
      var name = u.value.trim(), pw = p.value;
      if (!name || !pw) { say('请输入用户名和密码'); return; }
      if (mode === 'register') {
        var pe = Auth.pwError(name, pw);
        if (pe) { say(pe); return; }
        if (pw !== p2.value) { say('两次输入的密码不一致'); return; }
      }
      busy = true; go.disabled = true; say('请稍候…', true);
      var job = mode === 'register'
        ? Auth.register(name, pw).then(function (d) { return d.ok ? Auth.login(name, pw) : d; })
        : Auth.login(name, pw);
      job.then(function (d) {
        busy = false; go.disabled = false;
        if (d && d.ok) { say('欢迎，' + d.username, true); setTimeout(function () { closeMask(mask); if (opts.onDone) opts.onDone(); }, 300); }
        else say((d && d.error) || '操作失败');
      }).catch(function () { busy = false; go.disabled = false; say('无法连接服务器'); });
    }
    tLogin.onclick = function () { setMode('login'); };
    tReg.onclick = function () { setMode('register'); };
    cancel.onclick = function () { closeMask(mask); };
    go.onclick = submit;
    [u, p, p2].forEach(function (i) { i.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } }); });
    mask.addEventListener('mousedown', function (e) { if (e.target === mask) closeMask(mask); });
    mask.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMask(mask); });

    mask.appendChild(h('div', { class: 'ax-dlg' }, [
      title, sub, h('div', { class: 'ax-tabs' }, [tLogin, tReg]), u, p, p2, msg,
      h('div', { class: 'ax-row' }, [cancel, go])
    ]));
    setMode(mode);
    document.body.appendChild(mask);
    u.focus();
  };

  /* ---------- 确认框 ---------- */
  Auth.confirmBox = function (title, text, yesLabel, danger) {
    return new Promise(function (res) {
      var mask = h('div', { class: 'ax-mask', role: 'alertdialog', 'aria-modal': 'true' });
      var no = h('button', { type: 'button', text: '取消' });
      var yes = h('button', { type: 'button', class: danger ? 'bad' : 'go', text: yesLabel || '确认' });
      function done(v) { closeMask(mask); res(v); }
      no.onclick = function () { done(false); };
      yes.onclick = function () { done(true); };
      mask.addEventListener('mousedown', function (e) { if (e.target === mask) done(false); });
      mask.addEventListener('keydown', function (e) { if (e.key === 'Escape') done(false); });
      mask.appendChild(h('div', { class: 'ax-dlg' }, [h('h3', { text: title }), h('p', { text: text }), h('div', { class: 'ax-row' }, [no, yes])]));
      document.body.appendChild(mask);
      no.focus();
    });
  };

/* ---------- 修改密码 ---------- */
  Auth.openPassword = function () {
    var mask = h('div', { class: 'ax-mask', role: 'dialog', 'aria-modal': 'true' });
    var o = h('input', { type: 'password', placeholder: '当前密码', autocomplete: 'current-password' });
    var n1 = h('input', { type: 'password', placeholder: '新密码（至少 6 位）', autocomplete: 'new-password' });
    var n2 = h('input', { type: 'password', placeholder: '再输入一次新密码', autocomplete: 'new-password' });
    var msg = h('div', { class: 'ax-msg' });
    var cancel = h('button', { type: 'button', text: '取消' });
    var go = h('button', { type: 'button', class: 'go', text: '保存' });
    var hint = Auth.isAdmin() ? '管理员账号的密码可以使用中文。' : '新密码只能用英文字母、数字和符号，不能有中文或空格。';
    function say(t, ok) { msg.textContent = t; msg.className = 'ax-msg' + (ok ? ' ok' : ''); }
    function submit() {
      if (go.disabled) return;
      var pe = Auth.pwError(Auth.user(), n1.value);
      if (!o.value) return say('请输入当前密码');
      if (pe) return say(pe);
      if (n1.value !== n2.value) return say('两次输入的新密码不一致');
      go.disabled = true; say('请稍候…', true);
      Auth.api('/api/change_password', { old: o.value, new: n1.value }).then(function (res) {
        go.disabled = false;
        if (res.body && res.body.ok) { say('密码已修改，其它设备上的登录已失效', true); setTimeout(function () { closeMask(mask); }, 900); }
        else if (res.status !== 401) say((res.body && res.body.error) || '修改失败');
      }).catch(function () { go.disabled = false; say('无法连接服务器'); });
    }
    [o, n1, n2].forEach(function (i) { i.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } }); });
    cancel.onclick = function () { closeMask(mask); }; go.onclick = submit;
    mask.addEventListener('mousedown', function (e) { if (e.target === mask) closeMask(mask); });
    mask.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMask(mask); });
    mask.appendChild(h('div', { class: 'ax-dlg' }, [h('h3', { text: '修改密码' }), h('p', { text: hint }), o, n1, n2, msg, h('div', { class: 'ax-row' }, [cancel, go])]));
    document.body.appendChild(mask); o.focus();
  };

  /* ---------- 修改头像：选图 → 浏览器里居中裁成正方形、缩到 256px 并压缩（几十 KB，远小于 5MB）→ 上传 ---------- */
  var MAX_INPUT = 30 * 1024 * 1024;     // 允许选的原图上限（手机原图也没问题）
  var MAX_OUT = 100000;                 // 压缩后目标：base64 ≤ 约 100KB
  function compressImage(file) {
    return new Promise(function (resolve, reject) {
      if (!/^image\//.test(file.type) && !/\.(jpe?g|png|webp|gif|bmp)$/i.test(file.name)) return reject(new Error('请选择图片文件'));
      if (file.size > MAX_INPUT) return reject(new Error('图片太大了（超过 30MB），请换一张'));
      var url = URL.createObjectURL(file), img = new Image();
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('这张图片无法读取（HEIC 等格式请先转成 JPG/PNG）')); };
      img.onload = function () {
        URL.revokeObjectURL(url);
        var w = img.naturalWidth, hh = img.naturalHeight, side = Math.min(w, hh), out = Math.min(256, side);
        var c = document.createElement('canvas'); c.width = c.height = out;
        var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, out, out);
        g.drawImage(img, (w - side) / 2, (hh - side) / 2, side, side, 0, 0, out, out);
        var q = 0.9, d;
        for (;;) {
          d = c.toDataURL('image/webp', q);
          if (d.indexOf('data:image/webp') !== 0) d = c.toDataURL('image/jpeg', q);   // 不支持 webp 的浏览器退回 jpeg
          if (d.length <= MAX_OUT || q <= 0.3) break;
          q -= 0.1;
        }
        d.length <= 150000 ? resolve(d) : reject(new Error('压缩后仍然太大，请换一张'));
      };
      img.src = url;
    });
  }
  Auth.openAvatar = function () {
    var mask = h('div', { class: 'ax-mask', role: 'dialog', 'aria-modal': 'true' });
    var prev = h('div', { class: 'ax-prev' });
    var info = h('div', { class: 'ax-hint', text: '选一张图片，会自动裁成正方形并压缩，无需自己处理大小。' });
    var file = h('input', { type: 'file', accept: 'image/*', class: 'ax-file' });
    var pick = h('button', { type: 'button', text: '选择图片' });
    var rm = h('button', { type: 'button', text: '移除头像' });
    var cancel = h('button', { type: 'button', text: '取消' });
    var save = h('button', { type: 'button', class: 'go', text: '保存' });
    var msg = h('div', { class: 'ax-msg' });
    var data = null;
    function say(t, ok) { msg.textContent = t; msg.className = 'ax-msg' + (ok ? ' ok' : ''); }
    function showPrev(src) {
      prev.textContent = '';
      if (src) { var i = h('img', { src: src, alt: '' }); i.style.cssText = 'width:96px;height:96px;border-radius:50%;object-fit:cover;border:2px solid var(--color-line,#F0E6D2)'; prev.appendChild(i); }
      else prev.appendChild(Auth.avatar(Auth.user(), Auth.myAvatarVersion() !== '0' ? Auth.myAvatarVersion() : '', 96));
    }
    showPrev(null); save.disabled = true;
    pick.onclick = function () { file.click(); };
    file.onchange = function () {
      var f = file.files && file.files[0]; if (!f) return;
      say('处理中…', true); save.disabled = true;
      compressImage(f).then(function (d) {
        data = d; showPrev(d); save.disabled = false; say('', true);
        info.textContent = '已压缩为 ' + Math.max(1, Math.round(d.length * 0.75 / 1024)) + ' KB（原图 ' + (f.size / 1048576).toFixed(1) + ' MB），点“保存”生效。';
      }).catch(function (e) { data = null; say(e.message); });
    };
    save.onclick = function () {
      if (!data) return; save.disabled = true; say('上传中…', true);
      Auth.api('/api/avatar_set', { data: data }).then(function (res) {
        if (res.body && res.body.ok) { lsSet('av', String(res.body.v)); Auth._emit(); say('头像已更新', true); setTimeout(function () { closeMask(mask); }, 600); }
        else { save.disabled = false; if (res.status !== 401) say((res.body && res.body.error) || '上传失败'); }
      }).catch(function () { save.disabled = false; say('无法连接服务器'); });
    };
    rm.onclick = function () {
      Auth.api('/api/avatar_remove', {}).then(function (res) {
        if (res.body && res.body.ok) { lsDel('av'); Auth._emit(); showPrev(null); data = null; save.disabled = true; say('已移除头像', true); }
        else if (res.status !== 401) say((res.body && res.body.error) || '操作失败');
      }).catch(function () { say('无法连接服务器'); });
    };
    cancel.onclick = function () { closeMask(mask); };
    mask.addEventListener('mousedown', function (e) { if (e.target === mask) closeMask(mask); });
    mask.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMask(mask); });
    mask.appendChild(h('div', { class: 'ax-dlg' }, [h('h3', { text: '修改头像' }), prev, info, file, msg,
      h('div', { class: 'ax-row', style: 'margin-bottom:10px' }, [pick, rm]), h('div', { class: 'ax-row' }, [cancel, save])]));
    document.body.appendChild(mask);
  };

  /* ---------- 顶栏账号区 ---------- */
  var bars = [];
  Auth.mountBar = function (el) { bars.push(el); render(); };

  function toast(t) {
    var n = h('div', { text: t });
    n.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:200;padding:10px 18px;border-radius:12px;background:#1B2A4A;color:#fff;font:14px "Noto Sans SC",sans-serif;max-width:90vw';
    document.body.appendChild(n); setTimeout(function () { closeMask(n); }, 2400);
  }
  Auth.toast = toast;

  function doLogout() {
    Auth.confirmBox('退出登录', '退出后需要重新输入账号密码才能再进入游戏和论坛。', '退出登录').then(function (ok) { if (ok) Auth.logout(); });
  }
  function doDelete() {
    Auth.confirmBox('注销账号', '账号、游戏存档、积分以及你在论坛发的帖子和回复都会被永久删除，无法恢复。确定要注销吗？', '确认注销', true).then(function (ok) {
      if (!ok) return;
      Auth.deleteAccount().then(function (res) {
        if (res.body && res.body.ok) toast('账号已注销');
        else if (res.status !== 401) toast((res.body && res.body.error) || '注销失败，请稍后再试');
      }).catch(function () { toast('无法连接服务器'); });
    });
  }

  function render() {
    bars.forEach(function (el) {
      el.textContent = '';
      el.classList.add('ax-bar');
      if (!Auth.isLoggedIn()) {
        el.appendChild(h('button', { type: 'button', class: 'pill', text: '登录 / 注册', onclick: function () { Auth.openLogin(); } }));
        return;
      }
      var name = Auth.user();
      var menu = h('div', { class: 'ax-menu' });
      var chip = h('button', { type: 'button', class: 'pill ax-chip', 'aria-haspopup': 'true' }, [
        Auth.avatar(name, Auth.myAvatarVersion() !== '0' ? Auth.myAvatarVersion() : '0', 22),
        h('b', { text: name }), h('span', { text: '▾' })
      ]);
      menu.appendChild(h('button', { type: 'button', text: '修改头像', onclick: function () { menu.classList.remove('open'); Auth.openAvatar(); } }));
      menu.appendChild(h('button', { type: 'button', text: '修改密码', onclick: function () { menu.classList.remove('open'); Auth.openPassword(); } }));
      menu.appendChild(h('button', { type: 'button', text: '退出登录', onclick: function () { menu.classList.remove('open'); doLogout(); } }));
      if (!Auth.isAdmin()) menu.appendChild(h('button', { type: 'button', class: 'warn', text: '注销账号', onclick: function () { menu.classList.remove('open'); doDelete(); } }));
      chip.onclick = function (e) { e.stopPropagation(); menu.classList.toggle('open'); };
      el.appendChild(chip); el.appendChild(menu);
    });
  }
  document.addEventListener('click', function () {
    document.querySelectorAll('.ax-menu.open').forEach(function (m) { m.classList.remove('open'); });
  });

  window.Auth = Auth;
})();
