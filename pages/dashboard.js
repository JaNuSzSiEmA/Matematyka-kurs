import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/router';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

function clampPct(x) {
  const n = Number(x || 0);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

// Format percent for display: at most 2 fraction digits, no long floats
function formatPercent(value) {
  const n = Number(value || 0);
  if (Number.isNaN(n)) return '0';
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function CheckIcon({ state, size = 20 }) {
  // Determine dark mode by checking documentElement class (safe on client)
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('theme-dark');

  // scale stroke width with size so it looks consistent at different sizes
  const circleStrokeW = Math.max(1, Math.round(size / 10)); // stroke for circle border
  const checkStrokeW = Math.max(1, Math.round(size / 9)); // stroke for the check path

  // state: 'none' | 'in_progress' | 'done'
  if (state === 'done') {
    const circleStrokeColor = isDark ? '#000000' : 'transparent'; // black border only in dark mode
    const checkStrokeColor = isDark ? '#000000' : '#ffffff'; // black check in dark mode, white in light mode

    return (
      <svg
        className="check-icon"
        width={size}
        height={size}
        viewBox="0 0 20 20"
        aria-hidden="true"
      >
        {/* green fill; stroke only in dark mode */}
        <circle
          cx="10"
          cy="10"
          r="9"
          fill="#16a34a"
          stroke={circleStrokeColor}
          strokeWidth={circleStrokeW}
        />
        <path
          d="M5.5 10.2l2.6 2.6 6.2-6.2"
          fill="none"
          stroke={checkStrokeColor}
          strokeWidth={checkStrokeW}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (state === 'in_progress') {
    // fill white in light mode, black in dark mode
    const fillColor = isDark ? '#000000' : '#ffffff';
    return (
      <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="9" fill={fillColor} stroke="#16a34a" strokeWidth="2" />
        <path
          d="M5.5 10.2l2.6 2.6 6.2-6.2"
          fill="none"
          stroke="#22c55e"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  // 'none' / not started: fill white in light mode, black in dark mode
  const noneFill = isDark ? '#000000' : '#ffffff';
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="9" fill={noneFill} stroke="#d1d5db" strokeWidth="2" />
      <path
        d="M5.5 10.2l2.6 2.6 6.2-6.2"
        fill="none"
        stroke="#d1d5db"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const courseId = 'matematyka_podstawa';

  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState(null);
  const [sections, setSections] = useState([]);
  const [msg, setMsg] = useState('');

  // section_id -> { state, completedIslands, totalIslands, percent }
  const [sectionStats, setSectionStats] = useState({});

  const sectionsWithStats = useMemo(() => {
    return sections.map((s) => ({
      ...s,
      stats: sectionStats[s.id] || { state: 'none', completedIslands: 0, totalIslands: 0, percent: 0 },
    }));
  }, [sections, sectionStats]);

  // Sign out handler (clears Supabase + server cookies, goes to /login)
  async function handleSignOut() {
    try {
      await supabase.auth.signOut();
      try {
        await fetch('/api/auth/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ event: 'SIGNED_OUT' }),
        });
      } catch {}
    } finally {
      router.replace('/login');
    }
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      setMsg('');
      setSectionStats({});

      const {
        data: { session },
      } = await supabase.auth.getSession();

      // Do NOT force-redirect anonymous users here:
      // allow viewing the dashboard (course index) even when not logged in.
      setUserEmail(session?.user?.email ?? null);

      const { data, error } = await supabase
        .from('sections')
        .select('id, slug, title, order_index, is_free')
        .eq('course_id', courseId)
        .order('order_index', { ascending: true });

      if (error) {
        setMsg('Błąd pobierania działów: ' + error.message);
        setSections([]);
        setLoading(false);
        return;
      }

      const secs = data || [];
      setSections(secs);

      // load islands for these sections (we need totalIslands even for anonymous users)
      if (secs.length > 0) {
        const secIds = secs.map((s) => s.id);

        const { data: islRows, error: islErr } = await supabase
          .from('islands')
          .select('id, section_id, type, is_active')
          .in('section_id', secIds)
          .eq('is_active', true);

        if (islErr) {
          setMsg((prev) => (prev ? prev + ' ' : '') + 'Błąd pobierania wysp: ' + islErr.message);
          setLoading(false);
          return;
        }

        const islands = (islRows || []).filter((i) => i.type !== 'test'); // sections progress based on normal islands
        const islandIds = islands.map((i) => i.id);

        // If user is NOT logged in, we only show totals (no personal progress)
        if (!session) {
          const sStats = {};
          for (const s of secs) {
            const islInSection = islands.filter((i) => i.section_id === s.id);
            const totalIslands = islInSection.length;
            sStats[s.id] = { state: 'none', completedIslands: 0, totalIslands, percent: 0 };
          }
          setSectionStats(sStats);
          setLoading(false);
          return;
        }

        // Logged-in user: load exercise items and progress as before
        const { data: itemRows, error: itemErr } = await supabase
          .from('island_items')
          .select('id, island_id, item_type')
          .in('island_id', islandIds);

        if (itemErr) {
          setMsg((prev) => (prev ? prev + ' ' : '') + 'Błąd pobierania island_items: ' + itemErr.message);
          setLoading(false);
          return;
        }

        const exerciseItems = (itemRows || []).filter((it) => it.item_type === 'exercise');
        const exerciseItemIds = exerciseItems.map((it) => it.id);

        // 3) load progress for these island_item ids for current user
        let prog = [];
        if (exerciseItemIds.length > 0) {
          const { data: progRows, error: progErr } = await supabase
            .from('island_item_progress')
            .select('island_item_id, is_completed')
            .eq('user_id', session.user.id)
            .in('island_item_id', exerciseItemIds);

          if (progErr) {
            setMsg((prev) => (prev ? prev + ' ' : '') + 'Błąd pobierania postępu: ' + progErr.message);
          } else {
            prog = progRows || [];
          }
        }

        const completedItemSet = new Set((prog || []).filter((p) => p.is_completed).map((p) => p.island_item_id));

        // per-island: total exercises / completed exercises
        const islandExerciseCounts = {};
        for (const it of exerciseItems) {
          if (!islandExerciseCounts[it.island_id]) {
            islandExerciseCounts[it.island_id] = { total: 0, completed: 0 };
          }
          islandExerciseCounts[it.island_id].total += 1;
          if (completedItemSet.has(it.id)) islandExerciseCounts[it.island_id].completed += 1;
        }

        // per-section: islands completed/total
        const sStats = {};
        for (const s of secs) {
          const islInSection = islands.filter((i) => i.section_id === s.id);
          const totalIslands = islInSection.length;

          let completedIslands = 0;
          for (const isl of islInSection) {
            const c = islandExerciseCounts[isl.id] || { total: 0, completed: 0 };
            // videos don't count; island is completed when ALL exercise items completed AND there is at least 1 exercise
            const islandDone = c.total > 0 && c.completed === c.total;
            if (islandDone) completedIslands += 1;
          }

          const percent = totalIslands > 0 ? clampPct((completedIslands / totalIslands) * 100) : 0;

          let state = 'none';
          if (completedIslands === 0) state = 'none';
          else if (completedIslands < totalIslands) state = 'in_progress';
          else state = 'done';

          sStats[s.id] = { state, completedIslands, totalIslands, percent };
        }

        setSectionStats(sStats);
      }

      setLoading(false);
    })();
  }, [router]);

  return (
    // removed forced white bg so dark page background can show when theme-dark + page-target-dark are present
    <div className="min-h-screen dashboard-page">
      <div className="mx-auto max-w-4xl p-6">
        {/* main panel uses ui-surface so dark-theme overrides can change its appearance */}
        <div className="mt-6 rounded-2xl border p-4 main-panel-surface">
          <h2 className="text-lg font-semibold dashboard-title">Działy</h2>

          {/* Show banner when anonymous to explain progress won't be saved + quick login */}
          {!userEmail ? (
            <div className="mt-3 mb-3 rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
              Jesteś niezalogowany — możesz przeglądać kurs, ale postęp nie zostanie zapisany.
              <button
                onClick={() => router.push(`/login?redirectedFrom=/dashboard`)}
                className="ml-3 inline-block underline font-semibold"
              >
                Zaloguj się
              </button>
            </div>
          ) : null}

          {loading ? (
            <div className="mt-4 text-sm dashboard-muted">Ładowanie…</div>
          ) : msg ? (
            <div className="mt-4 text-sm text-red-700">{msg}</div>
          ) : (
            <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 items-stretch">
              {sectionsWithStats.map((s) => {
                const state = s.stats.state;

                // state-based modifier class (uses CSS variables in globals.css)
                const stateClass = `dashboard-card--${state || 'none'}`;

                const href = `/courses/${courseId}/sections/${s.slug}`;
                const ariaLabel = `Otwórz ścieżkę ${s.title}`;

                return (
                  <li key={s.id} className="h-full">
                    <Link
                      href={href}
                      aria-label={ariaLabel}
                      className={`block rounded-2xl border p-4 dashboard-card ${stateClass} cursor-pointer transform transition duration-150 ease-out hover:-translate-y-1 hover:shadow-lg active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-green-400 h-full flex flex-col`}
                    >
                      <div className="flex-1 flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="text-base font-semibold dashboard-title">{s.title}</div>
                          <div className="text-xs dashboard-subtext">/{s.slug}</div>

                          {/* Progress bar (replaces numeric-only Postęp) */}
                          <div className="mt-3">
                            <div className="text-xs dashboard-subtext mb-1">Postęp</div>

                            {/* bar background uses CSS var */}
                            <div className="relative w-full h-3 rounded-full progress-bar-bg overflow-hidden">
                              {/* filled portion uses CSS var; width reflects percent */}
                              <div
                                className="absolute left-0 top-0 h-full rounded-full progress-bar-fill"
                                style={{ width: `${s.stats.percent}%` }}
                                role="progressbar"
                                aria-valuenow={s.stats.percent}
                                aria-valuemin={0}
                                aria-valuemax={100}
                              />
                            </div>

                            {/* footer row: islands count + percent text */}
                            {s.stats.totalIslands ? (
                              <div className="mt-2 text-xs dashboard-subtext flex justify-between">
                                <span>{s.stats.completedIslands}/{s.stats.totalIslands} wysp</span>
                                <span><b>{formatPercent(s.stats.percent)}%</b></span>
                              </div>
                            ) : (
                              <div className="mt-2 text-xs dashboard-subtext">
                                <b>{formatPercent(s.stats.percent)}%</b>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-2 ml-4">
                          {s.is_free ? (
                            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">
                              DARMOWE
                            </span>
                          ) : (
                            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-800">
                              PŁATNE
                            </span>
                          )}

                          {/* requested labels + check visuals */}
                          {state === 'in_progress' ? (
                            <div className="flex items-center gap-2 text-xs font-semibold text-green-800">
                              <CheckIcon state="in_progress" size={18} />
                              W trakcie
                            </div>
                          ) : state === 'done' ? (
                            <div className="flex items-center gap-2 text-xs dashboard-card-state-done font-semibold text-green-800">
                              <CheckIcon state="done" size={18} />
                              Ukończone
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}