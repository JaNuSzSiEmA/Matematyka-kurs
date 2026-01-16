import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/router';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function SignOutButton({ className = '', onClick, label = 'Wyloguj' }) {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  // If a custom onClick is provided (e.g. navigate to login), use it.
  // Otherwise perform the default sign-out flow.
  async function handleClick() {
    if (onClick) {
      try {
        onClick();
      } catch (e) {
        console.error('SignOutButton onClick failed', e);
      }
      return;
    }

    if (isSigningOut) return;
    setIsSigningOut(true);

    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Supabase signOut error:', error);
      }

      // Notify server-side callback (best effort)
      try {
        await fetch('/api/auth/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ event: 'SIGNED_OUT' }),
        });
      } catch (e) {
        console.error('auth callback failed:', e);
      }
    } catch (e) {
      console.error('Sign out failed', e);
    } finally {
      // Force a full navigation so server/client state is refreshed.
      if (typeof window !== 'undefined') {
        window.location.replace('/login');
      } else {
        router.replace('/login');
      }
    }
  }

  const isBusy = isSigningOut && !onClick;

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={label}
      aria-busy={isBusy}
      disabled={isBusy}
      className={`signout-btn ${className}`}
    >
      <span className="inner">
        <span className="icon-wrap">
          <img src="/logout-icon.png" alt="" className="icon" />
        </span>
        <span className="label">{isBusy ? 'Trwa wylogowywanie…' : label}</span>
      </span>

      <style jsx>{`
        /* configurable values */
        .signout-btn {
          --side-pad: 14px;
          --icon-size: 22px;
          width: 80%;
          height: 48px;
          background: #e0e0e0;
          color: black;
          border: none;
          padding: 0 var(--side-pad);
          cursor: pointer;
          display: block;
          position: relative;
          overflow: visible;
          border-radius: 0;
          transition: background-color 160ms ease, color 160ms ease, border-radius 160ms ease, opacity 160ms ease, transform 160ms ease;
          text-align: left;
        }

        .signout-btn:disabled {
          cursor: default;
          opacity: 0.6;
          transform: none;
        }

        .signout-btn:focus {
          outline: 3px solid rgba(34,197,94,0.25);
          outline-offset: 2px;
        }

        .inner {
          display: block;
          height: 100%;
          position: relative;
        }

        .icon-wrap {
          position: absolute;
          left: var(--side-pad);
          top: 50%;
          transform: translateY(-50%);
          width: var(--icon-size);
          height: var(--icon-size);
          display: block;
        }

        .icon {
          width: var(--icon-size);
          height: var(--icon-size);
          display: block;
          transition: transform 300ms cubic-bezier(.2,.9,.2,1), filter 300ms ease;
          transform: translateX(10px);
          vertical-align: middle;
          filter: none;
        }

        .label {
          position: absolute;
          right: var(--side-pad);
          top: 50%;
          transform: translateY(-50%) translateX(-18px);
          opacity: 0;
          white-space: nowrap;
          font-weight: 600;
          font-size: 15px;
          line-height: 1;
          transition: transform 260ms cubic-bezier(.2,.9,.2,1), opacity 200ms ease;
          color: inherit;
          pointer-events: none;
        }

        .signout-btn:hover .icon,
        .signout-btn:focus-visible .icon {
          transform: translateX(0);
        }

        .signout-btn:hover .label,
        .signout-btn:focus-visible .label {
          transform: translateY(-50%) translateX(0);
          opacity: 1;
        }

        .signout-btn .label {
          color: inherit;
        }

        :global(.theme-dark) .signout-btn {
          background: var(--ui-bg, #0b0b0b);
          color: var(--ui-text, #e6eef6);
          border-radius: 8px;
        }

        :global(.theme-dark) .signout-btn .icon {
          filter: invert(1) contrast(120%) brightness(1.05);
        }

        :global(.theme-dark) .signout-btn:hover,
        :global(.theme-dark) .signout-btn:focus-visible {
          background: var(--ui-bg, #0b0b0b);
          color: var(--ui-text, #e6eef6);
          border-radius: 10px;
        }

        :global(.theme-dark) .signout-btn:hover .icon,
        :global(.theme-dark) .signout-btn:focus-visible .icon {
          transform: translateX(0);
          filter: invert(1) contrast(120%) brightness(1.05);
        }

        :global(.theme-dark) .signout-btn .label {
          color: inherit;
        }
      `}</style>
    </button>
  );
}