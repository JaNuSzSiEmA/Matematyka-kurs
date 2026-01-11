import { useEffect, useState } from 'react';

/**
 * ThemeToggle
 * - toggles "theme-dark" class on <html> (document.documentElement)
 * - persists choice in localStorage under key "theme" ("light" or "dark")
 *
 * Usage:
 * <ThemeToggle />
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState('light');

  useEffect(() => {
    // initialize from localStorage or system preference
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem('theme');
    if (saved === 'dark' || saved === 'light') {
      setTheme(saved);
      apply(saved);
    } else {
      // default to system preference if available
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      const initial = prefersDark ? 'dark' : 'light';
      setTheme(initial);
      apply(initial);
    }
  }, []);

  function apply(value) {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.toggle('theme-dark', value === 'dark');
    // optional: add an attribute for easier selectors
    if (value === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try {
      localStorage.setItem('theme', next);
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
        aria-checked={theme === 'dark'}
        onClick={toggle}
        className="theme-toggle"
      >
        <span className="visually-hidden">Toggle theme</span>
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
            --bg-light: #e5e7eb; /* light track */
            --bg-dark: #111827;  /* dark track */
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
            background: ${theme === 'dark' ? 'var(--bg-dark)' : 'var(--bg-light)'};
            transition: background-color 180ms ease, box-shadow 180ms ease;
            box-shadow: inset 0 0 0 1px rgba(0,0,0,0.06);
          }

          .thumb {
            width: var(--thumb-size);
            height: var(--thumb-size);
            display: block;
            border-radius: 50%;
            background: ${theme === 'dark' ? '#fff' : '#fff'};
            box-shadow: 0 2px 6px rgba(2,6,23,0.18);
            transform: translateX(${theme === 'dark' ? '28px' : '0'});
            transition: transform 200ms cubic-bezier(.2,.9,.2,1);
          }

          /* small focus outline */
          .theme-toggle:focus-visible .track {
            box-shadow: 0 0 0 4px rgba(34,197,94,0.12), inset 0 0 0 1px rgba(0,0,0,0.06);
            outline: none;
          }
        `}</style>
      </button>
    </>
  );
}