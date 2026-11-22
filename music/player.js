/* ================================================================
   播放列表 —— 想加歌？两步：
   1. 把文件放进和 index.html 同一个文件夹（根目录）
   2. 在下面的 PLAYLIST 里加一行文件名，保存刷新即可播放

   · 写法一：直接写文件名     "新歌.mp3"
   · 写法二：需要自定义时     { src: "电影.mp4", title: "标题", artist: "作者", sub: "字幕.srt", cover: "封面.jpg" }
   · 字幕 / 歌词：和媒体同名的 .lrc / .vtt / .srt 会自动加载（也可用 sub 指定）
   · 支持：mp3 m4a aac wav ogg opus flac · mp4 webm mkv mov ogv · mid midi kar（具体取决于浏览器）
   · 也可以在页面里点「添加文件」或直接把文件拖进来（仅本次有效）
   · 注意：字幕和 MIDI 需要通过 http(s) 访问（GitHub Pages / 任意服务器 / 本地运行 python -m http.server）
           直接双击打开 file:// 时，音视频仍可播放，但浏览器会禁止读取 MIDI 与字幕文件
   ================================================================ */
const PLAYLIST = [
  "Erika.mid",
  "Runaway Baby.webm",
  { scr:"Peppa-Ja.mp4", sub:"Ja-CN.srt", title:"小猪佩奇-日语-简中"},
  { scr:"Peppa-Ja.mp4", sub:"Ja-TW.srt", title:"小猪佩奇-日语-繁中"},
  // "新歌.mp3",
  // { src: "电影.mp4", sub: "电影.srt", title: "自定义标题" },
];
/* ================================================================ 以下是播放器代码，一般无需修改 */

'use strict';
const $ = s => document.querySelector(s);
const el = {
  player: $('#player'), stage: $('#stage'), media: $('#media'), roll: $('#roll'), caption: $('#caption'),
  artTitle: $('#artTitle'), artTile: $('.art-tile'), title: $('#title'), subtitle: $('#subtitle'),
  seek: $('#seek'), tCur: $('#tCur'), tDur: $('#tDur'), vol: $('#vol'),
  play: $('#btnPlay'), prev: $('#btnPrev'), next: $('#btnNext'), mode: $('#btnMode'), rate: $('#btnRate'),
  mute: $('#btnMute'), cc: $('#btnCC'), fs: $('#btnFS'),
  list: $('#list'), lyrics: $('#lyrics'), nList: $('#nList'), nLyr: $('#nLyr'), tabList: $('#tabList'), tabLyr: $('#tabLyr'),
  fileMedia: $('#fileMedia'), fileSub: $('#fileSub'), drop: $('#drop'), toast: $('#toast')
};
const media = el.media;

/* ---------------- 常量与工具 ---------------- */
const MIDI_EXT = ['mid', 'midi', 'kar'];
const VIDEO_EXT = ['mp4', 'm4v', 'mov', 'webm', 'mkv', 'ogv', 'avi', 'mpg', 'mpeg'];
const SUB_EXT = ['srt', 'vtt', 'lrc', 'txt'];
const MEDIA_EXT = [...MIDI_EXT, ...VIDEO_EXT, 'mp3', 'm4a', 'aac', 'wav', 'ogg', 'oga', 'opus', 'flac', 'weba', 'wma', 'amr', 'aiff'];
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const MODES = [
  { icon: 'repeat', tip: '列表循环' }, { icon: 'repeat1', tip: '单曲循环' },
  { icon: 'shuffle', tip: '随机播放' }, { icon: 'once', tip: '顺序播放（播完停止）' }
];
const KIND_LABEL = { midi: 'MIDI', video: '视频', audio: '音频' };
const KIND_ICON = { midi: 'piano', video: 'movie', audio: 'note' };

