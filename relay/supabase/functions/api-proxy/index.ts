// Supabase Edge Function：把浏览器发来的 /api/... 请求原样转给真正的后端（Cloudflare Pages + D1）。
// 浏览器 → xxx.supabase.co（国内能连）→ 本函数 → Cloudflare 后端（服务器之间互联，不受国内封锁影响）
// 数据库、账号、网盘都还在 Cloudflare 后端，这里不存任何东西。
const UPSTREAM = (Deno.env.get('UPSTREAM') ?? 'https://api.ssy2901.abrdns.com').replace(/\/+$/, '');
const RELAY_KEY = Deno.env.get('RELAY_KEY') ?? '';   // 可选：和 Cloudflare 里的 RELAY_KEY 相同，后端才会采信下面的真实 IP
const NAME = '/api-proxy';   // 函数名，部署时要和这里一致
const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, x-drive',
  'Access-Control-Max-Age': '86400',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url);
  const i = url.pathname.indexOf(NAME);
  const rest = i >= 0 ? url.pathname.slice(i + NAME.length) : url.pathname;
  if (!rest.startsWith('/api/')) return new Response('not found', { status: 404, headers: CORS });

  // 只转发后端需要的请求头，不带 Supabase 的 authorization / apikey
  const h = new Headers();
  for (const k of ['content-type', 'x-drive', 'accept', 'range']) { const v = req.headers.get(k); if (v) h.set(k, v); }
  // 把浏览器的真实 IP 告诉后端（登录记录用）；没设置 RELAY_KEY 就不发，后端会当成不可信
  if (RELAY_KEY) {
    const ip = (req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0] || '').trim();
    if (ip) { h.set('x-client-ip', ip); h.set('x-relay-key', RELAY_KEY); }
  }
  let up: Response;
  try {
    up = await fetch(UPSTREAM + rest + url.search, {
      method: req.method, headers: h,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : req.body,
      // @ts-ignore: 流式转发请求体（上传文件用）
      duplex: 'half',
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'upstream unreachable' }), { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
  const out = new Headers(up.headers);
  for (const k of ['content-encoding', 'content-length', 'transfer-encoding', 'connection']) out.delete(k);
  for (const [k, v] of Object.entries(CORS)) out.set(k, v);
  return new Response(up.body, { status: up.status, headers: out });
});
