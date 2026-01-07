import { createClient } from '@supabase/supabase-js';

export function requireServerEnvs(res) {
  const hasUrl = Boolean(process.env.SUPABASE_URL);
  const hasServiceKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!hasUrl || !hasServiceKey) {
    res.status(500).json({
      error: 'Server env missing',
      details: {
        SUPABASE_URL_set: hasUrl,
        SUPABASE_SERVICE_ROLE_KEY_set: hasServiceKey,
      },
    });
    return null;
  }

  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function getBearerToken(req) {
  const authHeader = req.headers.authorization || '';
  const m = authHeader.match(/^Bearer (.+)$/);
  return m ? m[1] : null;
}

export async function getUserFromRequest(req, res, supabase) {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return null;
  }

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) {
    res.status(401).json({ error: 'Invalid access token', details: userErr?.message || null });
    return null;
  }

  return { user: userData.user, accessToken: token };
}