const safeDecode = s => { try { return decodeURIComponent(s); } catch { return s; } };
const extOf = n => ((n.split(/[?#]/)[0].split('.').pop()) || '').toLowerCase();
const baseOf = n => n.split(/[?#]/)[0].split('/').pop();
const stripExt = n => n.replace(/\.[^./]+$/, '');
const isAbs = p => /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(p);
const toUrl = p => isAbs(p) ? p : safeDecode(p).split('/').map(encodeURIComponent).join('/');
const fmtTime = s => {
  s = Math.max(0, Math.floor(s || 0));
  const h = (s / 3600) | 0, m = ((s % 3600) / 60) | 0, x = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0');
};
const lowerBound = (arr, t, key = 's') => { let a = 0, b = arr.length; while (a < b) { const m = (a + b) >> 1; if (arr[m][key] < t) a = m + 1; else b = m; } return a; };
const valueAt = (arr, tick, def) => { if (!arr || !arr.length) return def; let a = 0, b = arr.length - 1, r = -1; while (a <= b) { const m = (a + b) >> 1; if (arr[m].tick <= tick) { r = m; a = m + 1; } else b = m - 1; } return r < 0 ? def : arr[r].v; };
function decodeBytes(b) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(b); } catch { }
  for (const enc of ['gbk', 'big5', 'shift_jis']) { try { return new TextDecoder(enc).decode(b); } catch { } }
  return new TextDecoder('latin1').decode(b);
}
function store(k, v) { try { localStorage.setItem('mp.' + k, JSON.stringify(v)); } catch { } }
function load(k, d) { try { const v = localStorage.getItem('mp.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } }
let toastTimer = 0;
function toast(msg, ms = 3600) {
  el.toast.textContent = msg; el.toast.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.toast.classList.remove('show'), ms);
}
const setIcon = (btn, name) => btn.querySelector('use').setAttribute('href', '#i-' + name);

/* ---------------- 字幕 / 歌词（SRT · VTT · LRC，自动识别） ---------------- */
function parseCues(text) {
  text = text.replace(/^﻿/, '').replace(/\r/g, '');
  const out = [];
  if (text.includes('-->')) {
    const ts = s => { const p = s.replace(',', '.').split(':').map(parseFloat); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]; };
    for (const block of text.split(/\n{2,}/)) {
      const lines = block.split('\n'), i = lines.findIndex(l => l.includes('-->'));
      if (i < 0) continue;
      const m = lines[i].match(/((?:\d+:)?\d+:\d+(?:[.,]\d+)?)\s*-->\s*((?:\d+:)?\d+:\d+(?:[.,]\d+)?)/);
      if (!m) continue;
      const t = lines.slice(i + 1).join('\n').replace(/<[^>]+>/g, '').replace(/\{\\[^}]*\}/g, '').trim();
      if (t) out.push({ s: ts(m[1]), e: ts(m[2]), t });
    }
    return out.sort((a, b) => a.s - b.s);
  }
  const re = /\[(\d+):(\d+(?:[.:]\d+)?)\]/g;                    // LRC（有些 .vtt 文件里装的其实是 LRC）
  for (const line of text.split('\n')) {
    const stamps = [...line.matchAll(re)]; if (!stamps.length) continue;
    const t = line.replace(re, '').replace(/<\d+:\d+(?:[.:]\d+)?>/g, '').trim();
    for (const m of stamps) out.push({ s: +m[1] * 60 + parseFloat(m[2].replace(':', '.')), t });
  }
  out.sort((a, b) => a.s - b.s);
  out.forEach((c, i) => {
    const nx = out.slice(i + 1).find(x => x.s > c.s);
    c.e = nx ? nx.s : c.s + 6;
  });
  return out.filter(c => c.t);
}
async function fetchCues(url) {
  try {
    const r = await fetch(url); if (!r.ok) return null;
    const c = parseCues(decodeBytes(new Uint8Array(await r.arrayBuffer())));
    return c.length ? c : null;
  } catch { return null; }
}

/* ---------------- MIDI 解析 ---------------- */
function parseMidi(buf, opt = {}) {
  const u = new Uint8Array(buf), dv = new DataView(buf);
  let p = 0;
  for (; p < u.length - 4; p++) if (u[p] === 0x4d && u[p + 1] === 0x54 && u[p + 2] === 0x68 && u[p + 3] === 0x64) break;   // MThd（兼容 RMID 外壳）
  if (p >= u.length - 4) throw new Error('不是有效的 MIDI 文件');
  const hlen = dv.getUint32(p + 4), ntrk = dv.getUint16(p + 10), div = dv.getUint16(p + 12);
  p += 8 + hlen;
  const smpte = div & 0x8000 ? (256 - (div >> 8)) * (div & 255) : 0;      // 每秒 tick 数（SMPTE 时间码）
  const tempos = [], raw = [], progs = [], lyr = [], ctrl = Array.from({ length: 16 }, () => ({}));
  const progOf = Array.from({ length: 16 }, () => []);

  for (let t = 0; t < ntrk && p + 8 <= u.length; t++) {
    const tag = String.fromCharCode(u[p], u[p + 1], u[p + 2], u[p + 3]), len = dv.getUint32(p + 4);
    p += 8; const end = Math.min(u.length, p + len);
    if (tag !== 'MTrk') { p = end; t--; continue; }
    let tick = 0, run = 0; const open = new Map();
    const vlq = () => { let v = 0, b; do { b = u[p++]; v = (v << 7) | (b & 127); } while (b & 128 && p < end); return v; };
    while (p < end) {
      tick += vlq();
      let st = u[p];
      if (st < 0x80) { st = run; if (!st) break; } else { p++; if (st < 0xf0) run = st; }
      if (st === 0xff) {
        const ty = u[p++], l = vlq();
        if (ty === 0x51 && l === 3) tempos.push({ tick, us: (u[p] << 16) | (u[p + 1] << 8) | u[p + 2] });
        else if (ty === 0x05 || (ty === 0x01 && opt.kar)) lyr.push({ tick, text: decodeBytes(u.subarray(p, p + l)) });
        p += l; if (ty === 0x2f) break;
      } else if (st === 0xf0 || st === 0xf7) { p += vlq(); }
      else {
        const hi = st >> 4, ch = st & 15, a = u[p++], b = (hi === 0xc || hi === 0xd) ? 0 : u[p++], key = ch * 128 + a;
        if (hi === 9 && b > 0) { (open.get(key) || open.set(key, []).get(key)).push({ tick, v: b }); }
        else if (hi === 8 || (hi === 9 && b === 0)) { const q = open.get(key); if (q && q.length) { const o = q.shift(); raw.push({ t0: o.tick, t1: tick, ch, n: a, v: o.v }); } }
        else if (hi === 0xc) progOf[ch].push({ tick, v: a });
        else if (hi === 0xb) (ctrl[ch][a] || (ctrl[ch][a] = [])).push({ tick, v: b });
      }
    }
    open.forEach((q, key) => q.forEach(o => raw.push({ t0: o.tick, t1: Math.max(tick, o.tick + div / 4), ch: key >> 7, n: key & 127, v: o.v })));
    p = end;
  }
  if (!raw.length) throw new Error('这个 MIDI 里没有音符');

  tempos.sort((a, b) => a.tick - b.tick);
  if (!tempos.length || tempos[0].tick > 0) tempos.unshift({ tick: 0, us: 500000 });
  const seg = []; let acc = 0;
  tempos.forEach((tp, i) => { if (i) { const pr = tempos[i - 1]; acc += (tp.tick - pr.tick) * pr.us / 1e6 / div; } seg.push({ tick: tp.tick, us: tp.us, sec: acc }); });
  const t2s = smpte ? (k => k / smpte) : (k => {
    let a = 0, b = seg.length - 1; while (a < b) { const m = (a + b + 1) >> 1; if (seg[m].tick <= k) a = m; else b = m - 1; }
    const g = seg[a]; return g.sec + (k - g.tick) * g.us / 1e6 / div;
  });
  progOf.forEach(a => a.sort((x, y) => x.tick - y.tick));
  ctrl.forEach(o => Object.values(o).forEach(a => a.sort((x, y) => x.tick - y.tick)));

  const notes = []; let dur = 0, lo = 127, hi = 0, maxD = 0; const voices = new Set(); const drums = { has: false };
  raw.sort((a, b) => a.t0 - b.t0);
  for (const r of raw) {
    const drum = r.ch === 9, c = ctrl[r.ch];
    const prog = drum ? -1 : valueAt(progOf[r.ch], r.t0, 0);
    const g = (valueAt(c[7], r.t0, 100) / 127) * (valueAt(c[11], r.t0, 127) / 127);
    let t1 = r.t1;
    if (!drum && c[64] && valueAt(c[64], t1, 0) >= 64) { const nx = c[64].find(e => e.tick > t1 && e.v < 64); if (nx) t1 = nx.tick; }   // 延音踏板
    const s = t2s(r.t0), vd = Math.max(0.06, t2s(r.t1) - s), d = Math.max(vd, t2s(t1) - s);
    notes.push({ s, d, vd, n: r.n, v: r.v, c: r.ch, p: prog, g });
    dur = Math.max(dur, s + d);
    if (drum) drums.has = true; else { voices.add(r.ch); lo = Math.min(lo, r.n); hi = Math.max(hi, r.n); maxD = Math.max(maxD, vd); }
  }
  if (lo > hi) { lo = 48; hi = 84; }
  const pan = Array.from({ length: 16 }, (_, c) => { const a = ctrl[c][10]; return a && a.length ? Math.max(-1, Math.min(1, (a[0].v - 64) / 64)) : 0; });

  // 卡拉 OK / 歌词事件 → 字幕行
  let cues = [];
  if (lyr.length) {
    lyr.sort((a, b) => a.tick - b.tick);
    const lines = []; let cur = null, lastT = 0;
    const flush = () => { if (cur && cur.t.trim()) lines.push(cur); cur = null; };
    for (const l of lyr) {
      if (l.text.startsWith('@')) continue;
      const tm = t2s(l.tick), brk = /^[\/\\]/.test(l.text) || /[\r\n]/.test(l.text);
      const tx = l.text.replace(/[\r\n]+/g, '').replace(/^[\/\\]+/, '');
      if (cur && (brk || tm - lastT > 1.6 || cur.t.length > 36)) flush();
      if (!cur) cur = { s: tm, t: '' };
      cur.t += tx; lastT = tm;
      if (/[\r\n]$/.test(l.text)) flush();
    }
    flush();
    cues = lines.map((ln, i) => ({ s: ln.s, e: lines[i + 1] ? lines[i + 1].s : ln.s + 4, t: ln.t.trim() }));
  }
  notes.sort((a, b) => a.s - b.s);
  return { notes, dur: dur + 0.5, lo, hi, maxD: Math.min(maxD, 20), voices: voices.size, drums: drums.has, pan, cues, bpm: Math.round(6e7 / tempos[0].us) };
}

/* ---------------- MIDI 合成器（Web Audio，无需音源库） ---------------- */
const FAMILY = [   // 按 GM 音色分组（每组 8 个音色）
  { w: 'piano', a: .004, d: 2.4, s: .04, r: .35 },                              // 0 钢琴
  { w: 'bell', a: .003, d: 1.8, s: .03, r: .4 },                                // 1 色彩打击
  { w: 'organ', a: .02, d: 0, r: .08 },                                         // 2 风琴
  { w: 'pluck', a: .003, d: 1.1, s: .05, r: .2 },                               // 3 吉他
  { w: 'sawtooth', a: .01, d: .8, s: .4, r: .12, lp: 900, g: .9 },              // 4 贝斯
  { w: 'sawtooth', a: .11, d: 0, r: .4, lp: 2200, det: 7, vib: 1 },             // 5 弦乐
  { w: 'sawtooth', a: .12, d: 0, r: .4, lp: 1800, det: 6, vib: 1 },             // 6 合奏
  { w: 'sawtooth', a: .05, d: 0, r: .15, lp: 2600, det: 4 },                    // 7 铜管
  { w: 'square', a: .05, d: 0, r: .12, lp: 1600, det: 3, g: .8 },               // 8 簧管
  { w: 'triangle', a: .06, d: 0, r: .15 },                                      // 9 木管
  { w: 'sawtooth', a: .02, d: 0, r: .1, lp: 3000, g: .8 },                      // 10 合成主音
  { w: 'triangle', a: .25, d: 0, r: .5, det: 5 },                               // 11 合成pad
  { w: 'sine', a: .1, d: 0, r: .4 },                                            // 12 效果
  { w: 'pluck', a: .003, d: .9, s: .05, r: .2 },                                // 13 民族乐器
  { w: 'bell', a: .002, d: .6, s: .02, r: .2 },                                 // 14 打击乐
  { w: 'sine', a: .05, d: 0, r: .3 }                                            // 15 音效
];
const CH_COLOR = ['#1a73e8', '#ea4335', '#34a853', '#f9ab00', '#8764b8', '#00b7c3', '#f7630c', '#e3008c', '#0f6cbd', '#107c10', '#8a8886', '#5c2e91', '#00b294', '#ca5010', '#4f6bed', '#a4262c'];
let ctx = null, master, chOut = [], chPan = [], noiseBuf, waves = {};
const live = new Set();

function audioInit() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.knee.value = 20; comp.ratio.value = 4;
  master = ctx.createGain(); master.connect(comp); comp.connect(ctx.destination); applyVolume();
  const bus = ctx.createGain(); bus.gain.value = .9; bus.connect(master);
  const len = Math.floor(ctx.sampleRate * 1.6), ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8); }
  const cv = ctx.createConvolver(); cv.buffer = ir; const wet = ctx.createGain(); wet.gain.value = .16; bus.connect(cv); cv.connect(wet); wet.connect(master);
  for (let c = 0; c < 16; c++) {
    const g = ctx.createGain();
    if (ctx.createStereoPanner) { const sp = ctx.createStereoPanner(); g.connect(sp); sp.connect(bus); chPan[c] = sp; } else g.connect(bus);
    chOut[c] = g;
  }
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const pw = a => ctx.createPeriodicWave(new Float32Array(a.length), new Float32Array(a));
  waves.piano = pw([0, 1, .5, .28, .16, .09, .05, .03]); waves.organ = pw([0, 1, 0, .5, 0, .35, 0, .2]);
  waves.pluck = pw([0, 1, .7, .4, .22, .12, .07, .04]); waves.bell = pw([0, 1, 0, .15, 0, .3, 0, 0, .12]);
}
function track(rel, oscs) { const v = { rel, oscs }; live.add(v); oscs[0].onended = () => live.delete(v); }
function voice(n, when, rate) {
  const pr = FAMILY[n.p >> 3] || FAMILY[0], hz = 440 * Math.pow(2, (n.n - 69) / 12);
  const peak = Math.pow(n.v / 127, 1.4) * .22 * n.g * (pr.g || 1) * (pr.det ? .6 : 1);
  const env = ctx.createGain(), rel = ctx.createGain(); let head = env;
  if (pr.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = Math.max(pr.lp, hz * 3); f.connect(env); head = f; }
  const oscs = [], mk = det => { const o = ctx.createOscillator(); if (waves[pr.w]) o.setPeriodicWave(waves[pr.w]); else o.type = pr.w; o.frequency.value = hz; o.detune.value = det; o.connect(head); oscs.push(o); };
  mk(0); if (pr.det) { mk(pr.det); mk(-pr.det); }
  if (pr.vib) { const l = ctx.createOscillator(), g = ctx.createGain(); l.frequency.value = 5.2; g.gain.value = 7; l.connect(g); oscs.slice().forEach(o => g.connect(o.detune)); oscs.push(l); }
  env.gain.setValueAtTime(0, when); env.gain.linearRampToValueAtTime(peak, when + pr.a);
  if (pr.d) env.gain.setTargetAtTime(peak * pr.s, when + pr.a, pr.d * (1.7 - n.n / 90) / 3);
  const off = when + Math.max(n.d / rate, .08);
  rel.gain.setValueAtTime(1, off); rel.gain.setTargetAtTime(0, off, pr.r / 3);
  env.connect(rel); rel.connect(chOut[n.c]);
  const end = off + pr.r + .3; oscs.forEach(o => { o.start(when); o.stop(end); });
  track(rel, oscs.slice().reverse());
}
function noiseHit(when, dur, type, fr, q, pk) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = fr; f.Q.value = q;
  const g = ctx.createGain(); g.gain.setValueAtTime(pk, when); g.gain.exponentialRampToValueAtTime(1e-4, when + dur);
  s.connect(f); f.connect(g); g.connect(chOut[9]); s.start(when); s.stop(when + dur + .05); track(g, [s]);
}
function toneHit(when, dur, f0, f1, pk) {
  const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(f0, when); o.frequency.exponentialRampToValueAtTime(f1, when + dur * .5);
  g.gain.setValueAtTime(pk, when); g.gain.exponentialRampToValueAtTime(1e-4, when + dur); o.connect(g); g.connect(chOut[9]); o.start(when); o.stop(when + dur + .05); track(g, [o]);
}
function drum(n, when) {
  const v = n.v / 127 * n.g, k = n.n;
  if (k === 35 || k === 36) toneHit(when, .28, 160, 42, .9 * v);
  else if (k === 38 || k === 40) { noiseHit(when, .17, 'highpass', 1200, 1, .5 * v); toneHit(when, .1, 220, 120, .3 * v); }
  else if (k === 42 || k === 44) noiseHit(when, .05, 'highpass', 7000, 1, .3 * v);
  else if (k === 46) noiseHit(when, .3, 'highpass', 6500, 1, .3 * v);
  else if ([49, 51, 52, 55, 57, 59].includes(k)) noiseHit(when, 1, 'highpass', 5000, 1, .28 * v);
  else if (k >= 41 && k <= 50) toneHit(when, .3, 90 + (k - 41) * 18, 50 + (k - 41) * 8, .6 * v);
  else noiseHit(when, .08, 'bandpass', 2500, 3, .35 * v);
}
function silenceAll() {
  if (!ctx) return; const t = ctx.currentTime;
  live.forEach(v => { try { v.rel.gain.cancelScheduledValues(t); v.rel.gain.setTargetAtTime(0, t, .015); v.oscs.forEach(o => { try { o.stop(t + .12); } catch { } }); } catch { } });
  live.clear();
}

