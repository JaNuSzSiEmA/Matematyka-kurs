import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).end('Method Not Allowed');

    const course_id = req.query.course_id;
    if (!course_id) return res.status(400).json({ error: 'Missing course_id' });

    // Check envs (do NOT log the actual key)
    const hasUrl = Boolean(process.env.SUPABASE_URL);
    const hasServiceKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
    if (!hasUrl || !hasServiceKey) {
      return res.status(500).json({
        error: 'Server env missing',
        details: {
          SUPABASE_URL_set: hasUrl,
          SUPABASE_SERVICE_ROLE_KEY_set: hasServiceKey,
        },
      });
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    const authHeader = req.headers.authorization || '';
    const tokenMatch = authHeader.match(/^Bearer (.+)$/);
    if (!tokenMatch) return res.status(401).json({ error: 'Missing or invalid Authorization header' });

    const accessToken = tokenMatch[1];

    // Validate token and get user
    const { data: userData, error: userErr } = await supabase.auth.getUser(accessToken);
    if (userErr || !userData?.user) {
      return res.status(401).json({ error: 'Invalid access token', details: userErr?.message || null });
    }

    const email = userData.user.email;
    if (!email) return res.status(400).json({ error: 'User has no email' });

    const { data, error } = await supabase
      .from('user_courses')
      .select('id')
      .eq('email', email)
      .eq('course_id', course_id)
      .limit(1);

    if (error) {
      return res.status(500).json({ error: 'Database error', details: error.message });
    }

    return res.status(200).json({ access: Array.isArray(data) && data.length > 0, email, course_id });
  } catch (e) {
    console.error('has-access crashed:', e);
    return res.status(500).json({ error: 'has-access crashed', details: e?.message || String(e) });
  }
}