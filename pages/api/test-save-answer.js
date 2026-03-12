import { requireServerEnvs, getUserFromRequest } from './_auth';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');

    const supabase = requireServerEnvs(res);
    if (!supabase) return;

    const auth = await getUserFromRequest(req, res, supabase);
    if (!auth) return;

    const userId = auth.user.id;

    const { island_id, exercise_id, answer } = req.body || {};
    if (!island_id || !exercise_id) {
      return res.status(400).json({ error: 'Missing island_id or exercise_id' });
    }

    // Verify active session not expired
    const { data: session } = await supabase
      .from('island_test_sessions')
      .select('id, expires_at, paused_at, is_active')
      .eq('user_id', userId)
      .eq('island_id', island_id)
      .eq('is_active', true)
      .maybeSingle();

    if (!session) return res.status(403).json({ error: 'No active test session' });
    if (session.paused_at) return res.status(403).json({ error: 'Test is paused' });

    const now = Date.now();
    const expiresAt = new Date(session.expires_at).getTime();
    if (expiresAt <= now) return res.status(403).json({ error: 'Test session expired' });

    // Save answer without checking correctness (is_correct = false placeholder)
    const { error: insErr } = await supabase.from('exercise_attempts').insert({
      user_id: userId,
      exercise_id,
      island_id,
      answer: answer ?? null,
      is_correct: false,
      points_awarded: 0,
      time_spent_sec: 0,
    });

    if (insErr) {
      return res.status(500).json({ error: 'Save failed', details: insErr.message });
    }

    return res.status(200).json({ saved: true });
  } catch (e) {
    console.error('test-save-answer crashed:', e);
    return res.status(500).json({ error: 'test-save-answer crashed', details: e?.message || String(e) });
  }
}
