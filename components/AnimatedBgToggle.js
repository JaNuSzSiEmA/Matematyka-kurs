import { useEffect, useState } from 'react';

/**
 * AnimatedBgToggle
 * - toggles "bg-animated" class on <html> (document.documentElement)
 * - persists choice in localStorage under key "bg-animated" ("on" or "off")
 *
 * Usage:
 * <AnimatedBgToggle />
 */
export default function AnimatedBgToggle() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem('bg-animated');
    const initial = saved === 'on';
    setEnabled(initial);
    apply(initial);
  }, []);

  function apply(value) {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.toggle('bg-animated', value);
    if (value) {
      document.documentElement.setAttribute('data-bg-animated', 'on');
    } else {
      document.documentElement.removeAttribute('data-bg-animated');
    }
  }

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    try {
      localStorage.setItem('bg-animated', next ? 'on' : 'off');
    } catch (e) {
      /* ignore */
    }
    apply(next);
  }

  return (
    <>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={toggle}
        className="theme-toggle"
      >
        <span className="visually-hidden">Toggle animated background</span>
        <span className="track" aria-hidden="true">
          <span className="thumb" />
        </span>

        <style jsx>{`
          .visually-hidden {
            position: absolute !important;
            height: 1px; width: 1px;
            overflow: hidden; clip: rect(1px, 1px, 1px, 1px);
            white-space: nowrap; border: 0; padding: 0; margin: -1px;
          }

          .theme-toggle {
            --track-w: 56px;
            --track-h: 28px;
            --thumb-size: 22px;
            --bg-off: #e5e7eb;
            --bg-on: #111827;
            display: inline-flex;
            align-items: center;
            border: none;
            background: transparent;
            padding: 0;
            cursor: pointer;
            user-select: none;
          }

          .track {
            width: var(--track-w);
            height: var(--track-h);
            display: inline-block;
            border-radius: calc(var(--track-h) / 2);
            box-sizing: border-box;
            padding: 3px;
            background: ${enabled ? 'var(--bg-on)' : 'var(--bg-off)'};
            transition: background-color 180ms ease, box-shadow 180ms ease;
            box-shadow: inset 0 0 0 1px rgba(0,0,0,0.06);
          }

          .thumb {
            width: var(--thumb-size);
            height: var(--thumb-size);
            display: block;
            border-radius: 50%;
            background: #fff;
            box-shadow: 0 2px 6px rgba(2,6,23,0.18);
            transform: translateX(${enabled ? '28px' : '0'});
            transition: transform 200ms cubic-bezier(.2,.9,.2,1);
          }

          .theme-toggle:focus-visible .track {
            box-shadow: 0 0 0 4px rgba(34,197,94,0.12), inset 0 0 0 1px rgba(0,0,0,0.06);
            outline: none;
          }
        `}</style>
      </button>
    </>
  );
}