/* MIDI 播放器（自己计时，用 Web Audio 时钟精确调度） */
const midi = {
  song: null, playing: false, offset: 0, startAt: 0, idx: 0, timer: 0, rate: 1,
  pos() { return this.playing ? Math.min(this.song.dur, Math.max(this.offset, this.offset + (ctx.currentTime - this.startAt) * this.rate)) : this.offset; },
  begin() { this.startAt = ctx.currentTime + .05; this.idx = lowerBound(this.song.notes, this.offset); },
  async play() {
    audioInit(); if (ctx.state !== 'running') await ctx.resume();
    this.song.pan.forEach((v, c) => { if (chPan[c]) chPan[c].pan.value = v; });
    if (this.offset >= this.song.dur - .05) this.offset = 0;
    this.playing = true; this.begin(); this.pump();
    clearInterval(this.timer); this.timer = setInterval(() => this.pump(), 25);
  },
  pause() { if (!this.playing) return; this.offset = this.pos(); this.playing = false; clearInterval(this.timer); silenceAll(); },
  stop() { this.pause(); this.offset = 0; },
  seek(t) { const was = this.playing; if (was) { this.playing = false; clearInterval(this.timer); silenceAll(); } this.offset = Math.max(0, Math.min(this.song.dur, t)); if (was) this.play(); roll.dirty = true; },
  setRate(r) { if (this.playing) { this.offset = this.pos(); silenceAll(); this.rate = r; this.begin(); } else this.rate = r; },
  pump() {
    if (!this.playing) return;
    const N = this.song.notes, now = ctx.currentTime, horizon = now + .6;
    while (this.idx < N.length) {
      const n = N[this.idx], w = this.startAt + (n.s - this.offset) / this.rate;
      if (w > horizon) break;
      if (w >= now - .05) { const ww = Math.max(w, now); n.c === 9 ? drum(n, ww) : voice(n, ww, this.rate); }
      this.idx++;
    }
    if (this.pos() >= this.song.dur) { this.playing = false; this.offset = this.song.dur; clearInterval(this.timer); onEnded(); }
  }
};

