import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/router';
import Link from 'next/link';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

function toEmbedUrl(youtubeUrl) {
  if (!youtubeUrl) return null;
  try {
    const url = new URL(youtubeUrl);
    if (url.hostname.includes('youtu.be')) {
      return `https://www.youtube.com/embed/${url.pathname.replace('/', '')}`;
    }
    const vid = url.searchParams.get('v');
    if (vid) return `https://www.youtube.com/embed/${vid}`;
    if (youtubeUrl.includes('/embed/')) return youtubeUrl;
    return youtubeUrl;
  } catch {
    return youtubeUrl;
  }
}

function formatUserAnswer(q) {
  if (!q?.answered) return '—';
  if (q.answer_type === 'abcd') return (q.user_answer?.choice || '—').toString().toUpperCase();
  if (q.answer_type === 'numeric') return q.user_answer?.value ?? '—';
  return '—';
}

function formatCorrectAnswer(q) {
  if (q.answer_type === 'abcd') return (q.correct_answer || '—').toString().toUpperCase();
  if (q.answer_type === 'numeric') return q.correct_answer ?? '—';
  return '—';
}

function getAbcdOptionsFromAnswerKey(answerKey) {
  const opts = answerKey?.options;
  if (!opts || typeof opts !== 'object') return null;
  return {
    A: opts.A ?? '',
    B: opts.B ?? '',
    C: opts.C ?? '',
    D: opts.D ?? '',
  };
}

