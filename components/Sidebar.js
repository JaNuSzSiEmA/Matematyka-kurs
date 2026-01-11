import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { createClient } from '@supabase/supabase-js';
import SignOutButton from './SignOutButton';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

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

  function normalizePath(p) {
    if (!p) return '/';
    const path = p.split('?')[0].split('#')[0].replace(/\/+$/, '');
    return path === '' ? '/' : path;
  }

  function isActive(href) {
    if (!href) return false;
    const current = normalizePath(router.asPath || router.pathname || '/');
    const target = normalizePath(href);
    return current === target || current.startsWith(target + '/');
  }

  return (
    <aside
      aria-label="Main navigation"
      className="fixed left-0 top-0 z-40 h-full w-56 px-3 py-6 ui-surface ui-surface--strong"
    >
      <div className="flex h-full flex-col justify-between">
        <div>
          <Link href="/" legacyBehavior>
            <a className="flex items-center gap-3 px-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-700 text-white">
                LOGO
              </div>
              <div>
                <div className="ui-surface text-sm font-semibold text-gray-900">NAZWA</div>
                <div className="ui-surface text-xs text-gray-500">NAZWA2</div>
              </div>
            </a>
          </Link>

          <nav className="mt-6 space-y-3">
            {TABS.map((t) => {
              const active = isActive(t.href);

              return (
                <Link href={t.href} key={t.key} legacyBehavior>
                  <a
                    className={`group flex w-full items-center gap-3 px-3 py-2 text-m font-medium rounded-lg focus:outline-none sidebar-tab ${
                      active ? 'sidebar-active' : 'sidebar-inactive'
                    }`}
                    aria-current={active ? 'page' : undefined}
                  >
                    <span className="sidebar-label">{t.label}</span>
                  </a>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="mt-6 px-2">
          <div className="mb-2 text-xs font-semibold text-gray-500"></div>
          <div className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 py-2  pr-5 ui-surface">
            <div className=" rounded-full ui-surface" />
            <div className="flex-1 text-sm overflow-hidden">
              <div className="font-medium text-gray-800 ui-surface">{email ?? '—'}</div>
              <div className="text-xs text-gray-500">Zalogowany</div>
            </div>
          </div>

          <div className="mt-3">
            <SignOutButton className="mt-2 w-full" />
          </div>
        </div>
      </div>

      <style jsx>{`
        .sidebar-tab {
          position: relative;
          color: #374151;
          text-decoration: none;
          transition:
            transform 200ms cubic-bezier(.2,.9,.2,1),
            box-shadow 200ms cubic-bezier(.2,.9,.2,1),
            background-color 160ms ease,
            color 160ms ease;
          will-change: transform, box-shadow, background-color, color;
          display: flex;
          align-items: center;
        }

        .sidebar-inactive {
          color: #374151;
          background-color: transparent;
        }

        .sidebar-tab .sidebar-label {
          color: inherit;
          display: inline-block;
          line-height: 1;
        }

        /* Hover / focus only for non-active tabs */
        .sidebar-tab:not(.sidebar-active):hover {
          transform: translate(-6px, -4px);
          box-shadow:
            0 10px 18px rgba(0,0,0,0.14),
            8px 6px 16px rgba(0,0,0,0.06);
          background-color: rgba(255,255,255,0.92);
          color: #111827;
          z-index: 20;
        }

        .sidebar-tab:not(.sidebar-active):focus-visible {
          transform: translate(-6px, -4px);
          box-shadow:
            0 10px 18px rgba(0,0,0,0.14),
            8px 6px 16px rgba(0,0,0,0.06);
          background-color: rgba(255,255,255,0.92);
          color: #111827;
          z-index: 20;
        }

        .sidebar-active {
          background-color: #065f46; /* green-800 */
          color: #ffffff !important;
          transform: translate(-6px, -4px);
          box-shadow:
            0 12px 22px rgba(0,0,0,0.16),
            10px 8px 20px rgba(0,0,0,0.08);
          z-index: 20;
        }
      `}</style>
    </aside>
  );
}