/* ---------------- 钢琴卷帘（MIDI 的“画面”） ---------------- */
const roll = {
  g: el.roll.getContext('2d'), W: 0, H: 0, dpr: 1, dirty: true,
  resize() {
    const r = el.roll.getBoundingClientRect(); this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = Math.max(1, r.width); this.H = Math.max(1, r.height);
    el.roll.width = Math.round(this.W * this.dpr); el.roll.height = Math.round(this.H * this.dpr);
    this.g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); this.dirty = true;
  },
  draw(t) {
    const s = midi.song, g = this.g, W = this.W, H = this.H; if (!s) return;
    g.clearRect(0, 0, W, H);
    const span = Math.max(4, Math.min(9, W / 100)), pps = W / span, px = W * .26;
    const t0 = t - px / pps, t1 = t + (W - px) / pps;
    const lo = s.lo - 1, hi = s.hi + 1, rows = hi - lo + 1, top = 14, bot = s.drums ? 34 : 14, rh = (H - top - bot) / rows;
    g.strokeStyle = '#e4e9f2'; g.lineWidth = 1; g.beginPath();
    for (let n = lo; n <= hi; n++) if (n % 12 === 0) { const y = Math.round(top + (hi - n + .5) * rh) + .5; g.moveTo(0, y); g.lineTo(W, y); }
    g.stroke();
    const N = s.notes, rr = g.roundRect ? (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); } : (x, y, w, h) => { g.beginPath(); g.rect(x, y, w, h); };
    for (let i = lowerBound(N, t0 - s.maxD); i < N.length && N[i].s < t1; i++) {
      const n = N[i], x = px + (n.s - t) * pps;
      if (n.c === 9) { if (x < -8 || x > W) continue; const a = n.s <= t && t - n.s < .12; g.globalAlpha = a ? 1 : t > n.s ? .3 : .75; g.fillStyle = a ? '#0b57d0' : '#8a94a6'; g.beginPath(); g.arc(x, H - 17, a ? 6 : 4, 0, 7); g.fill(); continue; }
      const w = Math.max(3, n.vd * pps - 1.5); if (x + w < 0) continue;
      const y = top + (hi - n.n) * rh, h = Math.max(3, rh - 1.5), on = n.s <= t && n.s + n.vd > t, past = n.s + n.vd <= t;
      g.fillStyle = CH_COLOR[n.c]; g.globalAlpha = on ? 1 : past ? .28 : .82;
      if (on) { g.shadowColor = CH_COLOR[n.c]; g.shadowBlur = 10; }
      rr(x, y, w, h, Math.min(4, h / 2)); g.fill(); g.shadowBlur = 0;
    }
    g.globalAlpha = 1; g.fillStyle = '#0b57d0'; g.fillRect(px - 1, 0, 2, H);
    this.dirty = false;
  }
};
new ResizeObserver(() => roll.resize()).observe(el.roll);

