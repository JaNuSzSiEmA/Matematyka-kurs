import { requireServerEnvs, getUserFromRequest } from './_auth';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');

    const supabase = requireServerEnvs(res);
    if (!supabase) return;

    const auth = await getUserFromRequest(req, res, supabase);
    if (!auth) return;

    const userId = auth.user.id;

    const { island_id } = req.body || {};
    if (!island_id) return res.status(400).json({ error: 'Missing island_id' });

    const { data: session, error: sessErr } = await supabase
      .from('island_test_sessions')
      .select('id, expires_at, paused_at, is_active')
      .eq('user_id', userId)
      .eq('island_id', island_id)
      .eq('is_active', true)
      .maybeSingle();

    if (sessErr) return res.status(500).json({ error: 'Load session failed', details: sessErr.message });
    if (!session) return res.status(404).json({ error: 'No active session found' });
    if (session.paused_at) return res.status(400).json({ error: 'Session already paused' });

    const now = new Date();
    const expiresAt = new Date(session.expires_at);
    const pauseRemainingSeconds = Math.max(0, Math.floor((expiresAt - now) / 1000));

    const { error: updateErr } = await supabase
      .from('island_test_sessions')
      .update({
        paused_at: now.toISOString(),
        pause_remaining_seconds: pauseRemainingSeconds,
      })
      .eq('id', session.id);

    if (updateErr) return res.status(500).json({ error: 'Pause failed', details: updateErr.message });

    return res.status(200).json({ paused: true, pause_remaining_seconds: pauseRemainingSeconds });
  } catch (e) {
    console.error('test-pause crashed:', e);
    return res.status(500).json({ error: 'test-pause crashed', details: e?.message || String(e) });
  }
}
