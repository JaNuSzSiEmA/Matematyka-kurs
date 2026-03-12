import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import AdminGate from '../../../../components/admin/AdminGate';
import { supabase } from '../../../../lib/admin';

function hintsFromTextarea(text) {
  const lines = String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.length ? lines : null;
}

function normalizeChoice(x) {
  return String(x || '').trim().toUpperCase();
}

function parseNumericValue(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const n = Number(s.replace(',', '.'));
  if (!Number.isNaN(n) && s.match(/^-?\d+([.,]\d+)?$/)) return n;
  return s;
}

function short(text, n = 90) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!s) return '—';
  return s.length > n ? s.slice(0, n) + '…' : s;
}

const DIFFICULTY_LABELS = ['', 'Łatwe (1)', 'Podstawowe (2)', 'Średnie (3)', 'Trudne (4)', 'Bardzo trudne (5)'];
const DIFFICULTY_COLORS = ['', 'bg-blue-100 text-blue-800', 'bg-green-100 text-green-800', 'bg-yellow-100 text-yellow-800', 'bg-orange-100 text-orange-800', 'bg-red-100 text-red-800'];
const DEFAULT_TEST_POINTS_BY_DIFF = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 };

export default function AdminTestIslandEditor() {
  const router = useRouter();
  const { island_id } = router.query;

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  const [island, setIsland] = useState(null);
  const [section, setSection] = useState(null);

  // Settings form
  const [settings, setSettings] = useState({
    title: '',
    intro_script: '',
    time_limit_seconds: 1800,
    passing_score_percent: 50,
  });

  // Test items
  const [testItems, setTestItems] = useState([]);

  // Exercises for attach dropdown
  const [exercises, setExercises] = useState([]);
  const [exerciseSearch, setExerciseSearch] = useState('');

  // Attach existing exercise
  const [attachForm, setAttachForm] = useState({ exercise_id: '', test_points: 1 });

  // Create new exercise form
  const [create, setCreate] = useState({
    title: '',
    prompt: '',
    description: '',
    image_url: '',
    answer_type: 'abcd',
    optionsA: '',
    optionsB: '',
    optionsC: '',
    optionsD: '',
    correct_choice: 'A',
    correct_numeric: '',
    points_max: 1,
    difficulty: 1,
    requires_ai: false,
    requires_photo: false,
    status: 'draft',
    solution_video_url: '',
    hints_text: '',
    use_in_course: true,
    use_in_repertory: false,
    use_in_generator: false,
    use_in_minigame: false,
    topic_section_id: '',
    test_points: 1,
  });

  async function load() {
    if (!island_id) return;
    setLoading(true);
    setMsg('');

    const { data: isl, error: islErr } = await supabase
      .from('islands')
      .select('id, section_id, title, type, order_index, is_active, time_limit_seconds, intro_script, passing_score_percent')
      .eq('id', island_id)
      .single();

    if (islErr) {
      setMsg(islErr.message);
      setLoading(false);
      return;
    }
    setIsland(isl);
    setSettings({
      title: isl.title || '',
      intro_script: isl.intro_script || '',
      time_limit_seconds: isl.time_limit_seconds || 1800,
      passing_score_percent: isl.passing_score_percent ?? 50,
    });

    const { data: sec, error: secErr } = await supabase
      .from('sections')
      .select('id, course_id, title, slug')
      .eq('id', isl.section_id)
      .single();

    if (secErr) {
      setMsg(`Błąd ładowania sekcji: ${secErr.message}`);
      setLoading(false);
      return;
    }
    setSection(sec);

    setCreate((p) => ({ ...p, topic_section_id: p.topic_section_id || isl.section_id }));

    // Load test items with exercise details
    const { data: items, error: itemsErr } = await supabase
      .from('island_test_items')
      .select(
        `
        id,
        island_id,
        exercise_id,
        test_points,
        order_index,
        created_at,
        exercises:exercise_id (
          id,
          title,
          prompt,
          answer_type,
          points_max,
          difficulty,
          status
        )
      `
      )
      .eq('island_id', island_id)
      .order('order_index', { ascending: true });

    if (itemsErr) {
      setMsg(`Błąd ładowania zadań testu: ${itemsErr.message}`);
      setLoading(false);
      return;
    }
    setTestItems(items || []);

    // Load exercises for dropdown
    const { data: exList, error: exErr } = await supabase
      .from('exercises')
      .select('id, title, prompt, answer_type, points_max, difficulty, status')
      .order('created_at', { ascending: false })
      .limit(500);

    if (exErr) {
      setMsg(`Błąd ładowania banku zadań: ${exErr.message}`);
    } else {
      setExercises(exList || []);
    }

    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [island_id]);

  const filteredExercises = useMemo(() => {
    const term = exerciseSearch.trim().toLowerCase();
    if (!term) return exercises;
    return exercises.filter((e) => {
      const hay = `${e.title || ''} ${e.prompt || ''} ${e.answer_type || ''} ${e.id}`.toLowerCase();
      return hay.includes(term);
    });
  }, [exercises, exerciseSearch]);

  // ── SETTINGS ──────────────────────────────────────────────
  async function saveSettings() {
    setMsg('');
    const { error } = await supabase
      .from('islands')
      .update({
        title: settings.title || null,
        intro_script: settings.intro_script || null,
        time_limit_seconds: Number(settings.time_limit_seconds) || null,
        passing_score_percent: Number(settings.passing_score_percent) ?? 50,
      })
      .eq('id', island_id);

    if (error) {
      setMsg(error.message);
    } else {
      setMsg('✅ Ustawienia zapisane.');
      await load();
    }
  }

  // ── TEST ITEMS ─────────────────────────────────────────────
  async function deleteTestItem(id) {
    setMsg('');
    const ok = window.confirm('Usunąć zadanie z testu?');
    if (!ok) return;
    const { error } = await supabase.from('island_test_items').delete().eq('id', id);
    if (error) {
      setMsg(error.message);
      return;
    }
    await load();
  }

  async function moveTestItem(itemId, dir) {
    setMsg('');
    const idx = testItems.findIndex((x) => x.id === itemId);
    if (idx === -1) return;

    const otherIdx = idx + dir;
    if (otherIdx < 0 || otherIdx >= testItems.length) return;

    const a = testItems[idx];
    const b = testItems[otherIdx];

    const { error: errA } = await supabase
      .from('island_test_items')
      .update({ order_index: b.order_index })
      .eq('id', a.id);
    if (errA) { setMsg(errA.message); return; }

    const { error: errB } = await supabase
      .from('island_test_items')
      .update({ order_index: a.order_index })
      .eq('id', b.id);
    if (errB) { setMsg(errB.message); return; }

    await load();
  }

  async function updateTestPoints(itemId, newPoints) {
    setMsg('');
    const pts = Number(newPoints);
    if (!Number.isFinite(pts) || pts < 0) return;
    const { error } = await supabase
      .from('island_test_items')
      .update({ test_points: pts })
      .eq('id', itemId);
    if (error) setMsg(error.message);
    else await load();
  }

  // ── ATTACH EXISTING ────────────────────────────────────────
  async function attachExistingExercise() {
    setMsg('');
    if (!attachForm.exercise_id) {
      setMsg('Wybierz zadanie.');
      return;
    }

    const order_index = (testItems?.length || 0) + 1;

    const { error } = await supabase.from('island_test_items').insert({
      island_id,
      exercise_id: attachForm.exercise_id,
      test_points: Number(attachForm.test_points) || 1,
      order_index,
    });

    if (error) {
      setMsg(error.message);
      return;
    }
    setAttachForm({ exercise_id: '', test_points: 1 });
    await load();
  }

  // ── CREATE & ATTACH ────────────────────────────────────────
  function buildAnswerKeyForCreate() {
    if (create.answer_type === 'abcd') {
      const options = {
        A: String(create.optionsA || '').trim(),
        B: String(create.optionsB || '').trim(),
        C: String(create.optionsC || '').trim(),
        D: String(create.optionsD || '').trim(),
      };
      for (const k of ['A', 'B', 'C', 'D']) {
        if (!options[k]) return { error: `Uzupełnij treść odpowiedzi ${k}.` };
      }
      const correct = normalizeChoice(create.correct_choice || 'A');
      if (!['A', 'B', 'C', 'D'].includes(correct)) return { error: 'Poprawna odpowiedź musi być A/B/C/D.' };
      return { value: { options, correct } };
    }

    const v = parseNumericValue(create.correct_numeric);
    if (v === null) return { error: 'Uzupełnij poprawną odpowiedź.' };
    return { value: { value: v } };
  }

  async function createExerciseAndAttach() {
    setMsg('');
    if (!section?.course_id) {
      setMsg('Brak course_id.');
      return;
    }
    if (!create.prompt.trim()) {
      setMsg('Prompt jest wymagany.');
      return;
    }

    const answerKey = buildAnswerKeyForCreate();
    if (answerKey.error) {
      setMsg(answerKey.error);
      return;
    }

    const hints = hintsFromTextarea(create.hints_text);

    const { data: inserted, error: insErr } = await supabase
      .from('exercises')
      .insert({
        course_id: String(section.course_id),
        section_id: section.id,
        topic_section_id: create.topic_section_id ? String(create.topic_section_id) : null,
        title: create.title || null,
        prompt: create.prompt,
        description: create.description || null,
        image_url: create.image_url || null,
        answer_type: create.answer_type,
        points_max: Number(create.points_max),
        difficulty: Number(create.difficulty),
        requires_ai: Boolean(create.requires_ai),
        requires_photo: Boolean(create.requires_photo),
        status: create.status,
        solution_video_url: create.solution_video_url || null,
        hints,
        use_in_course: Boolean(create.use_in_course),
        use_in_repertory: Boolean(create.use_in_repertory),
        use_in_generator: Boolean(create.use_in_generator),
        use_in_minigame: Boolean(create.use_in_minigame),
      })
      .select('id')
      .single();

    if (insErr) {
      setMsg(insErr.message);
      return;
    }

    const { error: keyErr } = await supabase.from('exercise_answer_keys').insert({
      exercise_id: inserted.id,
      answer_key: answerKey.value,
    });

    if (keyErr) {
      setMsg(`Zadanie utworzone, ale błąd klucza odpowiedzi: ${keyErr.message}`);
      await load();
      return;
    }

    const order_index = (testItems?.length || 0) + 1;

    const { error: itemErr } = await supabase.from('island_test_items').insert({
      island_id,
      exercise_id: inserted.id,
      test_points: Number(create.test_points) || 1,
      order_index,
    });

    if (itemErr) {
      setMsg(`Zadanie utworzone, ale błąd dodawania do testu: ${itemErr.message}`);
      await load();
      return;
    }

    setCreate((p) => ({
      ...p,
      title: '',
      prompt: '',
      description: '',
      image_url: '',
      answer_type: 'abcd',
      optionsA: '',
      optionsB: '',
      optionsC: '',
      optionsD: '',
      correct_choice: 'A',
      correct_numeric: '',
      points_max: 1,
      difficulty: 1,
      requires_ai: false,
      requires_photo: false,
      status: 'draft',
      solution_video_url: '',
      hints_text: '',
      test_points: 1,
    }));

    await load();
  }

  return (
    <AdminGate>
      <div className="min-h-screen bg-white">
        <div className="mx-auto max-w-6xl p-6">
          {/* Header */}
          <div className="flex items-center justify-between gap-3">
            <div>
              <Link
                href={island?.section_id ? `/admin/sections/${island.section_id}/islands` : '/admin/sections'}
                className="text-sm font-semibold text-gray-700 underline"
              >
                ← Wyspy
              </Link>
              {island && island.type !== 'test' ? (
                <Link
                  href={`/admin/islands/${island_id}`}
                  className="ml-4 text-sm font-semibold text-indigo-700 underline"
                >
                  ← Edytor standardowy
                </Link>
              ) : null}
              <h1 className="mt-2 text-2xl font-bold text-gray-900">
                🧪 Edytor testu: {island?.title || '…'}
              </h1>
              {section ? (
                <p className="mt-1 text-sm text-gray-600">
                  Sekcja: <b>{section.title}</b> • course_id: <code>{section.course_id}</code>
                </p>
              ) : null}
            </div>
          </div>

          {msg ? (
            <div className={`mt-4 rounded-xl border p-3 text-sm ${msg.startsWith('✅') ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
              {msg}
            </div>
          ) : null}

          {loading ? (
            <div className="mt-6 text-sm text-gray-700">Ładowanie…</div>
          ) : (
            <div className="mt-6 space-y-8">

              {/* ── SECTION 1: Settings ─────────────────────────────────── */}
              <div className="rounded-2xl border border-gray-200 p-5">
                <div className="text-lg font-semibold text-gray-900">1. Ustawienia wyspy testowej</div>

                <label className="mt-4 block">
                  <div className="text-xs font-semibold text-gray-600">Tytuł testu</div>
                  <input
                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                    value={settings.title}
                    onChange={(e) => setSettings((p) => ({ ...p, title: e.target.value }))}
                    placeholder="np. Test końcowy — Równania"
                  />
                </label>

                <label className="mt-4 block">
                  <div className="text-xs font-semibold text-gray-600">Skrypt intro (tekst wyświetlany przed testem)</div>
                  <textarea
                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                    rows={6}
                    value={settings.intro_script}
                    onChange={(e) => setSettings((p) => ({ ...p, intro_script: e.target.value }))}
                    placeholder="Napisz instrukcje, zasady, przypomnienie wzorów…"
                  />
                </label>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <div className="text-xs font-semibold text-gray-600">Czas na test (sekundy)</div>
                    <input
                      type="number"
                      className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                      value={settings.time_limit_seconds}
                      min={60}
                      onChange={(e) => setSettings((p) => ({ ...p, time_limit_seconds: e.target.value }))}
                    />
                    <div className="mt-1 text-xs text-gray-500">np. 1800 = 30 minut, 3600 = 60 minut</div>
                  </label>

                  <label className="block">
                    <div className="text-xs font-semibold text-gray-600">Próg zaliczenia (%)</div>
                    <input
                      type="number"
                      className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                      value={settings.passing_score_percent}
                      min={0}
                      max={100}
                      onChange={(e) => setSettings((p) => ({ ...p, passing_score_percent: e.target.value }))}
                    />
                    <div className="mt-1 text-xs text-gray-500">0–100, domyślnie 50</div>
                  </label>
                </div>

                <button
                  type="button"
                  onClick={saveSettings}
                  className="mt-4 rounded-xl border border-gray-900 bg-gray-900 px-5 py-2 text-sm font-semibold text-white"
                >
                  Zapisz ustawienia
                </button>
              </div>

              {/* ── SECTION 2: Test items list ──────────────────────────── */}
              <div className="rounded-2xl border border-gray-200 p-5">
                <div className="text-lg font-semibold text-gray-900">2. Zadania testu ({testItems.length})</div>

                {testItems.length === 0 ? (
                  <div className="mt-4 text-sm text-gray-600">Brak zadań — dodaj poniżej.</div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {testItems.map((item, idx) => {
                      const ex = item.exercises;
                      const diff = ex?.difficulty || 1;
                      const canUp = idx > 0;
                      const canDown = idx < testItems.length - 1;

                      return (
                        <div key={item.id} className="rounded-xl border border-gray-200 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-gray-700">#{item.order_index}</span>
                              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${DIFFICULTY_COLORS[diff] || ''}`}>
                                {DIFFICULTY_LABELS[diff] || `D${diff}`}
                              </span>
                              <span className="text-xs text-gray-500">{ex?.answer_type || '—'}</span>
                            </div>

                            <div className="flex items-center gap-2">
                              <label className="flex items-center gap-1 text-xs text-gray-600">
                                pkt:
                                <input
                                  type="number"
                                  className="w-14 rounded-lg border border-gray-300 px-2 py-1 text-sm"
                                  defaultValue={item.test_points}
                                  min={0}
                                  onBlur={(e) => updateTestPoints(item.id, e.target.value)}
                                />
                              </label>
                              <button
                                type="button"
                                disabled={!canUp}
                                onClick={() => moveTestItem(item.id, -1)}
                                className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm disabled:opacity-40"
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                disabled={!canDown}
                                onClick={() => moveTestItem(item.id, +1)}
                                className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm disabled:opacity-40"
                              >
                                ↓
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteTestItem(item.id)}
                                className="rounded-lg border border-red-600 bg-red-600 px-2 py-1 text-xs font-semibold text-white"
                              >
                                Usuń
                              </button>
                            </div>
                          </div>

                          <div className="mt-2 text-sm text-gray-800 whitespace-pre-wrap">
                            {short(ex?.prompt, 120)}
                          </div>
                          <div className="mt-1 text-xs text-gray-500">
                            exercise_id: <code>{item.exercise_id}</code>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ── SECTION 3: Attach existing ──────────────────────────── */}
              <div className="rounded-2xl border border-gray-200 p-5">
                <div className="text-lg font-semibold text-gray-900">3. Dodaj istniejące zadanie z bazy</div>

                <label className="mt-4 block">
                  <div className="text-xs font-semibold text-gray-600">Szukaj zadania</div>
                  <input
                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Wyszukaj po tytule, treści, typie…"
                    value={exerciseSearch}
                    onChange={(e) => setExerciseSearch(e.target.value)}
                  />
                </label>

                <label className="mt-3 block">
                  <div className="text-xs font-semibold text-gray-600">Wybierz zadanie ({filteredExercises.length} wyników)</div>
                  <select
                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                    value={attachForm.exercise_id}
                    onChange={(e) => {
                      const exId = e.target.value;
                      const ex = exercises.find((x) => x.id === exId);
                      const diff = ex?.difficulty || 1;
                      setAttachForm({ exercise_id: exId, test_points: DEFAULT_TEST_POINTS_BY_DIFF[diff] || 1 });
                    }}
                  >
                    <option value="">— wybierz —</option>
                    {filteredExercises.map((e) => (
                      <option key={e.id} value={e.id}>
                        [D{e.difficulty || '?'} | {e.answer_type}] {e.title || short(e.prompt, 60)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="mt-3 block">
                  <div className="text-xs font-semibold text-gray-600">Punkty za zadanie w teście</div>
                  <input
                    type="number"
                    className="mt-1 w-32 rounded-xl border border-gray-300 px-3 py-2 text-sm"
                    value={attachForm.test_points}
                    min={0}
                    onChange={(e) => setAttachForm((p) => ({ ...p, test_points: e.target.value }))}
                  />
                </label>

                <button
                  type="button"
                  onClick={attachExistingExercise}
                  className="mt-4 rounded-xl border border-gray-900 bg-gray-900 px-5 py-2 text-sm font-semibold text-white"
                >
                  Dodaj do testu
                </button>
              </div>

              {/* ── SECTION 4: Create new ───────────────────────────────── */}
              <div className="rounded-2xl border border-gray-200 p-5">
                <div className="text-lg font-semibold text-gray-900">4. Utwórz nowe zadanie i dodaj do testu</div>

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div className="space-y-3">
                    <label className="block">
                      <div className="text-xs font-semibold text-gray-600">Tytuł (opcjonalny)</div>
                      <input
                        className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                        value={create.title}
                        onChange={(e) => setCreate((p) => ({ ...p, title: e.target.value }))}
                        placeholder="Krótki tytuł"
                      />
                    </label>

                    <label className="block">
                      <div className="text-xs font-semibold text-gray-600">Typ odpowiedzi</div>
                      <select
                        className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                        value={create.answer_type}
                        onChange={(e) => setCreate((p) => ({ ...p, answer_type: e.target.value }))}
                      >
                        <option value="abcd">ABCD (wielokrotny wybór)</option>
                        <option value="numeric">Numeryczny</option>
                      </select>
                    </label>

                    <div className="grid grid-cols-3 gap-3">
                      <label className="block">
                        <div className="text-xs font-semibold text-gray-600">Punkty (kurs)</div>
                        <input
                          type="number"
                          className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                          value={create.points_max}
                          min={0}
                          onChange={(e) => setCreate((p) => ({ ...p, points_max: e.target.value }))}
                        />
                      </label>
                      <label className="block">
                        <div className="text-xs font-semibold text-gray-600">Punkty (test)</div>
                        <input
                          type="number"
                          className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                          value={create.test_points}
                          min={0}
                          onChange={(e) => setCreate((p) => ({ ...p, test_points: e.target.value }))}
                        />
                      </label>
                      <label className="block">
                        <div className="text-xs font-semibold text-gray-600">Trudność</div>
                        <select
                          className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                          value={create.difficulty}
                          onChange={(e) => {
                            const d = Number(e.target.value);
                            setCreate((p) => ({
                              ...p,
                              difficulty: d,
                              test_points: DEFAULT_TEST_POINTS_BY_DIFF[d] ?? p.test_points,
                            }));
                          }}
                        >
                          <option value={1}>1 — Łatwe</option>
                          <option value={2}>2 — Podstawowe</option>
                          <option value={3}>3 — Średnie</option>
                          <option value={4}>4 — Trudne</option>
                          <option value={5}>5 — Bardzo trudne</option>
                        </select>
                      </label>
                    </div>

                    <label className="block">
                      <div className="text-xs font-semibold text-gray-600">Status</div>
                      <select
                        className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                        value={create.status}
                        onChange={(e) => setCreate((p) => ({ ...p, status: e.target.value }))}
                      >
                        <option value="draft">draft</option>
                        <option value="active">active</option>
                        <option value="archived">archived</option>
                      </select>
                    </label>

                    <label className="block">
                      <div className="text-xs font-semibold text-gray-600">Treść zadania (prompt) *</div>
                      <textarea
                        className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                        rows={4}
                        value={create.prompt}
                        onChange={(e) => setCreate((p) => ({ ...p, prompt: e.target.value }))}
                        placeholder="Treść zadania…"
                      />
                    </label>

                    <label className="block">
                      <div className="text-xs font-semibold text-gray-600">Opis (opcjonalny)</div>
                      <textarea
                        className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                        rows={2}
                        value={create.description}
                        onChange={(e) => setCreate((p) => ({ ...p, description: e.target.value }))}
                      />
                    </label>

                    <label className="block">
                      <div className="text-xs font-semibold text-gray-600">URL obrazka</div>
                      <input
                        className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                        value={create.image_url}
                        onChange={(e) => setCreate((p) => ({ ...p, image_url: e.target.value }))}
                        placeholder="https://…"
                      />
                    </label>

                    <label className="block">
                      <div className="text-xs font-semibold text-gray-600">Podpowiedzi (każda linia = jedna)</div>
                      <textarea
                        className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                        rows={3}
                        value={create.hints_text}
                        onChange={(e) => setCreate((p) => ({ ...p, hints_text: e.target.value }))}
                        placeholder="Podpowiedź 1&#10;Podpowiedź 2"
                      />
                    </label>
                  </div>

                  <div className="space-y-3">
                    {create.answer_type === 'abcd' ? (
                      <>
                        {['A', 'B', 'C', 'D'].map((opt) => (
                          <label key={opt} className="block">
                            <div className="text-xs font-semibold text-gray-600">Odpowiedź {opt}</div>
                            <input
                              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                              value={create[`options${opt}`]}
                              onChange={(e) => setCreate((p) => ({ ...p, [`options${opt}`]: e.target.value }))}
                              placeholder={`Treść opcji ${opt}`}
                            />
                          </label>
                        ))}
                        <label className="block">
                          <div className="text-xs font-semibold text-gray-600">Poprawna odpowiedź</div>
                          <select
                            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                            value={create.correct_choice}
                            onChange={(e) => setCreate((p) => ({ ...p, correct_choice: e.target.value }))}
                          >
                            {['A', 'B', 'C', 'D'].map((o) => (
                              <option key={o} value={o}>{o}</option>
                            ))}
                          </select>
                        </label>
                      </>
                    ) : (
                      <label className="block">
                        <div className="text-xs font-semibold text-gray-600">Poprawna odpowiedź (liczba)</div>
                        <input
                          className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                          value={create.correct_numeric}
                          onChange={(e) => setCreate((p) => ({ ...p, correct_numeric: e.target.value }))}
                          placeholder="np. 3.14"
                        />
                      </label>
                    )}

                    <div className="rounded-xl border border-gray-100 p-3">
                      <div className="text-xs font-semibold text-gray-600">Flagi użycia</div>
                      <div className="mt-2 space-y-2">
                        {[
                          ['use_in_course', 'Kurs'],
                          ['use_in_repertory', 'Repetytoria'],
                          ['use_in_generator', 'Generator'],
                          ['use_in_minigame', 'Minigra'],
                        ].map(([key, label]) => (
                          <label key={key} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={Boolean(create[key])}
                              onChange={(e) => setCreate((p) => ({ ...p, [key]: e.target.checked }))}
                            />
                            <span className="text-sm text-gray-700">{label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={createExerciseAndAttach}
                  className="mt-6 rounded-xl border border-indigo-700 bg-indigo-700 px-5 py-2 text-sm font-semibold text-white"
                >
                  Utwórz zadanie i dodaj do testu
                </button>
              </div>

            </div>
          )}
        </div>
      </div>
    </AdminGate>
  );
}