/* ---------------- 播放器状态 ---------------- */
const state = { vol: load('vol', .8), muted: load('muted', false), mode: load('mode', 0), cc: load('cc', true), rate: 1 };
let items = [], idx = -1, token = 0, cur = { kind: 'none' }, cues = [], dragging = false, lastCapKey = '', lastLyrKey = '';
const isMidi = () => cur.kind === 'midi';
const hasMedia = () => cur.kind === 'media';
const curTime = () => isMidi() ? midi.pos() : hasMedia() ? (media.currentTime || 0) : 0;
const curDur = () => isMidi() ? midi.song.dur : hasMedia() && isFinite(media.duration) ? media.duration : 0;
const isPlaying = () => isMidi() ? midi.playing : hasMedia() && !media.paused && !media.ended;

function applyVolume() {
  media.volume = state.vol; media.muted = state.muted;
  if (master) master.gain.setTargetAtTime(state.muted ? 0 : state.vol, ctx.currentTime, .02);
  el.vol.value = state.muted ? 0 : state.vol; paintRange(el.vol);
  setIcon(el.mute, state.muted || state.vol === 0 ? 'mute' : 'vol');
}
const paintRange = r => r.style.setProperty('--p', (r.max > 0 ? (r.value - r.min) / (r.max - r.min) * 100 : 0) + '%');

async function play() {
  if (idx < 0) { if (!items.length) return; await openItem(0, true); return; }
  if (cur.kind === 'none') return;
  try { isMidi() ? await midi.play() : await media.play(); }
  catch (e) { toast('无法播放：' + (e.message || e)); }
  syncUI();
}
function pause() { isMidi() ? midi.pause() : media.pause(); syncUI(); }
function seekTo(t) { if (isMidi()) midi.seek(t); else if (hasMedia()) media.currentTime = Math.max(0, Math.min(curDur() || t, t)); }
const toggle = () => isPlaying() ? pause() : play();

