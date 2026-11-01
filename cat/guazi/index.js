/*
 * 瓜子|体育 —— 独立版 CatVod Node 源（零依赖，Node 18+）
 * 从 cat.999888123.xyz 的 index.js 中抽出 sportaiguazi 模块重写。
 * 路由与原包一致：/config、/check、/health、/spider/guazisport/3/{init,home,category,detail,play,search}
 */
const http = require('http');
const https = require('https');
const crypto = require('crypto');

const API = 'https://api.46d5umpk.com';
const KEY = Buffer.from('KANGEQIU@8868!~.', 'utf8');
const IV = Buffer.from('0200010900030207', 'utf8');
const SITE_KEY = 'guazisport';
const SITE_NAME = '瓜子|体育';
const PREFIX = `/spider/${SITE_KEY}/3`;
const AD_TIP = '不要相信视频中的任何广告！';

const CLASSES = [
  { type_id: 'hot', type_name: '热门' },
  { type_id: 'nba', type_name: 'NBA' },
  { type_id: 'football', type_name: '足球' },
  { type_id: 'basketball', type_name: '篮球' },
];
const QUERY = {
  hot: '{"frame":"0","hot":"1","tag":"0","type":"0"}',
  nba: '{"frame":"0","hot":"0","tag":"37","type":"0"}',
  football: '{"frame":"0","hot":"0","tag":"0","type":"1"}',
  basketball: '{"frame":"0","hot":"0","tag":"0","type":"2"}',
};

const s = (v, d = '') => (v == null || v === '' ? d : String(v));
const pad = (n) => String(n).padStart(2, '0');

function enc(text) {
  const c = crypto.createCipheriv('aes-128-cbc', KEY, IV);
  return Buffer.concat([c.update(String(text), 'utf8'), c.final()]).toString('base64');
}
function dec(b64) {
  const d = crypto.createDecipheriv('aes-128-cbc', KEY, IV);
  return Buffer.concat([d.update(String(b64), 'base64'), d.final()]).toString('utf8');
}

function post(url, form, headers) {
  // 不依赖全局 fetch：App 内置 Node 可能没有 fetch
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'http:' ? http : https;
    const req = mod.request({
      method: 'POST', hostname: u.hostname, port: u.port || undefined, path: u.pathname + u.search,
      headers: { ...headers, 'Content-Length': Buffer.byteLength(form) }, timeout: 7000,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end(form);
  });
}

async function apiOnce(path, body) {
  const form = new URLSearchParams({ parameter: enc(body) }).toString();
  const text = await post(API + path, form, {
    'User-Agent': 'okhttp/3.12.0',
    'content-type': 'application/x-www-form-urlencoded',
    'user-platform': 'null',
    'client-version': '3.0.1.1',
    'client-channel': '',
    token: '',
  });
  let j;
  try { j = JSON.parse(text); } catch { throw new Error('接口返回异常 ' + text.slice(0, 40)); }
  if (!j || !j.data) throw new Error('接口无数据 ' + String(j?.code ?? '') + ' ' + String(j?.msg ?? j?.message ?? '').slice(0, 30));
  return JSON.parse(dec(j.data));
}

async function api(path, body) {
  let err;
  for (let i = 0; i < 2; i++) {
    try { return await apiOnce(path, body); } catch (e) { err = e; }
  }
  throw err;
}

const cache = new Map(); // 分类结果缓存：接口偶尔失败时用上一次的
function fmtTime(ms) {
  const t = new Date(ms + 8 * 3600 * 1000); // 统一按北京时间显示
  return `${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
}
function scoreText(h, v) {
  const a = Number(h?.score || 0), b = Number(v?.score || 0);
  return a > 0 || b > 0 ? ` 比分${a}-${b}` : '';
}

const spider = {
  async init() { return {}; },

  async home() { return { class: CLASSES, filters: {} }; },

  async category(body = {}) {
    const page = parseInt(body.page || body.pg || 1, 10) || 1;
    if (page !== 1) return { page, pagecount: 1, limit: 999, total: 0, list: [] };
    const tid = s(body.id || body.tid, 'hot');
    let data;
    try {
      data = await api('/gz/live/sports?parameter=key', QUERY[tid] || QUERY.hot);
      if (Array.isArray(data) && data.length) cache.set(tid, data);
    } catch (e) {
      data = cache.get(tid);
      if (!data) throw e;
    }
    const since = Date.now() - 24 * 3600 * 1000;
    const list = [];
    for (const m of Array.isArray(data) ? data : []) {
      const t = Number(m?.match_time || 0) * 1000;
      if (t < since || Number(m?.m_status || 0) >= 2) continue; // 跳过已结束
      const h = m?.home || {}, v = m?.visiting || {};
      const remarks = `${s(m?.event_name)} ${fmtTime(t)} ${s(m?.match_status_info)}`.trim() + scoreText(h, v);
      list.push({ vod_id: s(m?.mid), vod_name: `${s(h.name)} vs ${s(v.name)}`, vod_pic: s(h.logo), vod_remarks: remarks });
    }
    if (!list.length) list.push({ vod_id: 'empty', vod_name: '当前分类暂无比赛', vod_pic: '', vod_remarks: '瓜子体育' });
    return { page: 1, pagecount: 1, limit: 999, total: list.length, list };
  },

  async detail(body = {}) {
    const id = s(Array.isArray(body.id) ? body.id[0] : body.id);
    if (!id) throw new Error('瓜子体育参数为空');
    const d = await api('/gz/live/detail?parameter=key', JSON.stringify({ mid: id }));
    const h = d?.home || {}, v = d?.visiting || {};
    const remarks = s(d?.match_status_info) + scoreText(h, v);
    const lines = Array.isArray(d?.live_line) ? d.live_line : [];
    const urls = [];
    lines.forEach((l, i) => {
      if (s(l?.m3u8)) urls.push(`${s(l.name, `线路${i + 1}`).replace(/[$#]/g, ' ')}$${id}|||${i}`);
    });
    if (!urls.length) throw new Error('瓜子体育暂无直播源');
    return {
      list: [{
        vod_id: id,
        vod_name: `${s(h.name)} vs ${s(v.name)}`,
        vod_pic: s(h.logo),
        vod_remarks: remarks,
        vod_content: `${remarks} ${AD_TIP}`.trim(),
        vod_play_from: '直播',
        vod_play_url: urls.join('#'),
      }],
    };
  },

  // 播放时重新取一次详情，避免 auth_key 过期
  async play(body = {}) {
    const raw = s(body.id);
    if (!raw) throw new Error('瓜子体育播放地址为空');
    let url = raw;
    if (raw.includes('|||')) {
      const [mid, idx] = raw.split('|||');
      const d = await api('/gz/live/detail?parameter=key', JSON.stringify({ mid }));
      const lines = Array.isArray(d?.live_line) ? d.live_line : [];
      url = s(lines[Number(idx)]?.m3u8 || lines.find((l) => l?.m3u8)?.m3u8);
      if (!url) throw new Error('瓜子体育暂无直播源');
    }
    return {
      parse: 0,
      url,
      header: { 'User-Agent': 'Lavf/57.83.100', Referer: 'http://WJiZxLXA2.com/' },
      extra: { danmaku: '', nodanmu: true },
    };
  },

  async search() { return { list: [] }; },
};

