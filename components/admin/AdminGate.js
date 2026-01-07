import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { getSessionOrRedirect, isCurrentUserAdmin } from '../../lib/admin';

export default function AdminGate({ children }) {
  const router = useRouter();
  const [state, setState] = useState({ loading: true, ok: false });

  useEffect(() => {
    (async () => {
      const session = await getSessionOrRedirect(router);
      if (!session) return;

      const ok = await isCurrentUserAdmin();
      if (!ok) {
        router.replace('/dashboard');
        return;
      }
      setState({ loading: false, ok: true });
    })();
  }, [router]);

  if (state.loading) {
    return (
      <div className="min-h-screen bg-white">
        <div className="mx-auto max-w-4xl p-6 text-sm text-gray-700">Ładowanie…</div>
      </div>
    );
  }

  if (!state.ok) return null;

  return children;
}