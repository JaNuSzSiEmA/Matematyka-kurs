import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = createPagesServerClient({ req, res });
  const { event, session } = req.body || {};

  try {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      await supabase.auth.setSession(session);
    } else if (event === 'SIGNED_OUT') {
      await supabase.auth.signOut();
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'callback error' });
  }
}