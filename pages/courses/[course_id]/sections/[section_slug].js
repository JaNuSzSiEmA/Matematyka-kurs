import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/router';
import Link from 'next/link';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Toggle this to show/hide debug UI
const DEBUG = false;

function clampPct(x) {
  const n = Number(x || 0);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function CheckIcon({ state, size = 20 }) {
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('theme-dark');

  if (state === 'done') {
    return (
      <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="9" fill="#16a34a" />
        <path d="M5.5 10.2l2.6 2.6 6.2-6.2" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (state === 'in_progress') {
    const fillColor = isDark ? '#000000' : '#ffffff';
    return (
      <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="9" fill={fillColor} stroke="#16a34a" strokeWidth="2" />
        <path d="M5.5 10.2l2.6 2.6 6.2-6.2" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  const noneFill = isDark ? '#000000' : '#ffffff';
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="9" fill={noneFill} stroke="#d1d5db" strokeWidth="2" />
      <path d="M5.5 10.2l2.6 2.6 6.2-6.2" fill="none" stroke="#d1d5db" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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
  const [session, setSession] = useState(null);

  // progress maps
  const [islandStatsById, setIslandStatsById] = useState({});
  // debug outputs
  const [debugItemsByIsland, setDebugItemsByIsland] = useState({});
  const [debugProgRows, setDebugProgRows] = useState([]);
  const zigZag = useMemo(() => (idx) => (idx % 2 === 0 ? 'justify-start' : 'justify-end'), []);

  useEffect(() => {
    if (!course_id || !section_slug) return;

    (async () => {
      setLoading(true);
      setMsg('');
      setIslandStatsById({});
      setHasAccess(false);
      setCheckingAccess(true);
      setDebugItemsByIsland({});
      setDebugProgRows([]);

      const { data: { session: sess } } = await supabase.auth.getSession();
      setSession(sess ?? null);

      // load section
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

      if (sec.is_free) {
        setHasAccess(true);
        setCheckingAccess(false);
      } else if (sess) {
        try {
          const res = await fetch(`/api/has-access?course_id=${encodeURIComponent(course_id)}`, {
            headers: { Authorization: `Bearer ${sess.access_token}` },
          });
          const json = await res.json();
          setHasAccess(Boolean(json.access));
        } catch {
          setHasAccess(false);
        } finally {
          setCheckingAccess(false);
        }
      } else {
        setHasAccess(false);
        setCheckingAccess(false);
      }

      // islands
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

      const islandIds = (isl || []).map((x) => x.id);
      if (!islandIds.length) {
        setIslandStatsById({});
        setLoading(false);
        return;
      }

      // load island_items
      const { data: items, error: itemsErr } = await supabase
        .from('island_items')
        .select(`
          id,
          island_id,
          item_type,
          exercise_id,
          exercises:exercise_id ( id, points_max )
        `)
        .in('island_id', islandIds);

      if (itemsErr) {
        setMsg('Błąd pobierania island_items: ' + itemsErr.message);
        setLoading(false);
        return;
      }

      const exerciseItems = (items || []).filter((it) => it.item_type === 'exercise' && it.exercise_id);

      // debug - items per island
      const byIsland = {};
      for (const it of exerciseItems) {
        byIsland[it.island_id] = byIsland[it.island_id] || [];
        byIsland[it.island_id].push(it.id);
      }
      setDebugItemsByIsland(byIsland);
      if (DEBUG) console.debug('[DEBUG] island_items per island', byIsland, 'raw items rows:', items);

      // load progress rows (only when logged in)
      const itemIds = exerciseItems.map((x) => x.id);
      let prog = [];
      if (itemIds.length > 0 && sess) {
        const { data: progRows, error: progErr } = await supabase
          .from('island_item_progress')
          .select('island_item_id, is_completed, points_earned, user_id')
          .eq('user_id', sess.user.id)
          .in('island_item_id', itemIds);

        if (progErr) {
          setMsg('Błąd pobierania postępu: ' + progErr.message);
        } else {
          prog = progRows || [];
        }
        setDebugProgRows(prog);
        if (DEBUG) console.debug('[DEBUG] progress rows for user', sess?.user?.id, prog);
      } else {
        if (DEBUG) console.debug('[DEBUG] skipping progress fetch - not logged in or no items', { sess: !!sess, itemCount: itemIds.length });
      }

      // normalize progress
      const progByItemId = Object.fromEntries((prog || []).map((p) => [String(p.island_item_id), { is_completed: Boolean(p.is_completed), points_earned: Number(p.points_earned || 0) }]));

      // build stats
      const stats = {};
      for (const island of isl || []) {
        const itForIsland = exerciseItems.filter((x) => x.island_id === island.id);
        const totalExercises = itForIsland.length;
        const completedExercises = itForIsland.filter((x) => progByItemId[String(x.id)]?.is_completed).length;
        const maxPoints = itForIsland.reduce((sum, x) => sum + Number(x.exercises?.points_max || 0), 0);
        const earnedPoints = itForIsland.reduce((sum, x) => sum + Number(progByItemId[String(x.id)]?.points_earned || 0), 0);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course_id, section_slug, router]);

  if (loading || checkingAccess) {
    return (
      <div className="min-h-screen section-page">
        <div className="mx-auto max-w-3xl p-6 text-sm text-gray-700">Ładowanie…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen section-page">
      <div className="mx-auto max-w-3xl p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Link href="/dashboard" className="text-sm section-title font-semibold text-gray-700 ">
              ← Panel
            </Link>
            <h1 className=" text-2xl font-bold section-title text-gray-900 p-3 rounded-xl ">{section?.title}</h1>
          </div>

          {section?.is_free ? (
            <span className="h-fit rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">
              DARMOWE
            </span>
          ) : null}
        </div>

        {!section?.is_free && !hasAccess ? (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            Ten dział jest płatny. Aby uzyskać pełny dostęp (np. zapisywać postęp), zaloguj się i kup dostęp.
            <button onClick={() => router.push(`/login?redirectedFrom=/courses/${course_id}/sections/${section_slug}`)} className="ml-3 underline font-semibold">
              Zaloguj się
            </button>
          </div>
        ) : null}

        {msg ? <div className="mt-4 text-sm text-red-700">{msg}</div> : null}

        {DEBUG && (
          <div className="mt-4 p-3 rounded border bg-gray-50 text-sm text-gray-800">
            <div><strong>DEBUG SUMMARY</strong></div>
            <div>Session id: {session?.user?.id ?? '(no session)'}</div>
            <div>Islands returned: {islands.length}</div>
            <div>Total progress rows fetched: {debugProgRows.length}</div>
            <div style={{ marginTop: 8 }}>
              <details>
                <summary style={{ cursor: 'pointer' }}>Raw progress rows (expand)</summary>
                <pre style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>{JSON.stringify(debugProgRows, null, 2)}</pre>
              </details>
            </div>
          </div>
        )}

        <div className="mt-8 flex flex-col gap-6">
          {islands.map((island, idx) => {
            const isTest = island.type === 'test';
            const st = islandStatsById[island.id] || { totalExercises: 0, completedExercises: 0, earnedPoints: 0, maxPoints: 0, state: 'none' };
            const pct = st.maxPoints > 0 ? clampPct((st.earnedPoints / st.maxPoints) * 100) : 0;

            const cardBase = st.state === 'done' ? 'border-green-200 island-surface' : st.state === 'in_progress' ? 'border-green-200 island-surface' : 'border-gray-200 island-surface';
            const finalCardClass = isTest ? 'border-indigo-300 island-surface' : cardBase;
            const islandHref = `/courses/${course_id}/islands/${island.id}`;

            return (
              <div key={island.id} className={`flex ${zigZag(idx)}`}>
                <Link href={islandHref} className={['w-full max-w-sm rounded-3xl border p-5 shadow-sm transition', 'hover:shadow-md', finalCardClass].join(' ')}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-gray-500">{isTest ? 'TEST (6 zadań)' : `WYSPA ${island.order_index}`}</div>
                      <div className="mt-1 text-lg font-bold text-gray-900 island-title ">{island.title}</div>

                      {!isTest ? (
                        <div className="mt-1 text-xs text-gray-600">Punkty: {st.earnedPoints} / {st.maxPoints} • Ćwiczenia: {st.completedExercises} / {st.totalExercises}</div>
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

                  {!isTest ? (
                    <div className="mt-4 h-2 w-full rounded-full bg-gray-100">
                      <div className="h-2 rounded-full bg-green-500" style={{ width: `${pct}%` }} />
                    </div>
                  ) : (
                    <div className="mt-4 h-2 w-full rounded-full bg-gray-100">
                      <div className="h-2 rounded-full bg-indigo-400" style={{ width: '0%' }} />
                    </div>
                  )}

                  {DEBUG ? (
                    <div style={{ marginTop: 10, fontSize: 12, color: '#374151', background: '#f8fafc', padding: 8, borderRadius: 8 }}>
                      <div><strong>DEBUG</strong></div>
                      <div>Item IDs: {(debugItemsByIsland[island.id] || []).join(', ') || '(none)'}</div>
                    </div>
                  ) : null}
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}