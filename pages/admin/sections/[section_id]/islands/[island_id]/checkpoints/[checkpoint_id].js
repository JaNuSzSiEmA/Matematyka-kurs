import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import AdminGate from '../../../../../../../components/admin/AdminGate';
import { supabase } from '../../../../../../../lib/admin';

function short(text, n = 90) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!s) return '—';
  return s.length > n ? s.slice(0, n) + '…' : s;
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

// ─── HintsEditor ─────────────────────────────────────────────────────────────
// Reużywalny komponent do dodawania/usuwania podpowiedzi
function HintsEditor({ hints, onChange }) {
  function addHint() {
    onChange([...hints, '']);
  }

  function updateHint(idx, value) {
    const next = hints.map((h, i) => (i === idx ? value : h));
    onChange(next);
  }

  function removeHint(idx) {
    onChange(hints.filter((_, i) => i !== idx));
  }

  return (
    <div>
      {hints.length === 0 ? (
        <div className="text-xs text-gray-400">Brak podpowiedzi.</div>
      ) : (
        <div className="space-y-2">
          {hints.map((h, idx) => (
            <div key={idx} className="flex items-start gap-2">
              <span className="mt-2 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700">
                {idx + 1}
              </span>
              <input
                className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm"
                placeholder={`Podpowiedź ${idx + 1}`}
                value={h}
                onChange={(e) => updateHint(idx, e.target.value)}
              />
              <button
                type="button"
                onClick={() => removeHint(idx)}
                className="mt-1 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={addHint}
        className="mt-2 flex items-center gap-1 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100"
      >
        <span className="text-base leading-none">+</span> Dodaj podpowiedź
      </button>
    </div>
  );
}

export default function AdminCheckpointItems() {
  const router = useRouter();
  const { section_id, island_id, checkpoint_id } = router.query;

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  const [checkpoint, setCheckpoint] = useState(null);
  const [items, setItems] = useState([]);
  const [sections, setSections] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [courseId, setCourseId] = useState('');
  const [topicSectionId, setTopicSectionId] = useState('');

  const [newItem, setNewItem] = useState({
    item_type: 'video',
    title: '',
    youtube_url: '',
    exercise_id: '',
  });

  // hints jako tablica stringów zamiast hints_text
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
    hints: [],           // ← tablica zamiast hints_text
    use_in_course: true,
    use_in_repertory: false,
    use_in_generator: false,
    use_in_minigame: false,
  });

  async function load() {
    if (!checkpoint_id) return;
    setLoading(true);
    setMsg('');

    const { data: cp, error: cpErr } = await supabase
      .from('island_checkpoints')
      .select('id, title, order_index, island_id')
      .eq('id', checkpoint_id)
      .single();

    if (cpErr) { setMsg(cpErr.message); setLoading(false); return; }
    setCheckpoint(cp);

    if (section_id) {
      const { data: secRow, error: secErr } = await supabase
        .from('sections')
        .select('id, course_id')
        .eq('id', section_id)
        .single();

      if (!secErr && secRow) {
        setCourseId(String(secRow.course_id || ''));
        if (!topicSectionId) setTopicSectionId(String(secRow.id || ''));
      }

      if (!secErr && secRow?.course_id) {
        const { data: secList, error: secListErr } = await supabase
          .from('sections')
          .select('id, title, order_index')
          .eq('course_id', secRow.course_id)
          .order('order_index', { ascending: true });

        if (!secListErr) setSections(secList || []);
        if (!topicSectionId && secList?.length) setTopicSectionId(String(secList[0].id));
      }
    }

    const { data: it, error: itErr } = await supabase
      .from('island_checkpoint_items')
      .select(`
        id, checkpoint_id, item_type, order_index, title, youtube_url, exercise_id,
        exercises:exercise_id ( id, title, prompt, answer_type, points_max, status )
      `)
      .eq('checkpoint_id', checkpoint_id)
      .order('order_index', { ascending: true });

    if (itErr) { setMsg(itErr.message); setItems([]); setLoading(false); return; }
    setItems(it || []);

    const { data: ex, error: exErr } = await supabase
      .from('exercises')
      .select('id, title, prompt, answer_type, points_max, status')
      .order('created_at', { ascending: false })
      .limit(500);

    if (exErr) { setMsg(`Load exercises failed: ${exErr.message}`); setExercises([]); setLoading(false); return; }
    setExercises(ex || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [checkpoint_id]);

  const filteredExercises = useMemo(() => {
    const term = exerciseSearch.trim().toLowerCase();
    if (!term) return exercises;
    return exercises.filter((e) => {
      const hay = `${e.title || ''} ${e.prompt || ''} ${e.answer_type || ''} ${e.id}`.toLowerCase();
      return hay.includes(term);
    });
  }, [exercises, exerciseSearch]);

  async function addVideoItem() {
    setMsg('');
    const { error } = await supabase.from('island_checkpoint_items').insert({
      checkpoint_id,
      item_type: 'video',
      order_index: (items?.length || 0) + 1,
      title: newItem.title || null,
      youtube_url: newItem.youtube_url || null,
      exercise_id: null,
    });
    if (error) { setMsg(error.message); return; }
    setNewItem({ item_type: 'video', title: '', youtube_url: '', exercise_id: '' });
    await load();
  }

  async function addExistingExerciseItem() {
    setMsg('');
    if (!newItem.exercise_id) { setMsg('Wybierz exercise.'); return; }
    const { error } = await supabase.from('island_checkpoint_items').insert({
      checkpoint_id,
      item_type: 'exercise',
      order_index: (items?.length || 0) + 1,
      title: newItem.title || null,
      youtube_url: null,
      exercise_id: newItem.exercise_id,
    });
    if (error) { setMsg(error.message); return; }
    setNewItem({ item_type: 'video', title: '', youtube_url: '', exercise_id: '' });
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
    if (!create.prompt.trim()) { setMsg('Prompt jest wymagany.'); return; }

    const answerKey = buildAnswerKeyForCreate();
    if (answerKey.error) { setMsg(answerKey.error); return; }

    // hints — filtrujemy puste
    const hints = create.hints.map((h) => h.trim()).filter(Boolean);

    const { data: inserted, error: insErr } = await supabase
      .from('exercises')
      .insert({
        course_id: courseId,
        topic_section_id: topicSectionId,
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
        hints: hints.length ? hints : null,
        use_in_course: Boolean(create.use_in_course),
        use_in_repertory: Boolean(create.use_in_repertory),
        use_in_generator: Boolean(create.use_in_generator),
        use_in_minigame: Boolean(create.use_in_minigame),
      })
      .select('id')
      .single();

    if (insErr) { setMsg(insErr.message); return; }

    const { error: keyErr } = await supabase.from('exercise_answer_keys').insert({
      exercise_id: inserted.id,
      answer_key: answerKey.value,
    });
    if (keyErr) { setMsg(`Exercise created, but answer key failed: ${keyErr.message}`); await load(); return; }

    const { error: itemErr } = await supabase.from('island_checkpoint_items').insert({
      checkpoint_id,
      item_type: 'exercise',
      order_index: (items?.length || 0) + 1,
      title: create.title || null,
      youtube_url: null,
      exercise_id: inserted.id,
    });
    if (itemErr) { setMsg(`Exercise created, but item insert failed: ${itemErr.message}`); await load(); return; }

    // reset — w tym hints: []
    setCreate({
      title: '', prompt: '', description: '', image_url: '',
      answer_type: 'abcd', optionsA: '', optionsB: '', optionsC: '', optionsD: '',
      correct_choice: 'A', correct_numeric: '', points_max: 1, difficulty: 1,
      requires_ai: false, requires_photo: false, status: 'draft',
      solution_video_url: '', hints: [],
      use_in_course: true, use_in_repertory: false, use_in_generator: false, use_in_minigame: false,
    });
    await load();
  }

  async function deleteItem(id) {
    setMsg('');
    if (!window.confirm('Usunąć element?')) return;
    const { error } = await supabase.from('island_checkpoint_items').delete().eq('id', id);
    if (error) { setMsg(error.message); return; }
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
    const { error: errA } = await supabase.from('island_checkpoint_items').update({ order_index: b.order_index }).eq('id', a.id);
    if (errA) { setMsg(errA.message); return; }
    const { error: errB } = await supabase.from('island_checkpoint_items').update({ order_index: a.order_index }).eq('id', b.id);
    if (errB) { setMsg(errB.message); return; }
    await load();
  }

  async function updateItemTitle(itemId, title) {
    setMsg('');
    const { error } = await supabase
      .from('island_checkpoint_items')
      .update({ title: title ? String(title) : null })
      .eq('id', itemId);
    if (error) { setMsg(error.message); return; }
    await load();
  }

  return (
    <AdminGate>
      <div className="min-h-screen bg-white">
        <div className="mx-auto max-w-6xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <Link
                href={`/admin/sections/${section_id}/islands/${island_id}/checkpoints`}
                className="text-sm font-semibold text-gray-700 underline"
              >
                ← Checkpointy
              </Link>
              <h1 className="mt-2 text-2xl font-bold text-gray-900">Zawartość checkpointu</h1>
              <p className="mt-1 text-sm text-gray-600">
                {checkpoint ? <>Checkpoint: <b>{checkpoint.title}</b></> : '—'}
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

              {/* ── ITEMS LIST ── */}
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
                      const displayTitle = it.item_type === 'exercise'
                        ? it.title || ex?.title || 'Ćwiczenie'
                        : it.title || 'Wideo';

                      return (
                        <div key={it.id} className="rounded-xl border border-gray-200 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="text-sm text-gray-900">
                              <b>{it.order_index}.</b> <code>{it.item_type}</code> •{' '}
                              <span className="font-semibold">{displayTitle}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button type="button" disabled={!canUp} onClick={() => moveItem(it.id, -1)}
                                className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm font-semibold text-gray-800 disabled:opacity-50">↑</button>
                              <button type="button" disabled={!canDown} onClick={() => moveItem(it.id, +1)}
                                className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm font-semibold text-gray-800 disabled:opacity-50">↓</button>
                              {it.item_type === 'exercise' && it.exercise_id ? (
                                <Link href={`/admin/exercise-bank?exercise_id=${it.exercise_id}`}
                                  className="rounded-lg border border-indigo-700 bg-indigo-700 px-3 py-1 text-sm font-semibold text-white">Edytuj</Link>
                              ) : null}
                              <button type="button" onClick={() => deleteItem(it.id)}
                                className="rounded-lg border border-red-700 bg-red-700 px-3 py-1 text-sm font-semibold text-white">Usuń</button>
                            </div>
                          </div>

                          {it.item_type === 'exercise' ? (
                            <label className="mt-2 block">
                              <div className="text-xs font-semibold text-gray-600">Wyświetlana nazwa (override)</div>
                              <input className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                                defaultValue={it.title || ''}
                                placeholder={ex?.title ? `Domyślnie: ${ex.title}` : 'Domyślnie: Ćwiczenie'}
                                onBlur={(e) => updateItemTitle(it.id, e.target.value)} />
                            </label>
                          ) : null}

                          {it.item_type === 'video' ? (
                            <div className="mt-2 text-xs text-gray-700">
                              youtube_url: <code>{it.youtube_url || '—'}</code>
                            </div>
                          ) : (
                            <div className="mt-2 space-y-1 text-xs text-gray-700">
                              <div>exercise_id: <code>{it.exercise_id || '—'}</code></div>
                              <div>exercise.title: <span className="text-gray-900">{ex?.title || '—'}</span></div>
                              <div>prompt: <span className="text-gray-900">{short(ex?.prompt, 110)}</span></div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ── ADD VIDEO / ATTACH EXISTING ── */}
              <div className="rounded-2xl border border-gray-200 p-4 lg:col-span-1">
                <div className="font-semibold text-gray-900">Dodaj video / podepnij ćwiczenie</div>

                <label className="mt-3 block">
                  <div className="text-xs font-semibold text-gray-600">title (optional)</div>
                  <input className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                    value={newItem.title}
                    onChange={(e) => setNewItem((p) => ({ ...p, title: e.target.value }))}
                    placeholder="Dla video lub override nazwy ćwiczenia" />
                </label>

                <label className="mt-3 block">
                  <div className="text-xs font-semibold text-gray-600">Sekcja (topic_section_id)</div>
                  <select className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                    value={topicSectionId} onChange={(e) => setTopicSectionId(e.target.value)}>
                    <option value="">(brak)</option>
                    {sections.map((s) => (
                      <option key={s.id} value={s.id}>{s.order_index}. {s.title}</option>
                    ))}
                  </select>
                </label>

                <div className="mt-4 rounded-xl border border-gray-100 p-3">
                  <div className="text-sm font-semibold text-gray-900">Video</div>
                  <label className="mt-2 block">
                    <div className="text-xs font-semibold text-gray-600">youtube_url</div>
                    <input className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                      placeholder="https://www.youtube.com/watch?v=..."
                      value={newItem.youtube_url}
                      onChange={(e) => setNewItem((p) => ({ ...p, youtube_url: e.target.value }))} />
                  </label>
                  <button type="button" onClick={addVideoItem}
                    className="mt-3 rounded-xl border border-gray-900 bg-gray-900 px-4 py-2 text-sm font-semibold text-white">
                    Dodaj video
                  </button>
                </div>

                <div className="mt-4 rounded-xl border border-gray-100 p-3">
                  <div className="text-sm font-semibold text-gray-900">Podepnij istniejące ćwiczenie</div>
                  <input className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Szukaj w title/prompt…"
                    value={exerciseSearch}
                    onChange={(e) => setExerciseSearch(e.target.value)} />
                  <select className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                    value={newItem.exercise_id}
                    onChange={(e) => setNewItem((p) => ({ ...p, exercise_id: e.target.value }))}>
                    <option value="">— wybierz —</option>
                    {filteredExercises.map((e) => (
                      <option key={e.id} value={e.id}>
                        {(e.title ? `${e.title} • ` : '') +
                          `${e.status} • ${e.answer_type} • ${e.points_max}pkt • ${String(e.prompt || '').slice(0, 60)}`}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={addExistingExerciseItem}
                    className="mt-3 rounded-xl border border-indigo-700 bg-indigo-700 px-4 py-2 text-sm font-semibold text-white">
                    Podepnij ćwiczenie
                  </button>
                </div>
              </div>

              {/* ── CREATE & ATTACH ── */}
              <div className="rounded-2xl border border-gray-200 p-4 lg:col-span-1">
                <div className="font-semibold text-gray-900">Utwórz ćwiczenie + podepnij</div>

                <label className="mt-3 block">
                  <div className="text-xs font-semibold text-gray-600">title (optional)</div>
                  <input className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                    value={create.title}
                    onChange={(e) => setCreate((p) => ({ ...p, title: e.target.value }))} />
                </label>

                <label className="mt-3 block">
                  <div className="text-xs font-semibold text-gray-600">Sekcja (topic_section_id)</div>
                  <select className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                    value={topicSectionId} onChange={(e) => setTopicSectionId(e.target.value)}>
                    <option value="">(brak)</option>
                    {sections.map((s) => (
                      <option key={s.id} value={s.id}>{s.order_index}. {s.title}</option>
                    ))}
                  </select>
                </label>

                <label className="mt-3 block">
                  <div className="text-xs font-semibold text-gray-600">Prompt</div>
                  <textarea className="mt-1 min-h-[90px] w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                    value={create.prompt}
                    onChange={(e) => setCreate((p) => ({ ...p, prompt: e.target.value }))} />
                </label>

                <label className="mt-3 block">
                  <div className="text-xs font-semibold text-gray-600">Opis</div>
                  <textarea className="mt-1 min-h-[60px] w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                    value={create.description}
                    onChange={(e) => setCreate((p) => ({ ...p, description: e.target.value }))} />
                </label>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label>
                    <div className="text-xs font-semibold text-gray-600">answer_type</div>
                    <select className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                      value={create.answer_type}
                      onChange={(e) => setCreate((p) => ({ ...p, answer_type: e.target.value }))}>
                      <option value="abcd">abcd</option>
                      <option value="numeric">numeric</option>
                    </select>
                  </label>

                  <label>
                    <div className="text-xs font-semibold text-gray-600">status</div>
                    <select className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                      value={create.status}
                      onChange={(e) => setCreate((p) => ({ ...p, status: e.target.value }))}>
                      <option value="draft">draft</option>
                      <option value="published">published</option>
                      <option value="archived">archived</option>
                    </select>
                  </label>

                  <label>
                    <div className="text-xs font-semibold text-gray-600">points_max</div>
                    <input type="number" className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                      value={create.points_max}
                      onChange={(e) => setCreate((p) => ({ ...p, points_max: e.target.value }))} />
                  </label>

                  <label>
                    <div className="text-xs font-semibold text-gray-600">difficulty</div>
                    <input type="number" className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                      value={create.difficulty}
                      onChange={(e) => setCreate((p) => ({ ...p, difficulty: e.target.value }))} />
                  </label>

                  <div className="col-span-2 rounded-xl border border-gray-100 p-3">
                    <div className="text-sm font-semibold text-gray-900">Flags</div>
                    {[
                      ['use_in_course', 'use_in_course'],
                      ['use_in_repertory', 'use_in_repertory'],
                      ['use_in_generator', 'use_in_generator'],
                      ['use_in_minigame', 'use_in_minigame'],
                    ].map(([key, label]) => (
                      <label key={key} className="mt-2 flex items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" checked={create[key]}
                          onChange={(e) => setCreate((p) => ({ ...p, [key]: e.target.checked }))} />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Odpowiedzi */}
                <div className="mt-3 rounded-xl border border-gray-100 p-3">
                  <div className="text-sm font-semibold text-gray-900">Odpowiedzi</div>
                  {create.answer_type === 'abcd' ? (
                    <div className="mt-2 grid gap-2">
                      {['A', 'B', 'C', 'D'].map((opt) => (
                        <div key={opt} className="grid grid-cols-[40px_1fr_110px] items-center gap-2">
                          <div className="text-sm font-semibold text-gray-800">{opt}</div>
                          <input className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                            value={create[`options${opt}`]}
                            onChange={(e) => setCreate((p) => ({ ...p, [`options${opt}`]: e.target.value }))} />
                          <button type="button"
                            className={['rounded-xl border px-3 py-2 text-sm font-semibold',
                              create.correct_choice === opt
                                ? 'border-gray-900 bg-gray-900 text-white'
                                : 'border-gray-300 bg-white text-gray-900'].join(' ')}
                            onClick={() => setCreate((p) => ({ ...p, correct_choice: opt }))}>
                            Poprawna
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <input className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                      placeholder="Poprawna odpowiedź"
                      value={create.correct_numeric}
                      onChange={(e) => setCreate((p) => ({ ...p, correct_numeric: e.target.value }))} />
                  )}
                </div>

                {/* ── Podpowiedzi ── */}
                <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50/40 p-3">
                  <div className="mb-2 text-sm font-semibold text-gray-900">
                    Podpowiedzi{' '}
                    <span className="font-normal text-gray-500">
                      ({create.hints.length} {create.hints.length === 1 ? 'podpowiedź' : 'podpowiedzi'})
                    </span>
                  </div>
                  <HintsEditor
                    hints={create.hints}
                    onChange={(next) => setCreate((p) => ({ ...p, hints: next }))}
                  />
                </div>

                <button type="button" onClick={createExerciseAndAttach}
                  className="mt-4 w-full rounded-xl border border-gray-900 bg-gray-900 px-4 py-2 text-sm font-semibold text-white">
                  Utwórz i podepnij
                </button>
              </div>

            </div>
          )}
        </div>
      </div>
    </AdminGate>
  );
}