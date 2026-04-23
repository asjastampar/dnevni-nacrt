const crypto = require('crypto');

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const SALT = process.env.APP_SALT || 'fitapp_sl_2025';
const EXPIRE_DAYS = 120;

function hashPin(pin) {
  return crypto.createHash('sha256').update(pin + SALT).digest('hex');
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
    return user.pinHash === hashPin(pin);
  } catch { return false; }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const params = req.method === 'GET' ? req.query : (req.body || {});
  const { action, username, pin, date } = params;

  if (!username || !pin) return res.status(401).json({ error: 'Ni avtorizacije' });

  const valid = await verifyUser(username.toLowerCase().trim(), pin);
  if (!valid) return res.status(401).json({ error: 'Napačni podatki' });

  const uname = username.toLowerCase().trim();

  // ── SAVE daily bundle ──
  if (action === 'save' && req.method === 'POST') {
    const { date: d, payload } = req.body;
    if (!d || !payload) return res.status(400).json({ error: 'Manjkajoči date ali payload' });

    const commands = [
      ['SET', `data:${uname}:${d}`, JSON.stringify(payload)],
      ['EXPIRE', `data:${uname}:${d}`, EXPIRE_DAYS * 86400],
      // Keep index of dates for this user
      ['SADD', `dates:${uname}`, d]
    ];
    await redisPipeline(commands);
    return res.json({ ok: true });
  }

  // ── LOAD single day ──
  if (action === 'load' && req.method === 'GET') {
    if (!date) return res.status(400).json({ error: 'Manjkajoči date' });
    const d = await redis('GET', `data:${uname}:${date}`);
    return res.json({ ok: true, data: d.result ? JSON.parse(d.result) : null });
  }

  // ── HISTORY — last 14 days ──
  if (action === 'history' && req.method === 'GET') {
    const dates = [];
    const today = new Date();
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