/* ---------------- 条目 ---------------- */
function makeItem(p) {
  const o = typeof p === 'string' ? { src: p } : { ...p };
  o.name = o.name || safeDecode(baseOf(o.src));
  o.title = o.title || stripExt(o.name);
  o.ext = extOf(o.name);
  o.kind = MIDI_EXT.includes(o.ext) ? 'midi' : VIDEO_EXT.includes(o.ext) ? 'video' : 'audio';
  o.url = o.file ? o.src : toUrl(o.src);
  return o;
}
async function openItem(i, autoplay) {
  if (i < 0 || i >= items.length) return;
  const tok = ++token, it = items[i];
  if (isMidi()) midi.stop(); else media.pause();
  media.removeAttribute('src'); media.load();
  idx = i; cur = { kind: 'none' }; setCues([]); it.bad = false;
  setStage('audio'); el.stage.classList.add('loading'); el.stage.classList.remove('playing');
  showMeta(it); drawList();
  el.seek.value = 0; paintRange(el.seek); el.tCur.textContent = '0:00'; el.tDur.textContent = '0:00';
  try {
    if (it.kind === 'midi') {
      let buf;
      if (it.file) buf = await it.file.arrayBuffer();
      else { const r = await fetch(it.url); if (!r.ok) throw new Error('找不到文件（HTTP ' + r.status + '）'); buf = await r.arrayBuffer(); }
      if (tok !== token) return;
      const song = parseMidi(buf, { kar: it.ext === 'kar' });
      midi.song = song; midi.offset = 0; midi.playing = false; midi.rate = state.rate; cur = { kind: 'midi' };
      setStage('midi'); roll.resize(); roll.draw(0);
      it.info = song.voices + ' 个声部 · ' + song.bpm + ' BPM';
    } else {
      cur = { kind: 'media' };
      await new Promise((ok, no) => {
        const done = () => { off(); ok(); }, fail = () => { off(); no(new Error(mediaError())); };
        const off = () => { media.removeEventListener('loadedmetadata', done); media.removeEventListener('error', fail); };
        media.addEventListener('loadedmetadata', done); media.addEventListener('error', fail);
        media.src = it.url; media.load();
      });
      if (tok !== token) return;
      it.kind = media.videoWidth ? 'video' : 'audio';
      setStage(it.kind === 'video' ? 'video' : 'audio'); media.playbackRate = state.rate;
    }
    el.stage.classList.remove('loading'); showMeta(it); drawList(); applyVolume(); syncUI();
    // 字幕：显式指定 > 配对文件 > 同名 lrc/vtt/srt > MIDI 内嵌歌词
    let found = null;
    if (it.subCues) found = it.subCues;
    else if (!it.file) {
      const cands = it.sub ? [toUrl(it.sub)] : ['lrc', 'vtt', 'srt'].map(e => stripExt(it.url) + '.' + e);
      for (const u of cands) { found = await fetchCues(u); if (found) break; if (tok !== token) return; }
    }
    if (tok !== token) return;
    if (!found && it.kind === 'midi' && midi.song.cues.length) found = midi.song.cues;
    if (found) setCues(found);
    if (autoplay) play();
  } catch (e) {
    if (tok !== token) return;
    it.bad = true; cur = { kind: 'none' }; el.stage.classList.remove('loading'); setStage('error'); drawList(); syncUI();
    el.artTitle.textContent = '无法播放';
    const hint = location.protocol === 'file:' && !it.file ? '（用 file:// 打开时浏览器禁止读取该文件，请通过本地服务器或网站访问）' : '';
    toast('「' + it.title + '」' + (e.message || '加载失败') + hint, 6000);
  }
}
function mediaError() {
  const c = media.error && media.error.code;
  return c === 3 ? '解码失败，文件可能已损坏' : c === 4 ? '格式不受当前浏览器支持，或文件不存在' : c === 2 ? '网络错误' : '加载失败';
}
function showMeta(it) {
  el.title.textContent = it.title; el.artTitle.textContent = it.title;
  el.subtitle.textContent = [KIND_LABEL[it.kind], it.artist, it.info].filter(Boolean).join(' · ');
  document.title = it.title + ' · 媒体播放器';
  el.artTile.innerHTML = it.cover ? '' : '<svg class="i"><use href="#i-' + KIND_ICON[it.kind] + '"/></svg>';
  if (it.cover) { const im = new Image(); im.alt = ''; im.src = it.file ? it.cover : toUrl(it.cover); el.artTile.appendChild(im); }
  if ('mediaSession' in navigator) {
    try { navigator.mediaSession.metadata = new MediaMetadata({ title: it.title, artist: it.artist || '', album: '媒体播放器' }); } catch { }
  }
}
function setStage(mode) { el.stage.dataset.mode = mode; }

function nextIndex(auto) {
  if (!items.length) return -1;
  if (state.mode === 2 && items.length > 1) { let r; do { r = Math.floor(Math.random() * items.length); } while (r === idx); return r; }
  const n = idx + 1;
  if (n >= items.length) return auto && state.mode === 3 ? -1 : 0;
  return n;
}
function next(auto) { const n = nextIndex(auto); if (n < 0) { seekTo(0); pause(); return; } openItem(n, true); }
function prev() { if (curTime() > 3) { seekTo(0); return; } if (items.length) openItem((idx - 1 + items.length) % items.length, true); }
function onEnded() { if (state.mode === 1) { seekTo(0); play(); } else next(true); }

function removeItem(i) {
  const it = items[i]; if (it.file) URL.revokeObjectURL(it.src);
  const wasCur = i === idx; items.splice(i, 1);
  if (!items.length) { idx = -1; ++token; if (isMidi()) midi.stop(); else media.pause(); media.removeAttribute('src'); media.load(); cur = { kind: 'none' }; setCues([]); setStage('empty'); resetMeta(); }
  else if (wasCur) openItem(Math.min(i, items.length - 1), isPlaying());
  else if (i < idx) idx--;
  drawList(); syncUI();
}
function resetMeta() { el.title.textContent = '未加载'; el.subtitle.textContent = ''; el.artTitle.textContent = '还没有曲目'; document.title = '媒体播放器'; el.tCur.textContent = el.tDur.textContent = '0:00'; el.seek.value = 0; paintRange(el.seek); }

