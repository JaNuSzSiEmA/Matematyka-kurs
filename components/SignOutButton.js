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
          --side-pad: 14px;     /* left/right padding you want */
          --icon-size: 22px;    /* icon width/height */
          --gap: 12px;          /* spacing between icon and text */
          width: 80%;
          height: 48px;
          background: white;
          color: black;
          border: none;
          padding: 0 var(--side-pad); /* symmetric horizontal padding */
          cursor: pointer;
          display: block;
          position: relative;
          overflow: visible; /* allow small icon movement left without clipping */
          border-radius: 0;
          transition: background-color 300ms ease, color 300ms ease, border-radius 300ms ease;
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

        /* icon-wrap anchored to left padding */
        .icon-wrap {
          position: absolute;
          left: var(--side-pad); /* icon's left edge target when hovered */
          top: 50%;
          transform: translateY(-50%);
          width: var(--icon-size);
          height: var(--icon-size);
          display: block;
        }

        /*
         * Icon initially starts nudged to the right (so it can slide left on hover).
         * On hover it moves to transform: translateX(0) leaving its left edge at left padding.
         */
        .icon {
          width: var(--icon-size);
          height: var(--icon-size);
          display: block;
          transition: transform 300ms cubic-bezier(.2,.9,.2,1), filter 300ms ease;
          transform: translateX(10px); /* start slightly to the right */
          vertical-align: middle;
        }

        /*
         * Label is anchored to the right padding so its right edge will sit
         * at the same padding as the icon's left edge when hovered.
         * Start hidden and slightly offset to the left; on hover slide to final place.
         */
        .label {
          position: absolute;
          right: var(--side-pad); /* final right-side padding */
          top: 50%;
          transform: translateY(-50%) translateX(-18px); /* start slightly left of final */
          opacity: 0;
          white-space: nowrap;
          font-weight: 600;
          font-size: 15px;
          line-height: 1;
          transition: transform 260ms cubic-bezier(.2,.9,.2,1), opacity 200ms ease;
          color: inherit;
          pointer-events: none;
        }

        /* Hover / keyboard focus: dark bg, rounded corners */
        .signout-btn:hover,
        .signout-btn:focus-visible {
          background: #000;
          color: #fff;
          border-radius: 10px;
        }

        /* Icon slides left to align to left padding on hover and inverts colors */
        .signout-btn:hover .icon,
        .signout-btn:focus-visible .icon {
          transform: translateX(0); /* final: left edge == var(--side-pad) */
          filter: invert(1) contrast(120%) brightness(1.05);
        }

        /* Label slides into final right-anchored position and fades in */
        .signout-btn:hover .label,
        .signout-btn:focus-visible .label {
          transform: translateY(-50%) translateX(0);
          opacity: 1;
        }

        /* text color follows parent */
        .signout-btn .label {
          color: inherit;
        }
      `}</style>
    </button>
  );
}