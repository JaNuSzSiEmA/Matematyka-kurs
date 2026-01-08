import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';

export default async function handler(req, res) {
  // Allow GET to avoid noisy 405s during debugging
  if (req.method !== 'POST') return res.status(200).json({ ok: true });

  try {
    const supabase = createPagesServerClient({ req, res });
    const body = req.body || {};
    const event = body.event;

    // Accept either a full session or just tokens
    const s = body.session || {};
    const access_token = s.access_token || body.access_token;
    const refresh_token = s.refresh_token || body.refresh_token;

    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      if (!access_token || !refresh_token) {
        return res.status(400).json({ error: 'Missing access_token or refresh_token' });
      }
      // Set cookies so middleware can see the session
      await supabase.auth.setSession({ access_token, refresh_token });
    } else if (event === 'SIGNED_OUT') {
      await supabase.auth.signOut();
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('callback error:', e);
    return res.status(500).json({ error: e?.message || 'callback error' });
  }
}