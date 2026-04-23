const crypto = require('crypto');

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const SALT = process.env.APP_SALT || 'fitapp_sl_2025';

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

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, username, pin } = req.body || {};

  if (!username || !pin) return res.status(400).json({ error: 'Manjkajoči podatki' });
  if (username.length < 2 || username.length > 30) return res.status(400).json({ error: 'Ime mora biti med 2 in 30 znakov' });
  if (pin.length < 4 || pin.length > 8) return res.status(400).json({ error: 'PIN mora biti 4–8 znakov' });

  const key = `user:${username.toLowerCase().trim()}`;

  if (action === 'register') {
    const existing = await redis('GET', key);
    if (existing.result) return res.status(409).json({ error: 'To ime je že zasedeno. Izberi drugo.' });

    await redis('SET', key, JSON.stringify({
      pinHash: hashPin(pin),
      displayName: username.trim(),
      createdAt: Date.now()
    }));

    return res.json({ ok: true, username: username.toLowerCase().trim(), displayName: username.trim() });
  }

  if (action === 'login') {
    const data = await redis('GET', key);
    if (!data.result) return res.status(404).json({ error: 'Uporabnik ne obstaja. Registriraj se.' });

    const user = JSON.parse(data.result);
    if (user.pinHash !== hashPin(pin)) return res.status(401).json({ error: 'Napačen PIN' });

    return res.json({ ok: true, username: username.toLowerCase().trim(), displayName: user.displayName || username.trim() });
  }

  res.status(400).json({ error: 'Neznana akcija' });
};
