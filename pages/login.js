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

  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const [sessionEmail, setSessionEmail] = useState(null);
  const syncedRef = useRef(false);

  async function syncAndRedirect(session) {
    try {
      const tokens = session
        ? { access_token: session.access_token, refresh_token: session.refresh_token }
        : null;
      if (tokens?.access_token && tokens?.refresh_token) {
        await fetch('/api/auth/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ event: 'SIGNED_IN', session: tokens }),
        });
      }
    } catch (e) {}

    const redirectedFrom = router.query.redirectedFrom;
    const dest =
      typeof redirectedFrom === 'string' && redirectedFrom.startsWith('/')
        ? redirectedFrom
        : '/home';

    if (typeof window !== 'undefined') {
      window.location.replace(dest);
      return;
    }

    try {
      await router.replace(dest);
    } catch {}
  }

  useEffect(() => {
    let subscription = null;

    supabase.auth.getSession().then(({ data }) => {
      const s = data?.session || null;
      setSessionEmail(s?.user?.email ?? null);
      if (s && !syncedRef.current) {
        syncedRef.current = true;
        syncAndRedirect(s);
      }
    });

    const { data: subData } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionEmail(session?.user?.email ?? null);
      if (session && !syncedRef.current) {
        syncedRef.current = true;
        syncAndRedirect(session);
      }
    });

    subscription = subData?.subscription ?? null;
    return () => {
      try {
        subscription?.unsubscribe();
      } catch {}
    };
  }, [router.query.redirectedFrom]);

  async function signInWithPassword(e) {
    e.preventDefault();
    setMsg('');
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setMsg('Błąd: ' + error.message);
      } else {
        setMsg('Zalogowano! Przekierowanie…');
        await syncAndRedirect(data?.session ?? null);
      }
    } finally {
      setLoading(false);
    }
  }

  async function signUpWithPassword(e) {
    e.preventDefault();
    setMsg('');

    if (password !== passwordConfirm) {
      setMsg('Błąd: Hasła nie są takie same.');
      return;
    }

    setLoading(true);
    try {
      const site =
        process.env.NEXT_PUBLIC_SITE_URL ||
        (typeof window !== 'undefined' ? window.location.origin : '');

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${site}/login`,
        },
      });

      if (error) {
        const lower = (error.message || '').toLowerCase();
        if (lower.includes('already') || lower.includes('registered') || lower.includes('exists')) {
          setMsg('Ten adres email jest już przypisany do istniejącego konta.');
        } else {
          setMsg('Błąd: ' + error.message);
        }
        return;
      }

      const hasIdentity = (data?.user?.identities || []).length > 0;
      if (!hasIdentity) {
        setMsg('Ten adres email jest już przypisany do istniejącego konta.');
        return;
      }

      setMsg('Sprawdź email, aby potwierdzić rejestrację.');
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
      if (error) setMsg('Błąd: ' + error.message);
      else setMsg('Wylogowano.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div
  className="login-card"
  style={{
    width: '100%',
    maxWidth: 420,
    padding: 24,
  }}
>
        <h1 style={{ marginTop: 0, color: '#0f172a' }}>Logowanie</h1>

        {sessionEmail ? (
          <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', padding: 12, borderRadius: 10, marginBottom: 12 }}>
            <div><strong>Zalogowano jako:</strong> {sessionEmail}</div>
            <div style={{ marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button onClick={signOut} disabled={loading} style={btn()}>
                Wyloguj się
              </button>
              <Link href="/courses/matematyka_podstawa" style={linkBtn()}>
                Przejdź do kursu
              </Link>
            </div>
          </div>
        ) : (
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: 12, borderRadius: 10, marginBottom: 12 }}>
            <div>Nie jesteś zalogowany.</div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <button
            type="button"
            onClick={() => setMode('login')}
            style={mode === 'login' ? tabActive() : tab()}
          >
            Zaloguj się
          </button>
          <button
            type="button"
            onClick={() => setMode('register')}
            style={mode === 'register' ? tabActive() : tab()}
          >
            Zarejestruj się
          </button>
        </div>

        <form onSubmit={mode === 'login' ? signInWithPassword : signUpWithPassword}>
          <label style={label()}>
            Email
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ty@example.com"
              type="email"
              required
              style={input()}
            />
          </label>

          <label style={label()}>
            Hasło
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              type="password"
              required
              style={input()}
            />
          </label>

          {mode === 'register' && (
            <label style={label()}>
              Powtórz hasło
              <input
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                placeholder="••••••••"
                type="password"
                required
                style={input()}
              />
            </label>
          )}

          <button disabled={loading} type="submit" style={btn({ width: '100%', marginTop: 6 })}>
            {loading ? 'Proszę czekać...' : mode === 'login' ? 'Zaloguj się' : 'Utwórz konto'}
          </button>
        </form>

        {msg ? <p style={{ marginTop: 12, color: msg.startsWith('Błąd:') ? '#b91c1c' : '#065f46' }}>{msg}</p> : null}

        <hr style={{ margin: '16px 0', border: 0, borderTop: '1px solid rgba(15,23,42,0.15)' }} />

        <div style={{ fontSize: 14, color: '#0f172a' }}>
          <div>
            Link testowy do kursu:{' '}
            <Link href="/courses/matematyka_podstawa">/courses/matematyka_podstawa</Link>
          </div>
          <div style={{ marginTop: 6 }}>
            Rejestracja wymaga potwierdzenia email.
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
  return { display: 'block', fontSize: 14, marginBottom: 12, color: '#0f172a' };
}

function btn(extra = {}) {
  return {
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid #0f172a',
    background: '#0f172a',
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
    border: '1px solid #0f172a',
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
    border: '1px solid #0f172a',
    background: '#0f172a',
    color: 'white',
  };
}