function siteMeta(base) {
  return {
    key: `nodejs_${SITE_KEY}`,
    name: SITE_NAME,
    type: 3,
    api: base ? base + PREFIX : PREFIX,
    searchable: 0,
    quickSearch: 0,
    filterable: 0,
  };
}

function send(res, code, obj) {
  const buf = Buffer.from(JSON.stringify(obj));
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': buf.length, 'Access-Control-Allow-Origin': '*' });
  res.end(buf);
}

function readBody(req) {
  return new Promise((resolve) => {
    if (req.body !== undefined) return resolve(req.body);
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      if (!data) return resolve({});
      try { return resolve(JSON.parse(data)); } catch {}
      resolve(Object.fromEntries(new URLSearchParams(data)));
    });
    req.on('error', () => resolve({}));
  });
}

let stopped = false;
async function handler(req, res) {
  const u = new URL(req.url, 'http://127.0.0.1');
  const base = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host || '127.0.0.1'}`;
  try {
    if (u.pathname === '/health') return send(res, 200, { ok: true, name: 'CatVodSpiderios' });
    if (u.pathname === '/check') return send(res, 200, { run: !stopped });
    if (u.pathname === '/config' || u.pathname === '/full-config') {
      return send(res, 200, {
        video: { sites: [siteMeta(u.pathname === '/full-config' ? base : '')] },
        read: { sites: [] }, comic: { sites: [] }, music: { sites: [] }, pan: { sites: [] }, color: [],
      });
    }
    if (u.pathname.startsWith(PREFIX + '/')) {
      const action = u.pathname.slice(PREFIX.length + 1);
      const fn = spider[action === 'homeVod' ? 'home' : action];
      if (!fn) return send(res, 404, { msg: 'not found' });
      const body = Object.assign(Object.fromEntries(u.searchParams), await readBody(req));
      return send(res, 200, await fn.call(spider, body));
    }
    send(res, 404, { msg: 'not found' });
  } catch (e) {
    const msg = String(e?.message || e);
    // 分类出错时把原因显示成一条，方便排查
    if (u.pathname.endsWith('/category')) return send(res, 200, { page: 1, pagecount: 1, limit: 999, total: 1, list: [{ vod_id: 'err', vod_name: '出错：' + msg.slice(0, 60), vod_pic: '', vod_remarks: '瓜子体育' }], msg });
    send(res, 200, { list: [], msg });
  }
}

let server = null;
// 防止单次请求的意外异常把整个源进程带崩
process.on('uncaughtException', (e) => console.error('[guazi] uncaught', e?.message || e));
process.on('unhandledRejection', (e) => console.error('[guazi] unhandled', e?.message || e));
async function start(opts = {}) {
  stopped = false;
  server = typeof globalThis.catServerFactory === 'function'
    ? globalThis.catServerFactory(handler, {})
    : http.createServer(handler);
  const inApp = typeof globalThis.catServerFactory === 'function';
  let port = Number(process.env.DEV_HTTP_PORT || (inApp ? 0 : process.env.PORT || 9988));
  const host = inApp ? '127.0.0.1' : process.env.HOST || '0.0.0.0';
  for (;;) {
    try {
      await new Promise((ok, bad) => { server.once('error', bad); server.listen(port, host, ok); });
      break;
    } catch (e) {
      if (e?.code !== 'EADDRINUSE' || port === 0) throw e;
      port += 1;
    }
  }
  const addr = server.address.bind(server);
  server.address = function () {
    const r = addr();
    if (r && typeof r === 'object') { r.url = `http://127.0.0.1:${r.port}`; r.dynamic = 'js2p://_WEB_'; }
    return r;
  };
  port = server.address()?.port || port;
  console.log(`CatVodSpiderios listening on http://127.0.0.1:${port}`);
  return server;
}
async function stop() {
  stopped = true;
  if (server) await new Promise((ok) => server.close(() => ok()));
  server = null;
}

module.exports = { start, stop, spider };

if (process.env.CATVOD_DISABLE_AUTOSTART !== '1' && typeof globalThis.catServerFactory !== 'function' && require.main === module) {
  start().catch((e) => { console.error(e); process.exit(1); });
}