/* ---------------- 列表 / 歌词 UI ---------------- */
function drawList() {
  el.list.innerHTML = ''; el.nList.textContent = items.length;
  if (!items.length) { el.list.innerHTML = '<li class="empty">播放列表是空的<br>在 <b>player.js</b> 顶部的 PLAYLIST 里加上文件名，<br>或点「添加文件」</li>'; return; }
  items.forEach((it, i) => {
    const li = document.createElement('li');
    li.className = 'item' + (i === idx ? ' cur' : '') + (it.bad ? ' bad' : ''); li.tabIndex = 0; li.setAttribute('role', 'option'); li.setAttribute('aria-selected', i === idx);
    const tile = i === idx && isPlaying() ? '<span class="mini-eq"><i></i><i></i><i></i></span>' : '<svg class="i"><use href="#i-' + (it.bad ? 'warn' : KIND_ICON[it.kind]) + '"/></svg>';
    li.innerHTML = '<span class="tile">' + tile + '</span><span class="txt"><b></b><small></small></span><button class="ib rm" type="button" title="从列表移除"><svg class="i"><use href="#i-close"/></svg></button>';
    li.querySelector('b').textContent = it.title;
    li.querySelector('small').textContent = [KIND_LABEL[it.kind], it.artist].filter(Boolean).join(' · ');
    li.onclick = () => i === idx && cur.kind !== 'none' ? toggle() : openItem(i, true);
    li.onkeydown = e => { if (e.target === li && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); li.onclick(); } };
    li.querySelector('.rm').onclick = e => { e.stopPropagation(); removeItem(i); };
    el.list.appendChild(li);
  });
  const c = el.list.querySelector('.cur'); if (c) c.scrollIntoView({ block: 'nearest' });
}
function setCues(c) {
  cues = c; lastCapKey = lastLyrKey = ''; el.nLyr.textContent = c.length; el.lyrics.innerHTML = '';
  if (!c.length) { el.lyrics.innerHTML = '<div class="empty">没有字幕 / 歌词<br>把同名的 .lrc / .vtt / .srt 放在同一目录会自动加载，<br>也可点右上角「加载字幕」</div>'; el.caption.hidden = true; el.cc.classList.remove('on'); return; }
  el.cc.classList.toggle('on', state.cc);
  c.forEach((cu, i) => { const d = document.createElement('div'); d.className = 'ly'; d.dataset.i = i; d.textContent = cu.t; d.onclick = () => seekTo(cu.s); el.lyrics.appendChild(d); });
}
function tickCues(t) {
  if (!cues.length) return;
  const act = []; for (let i = 0; i < cues.length; i++) { const c = cues[i]; if (c.s > t) { if (c.s > t + 600) break; continue; } if (t < c.e) act.push(i); }
  const key = act.join(',');
  if (key !== lastCapKey) {
    lastCapKey = key; const txt = act.map(i => cues[i].t).join('\n');
    el.caption.textContent = txt; el.caption.hidden = !txt || !state.cc;
  }
  if (key !== lastLyrKey) {
    lastLyrKey = key; const nodes = el.lyrics.children;
    for (let i = 0; i < nodes.length; i++) nodes[i].classList.toggle('on', act.includes(i));
    const first = nodes[act[0]];
    if (first && !el.lyrics.hidden) el.lyrics.scrollTo({ top: first.offsetTop - el.lyrics.clientHeight / 2 + first.clientHeight / 2 });
  }
}
function selectTab(name) {
  const lyr = name === 'lyr';
  el.tabList.setAttribute('aria-selected', !lyr); el.tabLyr.setAttribute('aria-selected', lyr);
  el.list.hidden = lyr; el.lyrics.hidden = !lyr;
  if (lyr) { const on = el.lyrics.querySelector('.on'); if (on) el.lyrics.scrollTo({ top: on.offsetTop - el.lyrics.clientHeight / 2, behavior: 'auto' }); }
}

function syncUI() {
  const p = isPlaying();
  setIcon(el.play, p ? 'pause' : 'play'); el.play.classList.toggle('playing', p);
  el.play.title = p ? '暂停 (空格)' : '播放 (空格)';
  el.stage.classList.toggle('playing', p);
  const cl = el.list.querySelector('.cur .tile');
  if (cl) cl.innerHTML = p ? '<span class="mini-eq"><i></i><i></i><i></i></span>' : '<svg class="i"><use href="#i-' + (items[idx] ? KIND_ICON[items[idx].kind] : 'note') + '"/></svg>';
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = p ? 'playing' : 'paused';
}
function frame() {
  const t = curTime(), d = curDur();
  if (!dragging) { el.seek.value = d ? t / d * 1000 : 0; paintRange(el.seek); el.tCur.textContent = fmtTime(t); }
  el.tDur.textContent = fmtTime(d);
  tickCues(t);
  if (isMidi() && (midi.playing || roll.dirty)) roll.draw(t);
  requestAnimationFrame(frame);
}

