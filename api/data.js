const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const SALT = process.env.APP_SALT || 'fitapp_sl_2025';
const EXPIRE_DAYS = 120;

async function hashPin(pin) {
  const enc = new TextEncoder();
  const data = enc.encode(pin + SALT);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function redis(cmd, ...args) {
  const parts = [cmd, ...args].map((a, i) => i === 0 ? a : encodeURIComponent(String(a)));
  const res = await fetch(`${REDIS_URL}/${parts.join('/')}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
  });
  return res.json();
}

async function redisPipeline(commands) {
  const res = await fetch(`${REDIS_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands)
  });
  return res.json();
}

async function verifyUser(username, pin) {
  const d = await redis('GET', `user:${username}`);
  if (!d.result) return false;
  try {
    const user = JSON.parse(d.result);
    const pinHash = await hashPin(String(pin));
    return user.pinHash === pinHash;
  } catch { return false; }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const params = req.method === 'GET' ? req.query : (req.body || {});
  const { action, username, pin } = params;

  if (!username || !pin) return res.status(401).json({ error: 'Ni avtorizacije' });

  const uname = username.toLowerCase().trim();
  const valid = await verifyUser(uname, pin);
  if (!valid) return res.status(401).json({ error: 'Napačni podatki' });

  // ── SAVE daily bundle ──
  if (action === 'save' && req.method === 'POST') {
    const { date, payload } = req.body;
    if (!date || !payload) return res.status(400).json({ error: 'Manjkajoči date ali payload' });
    const commands = [
      ['SET', `data:${uname}:${date}`, JSON.stringify(payload)],
      ['EXPIRE', `data:${uname}:${date}`, EXPIRE_DAYS * 86400],
      ['SADD', `dates:${uname}`, date]
    ];
    await redisPipeline(commands);
    return res.json({ ok: true });
  }

  // ── LOAD single day ──
  if (action === 'load' && req.method === 'GET') {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'Manjkajoči date' });
    const d = await redis('GET', `data:${uname}:${date}`);
    return res.json({ ok: true, data: d.result ? JSON.parse(d.result) : null });
  }

  // ── HISTORY ──
  if (action === 'history' && req.method === 'GET') {
    const today = new Date();
    const dates = [];
    for (let i = 1; i <= 14; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      dates.push(d.toISOString().split('T')[0]);
    }
    const cmds = dates.map(d => ['GET', `data:${uname}:${d}`]);
    const results = await redisPipeline(cmds);
    const history = {};
    dates.forEach((d, i) => {
      if (results[i]?.result) history[d] = JSON.parse(results[i].result);
    });
    return res.json({ ok: true, history });
  }

  res.status(400).json({ error: 'Neznana akcija' });
};
