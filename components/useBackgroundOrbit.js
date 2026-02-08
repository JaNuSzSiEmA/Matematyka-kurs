import { useEffect } from 'react';

export default function useBackgroundOrbit({
  radiusX = 600,
  radiusY = 400,
  durationMs = 120000,
  padding = 40,
} = {}) {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let rafId;
    let lastTime = performance.now();
    let elapsed = 0; // accumulated time only while animation is ON

    const getMaskSize = () => {
      const styles = getComputedStyle(document.documentElement);
      const mw = parseFloat(styles.getPropertyValue('--mask-width')) || 4000;
      const mh = parseFloat(styles.getPropertyValue('--mask-height')) || 5000;
      return { mw, mh };
    };

    const tick = (now) => {
      const root = document.documentElement;
      const isActive = root.classList.contains('bg-animated');

      if (isActive) {
        // accumulate time only while active
        elapsed += (now - lastTime);

        const { mw, mh } = getMaskSize();
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        const maxX = Math.max(0, (mw - vw) / 2 - padding);
        const maxY = Math.max(0, (mh - vh) / 2 - padding);

        const rx = Math.min(radiusX, maxX);
        const ry = Math.min(radiusY, maxY);

        const t = (elapsed / durationMs) * Math.PI * 2;

        const x = Math.cos(t) * rx;
        const y = Math.sin(t) * ry;

        root.style.setProperty('--mask-x', `${x}px`);
        root.style.setProperty('--mask-y', `${y}px`);
      }

      lastTime = now;
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [radiusX, radiusY, durationMs, padding]);
}