/* ---------------- 添加本地文件 / 拖放 ---------------- */
async function addFiles(fileList) {
  const files = [...fileList], subs = [], meds = [];
  for (const f of files) {
    const e = extOf(f.name);
    if (SUB_EXT.includes(e)) subs.push(f);
    else if (/^(audio|video)\//.test(f.type) || MEDIA_EXT.includes(e)) meds.push(f);
  }
  if (!meds.length && !subs.length) { toast('没有可识别的音频 / 视频 / MIDI / 字幕文件'); return; }
  const first = items.length;
  for (const f of meds) {
    const it = makeItem({ src: URL.createObjectURL(f), name: f.name, file: f });
    const pair = subs.find(s => stripExt(s.name).toLowerCase() === stripExt(f.name).toLowerCase());
    if (pair) { const c = parseCues(decodeBytes(new Uint8Array(await pair.arrayBuffer()))); if (c.length) it.subCues = c; }
    items.push(it);
  }
  if (meds.length) { drawList(); openItem(first, true); toast('已添加 ' + meds.length + ' 个文件'); }
  else await applySubFile(subs[0]);
}
async function applySubFile(f) {
  if (!f) return;
  const c = parseCues(decodeBytes(new Uint8Array(await f.arrayBuffer())));
  if (!c.length) { toast('字幕解析失败（支持 SRT / VTT / LRC）'); return; }
  if (items[idx]) items[idx].subCues = c;
  setCues(c); toast('已加载：' + f.name + '（' + c.length + ' 行）');
}

/* ---------------- 事件 ---------------- */
el.play.onclick = toggle; el.next.onclick = () => next(false); el.prev.onclick = prev;
el.seek.addEventListener('pointerdown', () => dragging = true);
el.seek.addEventListener('input', () => { paintRange(el.seek); el.tCur.textContent = fmtTime(curDur() * el.seek.value / 1000); });
el.seek.addEventListener('change', () => { seekTo(curDur() * el.seek.value / 1000); dragging = false; });
el.seek.addEventListener('blur', () => dragging = false);
el.vol.oninput = () => { state.vol = +el.vol.value; state.muted = false; store('vol', state.vol); store('muted', false); applyVolume(); };
el.mute.onclick = () => { state.muted = !state.muted; store('muted', state.muted); applyVolume(); };
el.rate.onclick = () => {
  state.rate = SPEEDS[(SPEEDS.indexOf(state.rate) + 1) % SPEEDS.length];
  media.playbackRate = state.rate; midi.setRate(state.rate);
  el.rate.textContent = state.rate + '×'; el.rate.classList.toggle('on', state.rate !== 1);
};
function paintMode() { setIcon(el.mode, MODES[state.mode].icon); el.mode.title = MODES[state.mode].tip; el.mode.classList.toggle('on', state.mode !== 3); }
el.mode.onclick = () => { state.mode = (state.mode + 1) % MODES.length; store('mode', state.mode); paintMode(); toast(MODES[state.mode].tip, 1400); };
el.cc.onclick = () => { state.cc = !state.cc; store('cc', state.cc); el.cc.classList.toggle('on', state.cc && cues.length > 0); lastCapKey = ''; if (!state.cc) el.caption.hidden = true; };
const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
function toggleFS() {
  if (fsEl()) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
  const p = el.player;
  if (p.requestFullscreen) p.requestFullscreen().catch(() => { }); else if (p.webkitRequestFullscreen) p.webkitRequestFullscreen();
  else if (media.webkitEnterFullscreen && el.stage.dataset.mode === 'video') media.webkitEnterFullscreen();
}
el.fs.onclick = toggleFS;
if (!(el.player.requestFullscreen || el.player.webkitRequestFullscreen || media.webkitEnterFullscreen)) el.fs.hidden = true;
const onFS = () => { setIcon(el.fs, fsEl() ? 'fsx' : 'fs'); setTimeout(() => roll.resize(), 60); };
document.addEventListener('fullscreenchange', onFS); document.addEventListener('webkitfullscreenchange', onFS);
el.stage.addEventListener('click', () => { if (cur.kind !== 'none') toggle(); });
el.stage.addEventListener('dblclick', toggleFS);
el.tabList.onclick = () => selectTab('list'); el.tabLyr.onclick = () => selectTab('lyr');
$('#btnAdd').onclick = () => el.fileMedia.click(); $('#btnSub').onclick = () => el.fileSub.click();
el.fileMedia.onchange = () => { addFiles(el.fileMedia.files); el.fileMedia.value = ''; };
el.fileSub.onchange = () => { applySubFile(el.fileSub.files[0]); el.fileSub.value = ''; };

media.addEventListener('ended', onEnded);
media.addEventListener('play', syncUI); media.addEventListener('pause', syncUI);
media.addEventListener('waiting', () => el.stage.classList.add('loading'));
['playing', 'canplay', 'seeked'].forEach(e => media.addEventListener(e, () => el.stage.classList.remove('loading')));
media.addEventListener('error', () => { if (cur.kind === 'media' && media.getAttribute('src')) { el.stage.classList.remove('loading'); toast(mediaError()); syncUI(); } });

let dragDepth = 0;
const hasFiles = e => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
addEventListener('dragenter', e => { if (hasFiles(e)) { dragDepth++; el.drop.classList.add('show'); } });
addEventListener('dragleave', e => { if (hasFiles(e) && --dragDepth <= 0) { dragDepth = 0; el.drop.classList.remove('show'); } });
addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
addEventListener('drop', e => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth = 0; el.drop.classList.remove('show'); addFiles(e.dataTransfer.files); });

addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = e.target.tagName, onRange = tag === 'INPUT' && e.target.type === 'range';
  if (e.code === 'Space') { if (tag === 'BUTTON' || tag === 'LI') return; e.preventDefault(); toggle(); return; }
  if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') { if (onRange) return; e.preventDefault(); seekTo(curTime() + (e.code === 'ArrowRight' ? 5 : -5)); return; }
  if (e.code === 'ArrowUp' || e.code === 'ArrowDown') { if (onRange) return; e.preventDefault(); state.vol = Math.max(0, Math.min(1, state.vol + (e.code === 'ArrowUp' ? .05 : -.05))); state.muted = false; store('vol', state.vol); applyVolume(); return; }
  if (tag === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (k === 'm') el.mute.click(); else if (k === 'f') toggleFS(); else if (k === 'c') el.cc.click();
  else if (k === 'n') next(false); else if (k === 'p') prev();
});
if ('mediaSession' in navigator) {
  const h = (a, f) => { try { navigator.mediaSession.setActionHandler(a, f); } catch { } };
  h('play', play); h('pause', pause); h('previoustrack', prev); h('nexttrack', () => next(false));
  h('seekto', d => seekTo(d.seekTime)); h('seekbackward', () => seekTo(curTime() - 10)); h('seekforward', () => seekTo(curTime() + 10));
}

/* ---------------- 启动 ---------------- */
items = PLAYLIST.map(makeItem);
paintMode(); applyVolume(); setCues([]); drawList(); roll.resize(); onFS();
if (!state.cc) el.cc.classList.remove('on');
if (items.length) openItem(0, false); else { setStage('empty'); resetMeta(); }
if (location.protocol === 'file:') setTimeout(() => toast('提示：file:// 下无法读取 MIDI 与字幕，请用服务器打开（python -m http.server）', 6000), 600);
requestAnimationFrame(frame);
