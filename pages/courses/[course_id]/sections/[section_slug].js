import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/router';
import Link from 'next/link';

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

  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="9" fill="white" stroke="#d1d5db" strokeWidth="2" />
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

export default function SectionPathPage() {
  const router = useRouter();
  const { course_id, section_slug } = router.query;

  const [loading, setLoading] = useState(true);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);

  const [section, setSection] = useState(null);
  const [islands, setIslands] = useState([]);
  const [msg, setMsg] = useState('');

  // progress maps
  const [islandStatsById, setIslandStatsById] = useState({}); // island_id -> { totalExercises, completedExercises, earnedPoints, maxPoints, state }

  const zigZag = useMemo(() => (idx) => (idx % 2 === 0 ? 'justify-start' : 'justify-end'), []);

  useEffect(() => {
    if (!course_id || !section_slug) return;

    (async () => {
      setLoading(true);
      setMsg('');
      setIslandStatsById({});

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/login');
        return;
      }

      const { data: sec, error: secErr } = await supabase
        .from('sections')
        .select('id, title, slug, is_free')
        .eq('course_id', course_id)
        .eq('slug', section_slug)
        .single();

      if (secErr || !sec) {
        setMsg('Nie znaleziono działu.');
        setLoading(false);
        setCheckingAccess(false);
        return;
      }
      setSection(sec);

      setCheckingAccess(true);
      if (sec.is_free) {
        setHasAccess(true);
        setCheckingAccess(false);
      } else {
        try {
          const accessToken = session.access_token;
          const res = await fetch(`/api/has-access?course_id=${encodeURIComponent(course_id)}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          const json = await res.json();
          setHasAccess(Boolean(json.access));
        } catch {
          setHasAccess(false);
        } finally {
          setCheckingAccess(false);
        }
      }

      const { data: isl, error: islErr } = await supabase
        .from('islands')
        .select('id, title, type, order_index, max_points, is_active')
        .eq('section_id', sec.id)
        .eq('is_active', true)
        .order('order_index', { ascending: true });

      if (islErr) {
        setMsg('Błąd pobierania wysp: ' + islErr.message);
        setIslands([]);
        setLoading(false);
        return;
      }

      setIslands(isl || []);

      // ---- Progress computation (dynamic) ----
      const islandIds = (isl || []).map((x) => x.id);
      if (islandIds.length === 0) {
        setIslandStatsById({});
        setLoading(false);
        return;
      }

      // Get all exercise items for these islands, join exercise points
      const { data: items, error: itemsErr } = await supabase
        .from('island_items')
        .select(
          `
          id,
          island_id,
          item_type,
          exercise_id,
          exercises:exercise_id (
            id,
            points_max
          )
        `
        )
        .in('island_id', islandIds);

      if (itemsErr) {
        setMsg((prev) => (prev ? prev + ' ' : '') + `Błąd pobierania island_items: ${itemsErr.message}`);
        setLoading(false);
        return;
      }

      const exerciseItems = (items || []).filter((it) => it.item_type === 'exercise' && it.exercise_id);

      // Load progress rows for these island_item ids
      const itemIds = exerciseItems.map((x) => x.id);
      let prog = [];
      if (itemIds.length > 0) {
        const { data: progRows, error: progErr } = await supabase
          .from('island_item_progress')
          .select('island_item_id, is_completed, points_earned')
          .eq('user_id', session.user.id)
          .in('island_item_id', itemIds);

        if (progErr) {
          setMsg((prev) => (prev ? prev + ' ' : '') + `Błąd pobierania postępu: ${progErr.message}`);
        } else {
          prog = progRows || [];
        }
      }

      const progByItemId = Object.fromEntries(
        prog.map((p) => [
          p.island_item_id,
          { is_completed: Boolean(p.is_completed), points_earned: Number(p.points_earned || 0) },
        ])
      );

      // Build island stats
      const stats = {};
      for (const island of isl || []) {
        const itForIsland = exerciseItems.filter((x) => x.island_id === island.id);

        const totalExercises = itForIsland.length;
        const completedExercises = itForIsland.filter((x) => progByItemId[x.id]?.is_completed).length;

        const maxPoints = itForIsland.reduce((sum, x) => sum + Number(x.exercises?.points_max || 0), 0);
        const earnedPoints = itForIsland.reduce((sum, x) => sum + Number(progByItemId[x.id]?.points_earned || 0), 0);

        let state = 'none';
        if (totalExercises === 0) state = 'none';
        else if (completedExercises === 0) state = 'none';
        else if (completedExercises < totalExercises) state = 'in_progress';
        else state = 'done';

        stats[island.id] = { totalExercises, completedExercises, earnedPoints, maxPoints, state };
      }

      setIslandStatsById(stats);

      setLoading(false);
    })();
  }, [course_id, section_slug, router]);

  if (loading || checkingAccess) {
    return (
      <div className="min-h-screen bg-white">
        <div className="mx-auto max-w-3xl p-6 text-sm text-gray-700">Ładowanie…</div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-white">
        <div className="mx-auto max-w-3xl p-6">
          <h1 className="text-2xl font-bold text-gray-900">Brak dostępu</h1>
          <p className="mt-2 text-sm text-gray-700">
            Nie masz dostępu do tego działu. Darmowy jest tylko dział: <b>Planimetria</b>.
          </p>
          <div className="mt-4">
            <Link
              href="/dashboard"
              className="rounded-xl border border-gray-900 bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Wróć do panelu
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Link href="/dashboard" className="text-sm font-semibold text-gray-700 underline">
              ← Panel
            </Link>
            <h1 className="mt-2 text-2xl font-bold text-gray-900">{section?.title}</h1>
            <p className="mt-1 text-sm text-gray-600">
              Możesz przeskakiwać wyspy. Test można zrobić od razu (nieograniczone podejścia).
            </p>
          </div>

          {section?.is_free ? (
            <span className="h-fit rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">
              DARMOWE
            </span>
          ) : null}
        </div>

        {msg ? <div className="mt-4 text-sm text-red-700">{msg}</div> : null}

        <div className="mt-8 flex flex-col gap-6">
          {islands.map((island, idx) => {
            const isTest = island.type === 'test';
            const st = islandStatsById[island.id] || {
              totalExercises: 0,
              completedExercises: 0,
              earnedPoints: 0,
              maxPoints: 0,
              state: 'none',
            };

            const pct = st.maxPoints > 0 ? clampPct((st.earnedPoints / st.maxPoints) * 100) : 0;

            const cardBase =
              st.state === 'done'
                ? 'border-green-200 bg-green-50'
                : st.state === 'in_progress'
                  ? 'border-green-200 bg-green-50/50'
                  : 'border-gray-200 bg-white';

            // tests keep indigo theme, but still show check state
            const finalCardClass = isTest
              ? 'border-indigo-300 bg-indigo-50'
              : cardBase;

            return (
              <div key={island.id} className={`flex ${zigZag(idx)}`}>
                <Link
                  href={`/courses/${course_id}/islands/${island.id}`}
                  className={[
                    'w-full max-w-sm rounded-3xl border p-5 shadow-sm transition',
                    'hover:shadow-md',
                    finalCardClass,
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-gray-500">
                        {isTest ? 'TEST (6 zadań)' : `WYSPA ${island.order_index}`}
                      </div>
                      <div className="mt-1 text-lg font-bold text-gray-900">{island.title}</div>

                      {!isTest ? (
                        <div className="mt-1 text-xs text-gray-600">
                          Punkty: {st.earnedPoints} / {st.maxPoints} • Ćwiczenia: {st.completedExercises} /{' '}
                          {st.totalExercises}
                        </div>
                      ) : (
                        <div className="mt-1 text-xs text-gray-600">Próg zaliczenia działu: 60%</div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {!isTest ? <CheckIcon state={st.state} /> : null}
                      <div className={isTest ? 'text-indigo-700' : 'text-gray-700'}>
                        <span className="text-sm font-semibold">Otwórz →</span>
                      </div>
                    </div>
                  </div>

                  {/* points bar (requested) */}
                  {!isTest ? (
                    <div className="mt-4 h-2 w-full rounded-full bg-gray-100">
                      <div className="h-2 rounded-full bg-green-500" style={{ width: `${pct}%` }} />
                    </div>
                  ) : (
                    <div className="mt-4 h-2 w-full rounded-full bg-gray-100">
                      <div className="h-2 rounded-full bg-indigo-400" style={{ width: '0%' }} />
                    </div>
                  )}
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}