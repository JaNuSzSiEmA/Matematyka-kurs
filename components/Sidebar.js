import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { createClient } from '@supabase/supabase-js';
import SignOutButton from './SignOutButton';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Tabs configuration (removed "General")
const TABS = [
  { key: 'kurs', label: 'Kurs', href: '/dashboard' },
  { key: 'generator', label: 'Generator', href: '/generator' },
  { key: 'ai', label: 'AI', href: '/ai' },
  { key: 'repetytorium', label: 'Repetytorium', href: '/repetytorium' },
  { key: 'mathmare', label: 'Mathmare', href: '/mathmare' },
  { key: 'opcje', label: 'Opcje', href: '/options' },
];

export default function Sidebar() {
  const router = useRouter();
  const [email, setEmail] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!mounted) return;
        setEmail(session?.user?.email ?? null);
      } catch {
        // ignore
      }
    })();
    return () => (mounted = false);
  }, []);

  function isActive(href) {
    if (!href) return false;
    // exact match for root-like paths, prefix match for others
    if (href === '/') return router.pathname === '/';
    return router.pathname === href || router.pathname.startsWith(href + '/');
  }

  return (
    <aside
      aria-label="Main navigation"
      className="fixed left-0 top-0 z-40 h-full w-56 bg-white/90 px-3 py-6 backdrop-blur-sm"
    >
      <div className="flex h-full flex-col justify-between">
        <div>
          <Link href="/" className="flex items-center gap-3 px-2">
            {/* placeholder logo (you said you'll replace later) */}
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-700 text-white">
              M
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-900">MaturaTesty</div>
              <div className="text-xs text-gray-500">Nauka & Testy</div>
            </div>
          </Link>

          <nav className="mt-6 space-y-1">
            {TABS.map((t) => {
              const active = isActive(t.href);
              return (
                <Link
                  key={t.key}
                  href={t.href}
                  className={[
                    'group flex w-full items-center gap-3 border px-3 py-2 text-sm font-medium transition',
                    'rounded-none', // sharp corners
                    active
                      ? 'bg-green-800 text-white border-green-800'
                      : 'text-gray-700 border-gray-200 hover:bg-gray-100 hover:text-gray-900',
                  ].join(' ')}
                >
                  {/* dot removed */}
                  <span>{t.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="mt-6">
          <div className="px-2">
            <div className="mb-2 text-xs font-semibold text-gray-500">Konto</div>
            <div className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <div className="h-8 w-8 rounded-full bg-gray-200" />
              <div className="flex-1 text-sm">
                <div className="truncate font-medium text-gray-800">{email ?? '—'}</div>
                <div className="text-xs text-gray-500">Zalogowany</div>
              </div>
            </div>

            <div className="mt-3">
              <SignOutButton className="mt-2 w-full" />
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}