import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/router';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function SignOutButton({ className = '' }) {
  const router = useRouter();

  async function signOut() {
    try {
      await supabase.auth.signOut();
      router.push('/login');
    } catch (e) {
      console.error('Sign out failed', e);
      router.push('/login');
    }
  }

  return (
    <button
      type="button"
      onClick={signOut}
      className={`w-full rounded-none border border-black bg-white px-3 py-2 text-sm font-semibold text-black transition hover:bg-black hover:text-white ${className}`}
    >
      Wyloguj
    </button>
  );
}