import { useEffect, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/router';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function LoginPage() {
  const router = useRouter();

  const [mode, setMode] = useState('password'); // 'password' | 'magic'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  // Optional: show current session status
  const [sessionEmail, setSessionEmail] = useState(null);
  const syncedRef = useRef(false);

  // Robust redirect helper: send tokens to server, then navigate
  async function syncAndRedirect(session) {
    // If session provided (from Supabase) send tokens to server-side callback
    try {
      const tokens = session
        ? { access_token: session.access_token, refresh_token: session.refresh_token }
        : null;
      if (tokens?.access_token && tokens?.refresh_token) {
        // Wait for server callback to finish so server-side cookies are set
        await fetch('/api/auth/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ event: 'SIGNED_IN', session: tokens }),
        });
      }
    } catch (e) {
      // ignore but log (optional)
      // console.warn('syncAndRedirect: callback failed', e);
    }

    const redirectedFrom = router.query.redirectedFrom;
    const dest =
      typeof redirectedFrom === 'string' && redirectedFrom.startsWith('/')
        ? redirectedFrom
        : '/dashboard';

    // Force a full-page navigation so server-rendered pages see the new session/cookies.
    // Use replace to avoid leaving the login page in history.
    if (typeof window !== 'undefined') {
      window.location.replace(dest);
      return;
    }

    // fallback to client router if window isn't available
    try {
      await router.replace(dest);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    let subscription = null;

    // Try to get current session immediately
    supabase.auth.getSession().then(({ data }) => {
      const s = data?.session || null;
      setSessionEmail(s?.user?.email ?? null);
      if (s && !syncedRef.current) {
        syncedRef.current = true;
        syncAndRedirect(s);
      }
    });

    // Listen to auth changes and react (e.g., magic-link, social login)
    const { data: subData } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionEmail(session?.user?.email ?? null);
      if (session && !syncedRef.current) {
        syncedRef.current = true;
        syncAndRedirect(session);
      }
    });

    // unsubscribe safely when component unmounts
    subscription = subData?.subscription ?? null;
    return () => {
      try {
        subscription?.unsubscribe();
      } catch (e) {
        // ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.query.redirectedFrom]);

  async function signInWithPassword(e) {
    e.preventDefault();
    setMsg('');
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setMsg('Error: ' + error.message);
      } else {
        setMsg('Signed in! Redirecting…');
        // data.session may be null (depends on provider/config), but syncAndRedirect handles null
        await syncAndRedirect(data?.session ?? null);
      }
    } finally {
      setLoading(false);
    }
  }

  async function sendMagicLink(e) {
    e.preventDefault();
    setMsg('');
    setLoading(true);
    try {
      const site =
        process.env.NEXT_PUBLIC_SITE_URL ||
        (typeof window !== 'undefined' ? window.location.origin : '');
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${site}/login`,
        },
      });
      if (error) setMsg('Error: ' + error.message);
      else setMsg('Magic link sent! Check your email inbox/spam.');
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    setLoading(true);
    setMsg('');
    try {
      const { error } = await supabase.auth.signOut();
      try {
        await fetch('/api/auth/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ event: 'SIGNED_OUT' }),
        });
      } catch {}
      if (error) setMsg('Error: ' + error.message);
      else setMsg('Signed out.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 420, border: '1px solid #e5e7eb', borderRadius: 12, padding: 20 }}>
        <h1 style={{ marginTop: 0 }}>Login</h1>

        {sessionEmail ? (
          <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', padding: 12, borderRadius: 10, marginBottom: 12 }}>
            <div><strong>Signed in as:</strong> {sessionEmail}</div>
            <div style={{ marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button onClick={signOut} disabled={loading} style={btn()}>
                Sign out
              </button>
              <Link href="/courses/matematyka_podstawa" style={linkBtn()}>
                Go to course
              </Link>
            </div>
          </div>
        ) : (
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: 12, borderRadius: 10, marginBottom: 12 }}>
            <div>Not signed in.</div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <button
            type="button"
            onClick={() => setMode('password')}
            style={mode === 'password' ? tabActive() : tab()}
          >
            Email + Password
          </button>
          <button
            type="button"
            onClick={() => setMode('magic')}
            style={mode === 'magic' ? tabActive() : tab()}
          >
            Magic link
          </button>
        </div>

        <form onSubmit={mode === 'password' ? signInWithPassword : sendMagicLink}>
          <label style={label()}>
            Email
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              type="email"
              required
              style={input()}
            />
          </label>

          {mode === 'password' && (
            <label style={label()}>
              Password
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                type="password"
                required
                style={input()}
              />
            </label>
          )}

          <button disabled={loading} type="submit" style={btn({ width: '100%', marginTop: 6 })}>
            {loading ? 'Please wait...' : mode === 'password' ? 'Sign in' : 'Send magic link'}
          </button>
        </form>

        {msg ? <p style={{ marginTop: 12, color: msg.startsWith('Error:') ? '#b91c1c' : '#065f46' }}>{msg}</p> : null}

        <hr style={{ margin: '16px 0', border: 0, borderTop: '1px solid #e5e7eb' }} />

        <div style={{ fontSize: 14, color: '#374151' }}>
          <div>
            Course test link:{' '}
            <Link href="/courses/matematyka_podstawa">/courses/matematyka_podstawa</Link>
          </div>
          <div style={{ marginTop: 6 }}>
            If you use <strong>Magic link</strong>, you must configure email sending in Supabase or use a provider.
          </div>
        </div>
      </div>
    </div>
  );
}

function input() {
  return {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid #d1d5db',
    marginTop: 6,
    outline: 'none',
  };
}

function label() {
  return { display: 'block', fontSize: 14, marginBottom: 12, color: '#111827' };
}

function btn(extra = {}) {
  return {
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid #111827',
    background: '#111827',
    color: 'white',
    cursor: 'pointer',
    ...extra,
  };
}

function linkBtn() {
  return {
    display: 'inline-block',
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid #111827',
    textDecoration: 'none',
  };
}

function tab() {
  return {
    flex: 1,
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid #d1d5db',
    background: 'white',
    cursor: 'pointer',
  };
}

function tabActive() {
  return {
    ...tab(),
    border: '1px solid #111827',
    background: '#111827',
    color: 'white',
  };
}