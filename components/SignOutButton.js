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
      aria-label="Wyloguj"
      className={`signout-btn ${className}`}
    >
      <span className="inner">
        <span className="icon-wrap">
          <img src="/logout-icon.png" alt="" className="icon" />
        </span>
        <span className="label">Wyloguj</span>
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
          transition: background-color 00ms ease, color 00ms ease, border-radius 00ms ease;
          text-align: left;
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

        /**
         * Dark theme overrides (when .theme-dark is applied on <html>)
         *
         * Behavior:
         * - default (unhovered): button blends with dark sidebar background, icon is white (via filter) and label is white.
         * - hover: button BG becomes the same color as the dark sidebar background (use var(--ui-bg)); text/icon adjust for contrast.
         *
         * NOTE: ensure your globals.css defines --ui-bg and --ui-text under .theme-dark (see snippet below).
         */
        :global(.theme-dark) .signout-btn {
          background: var(--ui-bg, #0b0b0b);
          color: var(--ui-text, #e6eef6);
          border-radius: 8px;
        }

        /* Unhovered icon is white in dark theme */
        :global(.theme-dark) .signout-btn .icon {
          filter: invert(1) contrast(120%) brightness(1.05);
        }

        /* Dark-theme hover: use the sidebar's dark background color for the button background.
           That keeps the button consistent with the dark sidebar look. */
        :global(.theme-dark) .signout-btn:hover,
        :global(.theme-dark) .signout-btn:focus-visible {
          background: var(--ui-bg, #0b0b0b);
          color: var(--ui-text, #e6eef6);
          border-radius: 10px;
        }

        /* On hover in dark theme ensure icon is visible (keep it white or slightly adjusted) */
        :global(.theme-dark) .signout-btn:hover .icon,
        :global(.theme-dark) .signout-btn:focus-visible .icon {
          transform: translateX(0);
          /* keep icon light so it contrasts with the dark button background */
          filter: invert(1) contrast(120%) brightness(1.05);
        }

        /* Label color follows parent */
        :global(.theme-dark) .signout-btn .label {
          color: inherit;
        }
      `}</style>
    </button>
  );
}