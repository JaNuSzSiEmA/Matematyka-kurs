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

function CheckIcon({ state, size = 20 }) {
  // state: 'none' | 'in_progress' | 'done'
  if (state === 'done') {
    return (
      <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="9" fill="#16a34a" />
        <path
          d="M5.5 10.2l2.6 2.6 6.2-6.2"
          fill="none"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (state === 'in_progress') {
    return (
      <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="9" fill="white" stroke="#86efac" strokeWidth="2" />
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

  return null; // for "not started" you wanted no message; we also hide icon here
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
      if (!session) {
        router.replace('/login');
        return;
      }

      setUserEmail(session.user?.email || null);

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

      // ---- compute progress per section ----
      if (secs.length > 0) {
        const secIds = secs.map((s) => s.id);

        // 1) load islands for these sections
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

        // if no islands, mark 0%
        if (islandIds.length === 0) {
          const sStats = {};
          for (const s of secs) sStats[s.id] = { state: 'none', completedIslands: 0, totalIslands: 0, percent: 0 };
          setSectionStats(sStats);
          setLoading(false);
          return;
        }

        // 2) load exercise items for these islands
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

        // 3) load progress for these island_item ids
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
          

          {loading ? (
            <div className="mt-4 text-sm dashboard-muted">Ładowanie…</div>
          ) : msg ? (
            <div className="mt-4 text-sm text-red-700">{msg}</div>
          ) : (
            <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {sectionsWithStats.map((s) => {
                const state = s.stats.state;

                // new named classes for borders/states; ui-surface still controls background
                                const cardBorderClass =
                  state === 'done'
                    ? 'border-green-200'
                    : state === 'in_progress'
                      ? 'border-green-200'
                      : 'border-gray-200';

                return (
                  <li key={s.id} className={`rounded-2xl border p-4 dashboard-card ${cardBorderClass}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-base font-semibold dashboard-title">{s.title}</div>
                        <div className="text-xs dashboard-subtext">/{s.slug}</div>

                        <div className="mt-2 text-xs dashboard-subtext">
                          Postęp: <b>{s.stats.percent}%</b>
                          {s.stats.totalIslands ? (
                            <span className="ml-2 dashboard-subtext">
                              ({s.stats.completedIslands}/{s.stats.totalIslands} wysp)
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-2">
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
                          <div className="flex items-center gap-2 text-xs font-semibold text-green-800">
                            <CheckIcon state="done" size={18} />
                            Ukończone
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-3">
                      <Link
                        href={`/courses/${courseId}/sections/${s.slug}`}
                        className="inline-block rounded-xl border border-gray-900 bg-white px-4 py-2 text-sm font-semibold text-gray-900 open-path-box"
                      >
                        Otwórz ścieżkę
                      </Link>
                    </div>
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