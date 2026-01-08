export default async function handler(req, res) {
  // Allow GET to return OK for quick checks
  if (req.method !== 'POST') return res.status(200).json({ ok: true });

  try {
    const body = req.body || {};
    const event = body.event;

    // Accept either a full session or just the tokens
    const s = body.session || {};
    const access_token = s.access_token || body.access_token;
    const refresh_token = s.refresh_token || body.refresh_token;

    const base = 'Path=/; HttpOnly; Secure; SameSite=Lax';

    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      if (!access_token || !refresh_token) {
        return res.status(400).json({ error: 'Missing access_token or refresh_token' });
      }
      res.setHeader('Set-Cookie', [
        `sb-access-token=${access_token}; ${base}; Max-Age=604800`,   // 7 days
        `sb-refresh-token=${refresh_token}; ${base}; Max-Age=2592000` // 30 days
      ]);
      return res.status(200).json({ ok: true });
    }

    if (event === 'SIGNED_OUT') {
      res.setHeader('Set-Cookie', [
        `sb-access-token=; ${base}; Max-Age=0`,
        `sb-refresh-token=; ${base}; Max-Age=0`
      ]);
      return res.status(200).json({ ok: true });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('callback error:', e);
    return res.status(500).json({ error: 'callback error' });
  }
}