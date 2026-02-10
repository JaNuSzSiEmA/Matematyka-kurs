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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [router.pathname]);

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
    <>
      {/* Mobile header with hamburger */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-700 text-white text-lg">
            📐
          </div>
          <div className="text-sm font-bold text-gray-900">Matematyka</div>
        </Link>
        
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 rounded-lg hover:bg-gray-100"
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        aria-label="Main navigation"
        className={`
          fixed left-0 top-0 z-40 h-full w-64 px-3 py-6 ui-surface ui-surface--strong
          transition-transform duration-300 ease-in-out
          ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0
        `}
      >
        <div className="flex h-full flex-col justify-between">
          <div>
            <Link href="/" legacyBehavior>
              <a className="flex items-center gap-3 px-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-700 text-white font-bold text-sm">
                  📐
                </div>
                <div>
                  <div className="ui-surface text-sm font-semibold text-gray-900">Matematyka</div>
                  <div className="ui-surface text-xs text-gray-500">Poziom podstawowy</div>
                </div>
              </a>
            </Link>

            <nav className="mt-6 space-y-2">
              {TABS.map((t) => {
                const active = isActive(t.href);

                return (
                  <Link href={t.href} key={t.key} legacyBehavior>
                    <a
                      className={`group flex w-full items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg focus:outline-none sidebar-tab ${
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
            <div className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 py-2 pr-3 pl-3 ui-surface">
              <div className="flex-1 text-sm overflow-hidden">
                <div className="font-medium text-gray-800 ui-surface truncate">{email ?? '—'}</div>
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
            transform: translate(-4px, -2px);
            box-shadow:
              0 8px 16px rgba(0,0,0,0.12),
              6px 4px 12px rgba(0,0,0,0.05);
            background-color: rgba(255,255,255,0.92);
            color: #111827;
            z-index: 20;
          }

          .sidebar-tab:not(.sidebar-active):focus-visible {
            transform: translate(-4px, -2px);
            box-shadow:
              0 8px 16px rgba(0,0,0,0.12),
              6px 4px 12px rgba(0,0,0,0.05);
            background-color: rgba(255,255,255,0.92);
            color: #111827;
            z-index: 20;
          }

          .sidebar-active {
            background-color: #065f46;
            color: #ffffff !important;
            transform: translate(-4px, -2px);
            box-shadow:
              0 10px 20px rgba(0,0,0,0.14),
              8px 6px 16px rgba(0,0,0,0.07);
            z-index: 20;
          }
        `}</style>
      </aside>

      {/* Spacer for mobile to push content below header */}
      <div className="lg:hidden h-16" />
    </>
  );
}