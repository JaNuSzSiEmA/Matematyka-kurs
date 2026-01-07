import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import AdminGate from '../../../components/admin/AdminGate';
import { supabase } from '../../../lib/admin';

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

export default function AdminIslandEditor() {
  const router = useRouter();
  const { island_id } = router.query;

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  const [island, setIsland] = useState(null);
  const [section, setSection] = useState(null);

  const [items, setItems] = useState([]);

  const [exercises, setExercises] = useState([]);
  const [exerciseSearch, setExerciseSearch] = useState('');

  const [newItem, setNewItem] = useState({
    item_type: 'video',
    title: '',
    youtube_url: '',
    exercise_id: '',
  });

  // Create & attach exercise form
  const [create, setCreate] = useState({
    title: '', // NEW: exercise title
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
  });

  async function load() {
    if (!island_id) return;
    setLoading(true);
    setMsg('');

    const { data: isl, error: islErr } = await supabase
      .from('islands')
      .select('id, section_id, title, type, order_index, max_points, is_active')
      .eq('id', island_id)
      .single();

    if (islErr) {
      setMsg(islErr.message);
      setLoading(false);
      return;
    }
    setIsland(isl);

    const { data: sec, error: secErr } = await supabase
      .from('sections')
      .select('id, course_id, title, slug')
      .eq('id', isl.section_id)
      .single();

    if (secErr) {
      setMsg(`Load section failed: ${secErr.message}`);
      setLoading(false);
      return;
    }
    setSection(sec);

    setCreate((p) => ({
      ...p,
      topic_section_id: p.topic_section_id || isl.section_id,
    }));

    // Load items + join exercise details incl. title
    const { data: it, error: itErr } = await supabase
      .from('island_items')
      .select(
        `
        id,
        island_id,
        item_type,
        order_index,
        title,
        youtube_url,
        exercise_id,
        created_at,
        exercises:exercise_id (
          id,
          title,
          prompt,
          answer_type,
          points_max,
          status
        )
      `
      )
      .eq('island_id', island_id)
      .order('order_index', { ascending: true });

    if (itErr) {
      setMsg(itErr.message);
      setItems([]);
      setLoading(false);
      return;
    }
    setItems(it || []);

    // Load exercises for attach dropdown (include title)
    const { data: ex, error: exErr } = await supabase
      .from('exercises')
      .select(
        'id, title, prompt, answer_type, points_max, course_id, difficulty, status, use_in_course, use_in_repertory, use_in_generator, use_in_minigame, topic_section_id'
      )
      .order('created_at', { ascending: false })
      .limit(500);

    if (exErr) {
      setMsg(`Load exercises failed: ${exErr.message}`);
      setExercises([]);
      setLoading(false);
      return;
    }

    setExercises(ex || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [island_id]);

  const filteredExercises = useMemo(() => {
    const term = exerciseSearch.trim().toLowerCase();
    if (!term) return exercises;

    return exercises.filter((e) => {
      const hay = `${e.title || ''} ${e.prompt || ''} ${e.course_id || ''} ${e.answer_type || ''} ${e.id}`.toLowerCase();
      return hay.includes(term);
    });
  }, [exercises, exerciseSearch]);

  async function addVideoItem() {
    setMsg('');
    const order_index = (items?.length || 0) + 1;

    const { error } = await supabase.from('island_items').insert({
      island_id,
      item_type: 'video',
      order_index,
      title: newItem.title || null,
      youtube_url: newItem.youtube_url || null,
      exercise_id: null,
    });

    if (error) {
      setMsg(error.message);
      return;
    }

    setNewItem({ item_type: 'video', title: '', youtube_url: '', exercise_id: '' });
    await load();
  }

  async function addExistingExerciseItem() {
    setMsg('');
    const order_index = (items?.length || 0) + 1;

    if (!newItem.exercise_id) {
      setMsg('Wybierz exercise.');
      return;
    }

    const { error } = await supabase.from('island_items').insert({
      island_id,
      item_type: 'exercise',
      order_index,
      title: newItem.title || null, // this is ISLAND ITEM title override
      youtube_url: null,
      exercise_id: newItem.exercise_id,
    });

    if (error) {
      setMsg(error.message);
      return;
    }

    setNewItem({ item_type: 'video', title: '', youtube_url: '', exercise_id: '' });
    await load();
  }

  async function deleteItem(id) {
    setMsg('');
    const ok = window.confirm('Usunąć element?');
    if (!ok) return;

    const { error } = await supabase.from('island_items').delete().eq('id', id);
    if (error) {
      setMsg(error.message);
      return;
    }
    await load();
  }

  async function moveItem(itemId, dir) {
    setMsg('');
    const idx = items.findIndex((x) => x.id === itemId);
    if (idx === -1) return;

    const otherIdx = idx + dir;
    if (otherIdx < 0 || otherIdx >= items.length) return;

    const a = items[idx];
    const b = items[otherIdx];

    const { error: errA } = await supabase.from('island_items').update({ order_index: b.order_index }).eq('id', a.id);
    if (errA) {
      setMsg(errA.message);
      return;
    }

    const { error: errB } = await supabase.from('island_items').update({ order_index: a.order_index }).eq('id', b.id);
    if (errB) {
      setMsg(errB.message);
      return;
    }

    await load();
  }

  async function updateIslandItemTitle(itemId, title) {
    setMsg('');
    const { error } = await supabase
      .from('island_items')
      .update({ title: title ? String(title) : null })
      .eq('id', itemId);

    if (error) {
      setMsg(error.message);
      return;
    }
    await load();
  }

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
      setMsg('Brak course_id (nie udało się wczytać sekcji).');
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

        title: create.title || null, // NEW
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
      setMsg(`Exercise created, but answer key insert failed: ${keyErr.message}`);
      await load();
      return;
    }

    const order_index = (items?.length || 0) + 1;

    // NEW: when attaching to island, we set island_item.title default:
    // - if user provided exercise title: use that
    // - else: null (so UI can fallback)
    const islandItemTitle = create.title ? String(create.title) : null;

    const { error: itemErr } = await supabase.from('island_items').insert({
      island_id,
      item_type: 'exercise',
      order_index,
      title: islandItemTitle,
      youtube_url: null,
      exercise_id: inserted.id,
    });

    if (itemErr) {
      setMsg(`Exercise created, but island item insert failed: ${itemErr.message}`);
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
      topic_section_id: section.id,
    }));

    await load();
  }

  return (
    <AdminGate>
      <div className="min-h-screen bg-white">
        <div className="mx-auto max-w-6xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <Link
                href={island?.section_id ? `/admin/sections/${island.section_id}/islands` : '/admin/sections'}
                className="text-sm font-semibold text-gray-700 underline"
              >
                ← Wyspy
              </Link>
              <h1 className="mt-2 text-2xl font-bold text-gray-900">Zawartość wyspy</h1>
              <p className="mt-1 text-sm text-gray-600">
                {section ? (
                  <>
                    Sekcja: <b>{section.title}</b> (<code>{section.slug}</code>) • course_id: <code>{section.course_id}</code>
                  </>
                ) : (
                  '—'
                )}
              </p>
            </div>
          </div>

          {msg ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{msg}</div>
          ) : null}

          {loading ? (
            <div className="mt-6 text-sm text-gray-700">Ładowanie…</div>
          ) : (
            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              {/* ITEMS LIST */}
              <div className="rounded-2xl border border-gray-200 p-4 lg:col-span-1">
                <div className="font-semibold text-gray-900">Elementy</div>

                {items.length === 0 ? (
                  <div className="mt-3 text-sm text-gray-600">Brak elementów.</div>
                ) : (
                  <div className="mt-3 space-y-3">
                    {items.map((it, idx) => {
                      const ex = it.exercises;
                      const canUp = idx > 0;
                      const canDown = idx < items.length - 1;

                      const displayTitle =
                        it.item_type === 'exercise'
                          ? it.title || ex?.title || 'Ćwiczenie'
                          : it.title || 'Wideo';

                      return (
                        <div key={it.id} className="rounded-xl border border-gray-200 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="text-sm text-gray-900">
                              <b>{it.order_index}.</b> <code>{it.item_type}</code> • <span className="font-semibold">{displayTitle}</span>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm font-semibold text-gray-800 disabled:opacity-50"
                                disabled={!canUp}
                                onClick={() => moveItem(it.id, -1)}
                                title="Przenieś wyżej"
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm font-semibold text-gray-800 disabled:opacity-50"
                                disabled={!canDown}
                                onClick={() => moveItem(it.id, +1)}
                                title="Przenieś niżej"
                              >
                                ↓
                              </button>

                              {it.item_type === 'exercise' && it.exercise_id ? (
                                <Link
                                  href={`/admin/exercise-bank?exercise_id=${it.exercise_id}`}
                                  className="rounded-lg border border-indigo-700 bg-indigo-700 px-3 py-1 text-sm font-semibold text-white"
                                >
                                  Edytuj
                                </Link>
                              ) : null}

                              <button
                                type="button"
                                className="rounded-lg border border-red-700 bg-red-700 px-3 py-1 text-sm font-semibold text-white"
                                onClick={() => deleteItem(it.id)}
                              >
                                Usuń
                              </button>
                            </div>
                          </div>

                          {/* NEW: quick edit island display title (per-island label) */}
                          {it.item_type === 'exercise' ? (
                            <label className="mt-2 block">
                              <div className="text-xs font-semibold text-gray-600">Wyświetlana nazwa na wyspie (override)</div>
                              <input
                                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                                defaultValue={it.title || ''}
                                placeholder={ex?.title ? `Domyślnie: ${ex.title}` : 'Domyślnie: Ćwiczenie'}
                                onBlur={(e) => updateIslandItemTitle(it.id, e.target.value)}
                              />
                              <div className="mt-1 text-[11px] text-gray-500">
                                Zostaw puste → użyje <b>exercise.title</b> (jeśli jest) albo „Ćwiczenie”.
                              </div>
                            </label>
                          ) : null}

                          {it.item_type === 'video' ? (
                            <div className="mt-2 text-xs text-gray-700">
                              youtube_url: <code>{it.youtube_url || '—'}</code>
                            </div>
                          ) : (
                            <div className="mt-2 space-y-1 text-xs text-gray-700">
                              <div>
                                exercise_id: <code>{it.exercise_id || '—'}</code>
                              </div>
                              <div>
                                exercise.title: <span className="text-gray-900">{ex?.title || '—'}</span>
                              </div>
                              <div>
                                prompt: <span className="text-gray-900">{short(ex?.prompt, 110)}</span>
                              </div>
                              <div>
                                meta:{' '}
                                <span className="text-gray-900">
                                  {ex?.status || '—'} • {ex?.answer_type || '—'} • {ex?.points_max ?? '—'} pkt
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ADD VIDEO / ATTACH EXISTING */}
              <div className="rounded-2xl border border-gray-200 p-4 lg:col-span-1">
                <div className="font-semibold text-gray-900">Dodaj video / podepnij ćwiczenie</div>

                <label className="mt-3 block">
                  <div className="text-xs font-semibold text-gray-600">title (optional)</div>
                  <input
                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                    value={newItem.title}
                    onChange={(e) => setNewItem((p) => ({ ...p, title: e.target.value }))}
                    placeholder="Dla video lub jako override nazwy ćwiczenia na wyspie"
                  />
                </label>

                <div className="mt-4 rounded-xl border border-gray-100 p-3">
                  <div className="text-sm font-semibold text-gray-900">Video</div>
                  <label className="mt-2 block">
                    <div className="text-xs font-semibold text-gray-600">youtube_url</div>
                    <input
                      className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                      placeholder="https://www.youtube.com/watch?v=..."
                      value={newItem.youtube_url}
                      onChange={(e) => setNewItem((p) => ({ ...p, youtube_url: e.target.value }))}
                    />
                  </label>
                  <button
                    type="button"
                    className="mt-3 rounded-xl border border-gray-900 bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
                    onClick={addVideoItem}
                  >
                    Dodaj video
                  </button>
                </div>

                <div className="mt-4 rounded-xl border border-gray-100 p-3">
                  <div className="text-sm font-semibold text-gray-900">Podepnij istniejące ćwiczenie</div>

                  <input
                    className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Szukaj w title/prompt…"
                    value={exerciseSearch}
                    onChange={(e) => setExerciseSearch(e.target.value)}
                  />

                  <select
                    className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                    value={newItem.exercise_id}
                    onChange={(e) => setNewItem((p) => ({ ...p, exercise_id: e.target.value }))}
                  >
                    <option value="">— wybierz —</option>
                    {filteredExercises.map((e) => (
                      <option key={e.id} value={e.id}>
                        {(e.title ? `${e.title} • ` : '') +
                          `${e.status} • ${e.answer_type} • ${e.points_max}pkt • ${String(e.prompt || '').slice(0, 60)}`}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    className="mt-3 rounded-xl border border-indigo-700 bg-indigo-700 px-4 py-2 text-sm font-semibold text-white"
                    onClick={addExistingExerciseItem}
                  >
                    Podepnij ćwiczenie
                  </button>
                </div>
              </div>

              {/* CREATE & ATTACH */}
              <div className="rounded-2xl border border-gray-200 p-4 lg:col-span-1">
                <div className="font-semibold text-gray-900">Utwórz ćwiczenie + podepnij</div>

                {/* NEW: title */}
                <label className="mt-3 block">
                  <div className="text-xs font-semibold text-gray-600">exercise title (optional)</div>
                  <input
                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                    value={create.title}
                    onChange={(e) => setCreate((p) => ({ ...p, title: e.target.value }))}
                    placeholder="np. Funkcje kwadratowe — zadanie 1"
                  />
                </label>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label>
                    <div className="text-xs font-semibold text-gray-600">answer_type</div>
                    <select
                      className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                      value={create.answer_type}
                      onChange={(e) => setCreate((p) => ({ ...p, answer_type: e.target.value }))}
                    >
                      <option value="abcd">abcd</option>
                      <option value="numeric">numeric</option>
                    </select>
                  </label>

                  <label>
                    <div className="text-xs font-semibold text-gray-600">status</div>
                    <select
                      className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                      value={create.status}
                      onChange={(e) => setCreate((p) => ({ ...p, status: e.target.value }))}
                    >
                      <option value="draft">draft</option>
                      <option value="published">published</option>
                      <option value="archived">archived</option>
                    </select>
                  </label>

                  <label>
                    <div className="text-xs font-semibold text-gray-600">points_max</div>
                    <input
                      type="number"
                      className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                      value={create.points_max}
                      onChange={(e) => setCreate((p) => ({ ...p, points_max: e.target.value }))}
                    />
                  </label>

                  <label>
                    <div className="text-xs font-semibold text-gray-600">difficulty</div>
                    <input
                      type="number"
                      className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                      value={create.difficulty}
                      onChange={(e) => setCreate((p) => ({ ...p, difficulty: e.target.value }))}
                    />
                  </label>
                </div>

                <label className="mt-3 block">
                  <div className="text-xs font-semibold text-gray-600">Prompt</div>
                  <textarea
                    className="mt-1 min-h-[110px] w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                    value={create.prompt}
                    onChange={(e) => setCreate((p) => ({ ...p, prompt: e.target.value }))}
                  />
                </label>

                <label className="mt-3 block">
                  <div className="text-xs font-semibold text-gray-600">description (optional)</div>
                  <textarea
                    className="mt-1 min-h-[80px] w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                    value={create.description}
                    onChange={(e) => setCreate((p) => ({ ...p, description: e.target.value }))}
                  />
                </label>

                <label className="mt-3 block">
                  <div className="text-xs font-semibold text-gray-600">image_url (optional)</div>
                  <input
                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                    value={create.image_url}
                    onChange={(e) => setCreate((p) => ({ ...p, image_url: e.target.value }))}
                  />
                </label>

                <label className="mt-3 block">
                  <div className="text-xs font-semibold text-gray-600">solution_video_url (optional)</div>
                  <input
                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                    value={create.solution_video_url}
                    onChange={(e) => setCreate((p) => ({ ...p, solution_video_url: e.target.value }))}
                  />
                </label>

                <label className="mt-3 block">
                  <div className="text-xs font-semibold text-gray-600">hints (one per line)</div>
                  <textarea
                    className="mt-1 min-h-[90px] w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                    value={create.hints_text}
                    onChange={(e) => setCreate((p) => ({ ...p, hints_text: e.target.value }))}
                  />
                </label>

                <div className="mt-3 rounded-xl border border-gray-100 p-3">
                  <div className="text-sm font-semibold text-gray-900">Odpowiedzi</div>

                  {create.answer_type === 'abcd' ? (
                    <div className="mt-2 grid gap-2">
                      {['A', 'B', 'C', 'D'].map((opt) => (
                        <div key={opt} className="grid grid-cols-[40px_1fr_110px] items-center gap-2">
                          <div className="text-sm font-semibold text-gray-800">{opt}</div>
                          <input
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                            placeholder={`Treść odpowiedzi ${opt}`}
                            value={
                              opt === 'A'
                                ? create.optionsA
                                : opt === 'B'
                                  ? create.optionsB
                                  : opt === 'C'
                                    ? create.optionsC
                                    : create.optionsD
                            }
                            onChange={(e) => {
                              const v = e.target.value;
                              setCreate((p) => ({
                                ...p,
                                ...(opt === 'A'
                                  ? { optionsA: v }
                                  : opt === 'B'
                                    ? { optionsB: v }
                                    : opt === 'C'
                                      ? { optionsC: v }
                                      : { optionsD: v }),
                              }));
                            }}
                          />
                          <button
                            type="button"
                            className={[
                              'rounded-xl border px-3 py-2 text-sm font-semibold',
                              create.correct_choice === opt
                                ? 'border-gray-900 bg-gray-900 text-white'
                                : 'border-gray-300 bg-white text-gray-900',
                            ].join(' ')}
                            onClick={() => setCreate((p) => ({ ...p, correct_choice: opt }))}
                          >
                            Poprawna
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <input
                      className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                      placeholder="Poprawna odpowiedź (np. 12)"
                      value={create.correct_numeric}
                      onChange={(e) => setCreate((p) => ({ ...p, correct_numeric: e.target.value }))}
                    />
                  )}
                </div>

                <div className="mt-3 grid gap-2">
                  <div className="text-xs font-semibold text-gray-600">Flags</div>
                  {['use_in_course', 'use_in_repertory', 'use_in_generator', 'use_in_minigame'].map((k) => (
                    <label key={k} className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={Boolean(create[k])}
                        onChange={(e) => setCreate((p) => ({ ...p, [k]: e.target.checked }))}
                      />
                      {k}
                    </label>
                  ))}
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={Boolean(create.requires_ai)}
                      onChange={(e) => setCreate((p) => ({ ...p, requires_ai: e.target.checked }))}
                    />
                    requires_ai
                  </label>

                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={Boolean(create.requires_photo)}
                      onChange={(e) => setCreate((p) => ({ ...p, requires_photo: e.target.checked }))}
                    />
                    requires_photo
                  </label>
                </div>

                <button
                  type="button"
                  className="mt-4 w-full rounded-xl border border-gray-900 bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
                  onClick={createExerciseAndAttach}
                >
                  Utwórz i podepnij do wyspy
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminGate>
  );
}