function CheckIcon({ done, size = 18, className = '' }) {
  if (done) {
    return (
      <svg width={size} height={size} viewBox="0 0 20 20" className={className} aria-hidden="true">
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

  return (
    <svg width={size} height={size} viewBox="0 0 20 20" className={className} aria-hidden="true">
      <circle cx="10" cy="10" r="9" fill="white" stroke="#9ca3af" strokeWidth="2" />
      <path
        d="M5.5 10.2l2.6 2.6 6.2-6.2"
        fill="none"
        stroke="#9ca3af"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const DIFFICULTY_BORDER = {
  1: 'border-blue-400',
  2: 'border-green-400',
  3: 'border-yellow-400',
  4: 'border-orange-400',
  5: 'border-red-500',
};

export default function IslandPage() {
  const router = useRouter();
  const { course_id, island_id } = router.query;

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  const [island, setIsland] = useState(null);
  const [items, setItems] = useState([]);

  const [answers, setAnswers] = useState({});
  const [saved, setSaved] = useState({});
  const [results, setResults] = useState({});
  const [submittingTest, setSubmittingTest] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const [pendingFinish, setPendingFinish] = useState(null);
  const [testRules, setTestRules] = useState({ test_questions_count: 6, pass_percent: 60 });

  // NEW: track section link info for the back button
  const [sectionSlug, setSectionSlug] = useState(null);
  const [sectionTitle, setSectionTitle] = useState(null);

  const [showHintsByExerciseId, setShowHintsByExerciseId] = useState({});
  const [showExplanationByExerciseId, setShowExplanationByExerciseId] = useState({});

  const saveTimersRef = useRef(new Map());
  const inflightRef = useRef(new Map());

  // progress: island_item_id -> { is_completed, points_earned }
  const [progressByItemId, setProgressByItemId] = useState({});
  const [userId, setUserId] = useState(null);

  // ── TEST SYSTEM STATE ──────────────────────────────────────
  // Phase: 'loading' | 'intro' | 'active' | 'paused' | 'finished'
  const [testPhase, setTestPhase] = useState('loading');
  const [testExercises, setTestExercises] = useState([]);
  const [testSessionId, setTestSessionId] = useState(null);
  const [testExpiresAt, setTestExpiresAt] = useState(null);
  const [testTimeLimitSeconds, setTestTimeLimitSeconds] = useState(1800);
  const [testPassingScorePercent, setTestPassingScorePercent] = useState(50);
  const [testAnswers, setTestAnswers] = useState({});
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSubmittingTest, setIsSubmittingTest] = useState(false);
  const [testFinishedResult, setTestFinishedResult] = useState(null);
  const [testItemCount, setTestItemCount] = useState(0);

  const timerRef = useRef(null);
  const testAnswersRef = useRef({});
  const autoSubmittedRef = useRef(false);

  // Keep testAnswersRef in sync
  useEffect(() => {
    testAnswersRef.current = testAnswers;
  }, [testAnswers]);

  const resultByExerciseId = useMemo(() => {
    const map = new Map();
    for (const q of testResult?.perQuestion || []) map.set(q.exercise_id, q);
    return map;
  }, [testResult]);

  const exerciseItems = useMemo(() => items.filter((it) => it.item_type === 'exercise' && it.exercise?.id), [items]);
  const completedExerciseItemCount = useMemo(() => {
    return exerciseItems.filter((it) => Boolean(progressByItemId[it.id]?.is_completed)).length;
  }, [exerciseItems, progressByItemId]);

  const islandCompleted = useMemo(() => {
    if (exerciseItems.length === 0) return false;
    return completedExerciseItemCount === exerciseItems.length;
  }, [exerciseItems.length, completedExerciseItemCount]);

  async function loadProgressForItems(sessionUserId, islandItems) {
    const itemIds = (islandItems || []).map((it) => it.id);
    if (!itemIds.length) {
      setProgressByItemId({});
      return;
    }

    const { data, error } = await supabase
      .from('island_item_progress')
      .select('island_item_id, is_completed, points_earned')
      .eq('user_id', sessionUserId)
      .in('island_item_id', itemIds);

    if (error) {
      setMsg((prev) => (prev ? prev + ' ' : '') + `Progress load failed: ${error.message}`);
      setProgressByItemId({});
      return;
    }

    const map = {};
    for (const row of data || []) {
      map[row.island_item_id] = {
        is_completed: Boolean(row.is_completed),
        points_earned: Number(row.points_earned || 0),
      };
    }
    setProgressByItemId(map);
  }

  async function upsertCompletionForIslandItem({ sessionUserId, islandItemId, pointsEarned, lastAnswer }) {
    const { error } = await supabase.from('island_item_progress').upsert(
      {
        user_id: sessionUserId,
        island_item_id: islandItemId,
        is_completed: true,
        completed_at: new Date().toISOString(),
        points_earned: Number(pointsEarned || 0),
        last_answer: lastAnswer ?? null,
      },
      { onConflict: 'user_id,island_item_id' }
    );

    if (error) {
      setMsg((prev) => (prev ? prev + ' ' : '') + `Progress save failed: ${error.message}`);
      return false;
    }

    setProgressByItemId((prev) => ({
      ...prev,
      [islandItemId]: { is_completed: true, points_earned: Number(pointsEarned || 0) },
    }));
    return true;
  }

  useEffect(() => {
    if (!course_id || !island_id) return;

    (async () => {
      setLoading(true);
      setMsg('');
      setTestResult(null);
      setPendingFinish(null);
      setSaved({});
      setAnswers({});
      setResults({});
      setShowHintsByExerciseId({});
      setShowExplanationByExerciseId({});
      setProgressByItemId({});
      setUserId(null);
      setSectionSlug(null);
      setSectionTitle(null);
      // Reset test state
      setTestPhase('loading');
      setTestExercises([]);
      setTestAnswers({});
      setTimeRemaining(0);
      setTestExpiresAt(null);
      setTestFinishedResult(null);
      testAnswersRef.current = {};
      autoSubmittedRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/login');
        return;
      }

      setUserId(session.user?.id || null);

      const { data: isl, error: islErr } = await supabase
        .from('islands')
        .select('id, title, type, order_index, section_id, is_active, time_limit_seconds, intro_script, passing_score_percent')
        .eq('id', island_id)
        .single();

      if (islErr || !isl) {
        setMsg('Nie znaleziono wyspy.');
        setLoading(false);
        return;
      }
      if (isl.is_active === false) {
        setMsg('Ta wyspa jest nieaktywna.');
        setLoading(false);
        return;
      }
      setIsland(isl);

      const { data: secRules, error: secRulesErr } = await supabase
        .from('sections')
        .select('id, slug, title, test_questions_count, pass_percent')
        .eq('id', isl.section_id)
        .single();

      if (!secRulesErr && secRules) {
        setTestRules({
          test_questions_count: Number(secRules.test_questions_count || 6),
          pass_percent: Number(secRules.pass_percent || 60),
        });
        setSectionSlug(secRules.slug || null);
        setSectionTitle(secRules.title || null);
      }

      // ── TEST ISLAND BRANCH ─────────────────────────────────
      if (isl.type === 'test') {
        setTestTimeLimitSeconds(Number(isl.time_limit_seconds || 1800));
        setTestPassingScorePercent(Number(isl.passing_score_percent ?? 50));

        // Get item count for intro display
        const { count: itemCount } = await supabase
          .from('island_test_items')
          .select('id', { count: 'exact', head: true })
          .eq('island_id', island_id);
        setTestItemCount(itemCount || 0);

        const statusRes = await fetch(`/api/test-status?island_id=${island_id}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!statusRes.ok) {
          setMsg('Błąd sprawdzania statusu testu.');
          setLoading(false);
          return;
        }
        const status = await statusRes.json();

        if (status.phase === 'finished') {
          setTestPhase('finished');
          setTestFinishedResult(status.result);
          setLoading(false);
          return;
        }

        if (status.phase === 'active' || status.phase === 'paused') {
          const startRes = await fetch('/api/test-start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ island_id }),
          });
          const startData = await startRes.json();
          if (!startRes.ok) {
            setMsg(startData.error || 'Błąd ładowania testu.');
            setLoading(false);
            return;
          }
          setTestExercises(startData.exercises || []);
          setTestSessionId(startData.session_id);
          setTestExpiresAt(startData.expires_at);
          if (startData.time_limit_seconds) setTestTimeLimitSeconds(Number(startData.time_limit_seconds));
          if (startData.passing_score_percent !== undefined)
            setTestPassingScorePercent(Number(startData.passing_score_percent));
          if (status.phase === 'active') {
            setTimeRemaining(status.time_remaining_seconds || 0);
          }
          setTestPhase(status.phase);
          setLoading(false);
          return;
        }

        // intro
        setTestPhase('intro');
        setLoading(false);
        return;
      }
      // ── END TEST BRANCH ────────────────────────────────────

      const { data: its, error: itsErr } = await supabase
        .from('island_items')
        .select('id, item_type, order_index, title, youtube_url, exercise_id')
        .eq('island_id', island_id)
        .order('order_index', { ascending: true });

      if (itsErr) {
        setMsg('Błąd pobierania elementów wyspy: ' + itsErr.message);
        setItems([]);
        setLoading(false);
        return;
      }

      const exIds = (its || []).map((x) => x.exercise_id).filter(Boolean);

      let exById = {};
      let answerKeyById = {};

      if (exIds.length > 0) {
        const { data: exData, error: exErr } = await supabase
          .from('exercises')
          .select('id, prompt, description, hints, solution_video_url, answer_type, points_max, image_url')
          .in('id', exIds);

        if (exErr) {
          setMsg('Błąd pobierania zadań: ' + exErr.message);
        } else {
          exById = Object.fromEntries((exData || []).map((e) => [e.id, e]));
        }

        const { data: keyRows, error: keyErr } = await supabase
          .from('exercise_answer_keys')
          .select('exercise_id, answer_key')
          .in('exercise_id', exIds);

        if (keyErr) {
          setMsg((prev) => (prev ? prev : '') + ' ' + 'Błąd pobierania kluczy: ' + keyErr.message);
        } else {
          answerKeyById = Object.fromEntries((keyRows || []).map((k) => [k.exercise_id, k.answer_key]));
        }
      }

      const hydratedItems =
        (its || []).map((it) => {
          const ex = it.exercise_id ? exById[it.exercise_id] : null;
          const answer_key = it.exercise_id ? answerKeyById[it.exercise_id] : null;

          return {
            ...it,
            exercise: ex ? { ...ex, answer_key } : null,
          };
        }) || [];

      setItems(hydratedItems);

      await loadProgressForItems(session.user.id, hydratedItems);

      setLoading(false);
    })();
  }, [course_id, island_id, router]);

  // ── TIMER EFFECT ──────────────────────────────────────────
  useEffect(() => {
    if (testPhase !== 'active' || !testExpiresAt) return;

    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.floor((new Date(testExpiresAt) - Date.now()) / 1000));
      setTimeRemaining(remaining);
      if (remaining <= 0 && !autoSubmittedRef.current) {
        autoSubmittedRef.current = true;
        clearInterval(timerRef.current);
        doSubmitTest(testAnswersRef.current);
      }
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [testPhase, testExpiresAt]);

  // ── TEST HANDLERS ─────────────────────────────────────────
  async function handleStartTest() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      router.replace('/login');
      return;
    }

    setMsg('');
    setTestPhase('loading');
    setTestAnswers({});
    testAnswersRef.current = {};
    autoSubmittedRef.current = false;

    const res = await fetch('/api/test-start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ island_id }),
    });
    const data = await res.json();

    if (!res.ok) {
      setMsg(data.error || 'Błąd uruchamiania testu.');
      setTestPhase('intro');
      return;
    }

    if (data.already_completed) {
      setTestPhase('finished');
      setTestFinishedResult(data.result);
      return;
    }

    setTestExercises(data.exercises || []);
    setTestSessionId(data.session_id);
    setTestExpiresAt(data.expires_at);
    if (data.time_limit_seconds) setTestTimeLimitSeconds(Number(data.time_limit_seconds));
    if (data.passing_score_percent !== undefined) setTestPassingScorePercent(Number(data.passing_score_percent));
    const initialRemaining = Math.max(0, Math.floor((new Date(data.expires_at) - Date.now()) / 1000));
    setTimeRemaining(initialRemaining);
    setTestPhase('active');
  }

  async function handlePauseTest() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      router.replace('/login');
      return;
    }

    if (timerRef.current) clearInterval(timerRef.current);

    const res = await fetch('/api/test-pause', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ island_id }),
    });
    if (!res.ok) {
      const data = await res.json();
      setMsg(data.error || 'Błąd pauzy.');
      return;
    }
    setTestPhase('paused');
  }

  async function handleResumeTest() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      router.replace('/login');
      return;
    }

    const res = await fetch('/api/test-resume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ island_id }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error || 'Błąd wznawiania testu.');
      return;
    }
    setTestExpiresAt(data.expires_at);
    autoSubmittedRef.current = false;
    setTestPhase('active');
  }

  async function doSubmitTest(answers) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      router.replace('/login');
      return;
    }

    setIsSubmittingTest(true);
    setMsg('');
    if (timerRef.current) clearInterval(timerRef.current);

    try {
      const res = await fetch('/api/test-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ island_id, answers }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error || 'Błąd wysyłania testu.');
        setIsSubmittingTest(false);
        return;
      }
      setTestFinishedResult({
        score_percent: data.score_percent,
        points_earned: data.points_earned,
        points_max: data.points_max,
        passed: data.passed,
        per_question: data.per_question,
        passing_score_percent: data.passing_score_percent,
      });
      setTestPhase('finished');
    } finally {
      setIsSubmittingTest(false);
    }
  }

  function handleConfirmSubmit() {
    setShowConfirmModal(false);
    doSubmitTest(testAnswersRef.current);
  }

  async function saveAttempt(exerciseId, answer, { storeResult } = { storeResult: false }) {
    if (inflightRef.current.get(exerciseId)) return;
    inflightRef.current.set(exerciseId, true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/login');
        return;
      }

      const res = await fetch('/api/exercise-attempt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          island_id,
          exercise_id: exerciseId,
          answer,
          time_spent_sec: 0,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setMsg(json?.error ? `${json.error}${json.details ? `: ${json.details}` : ''}` : 'Save failed');
        return;
      }

      setSaved((prev) => ({ ...prev, [exerciseId]: true }));

      if (storeResult) {
        setResults((prev) => ({
          ...prev,
          [exerciseId]: { is_correct: json.is_correct, points_awarded: json.points_awarded },
        }));

        if (json.is_correct) {
          const islandItem = items.find((it) => it.item_type === 'exercise' && it.exercise_id === exerciseId);
          const pts = islandItem?.exercise?.points_max ?? json.points_awarded ?? 0;

          if (islandItem && session.user?.id) {
            await upsertCompletionForIslandItem({
              sessionUserId: session.user.id,
              islandItemId: islandItem.id,
              pointsEarned: pts,
              lastAnswer: answer,
            });
          }
        }
      }

      setMsg('');
    } finally {
      inflightRef.current.set(exerciseId, false);
    }
  }

  function scheduleSave(exerciseId, answer, delayMs = 600) {
    const timers = saveTimersRef.current;
    const existing = timers.get(exerciseId);
    if (existing) clearTimeout(existing);

    const t = setTimeout(() => {
      timers.delete(exerciseId);
      if (testResult) return;
      saveAttempt(exerciseId, answer, { storeResult: false });
    }, delayMs);

    timers.set(exerciseId, t);
  }

  async function reallySubmitTest() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      router.replace('/login');
      return;
    }

    setSubmittingTest(true);
    setMsg('');
    setTestResult(null);

    try {
      const res = await fetch('/api/submit-test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ island_id }),
      });

      const json = await res.json();
      if (!res.ok) {
        setMsg(json?.error ? `${json.error}${json.details ? `: ${json.details}` : ''}` : 'Submit test failed');
        return;
      }

      setTestResult(json);

      if (Array.isArray(json.perQuestion) && session.user?.id) {
        for (const q of json.perQuestion) {
          if (!q?.is_correct) continue;
          const islandItem = items.find((it) => it.item_type === 'exercise' && it.exercise_id === q.exercise_id);
          if (!islandItem) continue;

          const pts = islandItem.exercise?.points_max ?? q.points_awarded ?? 0;

          await upsertCompletionForIslandItem({
            sessionUserId: session.user.id,
            islandItemId: islandItem.id,
            pointsEarned: pts,
            lastAnswer: q.user_answer ?? null,
          });
        }
      }

      setTimeout(() => {
        const el = document.getElementById('test-summary');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 0);
    } finally {
      setSubmittingTest(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <div className="mx-auto max-w-3xl p-6 text-sm text-gray-700">Ładowanie…</div>
      </div>
    );
  }

  // ── TEST ISLAND RENDERING ────────────────────────────────────────────────────
  if (island?.type === 'test') {
    const backHref =
      sectionSlug && course_id ? `/courses/${course_id}/sections/${sectionSlug}` : `/courses/${course_id}`;
    const timeLimitMinutes = Math.round(testTimeLimitSeconds / 60);
    const filledCount = Object.keys(testAnswers).filter((k) => {
      const a = testAnswers[k];
      if (!a) return false;
      if (a.choice !== undefined) return Boolean(a.choice);
      if (a.value !== undefined) return String(a.value).trim() !== '';
      return false;
    }).length;
    const totalExercises = testExercises.length;
    const warningThreshold = Math.floor(testTimeLimitSeconds * 0.15);
    const isTimerWarning = testPhase === 'active' && timeRemaining <= warningThreshold;

    // ── PHASE: loading ──
    if (testPhase === 'loading') {
      return (
        <div className="min-h-screen bg-white">
          <div className="mx-auto max-w-3xl p-6 text-sm text-gray-700">Ładowanie testu…</div>
        </div>
      );
    }

    // ── PHASE: intro ──
    if (testPhase === 'intro') {
      return (
        <div className="min-h-screen bg-white">
          <div className="mx-auto max-w-3xl p-6">
            <Link href={backHref} className="text-sm font-semibold text-gray-700 underline">
              ← {sectionTitle || 'Panel'}
            </Link>
            <h1 className="mt-4 text-2xl font-bold text-gray-900">📝 {island.title}</h1>

            {island.intro_script ? (
              <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-4 whitespace-pre-wrap text-sm text-gray-800">
                {island.intro_script}
              </div>
            ) : null}

            <div className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 space-y-2 text-sm text-indigo-900">
              <div>⏱ Czas na test: <b>{timeLimitMinutes} minut</b></div>
              <div>🎯 Próg zaliczenia: <b>{testPassingScorePercent}%</b></div>
              <div>📋 Liczba zadań: <b>{testItemCount}</b></div>
              <div className="pt-2 border-t border-indigo-200">⚠️ <b>Masz tylko jedno podejście do testu.</b></div>
              <div>⏸ Podczas testu możesz pauzować — ekran zostanie zaciemniony.</div>
            </div>

            {msg ? (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{msg}</div>
            ) : null}

            <button
              type="button"
              onClick={handleStartTest}
              className="mt-6 rounded-xl border border-indigo-700 bg-indigo-700 px-6 py-3 text-sm font-semibold text-white hover:bg-indigo-800"
            >
              Rozpocznij test →
            </button>
          </div>
        </div>
      );
    }

    // ── PHASE: finished ──
    if (testPhase === 'finished') {
      const res = testFinishedResult;
      const perQ = res?.per_question || (res?.answers ? Object.entries(res.answers).map(([exercise_id, a]) => ({
        exercise_id,
        is_correct: a?.is_correct ?? false,
        answered: Boolean(a),
        user_answer: a?.user_answer ?? a,
        correct_answer: a?.correct_answer ?? null,
        answer_type: a?.answer_type ?? null,
        test_points: a?.test_points ?? 1,
      })) : []);
      const passed = res?.passed ?? false;
      const scorePercent = res?.score_percent ?? 0;
      const pointsEarned = res?.points_earned ?? 0;
      const pointsMax = res?.points_max ?? 0;
      const passingPct = res?.passing_score_percent ?? testPassingScorePercent;

      return (
        <div className="min-h-screen bg-white">
          <div className="mx-auto max-w-3xl p-6">
            <Link href={backHref} className="text-sm font-semibold text-gray-700 underline">
              ← {sectionTitle || 'Panel'}
            </Link>
            <h1 className="mt-4 text-2xl font-bold text-gray-900">📝 {island.title}</h1>

            <div className={`mt-4 rounded-2xl border p-5 ${passed ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
              <div className={`text-2xl font-bold ${passed ? 'text-green-800' : 'text-red-800'}`}>
                {passed ? '✅ ZALICZONO' : '❌ NIE ZALICZONO'}
              </div>
              <div className="mt-2 text-lg font-semibold text-gray-900">
                Wynik: {scorePercent}%
              </div>
              <div className="text-sm text-gray-700">
                Punkty: {pointsEarned} / {pointsMax}
              </div>
              <div className="text-sm text-gray-600">Próg zaliczenia: {passingPct}%</div>
            </div>

            {perQ.length > 0 ? (
              <div className="mt-6 space-y-3">
                <div className="text-sm font-semibold text-gray-700">Szczegóły zadań:</div>
                {perQ.map((q, idx) => {
                  const ex = testExercises.find((e) => e.exercise_id === q.exercise_id || e.id === q.exercise_id);
                  const diff = ex?.difficulty || 1;
                  const borderColor = DIFFICULTY_BORDER[diff] || 'border-gray-200';
                  return (
                    <div key={q.exercise_id || idx} className={`rounded-2xl border-2 p-4 ${borderColor} ${q.is_correct ? 'bg-green-50' : 'bg-red-50'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-semibold text-gray-600">Zadanie {idx + 1}</div>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${q.is_correct ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {q.is_correct ? `+${q.test_points ?? 1} pkt` : '0 pkt'}
                        </span>
                      </div>
                      {ex?.prompt ? (
                        <div className="mt-1 text-sm text-gray-800 whitespace-pre-wrap">{ex.prompt}</div>
                      ) : null}
                      {!q.is_correct ? (
                        <div className="mt-2 rounded-xl border border-gray-200 bg-white/70 p-2 text-xs text-gray-700">
                          <div><span className="font-semibold">Twoja odpowiedź:</span>{' '}
                            {q.answered
                              ? (q.answer_type === 'abcd' ? String(q.user_answer?.choice || '—').toUpperCase() : q.user_answer?.value ?? '—')
                              : '—'}
                          </div>
                          {q.correct_answer !== null && q.correct_answer !== undefined ? (
                            <div><span className="font-semibold">Poprawna:</span>{' '}
                              {q.answer_type === 'abcd' ? String(q.correct_answer).toUpperCase() : q.correct_answer}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}

            <Link href={backHref} className="mt-6 inline-block rounded-xl border border-gray-900 bg-gray-900 px-4 py-2 text-sm font-semibold text-white">
              ← Powrót do działu
            </Link>
          </div>
        </div>
      );
    }

    // ── PHASE: active or paused ──
    const isActive = testPhase === 'active';
    const isPaused = testPhase === 'paused';

    return (
      <div className="min-h-screen bg-white">
        {/* Sticky header bar */}
        <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3 shadow-sm">
          <div className="text-sm font-semibold text-gray-900 truncate">{island.title}</div>
          <div className="flex items-center gap-3">
            <div className={`rounded-xl border px-3 py-1.5 text-sm font-bold tabular-nums ${isTimerWarning ? 'timer-warning border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50 text-gray-900'}`}>
              ⏱ {formatTime(timeRemaining)}
            </div>
            {isActive ? (
              <button
                type="button"
                onClick={handlePauseTest}
                className="rounded-xl border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-900 hover:bg-gray-50"
              >
                ⏸ Pauza
              </button>
            ) : null}
          </div>
        </div>

        {/* Pause overlay */}
        {isPaused ? (
          <div className="fixed inset-0 z-30 flex items-center justify-center backdrop-blur-sm bg-black/60">
            <div className="rounded-2xl border border-white/20 bg-white p-8 text-center shadow-2xl max-w-sm mx-4">
              <div className="text-2xl font-bold text-gray-900">⏸ Test zapauzowany</div>
              <div className="mt-2 text-sm text-gray-600">Ekran jest zaciemniony — zadania są niewidoczne.</div>
              <button
                type="button"
                onClick={handleResumeTest}
                className="mt-6 w-full rounded-xl border border-indigo-700 bg-indigo-700 px-6 py-3 text-sm font-semibold text-white hover:bg-indigo-800"
              >
                ▶ Wznów test
              </button>
            </div>
          </div>
        ) : null}

        {/* Confirm submit modal */}
        {showConfirmModal ? (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl max-w-sm mx-4">
              <div className="text-lg font-bold text-gray-900">Zakończyć test?</div>
              <div className="mt-2 text-sm text-gray-700">
                Wypełniono <b>{filledCount}/{totalExercises}</b> zadań.{' '}
                {filledCount < totalExercises ? 'Brakujące odpowiedzi zostaną policzone jako błędne.' : ''}
              </div>
              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  onClick={handleConfirmSubmit}
                  disabled={isSubmittingTest}
                  className="flex-1 rounded-xl border border-red-700 bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {isSubmittingTest ? 'Wysyłanie…' : 'Tak, zakończ'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(false)}
                  className="flex-1 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900"
                >
                  Wróć
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Main content */}
        <div className={`mx-auto max-w-3xl p-4 ${isPaused ? 'blur-sm pointer-events-none select-none' : ''}`}>
          {msg ? (
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{msg}</div>
          ) : null}

          <div className="space-y-4">
            {testExercises.map((ex, idx) => {
              const exId = ex.exercise_id || ex.id;
              const a = testAnswers[exId] || {};
              const diff = ex.difficulty || 1;
              const borderColor = DIFFICULTY_BORDER[diff] || 'border-gray-200';
              const abcdOptions = ex.answer_key ? getAbcdOptionsFromAnswerKey(ex.answer_key) : null;
              const hints = Array.isArray(ex.hints) ? ex.hints : [];

              return (
                <div key={exId} className={`rounded-2xl border-2 p-4 bg-white ${borderColor}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-xs font-semibold text-gray-500">
                      ZADANIE {idx + 1} • {['', 'Łatwe', 'Podstawowe', 'Średnie', 'Trudne', 'Bardzo trudne'][diff] || `Difficulty ${diff}`}
                    </div>
                    <span className="text-xs font-semibold text-gray-500">{ex.test_points ?? 1} pkt</span>
                  </div>

                  {ex.prompt ? (
                    <div className="mt-2 whitespace-pre-wrap text-sm text-gray-800">{ex.prompt}</div>
                  ) : null}

                  {ex.description ? (
                    <div className="mt-2 whitespace-pre-wrap text-sm text-gray-700">
                      <span className="font-semibold">Opis:</span> {ex.description}
                    </div>
                  ) : null}

                  {ex.image_url ? (
                    <img
                      src={ex.image_url}
                      alt="Obrazek do zadania"
                      className="mt-3 w-full rounded-xl border border-gray-200"
                      loading="lazy"
                    />
                  ) : null}

                  {hints.length > 0 ? (
                    <div className="mt-3">
                      <button
                        type="button"
                        className="rounded-xl border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-900"
                        onClick={() =>
                          setShowHintsByExerciseId((prev) => ({ ...prev, [exId]: !prev[exId] }))
                        }
                      >
                        {showHintsByExerciseId[exId] ? 'Ukryj podpowiedzi' : `Pokaż podpowiedzi (${hints.length})`}
                      </button>
                      {showHintsByExerciseId[exId] ? (
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-800">
                          {hints.map((h, i) => (
                            <li key={i} className="whitespace-pre-wrap">{String(h)}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="mt-3">
                    {ex.answer_type === 'numeric' ? (
                      <input
                        className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
                        placeholder="Wpisz odpowiedź (liczba)"
                        value={a.value || ''}
                        onChange={(e) => {
                          const value = e.target.value;
                          const newAnswers = { ...testAnswers, [exId]: { ...(testAnswers[exId] || {}), value } };
                          setTestAnswers(newAnswers);
                          testAnswersRef.current = newAnswers;
                        }}
                      />
                    ) : ex.answer_type === 'abcd' ? (
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {['A', 'B', 'C', 'D'].map((opt) => {
                          const selected = (a.choice || '').toUpperCase() === opt;
                          const labelText = abcdOptions?.[opt] ? `${opt}) ${abcdOptions[opt]}` : opt;
                          return (
                            <button
                              key={opt}
                              type="button"
                              className={[
                                'rounded-xl border px-3 py-2 text-left text-sm font-semibold',
                                selected
                                  ? 'border-gray-900 bg-gray-900 text-white'
                                  : 'border-gray-300 bg-white text-gray-900',
                              ].join(' ')}
                              onClick={() => {
                                const prevChoice = (testAnswers[exId]?.choice || '').toUpperCase();
                                const nextChoice = prevChoice === opt ? '' : opt;
                                const newAnswers = { ...testAnswers, [exId]: { ...(testAnswers[exId] || {}), choice: nextChoice } };
                                setTestAnswers(newAnswers);
                                testAnswersRef.current = newAnswers;
                              }}
                            >
                              {labelText}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-sm text-gray-600">
                        Typ: <code>{ex.answer_type}</code>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom bar */}
          <div className="mt-6 rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
            <div className="text-sm text-indigo-900">
              Wypełnione: <b>{filledCount}</b> / {totalExercises}
            </div>
            <button
              type="button"
              onClick={() => setShowConfirmModal(true)}
              disabled={isSubmittingTest}
              className="mt-3 rounded-xl border border-indigo-700 bg-indigo-700 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {isSubmittingTest ? 'Wysyłanie…' : 'Zakończ test'}
            </button>
          </div>
        </div>
      </div>
    );
  }
  // ── END TEST ISLAND RENDERING ────────────────────────────────────────────────
  const isTest = island?.type === 'test';
  const testCount = isTest ? (testRules?.test_questions_count ?? 6) : null;
  const passPercent = isTest ? (testRules?.pass_percent ?? 60) : null;

  function onClickFinishTest() {
    const filled = Object.keys(saved).length;
    if (filled < testCount) {
      setPendingFinish({ filled });
      return;
    }
    setPendingFinish(null);
    reallySubmitTest();
  }

  const backHref =
    sectionSlug && course_id ? `/courses/${course_id}/sections/${sectionSlug}` : `/courses/${course_id}`;

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Link href={backHref} className="text-sm font-semibold text-gray-700 underline">
              ← {sectionTitle ? sectionTitle : 'Panel'}
            </Link>
            <h1 className="mt-2 text-2xl font-bold text-gray-900">
              {isTest ? 'Test' : 'Wyspa'}: {island?.title}
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              {isTest
                ? `Odpowiadaj — zapisywanie jest automatyczne. Po zakończeniu pytania podświetlą się na zielono/czerwono. (próg: ${passPercent}%)`
                : 'Wpisz odpowiedź i kliknij „Sprawdź”, aby zobaczyć czy jest poprawna.'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {!isTest ? <CheckIcon done={islandCompleted} size={22} /> : null}

            <span
              className={[
                'h-fit rounded-full px-3 py-1 text-xs font-semibold',
                isTest ? 'bg-indigo-100 text-indigo-800' : 'bg-gray-100 text-gray-800',
              ].join(' ')}
            >
              {isTest ? 'TEST' : 'NORMAL'}
            </span>
          </div>
        </div>

        {!isTest ? (
          <div className="mt-3 text-xs text-gray-600">
            Ukończone ćwiczenia: <b>{completedExerciseItemCount}</b> / {exerciseItems.length}
          </div>
        ) : null}

        {msg ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{msg}</div>
        ) : null}

        <div className="mt-6 space-y-4">
          {items.length === 0 ? (
            <div className="rounded-2xl border border-gray-200 p-4 text-sm text-gray-700">
              Brak elementów w tej wyspie.
            </div>
          ) : (
            items.map((it) => {
              if (it.item_type === 'video') {
                return (
                  <div key={it.id} className="rounded-2xl border border-gray-200 p-4">
                    <div className="text-xs font-semibold text-gray-500">WIDEO • #{it.order_index}</div>
                    <div className="mt-1 text-base font-semibold text-gray-900">{it.title || 'Lekcja wideo'}</div>
                    <div className="mt-3 aspect-video w-full overflow-hidden rounded-xl bg-black">
                      <iframe
                        className="h-full w-full"
                        src={toEmbedUrl(it.youtube_url)}
                        title={it.title || 'YouTube video'}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    </div>
                  </div>
                );
              }

              const ex = it.exercise;
              const exId = ex?.id;
              const a = exId ? answers[exId] || {} : {};

              const qRes = exId ? resultByExerciseId.get(exId) : null;
              const showGradingInCard = isTest && Boolean(testResult) && Boolean(qRes);

              const cardStyle = showGradingInCard
                ? !qRes.answered
                  ? 'border-gray-200 bg-white'
                  : qRes.is_correct
                    ? 'border-green-200 bg-green-50'
                    : 'border-red-200 bg-red-50'
                : 'border-gray-200 bg-white';

              const badge = showGradingInCard
                ? !qRes.answered
                  ? { text: 'BRAK', cls: 'bg-gray-100 text-gray-800 border-gray-200' }
                  : qRes.is_correct
                    ? { text: 'OK', cls: 'bg-green-100 text-green-800 border-green-200' }
                    : { text: 'BŁĄD', cls: 'bg-red-100 text-red-800 border-red-200' }
                : null;

              const hints = Array.isArray(ex?.hints) ? ex.hints : [];
              const abcdOptions = getAbcdOptionsFromAnswerKey(ex?.answer_key);

              const itemCompleted = Boolean(progressByItemId[it.id]?.is_completed);

              return (
                <div key={it.id} className={`rounded-2xl border p-4 ${cardStyle}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      {!isTest ? <CheckIcon done={itemCompleted} size={20} className="mt-0.5" /> : null}

                      <div>
                        <div className="text-xs font-semibold text-gray-500">ZADANIE • #{it.order_index}</div>
                        <div className="mt-1 text-base font-semibold text-gray-900">{it.title || 'Ćwiczenie'}</div>
                      </div>
                    </div>

                    {badge ? (
                      <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${badge.cls}`}>
                        {badge.text}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-2 whitespace-pre-wrap text-sm text-gray-800">{ex?.prompt || '(brak treści)'}</div>

                  {ex?.description ? (
                    <div className="mt-2 whitespace-pre-wrap text-sm text-gray-700">
                      <span className="font-semibold">Opis:</span> {ex.description}
                    </div>
                  ) : null}

                  {ex?.image_url ? (
                    <img
                      src={ex.image_url}
                      alt="Obrazek do zadania"
                      className="mt-3 w-full rounded-xl border border-gray-200"
                      loading="lazy"
                    />
                  ) : null}

                  {hints.length > 0 ? (
                    <div className="mt-3">
                      <button
                        type="button"
                        className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900"
                        onClick={() =>
                          setShowHintsByExerciseId((prev) => ({ ...prev, [exId]: !Boolean(prev[exId]) }))
                        }
                      >
                        {showHintsByExerciseId[exId] ? 'Ukryj podpowiedzi' : `Pokaż podpowiedzi (${hints.length})`}
                      </button>

                      {showHintsByExerciseId[exId] ? (
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-800">
                          {hints.map((h, idx) => (
                            <li key={idx} className="whitespace-pre-wrap">
                              {String(h)}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}

                  {ex?.solution_video_url ? (
                    <div className="mt-3">
                      <button
                        type="button"
                        className="rounded-xl border border-indigo-700 bg-indigo-700 px-3 py-2 text-sm font-semibold text-white"
                        onClick={() =>
                          setShowExplanationByExerciseId((prev) => ({ ...prev, [exId]: !Boolean(prev[exId]) }))
                        }
                      >
                        {showExplanationByExerciseId[exId] ? 'Ukryj wyjaśnienie' : 'Pokaż wyjaśnienie'}
                      </button>

                      {showExplanationByExerciseId[exId] ? (
                        <div className="mt-2">
                          <a
                            href={ex.solution_video_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm font-semibold text-indigo-700 underline"
                          >
                            Otwórz link do wyjaśnienia →
                          </a>

                          {toEmbedUrl(ex.solution_video_url)?.includes('youtube.com/embed/') ? (
                            <div className="mt-3 aspect-video w-full overflow-hidden rounded-xl bg-black">
                              <iframe
                                className="h-full w-full"
                                src={toEmbedUrl(ex.solution_video_url)}
                                title="Wyjaśnienie"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                              />
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="mt-3">
                    {ex?.answer_type === 'numeric' ? (
                      <input
                        className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
                        placeholder="Wpisz odpowiedź (liczba)"
                        value={a.value || ''}
                        onChange={(e) => {
                          const value = e.target.value;
                          setAnswers((prev) => ({
                            ...prev,
                            [exId]: { ...(prev[exId] || {}), value },
                          }));
                          if (isTest) scheduleSave(exId, { value });
                        }}
                        onBlur={() => {
                          if (!isTest) return;
                          const value = (answers[exId]?.value ?? '').toString();
                          scheduleSave(exId, { value }, 0);
                        }}
                      />
                    ) : ex?.answer_type === 'abcd' ? (
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {['A', 'B', 'C', 'D'].map((opt) => {
                          const selected = (a.choice || '').toUpperCase() === opt;
                          const labelText = abcdOptions?.[opt] ? `${opt}) ${abcdOptions[opt]}` : opt;

                          return (
                            <button
                              key={opt}
                              type="button"
                              className={[
                                'rounded-xl border px-3 py-2 text-left text-sm font-semibold',
                                selected
                                  ? 'border-gray-900 bg-gray-900 text-white'
                                  : 'border-gray-300 bg-white text-gray-900',
                              ].join(' ')}
                              onClick={() => {
                                const prevChoice = (answers?.[exId]?.choice || '').toUpperCase();
                                const nextChoice = prevChoice === opt ? '' : opt;

                                setAnswers((prev) => ({
                                  ...prev,
                                  [exId]: { ...(prev[exId] || {}), choice: nextChoice },
                                }));

                                if (isTest) saveAttempt(exId, { choice: nextChoice }, { storeResult: false });
                              }}
                            >
                              {labelText}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-sm text-gray-600">
                        Typ zadania: <code>{ex?.answer_type}</code> (MVP jeszcze nieobsługiwane)
                      </div>
                    )}
                  </div>

                  {showGradingInCard ? (
                    <div className="mt-3 rounded-xl border border-gray-200 bg-white/70 p-3 text-sm text-gray-900">
                      <div>
                        <span className="font-semibold">Twoja odpowiedź:</span> {formatUserAnswer(qRes)}
                      </div>
                      <div className="mt-1">
                        <span className="font-semibold">Poprawna odpowiedź:</span> {formatCorrectAnswer(qRes)}
                      </div>
                      {!qRes.answered ? (
                        <div className="mt-2 text-xs text-gray-700">Nie zapisano odpowiedzi — policzone jako błędne.</div>
                      ) : null}
                    </div>
                  ) : null}

                  {!isTest && (ex?.answer_type === 'numeric' || ex?.answer_type === 'abcd') ? (
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-xs text-gray-600">
                        Punkty: {ex?.points_max ?? 0}
                        {results[exId] ? (
                          <span className="ml-2 font-semibold">
                            • {results[exId].is_correct ? '✅ poprawnie' : '❌ błędnie'} (+{results[exId].points_awarded})
                          </span>
                        ) : null}
                      </div>

                      <button
                        type="button"
                        className="rounded-xl border border-gray-900 bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
                        onClick={() => saveAttempt(exId, answers[exId] || {}, { storeResult: true })}
                      >
                        Sprawdź
                      </button>
                    </div>
                  ) : (
                    <div className="mt-3 text-xs text-gray-600">
                      Punkty: {ex?.points_max ?? 0}
                      {isTest && saved[exId] ? <span className="ml-2 font-semibold">• zapisano</span> : null}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {isTest ? (
          <div className="mt-6 rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
            <div className="text-sm text-indigo-900">
              Wypełnione: <b>{Object.keys(saved).length}</b> / {testCount} (liczone jako „zapisane”)
            </div>

            {!testResult && pendingFinish ? (
              <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                <div className="font-semibold">Nie uzupełniłeś wszystkich odpowiedzi.</div>
                <div className="mt-1">
                  Uzupełniono {pendingFinish.filled}/{testCount}. Brakujące zostaną policzone jako błędne.
                </div>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    className="rounded-xl border border-red-700 bg-red-700 px-4 py-2 text-sm font-semibold text-white"
                    onClick={() => {
                      setPendingFinish(null);
                      reallySubmitTest();
                    }}
                  >
                    Zakończ mimo to
                  </button>
                  <button
                    type="button"
                    className="rounded-xl border border-red-700 bg-white px-4 py-2 text-sm font-semibold text-red-700"
                    onClick={() => setPendingFinish(null)}
                  >
                    Wróć i uzupełnij
                  </button>
                </div>
              </div>
            ) : null}

            {!testResult ? (
              <button
                type="button"
                onClick={onClickFinishTest}
                disabled={submittingTest}
                className="mt-3 rounded-xl border border-indigo-700 bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {submittingTest ? 'Zapisuję…' : 'Zakończ test'}
              </button>
            ) : (
              <div className="mt-3 text-sm font-semibold text-indigo-900">Test zakończony — wynik jest zapisany poniżej.</div>
            )}

            <div className="mt-2 text-xs text-indigo-900/80">
              Wynik liczy się z ostatnich prób każdego z {testCount} zadań. Brak odpowiedzi = 0 pkt.
            </div>
          </div>
        ) : null}

        {isTest && testResult ? (
          <div
            id="test-summary"
            className="mt-6 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900"
          >
            <div className="font-semibold">Podsumowanie</div>
            <div className="mt-1">
              Wynik: <b>{testResult.score_percent}%</b>
            </div>
            <div>
              Poprawne: {testResult.correctCount} / {testResult.test_questions_count ?? testCount}
            </div>
            <div>
              Zaliczone: {testResult.passed ? 'TAK' : 'NIE'} (próg {testResult.pass_percent ?? passPercent}%)
            </div>
            <div>Najlepszy wynik w dziale: {testResult.best_test_score_percent}%</div>
            <div className="mt-2 text-xs text-indigo-900/80">Przewiń w górę — zadania zostały oznaczone na zielono/czerwono.</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}