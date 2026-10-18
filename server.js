'use strict';
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim()).filter(Boolean);
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: (origin, cb) => {
  if (!origin || ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
  return cb(new Error('Origin tidak diizinkan oleh ALLOWED_ORIGINS.'));
}}));
app.use(express.json({ limit: '16kb' }));
app.use('/api/', rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false }));

app.get('/health', (_req, res) => res.json({ ok: true, service: 'yugen-nexus-backend', time: new Date().toISOString() }));

function validVideoUrl(value) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    return host === 'tiktok.com' || host.endsWith('.tiktok.com') || host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be';
  } catch { return false; }
}

app.post('/api/ampreset', async (req, res) => {
  const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
  if (!url || !validVideoUrl(url)) return res.status(400).json({ ok: false, error: 'Masukkan URL video TikTok atau YouTube yang valid.' });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 22_000);
  try {
    const upstream = new URL('https://api.nexadev.my.id/api/ampreset');
    upstream.searchParams.set('url', url);
    const response = await fetch(upstream, { headers: { Accept: 'application/json' }, signal: controller.signal });
    const raw = await response.text();
    let data;
    try { data = JSON.parse(raw); } catch { return res.status(502).json({ ok: false, error: 'API NexaDev mengembalikan data yang bukan JSON.' }); }
    if (!response.ok) return res.status(502).json({ ok: false, error: `API NexaDev merespons HTTP ${response.status}`, upstream: data });
    return res.status(200).json(data);
  } catch (err) {
    const timeoutError = err?.name === 'AbortError';
    return res.status(timeoutError ? 504 : 502).json({ ok: false, error: timeoutError ? 'API NexaDev timeout.' : 'Tidak dapat menghubungi API NexaDev.' });
  } finally { clearTimeout(timeout); }
});

app.use((err, _req, res, _next) => {
  if (err?.message?.includes('Origin tidak diizinkan')) return res.status(403).json({ ok: false, error: err.message });
  return res.status(500).json({ ok: false, error: 'Kesalahan server.' });
});
app.listen(PORT, () => console.log(`Yugen Nexus backend listening on ${PORT}`));
