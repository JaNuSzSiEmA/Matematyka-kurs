import { useState } from 'react';
import { useRouter } from 'next/router';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function SignOutButton({ label = 'Wyloguj' }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSignOut() {
    setLoading(true);
    try {
      // Sign out on the client
      await supabase.auth.signOut();
      // Clear server cookies so middleware treats you as logged out
      try {
        await fetch('/api/auth/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ event: 'SIGNED_OUT' }),
        });
      } catch {}
      // Go to login
      router.replace('/login');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleSignOut}
      disabled={loading}
      style={{
        padding: '10px 12px',
        borderRadius: 10,
        border: '1px solid #111827',
        background: '#111827',
        color: 'white',
        cursor: 'pointer',
      }}
    >
      {loading ? 'Wylogowywanie…' : label}
    </button>
  );
}