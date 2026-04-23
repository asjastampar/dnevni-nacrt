const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const SALT = process.env.APP_SALT || 'fitapp_sl_2025';

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

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, username, pin } = req.body || {};

  if (!username || !pin) return res.status(400).json({ error: 'Manjkajoči podatki' });
  if (username.length < 2 || username.length > 30) return res.status(400).json({ error: 'Ime mora biti med 2 in 30 znakov' });
  if (String(pin).length < 4 || String(pin).length > 8) return res.status(400).json({ error: 'PIN mora biti 4–8 znakov' });

  const uname = username.toLowerCase().trim();
  const key = `user:${uname}`;

  if (action === 'register') {
    const existing = await redis('GET', key);
    if (existing.result) return res.status(409).json({ error: 'To ime je že zasedeno. Izberi drugo.' });
    const pinHash = await hashPin(String(pin));
    await redis('SET', key, JSON.stringify({
      pinHash,
      displayName: username.trim(),
      createdAt: Date.now()
    }));
    return res.json({ ok: true, username: uname, displayName: username.trim() });
  }

  if (action === 'login') {
    const data = await redis('GET', key);
    if (!data.result) return res.status(404).json({ error: 'Uporabnik ne obstaja. Registriraj se.' });
    const user = JSON.parse(data.result);
    const pinHash = await hashPin(String(pin));
    if (user.pinHash !== pinHash) return res.status(401).json({ error: 'Napačen PIN' });
    return res.json({ ok: true, username: uname, displayName: user.displayName || username.trim() });
  }

  res.status(400).json({ error: 'Neznana akcija' });
};
