import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import AdminGate from '../../components/admin/AdminGate';
import { supabase } from '../../lib/admin';

function getCourseLabel(c) {
  return c?.title || c?.name || c?.slug || c?.id || 'course';
}

function hintsFromTextarea(text) {
  const lines = String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.length ? lines : null;
}

function hintsToTextarea(hints) {
  if (!Array.isArray(hints)) return '';
  return hints.map((h) => String(h ?? '')).join('\n');
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

function getKeyForExercise(ex, keyObj) {
  if (ex?.answer_type === 'abcd') {
    const options = keyObj?.options && typeof keyObj.options === 'object' ? keyObj.options : {};
    return {
      kind: 'abcd',
      correct: normalizeChoice(keyObj?.correct || 'A'),
      A: String(options.A ?? ''),
      B: String(options.B ?? ''),
      C: String(options.C ?? ''),
      D: String(options.D ?? ''),
    };
  }
  return {
    kind: 'numeric',
    value: keyObj?.value ?? '',
  };
}

// ---------------- BULK HELPERS ----------------
function safeJsonParse(str) {
  try {
    return { ok: true, value: JSON.parse(str) };
  } catch (e) {
    return { ok: false, error: e?.message || 'Invalid JSON' };
  }
}

function parseTSV(text) {
  const lines = String(text || '')
    .split('\n')
    .map((l) => l.replace(/\r$/, ''))
    .filter((l) => l.trim().length > 0);

  if (lines.length === 0) return { rows: [] };

  const first = lines[0].split('\t').map((x) => x.trim());
  const hasHeader = first.some((h) =>
    [
      'title',
      'prompt',
      'answer_type',
      'a',
      'b',
      'c',
      'd',
      'correct',
      'numeric_value',
      'points_max',
      'difficulty',
      'status',
      'description',
      'image_url',
      'solution_video_url',
      'hints',
    ].includes(String(h || '').toLowerCase())
  );

  let header = null;
  let startIdx = 0;

  if (hasHeader) {
    header = first.map((h) => String(h || '').toLowerCase());
    startIdx = 1;
  }

  const rows = [];

  for (let i = startIdx; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    const lineNo = i + 1;

    if (!header) {
      // fallback layout: prompt, A, B, C, D, correct, points_max?, difficulty?, status?
      const [prompt, A, B, C, D, correct, points_max, difficulty, status] = cols;
      rows.push({
        __line: lineNo,
        prompt: prompt ?? '',
        answer_type: 'abcd',
        A: A ?? '',
        B: B ?? '',
        C: C ?? '',
        D: D ?? '',
        correct: correct ?? '',
        points_max: points_max ?? '',
        difficulty: difficulty ?? '',
        status: status ?? '',
      });
      continue;
    }

    const obj = { __line: lineNo };
    for (let j = 0; j < header.length; j++) {
      obj[header[j]] = cols[j];
    }
    rows.push(obj);
  }

  return { rows };
}

function normalizeBulkRow(raw) {
  const answer_type = String(raw.answer_type || raw.type || '').trim() || (raw.numeric_value ? 'numeric' : 'abcd');

  const title = String(raw.title || '').trim() || null;

  const prompt = String(raw.prompt || '').trim();
  if (!prompt) return { ok: false, error: 'Missing prompt' };

  const points_max =
    raw.points_max !== undefined && String(raw.points_max).trim() !== '' ? Number(raw.points_max) : null;
  const difficulty =
    raw.difficulty !== undefined && String(raw.difficulty).trim() !== '' ? Number(raw.difficulty) : null;

  const status = String(raw.status || '').trim() || null;
  const description = String(raw.description || '').trim() || null;
  const image_url = String(raw.image_url || '').trim() || null;
  const solution_video_url = String(raw.solution_video_url || '').trim() || null;

  const hints = raw.hints
    ? Array.isArray(raw.hints)
      ? raw.hints
      : hintsFromTextarea(String(raw.hints))
    : null;

  if (answer_type === 'abcd') {
    const A = String(raw.A ?? raw.a ?? '').trim();
    const B = String(raw.B ?? raw.b ?? '').trim();
    const C = String(raw.C ?? raw.c ?? '').trim();
    const D = String(raw.D ?? raw.d ?? '').trim();
    const correct = normalizeChoice(raw.correct ?? raw.correct_choice ?? '');

    if (!A || !B || !C || !D) return { ok: false, error: 'Missing one of A/B/C/D' };
    if (!['A', 'B', 'C', 'D'].includes(correct)) return { ok: false, error: 'Invalid correct (must be A/B/C/D)' };

    return {
      ok: true,
      value: {
        title,
        answer_type: 'abcd',
        prompt,
        points_max,
        difficulty,
        status,
        description,
        image_url,
        solution_video_url,
        hints,
        answer_key: { options: { A, B, C, D }, correct },
      },
    };
  }

  if (answer_type === 'numeric') {
    const rawVal = raw.numeric_value ?? raw.value ?? raw.correct_numeric ?? '';
    const v = parseNumericValue(rawVal);
    if (v === null) return { ok: false, error: 'Missing numeric_value' };

    return {
      ok: true,
      value: {
        title,
        answer_type: 'numeric',
        prompt,
        points_max,
        difficulty,
        status,
        description,
        image_url,
        solution_video_url,
        hints,
        answer_key: { value: v },
      },
    };
  }

  return { ok: false, error: `Unsupported answer_type: ${answer_type}` };
}

export default function AdminExerciseBank() {
  const router = useRouter();
  const focusedExerciseId = router.query.exercise_id ? String(router.query.exercise_id) : '';

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  const [courses, setCourses] = useState([]);
  const [sections, setSections] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [answerKeysByExerciseId, setAnswerKeysByExerciseId] = useState({});

  const [filters, setFilters] = useState({
    course_id: '',
    topic_section_id: '',
    status: 'all',
    answer_type: 'all',
    q: '',
    use_in_course: false,
    use_in_repertory: false,
    use_in_generator: false,
    use_in_minigame: false,
  });

  // Create form defaults:
  const [create, setCreate] = useState({
    title: '', // NEW (exercise title)
    course_id: '',
    topic_section_id: '',
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

    use_in_course: false,
    use_in_repertory: true,
    use_in_generator: true,
    use_in_minigame: true,
  });

  // Editor state (Save button)
  const [editById, setEditById] = useState({});
  const [savingById, setSavingById] = useState({});

  // BULK
  const [bulk, setBulk] = useState({
    mode: 'tsv', // tsv|json
    course_id: '',
    topic_section_id: '',
    status: 'draft',
    points_max: 1,
    difficulty: 1,
    use_in_course: false,
    use_in_repertory: true,
    use_in_generator: true,
    use_in_minigame: true,
    requires_ai: false,
    requires_photo: false,
    text: '',
  });
  const [bulkPreview, setBulkPreview] = useState({ rows: [], errors: [] });
  const [bulkImporting, setBulkImporting] = useState(false);

  async function load() {
    setLoading(true);
    setMsg('');

    const { data: courseRows, error: courseErr } = await supabase
      .from('courses')
      .select('id, title, description')
      .order('title', { ascending: true });

    if (courseErr) {
      setMsg(`Load courses failed: ${courseErr.message}`);
      setCourses([]);
      setLoading(false);
      return;
    }
    setCourses(courseRows || []);

    const defaultCourseId = create.course_id || (courseRows?.[0]?.id ? String(courseRows[0].id) : '');
    if (!create.course_id && defaultCourseId) {
      setCreate((p) => ({ ...p, course_id: defaultCourseId }));
      setFilters((p) => ({ ...p, course_id: defaultCourseId }));
    }
    if (!bulk.course_id && defaultCourseId) {
      setBulk((p) => ({ ...p, course_id: defaultCourseId }));
    }

    const courseForSections = defaultCourseId || filters.course_id;
    if (courseForSections) {
      const { data: secRows, error: secErr } = await supabase
        .from('sections')
        .select('id, title, slug, order_index, course_id')
        .eq('course_id', String(courseForSections))
        .order('order_index', { ascending: true });

      if (secErr) {
        setMsg(`Load sections failed: ${secErr.message}`);
        setSections([]);
      } else {
        setSections(secRows || []);
        if (!create.topic_section_id && (secRows || []).length > 0) {
          setCreate((p) => ({ ...p, topic_section_id: secRows[0].id }));
        }
        if (!bulk.topic_section_id && (secRows || []).length > 0) {
          setBulk((p) => ({ ...p, topic_section_id: secRows[0].id }));
        }
      }
    } else {
      setSections([]);
    }

    const { data: exData, error: exErr } = await supabase
      .from('exercises')
      .select(
        // NEW: include title
        'id, title, course_id, topic_section_id, prompt, answer_type, points_max, difficulty, requires_ai, requires_photo, image_url, description, hints, solution_video_url, status, use_in_course, use_in_repertory, use_in_generator, use_in_minigame, created_at'
      )
      .order('created_at', { ascending: false })
      .limit(500);

    if (exErr) {
      setMsg(`Load exercises failed: ${exErr.message}`);
      setExercises([]);
      setAnswerKeysByExerciseId({});
      setEditById({});
      setLoading(false);
      return;
    }

    const ids = (exData || []).map((x) => x.id);
    let keyMap = {};
    if (ids.length > 0) {
      const { data: keyRows, error: keyErr } = await supabase
        .from('exercise_answer_keys')
        .select('exercise_id, answer_key')
        .in('exercise_id', ids);

      if (keyErr) {
        setMsg(`Load answer keys failed: ${keyErr.message}`);
      } else {
        keyMap = Object.fromEntries((keyRows || []).map((k) => [k.exercise_id, k.answer_key]));
      }
    }

    setExercises(exData || []);
    setAnswerKeysByExerciseId(keyMap);

    // init editor model
    const nextEdit = {};
    for (const e of exData || []) {
      const keyObj = keyMap[e.id];
      const parsedKey = getKeyForExercise(e, keyObj);

      nextEdit[e.id] = {
        title: e.title || '', // NEW
        course_id: String(e.course_id ?? ''),
        topic_section_id: e.topic_section_id ? String(e.topic_section_id) : '',
        prompt: e.prompt || '',
        description: e.description || '',
        image_url: e.image_url || '',
        solution_video_url: e.solution_video_url || '',
        hints_text: hintsToTextarea(e.hints),
        answer_type: e.answer_type,
        points_max: e.points_max ?? 1,
        difficulty: e.difficulty ?? 1,
        requires_ai: Boolean(e.requires_ai),
        requires_photo: Boolean(e.requires_photo),
        status: e.status || 'draft',
        use_in_course: Boolean(e.use_in_course),
        use_in_repertory: Boolean(e.use_in_repertory),
        use_in_generator: Boolean(e.use_in_generator),
        use_in_minigame: Boolean(e.use_in_minigame),

        correct_choice: parsedKey.kind === 'abcd' ? parsedKey.correct : 'A',
        optionsA: parsedKey.kind === 'abcd' ? parsedKey.A : '',
        optionsB: parsedKey.kind === 'abcd' ? parsedKey.B : '',
        optionsC: parsedKey.kind === 'abcd' ? parsedKey.C : '',
        optionsD: parsedKey.kind === 'abcd' ? parsedKey.D : '',
        correct_numeric: parsedKey.kind === 'numeric' ? String(parsedKey.value ?? '') : '',
      };
    }
    setEditById(nextEdit);

    setSavingById({});
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deep-link: scroll to + highlight
  useEffect(() => {
    if (!focusedExerciseId) return;
    const el = document.getElementById(`exercise-card-${focusedExerciseId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [focusedExerciseId, loading]);

  useEffect(() => {
    (async () => {
      if (!filters.course_id) return;

      const { data: secRows, error: secErr } = await supabase
        .from('sections')
        .select('id, title, slug, order_index, course_id')
        .eq('course_id', String(filters.course_id))
        .order('order_index', { ascending: true });

      if (secErr) {
        setMsg(`Load sections failed: ${secErr.message}`);
        setSections([]);
        return;
      }
      setSections(secRows || []);
      setFilters((p) => ({ ...p, topic_section_id: '' }));
    })();
  }, [filters.course_id]);

  const filtered = useMemo(() => {
    const term = filters.q.trim().toLowerCase();

    return exercises.filter((e) => {
      if (filters.course_id && String(e.course_id) !== String(filters.course_id)) return false;
      if (filters.topic_section_id && String(e.topic_section_id) !== String(filters.topic_section_id)) return false;
      if (filters.status !== 'all' && e.status !== filters.status) return false;
      if (filters.answer_type !== 'all' && e.answer_type !== filters.answer_type) return false;

      if (filters.use_in_course && !e.use_in_course) return false;
      if (filters.use_in_repertory && !e.use_in_repertory) return false;
      if (filters.use_in_generator && !e.use_in_generator) return false;
      if (filters.use_in_minigame && !e.use_in_minigame) return false;

      if (term) {
        const hay = `${e.title || ''} ${e.prompt || ''}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }

      return true;
    });
  }, [exercises, filters]);

  function buildAnswerKeyFromCreate() {
    if (create.answer_type === 'abcd') {
      const correct = normalizeChoice(create.correct_choice || 'A');
      const options = {
        A: String(create.optionsA || '').trim(),
        B: String(create.optionsB || '').trim(),
        C: String(create.optionsC || '').trim(),
        D: String(create.optionsD || '').trim(),
      };

      for (const k of ['A', 'B', 'C', 'D']) {
        if (!options[k]) return { error: `Uzupełnij treść odpowiedzi ${k}.` };
      }

      return { value: { options, correct } };
    }

    const v = parseNumericValue(create.correct_numeric);
    if (v === null) return { error: 'Uzupełnij poprawną odpowiedź.' };
    return { value: { value: v } };
  }

  async function createExercise() {
    setMsg('');

    if (!create.course_id) {
      setMsg('Wybierz course.');
      return;
    }
    if (!create.prompt.trim()) {
      setMsg('Prompt jest wymagany.');
      return;
    }

    const answerKey = buildAnswerKeyFromCreate();
    if (answerKey.error) {
      setMsg(answerKey.error);
      return;
    }

    const hints = hintsFromTextarea(create.hints_text);

    const { data: inserted, error: insErr } = await supabase
      .from('exercises')
      .insert({
        course_id: String(create.course_id),
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

    setCreate((p) => ({
      ...p,
      title: '',
      prompt: '',
      description: '',
      image_url: '',
      solution_video_url: '',
      hints_text: '',
      points_max: 1,
      difficulty: 1,
      requires_ai: false,
      requires_photo: false,
      status: 'draft',
      answer_type: 'abcd',
      correct_choice: 'A',
      correct_numeric: '',
      optionsA: '',
      optionsB: '',
      optionsC: '',
      optionsD: '',
    }));

    await load();
  }

  function getDirty(id) {
    const e = exercises.find((x) => x.id === id);
    if (!e) return false;
    const ed = editById[id];
    if (!ed) return false;

    const keyObj = answerKeysByExerciseId[id];
    const keyParsed = getKeyForExercise(e, keyObj);

    const hintsNow = hintsToTextarea(e.hints);
    const hintsEd = String(ed.hints_text || '');

    if (
      String(e.title ?? '') !== String(ed.title ?? '') || // NEW
      String(e.course_id ?? '') !== String(ed.course_id ?? '') ||
      String(e.topic_section_id ?? '') !== String(ed.topic_section_id ?? '') ||
      String(e.prompt ?? '') !== String(ed.prompt ?? '') ||
      String(e.description ?? '') !== String(ed.description ?? '') ||
      String(e.image_url ?? '') !== String(ed.image_url ?? '') ||
      String(e.solution_video_url ?? '') !== String(ed.solution_video_url ?? '') ||
      String(hintsNow) !== String(hintsEd) ||
      String(e.answer_type ?? '') !== String(ed.answer_type ?? '') ||
      Number(e.points_max ?? 0) !== Number(ed.points_max ?? 0) ||
      Number(e.difficulty ?? 0) !== Number(ed.difficulty ?? 0) ||
      Boolean(e.requires_ai) !== Boolean(ed.requires_ai) ||
      Boolean(e.requires_photo) !== Boolean(ed.requires_photo) ||
      String(e.status ?? '') !== String(ed.status ?? '') ||
      Boolean(e.use_in_course) !== Boolean(ed.use_in_course) ||
      Boolean(e.use_in_repertory) !== Boolean(ed.use_in_repertory) ||
      Boolean(e.use_in_generator) !== Boolean(ed.use_in_generator) ||
      Boolean(e.use_in_minigame) !== Boolean(ed.use_in_minigame)
    ) {
      return true;
    }

    if (ed.answer_type === 'abcd') {
      const curCorrect = keyParsed.kind === 'abcd' ? keyParsed.correct : 'A';
      const curOpts =
        keyParsed.kind === 'abcd'
          ? { A: keyParsed.A, B: keyParsed.B, C: keyParsed.C, D: keyParsed.D }
          : { A: '', B: '', C: '', D: '' };

      if (normalizeChoice(ed.correct_choice) !== normalizeChoice(curCorrect)) return true;
      if (
        String(ed.optionsA || '') !== String(curOpts.A || '') ||
        String(ed.optionsB || '') !== String(curOpts.B || '') ||
        String(ed.optionsC || '') !== String(curOpts.C || '') ||
        String(ed.optionsD || '') !== String(curOpts.D || '')
      ) {
        return true;
      }
    } else {
      const curVal = keyParsed.kind === 'numeric' ? String(keyParsed.value ?? '') : '';
      if (String(ed.correct_numeric ?? '') !== curVal) return true;
    }

    return false;
  }

  async function saveExercise(id) {
    setMsg('');
    const ed = editById[id];
    if (!ed) return;

    let nextAnswerKey = null;

    if (ed.answer_type === 'abcd') {
      const options = {
        A: String(ed.optionsA || '').trim(),
        B: String(ed.optionsB || '').trim(),
        C: String(ed.optionsC || '').trim(),
        D: String(ed.optionsD || '').trim(),
      };
      for (const k of ['A', 'B', 'C', 'D']) {
        if (!options[k]) {
          setMsg(`Exercise ${id}: brak treści odpowiedzi ${k}.`);
          return;
        }
      }
      nextAnswerKey = { options, correct: normalizeChoice(ed.correct_choice || 'A') };
    } else {
      const v = parseNumericValue(ed.correct_numeric);
      if (v === null) {
        setMsg(`Exercise ${id}: brak poprawnej odpowiedzi numeric.`);
        return;
      }
      nextAnswerKey = { value: v };
    }

    setSavingById((p) => ({ ...p, [id]: true }));
    try {
      const hints = hintsFromTextarea(ed.hints_text);

      const { error: updErr } = await supabase
        .from('exercises')
        .update({
          title: ed.title || null, // NEW
          course_id: String(ed.course_id),
          topic_section_id: ed.topic_section_id ? String(ed.topic_section_id) : null,
          prompt: ed.prompt,
          description: ed.description || null,
          image_url: ed.image_url || null,
          solution_video_url: ed.solution_video_url || null,
          hints,
          answer_type: ed.answer_type,
          points_max: Number(ed.points_max),
          difficulty: Number(ed.difficulty),
          requires_ai: Boolean(ed.requires_ai),
          requires_photo: Boolean(ed.requires_photo),
          status: ed.status,
          use_in_course: Boolean(ed.use_in_course),
          use_in_repertory: Boolean(ed.use_in_repertory),
          use_in_generator: Boolean(ed.use_in_generator),
          use_in_minigame: Boolean(ed.use_in_minigame),
        })
        .eq('id', id);

      if (updErr) {
        setMsg(updErr.message);
        return;
      }

      const { error: keyErr } = await supabase.from('exercise_answer_keys').upsert(
        { exercise_id: id, answer_key: nextAnswerKey },
        { onConflict: 'exercise_id' }
      );

      if (keyErr) {
        setMsg(keyErr.message);
        return;
      }

      await load();
    } finally {
      setSavingById((p) => ({ ...p, [id]: false }));
    }
  }

  async function deleteExercise(id) {
    setMsg('');
    const ok = window.confirm('Usunąć exercise? Uwaga: island_items mogą się zepsuć.');
    if (!ok) return;

    const { error } = await supabase.from('exercises').delete().eq('id', id);
    if (error) {
      setMsg(error.message);
      return;
    }
    await load();
  }

  // BULK PREVIEW (TSV/JSON)
  useEffect(() => {
    const text = bulk.text || '';
    if (!text.trim()) {
      setBulkPreview({ rows: [], errors: [] });
      return;
    }

    if (bulk.mode === 'tsv') {
      const { rows } = parseTSV(text);
      const preview = [];
      const errors = [];

      for (const r of rows) {
        const norm = normalizeBulkRow(r);
        if (!norm.ok) errors.push({ line: r.__line, error: norm.error });
        else preview.push({ line: r.__line, ...norm.value });
      }

      setBulkPreview({ rows: preview, errors });
    } else {
      const parsed = safeJsonParse(text);
      if (!parsed.ok) {
        setBulkPreview({ rows: [], errors: [{ line: 0, error: parsed.error }] });
        return;
      }
      if (!Array.isArray(parsed.value)) {
        setBulkPreview({ rows: [], errors: [{ line: 0, error: 'JSON must be an array of objects' }] });
        return;
      }

      const preview = [];
      const errors = [];
      parsed.value.forEach((obj, idx) => {
        const norm = normalizeBulkRow(obj);
        if (!norm.ok) errors.push({ line: idx + 1, error: norm.error });
        else preview.push({ line: idx + 1, ...norm.value, __raw: obj });
      });

      setBulkPreview({ rows: preview, errors });
    }
  }, [bulk.mode, bulk.text]);

  async function runBulkImport() {
    setMsg('');

    if (!bulk.course_id) {
      setMsg('Bulk: wybierz course.');
      return;
    }
    if (!bulkPreview.rows.length) {
      setMsg('Bulk: brak wierszy do importu.');
      return;
    }
    if (bulkPreview.errors.length) {
      setMsg('Bulk: popraw błędy w danych (preview errors).');
      return;
    }

    const ok = window.confirm(`Zaimportować ${bulkPreview.rows.length} ćwiczeń?`);
    if (!ok) return;

    setBulkImporting(true);
    const errors = [];

    try {
      for (const row of bulkPreview.rows) {
        const rawOverrides = bulk.mode === 'json' ? row.__raw || {} : {};

        const points_max =
          rawOverrides.points_max !== undefined
            ? Number(rawOverrides.points_max)
            : row.points_max ?? Number(bulk.points_max);

        const difficulty =
          rawOverrides.difficulty !== undefined
            ? Number(rawOverrides.difficulty)
            : row.difficulty ?? Number(bulk.difficulty);

        const status = rawOverrides.status !== undefined ? String(rawOverrides.status) : row.status || bulk.status;

        const use_in_course =
          rawOverrides.use_in_course !== undefined ? Boolean(rawOverrides.use_in_course) : Boolean(bulk.use_in_course);
        const use_in_repertory =
          rawOverrides.use_in_repertory !== undefined
            ? Boolean(rawOverrides.use_in_repertory)
            : Boolean(bulk.use_in_repertory);
        const use_in_generator =
          rawOverrides.use_in_generator !== undefined
            ? Boolean(rawOverrides.use_in_generator)
            : Boolean(bulk.use_in_generator);
        const use_in_minigame =
          rawOverrides.use_in_minigame !== undefined
            ? Boolean(rawOverrides.use_in_minigame)
            : Boolean(bulk.use_in_minigame);

        const requires_ai =
          rawOverrides.requires_ai !== undefined ? Boolean(rawOverrides.requires_ai) : Boolean(bulk.requires_ai);
        const requires_photo =
          rawOverrides.requires_photo !== undefined ? Boolean(rawOverrides.requires_photo) : Boolean(bulk.requires_photo);

        const topic_section_id =
          rawOverrides.topic_section_id !== undefined
            ? String(rawOverrides.topic_section_id || '')
            : String(bulk.topic_section_id || '');

        const title = rawOverrides.title !== undefined ? String(rawOverrides.title || '') : String(row.title || '');

        const { data: inserted, error: insErr } = await supabase
          .from('exercises')
          .insert({
            course_id: String(bulk.course_id),
            topic_section_id: topic_section_id ? String(topic_section_id) : null,
            title: title ? title : null, // NEW
            prompt: row.prompt,
            answer_type: row.answer_type,
            points_max: Number(points_max),
            difficulty: Number(difficulty),
            status,
            description: row.description || null,
            image_url: row.image_url || null,
            solution_video_url: row.solution_video_url || null,
            hints: row.hints || null,
            use_in_course,
            use_in_repertory,
            use_in_generator,
            use_in_minigame,
            requires_ai,
            requires_photo,
          })
          .select('id')
          .single();

        if (insErr) {
          errors.push({ line: row.line, error: insErr.message });
          continue;
        }

        const { error: keyErr } = await supabase.from('exercise_answer_keys').insert({
          exercise_id: inserted.id,
          answer_key: row.answer_key,
        });

        if (keyErr) {
          errors.push({ line: row.line, error: `answer_key insert failed: ${keyErr.message}` });
          continue;
        }
      }
    } finally {
      setBulkImporting(false);
    }

    if (errors.length) {
      setMsg(`Bulk import finished with errors. First: line ${errors[0].line}: ${errors[0].error}`);
    } else {
      setMsg(`Bulk import OK: ${bulkPreview.rows.length} ćwiczeń.`);
      setBulk((p) => ({ ...p, text: '' }));
    }

    await load();
  }

  return (
    <AdminGate>
      <div className="min-h-screen bg-white">
        <div className="mx-auto max-w-7xl p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Link href="/admin" className="text-sm font-semibold text-gray-700 underline">
                ← Admin
              </Link>
              <h1 className="mt-2 text-2xl font-bold text-gray-900">Exercise Bank</h1>
              <p className="mt-1 text-sm text-gray-600">Create • Bulk add (TSV/JSON) • Edit + Save</p>
            </div>
          </div>

          {msg ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{msg}</div>
          ) : null}

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {/* LEFT: CREATE */}
            <div className="rounded-2xl border border-gray-200 p-4">
              <div className="font-semibold text-gray-900">Dodaj ćwiczenie</div>

              {/* NEW: title */}
              <label className="mt-3 block">
                <div className="text-xs font-semibold text-gray-600">title (optional)</div>
                <input
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  placeholder="np. Funkcje kwadratowe — zadanie 1"
                  value={create.title}
                  onChange={(e) => setCreate((p) => ({ ...p, title: e.target.value }))}
                />
              </label>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label>
                  <div className="text-xs font-semibold text-gray-600">Course</div>
                  <select
                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                    value={create.course_id}
                    onChange={(e) => setCreate((p) => ({ ...p, course_id: e.target.value }))}
                  >
                    <option value="">Wybierz…</option>
                    {courses.map((c) => (
                      <option key={c.id} value={String(c.id)}>
                        {getCourseLabel(c)}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <div className="text-xs font-semibold text-gray-600">Topic (sekcja)</div>
                  <select
                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                    value={create.topic_section_id || ''}
                    onChange={(e) => setCreate((p) => ({ ...p, topic_section_id: e.target.value }))}
                  >
                    <option value="">(brak)</option>
                    {sections.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.order_index}. {s.title}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="mt-3 block">
                <div className="text-xs font-semibold text-gray-600">Question (prompt)</div>
                <textarea
                  className="mt-1 min-h-[120px] w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  value={create.prompt}
                  onChange={(e) => setCreate((p) => ({ ...p, prompt: e.target.value }))}
                />
              </label>

              <label className="mt-3 block">
                <div className="text-xs font-semibold text-gray-600">description (optional)</div>
                <textarea
                  className="mt-1 min-h-[70px] w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  value={create.description}
                  onChange={(e) => setCreate((p) => ({ ...p, description: e.target.value }))}
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

              <div className="mt-3 rounded-xl border border-gray-100 p-3">
                <div className="text-sm font-semibold text-gray-900">Answers</div>

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

              <div className="mt-3 grid gap-2">
                <div className="text-xs font-semibold text-gray-600">Flags</div>

                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={Boolean(create.use_in_course)}
                    onChange={(e) => setCreate((p) => ({ ...p, use_in_course: e.target.checked }))}
                  />
                  use_in_course
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={Boolean(create.use_in_repertory)}
                    onChange={(e) => setCreate((p) => ({ ...p, use_in_repertory: e.target.checked }))}
                  />
                  use_in_repertory
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={Boolean(create.use_in_generator)}
                    onChange={(e) => setCreate((p) => ({ ...p, use_in_generator: e.target.checked }))}
                  />
                  use_in_generator
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={Boolean(create.use_in_minigame)}
                    onChange={(e) => setCreate((p) => ({ ...p, use_in_minigame: e.target.checked }))}
                  />
                  use_in_minigame
                </label>
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
                className="mt-4 rounded-xl border border-gray-900 bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
                onClick={createExercise}
              >
                Dodaj do banku
              </button>
            </div>

            {/* RIGHT: BULK + EDIT LIST */}
            <div className="space-y-4">
              {/* BULK */}
              <div className="rounded-2xl border border-gray-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold text-gray-900">Bulk add (TSV / JSON)</div>
                  <select
                    className="rounded-xl border border-gray-300 px-3 py-2 text-sm"
                    value={bulk.mode}
                    onChange={(e) => setBulk((p) => ({ ...p, mode: e.target.value }))}
                  >
                    <option value="tsv">TSV</option>
                    <option value="json">JSON</option>
                  </select>
                </div>

                <div className="mt-3 text-xs text-gray-600">
                  Tip: you can include a <b>title</b> column in TSV header or JSON field: <code>{"title"}</code>.
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label>
                    <div className="text-xs font-semibold text-gray-600">course</div>
                    <select
                      className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                      value={bulk.course_id}
                      onChange={(e) => setBulk((p) => ({ ...p, course_id: e.target.value }))}
                    >
                      <option value="">Wybierz…</option>
                      {courses.map((c) => (
                        <option key={c.id} value={String(c.id)}>
                          {getCourseLabel(c)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    <div className="text-xs font-semibold text-gray-600">topic_section_id</div>
                    <select
                      className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                      value={bulk.topic_section_id || ''}
                      onChange={(e) => setBulk((p) => ({ ...p, topic_section_id: e.target.value }))}
                    >
                      <option value="">(brak)</option>
                      {sections.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.order_index}. {s.title}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    <div className="text-xs font-semibold text-gray-600">default status</div>
                    <select
                      className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                      value={bulk.status}
                      onChange={(e) => setBulk((p) => ({ ...p, status: e.target.value }))}
                    >
                      <option value="draft">draft</option>
                      <option value="published">published</option>
                      <option value="archived">archived</option>
                    </select>
                  </label>

                  <label>
                    <div className="text-xs font-semibold text-gray-600">default points_max</div>
                    <input
                      type="number"
                      className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                      value={bulk.points_max}
                      onChange={(e) => setBulk((p) => ({ ...p, points_max: e.target.value }))}
                    />
                  </label>

                  <label>
                    <div className="text-xs font-semibold text-gray-600">default difficulty</div>
                    <input
                      type="number"
                      className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                      value={bulk.difficulty}
                      onChange={(e) => setBulk((p) => ({ ...p, difficulty: e.target.value }))}
                    />
                  </label>
                </div>

                <div className="mt-3">
                  <div className="text-xs font-semibold text-gray-600">default flags</div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-gray-700">
                    {['use_in_course', 'use_in_repertory', 'use_in_generator', 'use_in_minigame'].map((k) => (
                      <label key={k} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={Boolean(bulk[k])}
                          onChange={(e) => setBulk((p) => ({ ...p, [k]: e.target.checked }))}
                        />
                        {k}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="mt-3">
                  <div className="text-xs font-semibold text-gray-600">default requirements</div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-gray-700">
                    {['requires_ai', 'requires_photo'].map((k) => (
                      <label key={k} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={Boolean(bulk[k])}
                          onChange={(e) => setBulk((p) => ({ ...p, [k]: e.target.checked }))}
                        />
                        {k}
                      </label>
                    ))}
                  </div>
                </div>

                <label className="mt-3 block">
                  <div className="text-xs font-semibold text-gray-600">
                    {bulk.mode === 'tsv' ? 'Paste TSV (tab-separated)' : 'Paste JSON array'}
                  </div>
                  <textarea
                    className="mt-1 min-h-[160px] w-full rounded-xl border border-gray-300 px-3 py-2 font-mono text-xs"
                    value={bulk.text}
                    onChange={(e) => setBulk((p) => ({ ...p, text: e.target.value }))}
                    placeholder={
                      bulk.mode === 'tsv'
                        ? `Header example (optional):
title\tprompt\tA\tB\tC\tD\tcorrect\tpoints_max\tdifficulty\tstatus
Funkcje kwadratowe #1\tIle kątów ma pięciokąt?\t3\t4\t5\t6\tC\t1\t1\tdraft

Numeric:
title\tprompt\tanswer_type\tnumeric_value\tpoints_max
Dodawanie\tIle to 2+2?\tnumeric\t4\t1`
                        : `Example:
[
  {
    "title": "Funkcje kwadratowe #1",
    "prompt": "Ile kątów ma pięciokąt?",
    "answer_type": "abcd",
    "A": "3",
    "B": "4",
    "C": "5",
    "D": "6",
    "correct": "C",
    "points_max": 1
  }
]`
                    }
                  />
                </label>

                <div className="mt-2 text-sm text-gray-700">
                  Preview: <b>{bulkPreview.rows.length}</b> rows • Errors: <b>{bulkPreview.errors.length}</b>
                </div>

                {bulkPreview.errors.length ? (
                  <div className="mt-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                    {bulkPreview.errors.slice(0, 8).map((e, idx) => (
                      <div key={idx}>
                        line {e.line}: {e.error}
                      </div>
                    ))}
                    {bulkPreview.errors.length > 8 ? <div>…</div> : null}
                  </div>
                ) : null}

                <button
                  type="button"
                  className="mt-3 rounded-xl border border-gray-900 bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  disabled={bulkImporting || !bulkPreview.rows.length || bulkPreview.errors.length}
                  onClick={runBulkImport}
                >
                  {bulkImporting ? 'Importing…' : 'Import'}
                </button>
              </div>

              {/* EDIT LIST */}
              <div className="rounded-2xl border border-gray-200 p-4">
                <div className="font-semibold text-gray-900">Ćwiczenia (edycja)</div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label>
                    <div className="text-xs font-semibold text-gray-600">Course</div>
                    <select
                      className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                      value={filters.course_id}
                      onChange={(e) => setFilters((p) => ({ ...p, course_id: e.target.value }))}
                    >
                      <option value="">(all)</option>
                      {courses.map((c) => (
                        <option key={c.id} value={String(c.id)}>
                          {getCourseLabel(c)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    <div className="text-xs font-semibold text-gray-600">Topic</div>
                    <select
                      className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                      value={filters.topic_section_id}
                      onChange={(e) => setFilters((p) => ({ ...p, topic_section_id: e.target.value }))}
                      disabled={!filters.course_id}
                    >
                      <option value="">(all)</option>
                      {sections.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.order_index}. {s.title}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    <div className="text-xs font-semibold text-gray-600">status</div>
                    <select
                      className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                      value={filters.status}
                      onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}
                    >
                      <option value="all">(all)</option>
                      <option value="draft">draft</option>
                      <option value="published">published</option>
                      <option value="archived">archived</option>
                    </select>
                  </label>

                  <label>
                    <div className="text-xs font-semibold text-gray-600">answer_type</div>
                    <select
                      className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                      value={filters.answer_type}
                      onChange={(e) => setFilters((p) => ({ ...p, answer_type: e.target.value }))}
                    >
                      <option value="all">(all)</option>
                      <option value="abcd">abcd</option>
                      <option value="numeric">numeric</option>
                    </select>
                  </label>

                  <label className="sm:col-span-2">
                    <div className="text-xs font-semibold text-gray-600">Szukaj w title/prompt</div>
                    <input
                      className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                      value={filters.q}
                      onChange={(e) => setFilters((p) => ({ ...p, q: e.target.value }))}
                    />
                  </label>

                  <div className="sm:col-span-2">
                    <div className="text-xs font-semibold text-gray-600">Flag filters (require true)</div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-gray-700">
                      {['use_in_course', 'use_in_repertory', 'use_in_generator', 'use_in_minigame'].map((k) => (
                        <label key={k} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={filters[k]}
                            onChange={(e) => setFilters((p) => ({ ...p, [k]: e.target.checked }))}
                          />
                          {k}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                {loading ? (
                  <div className="mt-4 text-sm text-gray-700">Ładowanie…</div>
                ) : filtered.length === 0 ? (
                  <div className="mt-4 text-sm text-gray-700">Brak wyników.</div>
                ) : (
                  <div className="mt-4 space-y-4">
                    {filtered.map((e) => {
                      const ed = editById[e.id];
                      if (!ed) return null;

                      const dirty = getDirty(e.id);
                      const saving = Boolean(savingById[e.id]);

                      return (
                        <div
                          key={e.id}
                          id={`exercise-card-${e.id}`}
                          className={[
                            'rounded-xl border p-3',
                            focusedExerciseId === String(e.id)
                              ? 'border-indigo-400 bg-indigo-50'
                              : 'border-gray-200',
                          ].join(' ')}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-gray-900">
                                {(ed.title || '(no title)') + ' • '}
                                {ed.status} • {ed.answer_type} • {Number(ed.points_max)}pkt • diff {Number(ed.difficulty)}
                                {dirty ? <span className="ml-2 text-xs text-orange-700">(unsaved)</span> : null}
                              </div>
                              <div className="mt-1 text-[11px] text-gray-500">
                                id: <code>{e.id}</code>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                className="rounded-lg border border-gray-900 bg-gray-900 px-3 py-1 text-sm font-semibold text-white disabled:opacity-50"
                                disabled={!dirty || saving}
                                onClick={() => saveExercise(e.id)}
                              >
                                {saving ? 'Saving…' : 'Save'}
                              </button>

                              <button
                                type="button"
                                className="rounded-lg border border-red-700 bg-red-700 px-3 py-1 text-sm font-semibold text-white"
                                onClick={() => deleteExercise(e.id)}
                              >
                                Usuń
                              </button>
                            </div>
                          </div>

                          {/* NEW: title editor */}
                          <label className="mt-3 block">
                            <div className="text-xs font-semibold text-gray-600">Title</div>
                            <input
                              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                              value={ed.title}
                              onChange={(ev) =>
                                setEditById((p) => ({ ...p, [e.id]: { ...p[e.id], title: ev.target.value } }))
                              }
                              placeholder="np. Funkcje kwadratowe — zadanie 1"
                            />
                          </label>

                          <label className="mt-3 block">
                            <div className="text-xs font-semibold text-gray-600">Prompt</div>
                            <textarea
                              className="mt-1 min-h-[90px] w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                              value={ed.prompt}
                              onChange={(ev) =>
                                setEditById((p) => ({ ...p, [e.id]: { ...p[e.id], prompt: ev.target.value } }))
                              }
                            />
                          </label>

                          <label className="mt-3 block">
                            <div className="text-xs font-semibold text-gray-600">description</div>
                            <textarea
                              className="mt-1 min-h-[60px] w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                              value={ed.description}
                              onChange={(ev) =>
                                setEditById((p) => ({ ...p, [e.id]: { ...p[e.id], description: ev.target.value } }))
                              }
                            />
                          </label>

                          <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <label>
                              <div className="text-xs font-semibold text-gray-600">status</div>
                              <select
                                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                                value={ed.status}
                                onChange={(ev) =>
                                  setEditById((p) => ({ ...p, [e.id]: { ...p[e.id], status: ev.target.value } }))
                                }
                              >
                                <option value="draft">draft</option>
                                <option value="published">published</option>
                                <option value="archived">archived</option>
                              </select>
                            </label>

                            <label>
                              <div className="text-xs font-semibold text-gray-600">answer_type</div>
                              <select
                                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                                value={ed.answer_type}
                                onChange={(ev) =>
                                  setEditById((p) => ({
                                    ...p,
                                    [e.id]: {
                                      ...p[e.id],
                                      answer_type: ev.target.value,
                                      correct_choice: 'A',
                                      optionsA: '',
                                      optionsB: '',
                                      optionsC: '',
                                      optionsD: '',
                                      correct_numeric: '',
                                    },
                                  }))
                                }
                              >
                                <option value="abcd">abcd</option>
                                <option value="numeric">numeric</option>
                              </select>
                            </label>

                            <label>
                              <div className="text-xs font-semibold text-gray-600">points_max</div>
                              <input
                                type="number"
                                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                                value={ed.points_max}
                                onChange={(ev) =>
                                  setEditById((p) => ({ ...p, [e.id]: { ...p[e.id], points_max: ev.target.value } }))
                                }
                              />
                            </label>

                            <label>
                              <div className="text-xs font-semibold text-gray-600">difficulty</div>
                              <input
                                type="number"
                                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                                value={ed.difficulty}
                                onChange={(ev) =>
                                  setEditById((p) => ({ ...p, [e.id]: { ...p[e.id], difficulty: ev.target.value } }))
                                }
                              />
                            </label>

                            <label className="sm:col-span-2">
                              <div className="text-xs font-semibold text-gray-600">image_url</div>
                              <input
                                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                                value={ed.image_url}
                                onChange={(ev) =>
                                  setEditById((p) => ({ ...p, [e.id]: { ...p[e.id], image_url: ev.target.value } }))
                                }
                              />
                            </label>

                            <label className="sm:col-span-2">
                              <div className="text-xs font-semibold text-gray-600">solution_video_url</div>
                              <input
                                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                                value={ed.solution_video_url}
                                onChange={(ev) =>
                                  setEditById((p) => ({
                                    ...p,
                                    [e.id]: { ...p[e.id], solution_video_url: ev.target.value },
                                  }))
                                }
                              />
                            </label>
                          </div>

                          <label className="mt-3 block">
                            <div className="text-xs font-semibold text-gray-600">hints (one per line)</div>
                            <textarea
                              className="mt-1 min-h-[70px] w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                              value={ed.hints_text}
                              onChange={(ev) =>
                                setEditById((p) => ({ ...p, [e.id]: { ...p[e.id], hints_text: ev.target.value } }))
                              }
                            />
                          </label>

                          <div className="mt-3">
                            <div className="text-xs font-semibold text-gray-600">Flags</div>
                            <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-gray-700">
                              {['use_in_course', 'use_in_repertory', 'use_in_generator', 'use_in_minigame'].map((k) => (
                                <label key={k} className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(ed[k])}
                                    onChange={(ev) =>
                                      setEditById((p) => ({ ...p, [e.id]: { ...p[e.id], [k]: ev.target.checked } }))
                                    }
                                  />
                                  {k}
                                </label>
                              ))}
                            </div>
                          </div>

                          <div className="mt-3">
                            <div className="text-xs font-semibold text-gray-600">Requirements</div>
                            <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-gray-700">
                              {['requires_ai', 'requires_photo'].map((k) => (
                                <label key={k} className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(ed[k])}
                                    onChange={(ev) =>
                                      setEditById((p) => ({ ...p, [e.id]: { ...p[e.id], [k]: ev.target.checked } }))
                                    }
                                  />
                                  {k}
                                </label>
                              ))}
                            </div>
                          </div>

                          <div className="mt-3 rounded-xl border border-gray-100 p-3">
                            <div className="text-sm font-semibold text-gray-900">Answer key</div>

                            {ed.answer_type === 'abcd' ? (
                              <div className="mt-2 grid gap-2">
                                {['A', 'B', 'C', 'D'].map((opt) => (
                                  <div key={opt} className="grid grid-cols-[40px_1fr_110px] items-center gap-2">
                                    <div className="text-sm font-semibold text-gray-800">{opt}</div>
                                    <input
                                      className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                                      value={
                                        opt === 'A'
                                          ? ed.optionsA
                                          : opt === 'B'
                                            ? ed.optionsB
                                            : opt === 'C'
                                              ? ed.optionsC
                                              : ed.optionsD
                                      }
                                      onChange={(ev) => {
                                        const v = ev.target.value;
                                        setEditById((p) => ({
                                          ...p,
                                          [e.id]: {
                                            ...p[e.id],
                                            ...(opt === 'A'
                                              ? { optionsA: v }
                                              : opt === 'B'
                                                ? { optionsB: v }
                                                : opt === 'C'
                                                  ? { optionsC: v }
                                                  : { optionsD: v }),
                                          },
                                        }));
                                      }}
                                    />
                                    <button
                                      type="button"
                                      className={[
                                        'rounded-xl border px-3 py-2 text-sm font-semibold',
                                        normalizeChoice(ed.correct_choice) === opt
                                          ? 'border-gray-900 bg-gray-900 text-white'
                                          : 'border-gray-300 bg-white text-gray-900',
                                      ].join(' ')}
                                      onClick={() =>
                                        setEditById((p) => ({ ...p, [e.id]: { ...p[e.id], correct_choice: opt } }))
                                      }
                                    >
                                      Poprawna
                                    </button>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <input
                                className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                                placeholder="Poprawna odpowiedź"
                                value={ed.correct_numeric}
                                onChange={(ev) =>
                                  setEditById((p) => ({ ...p, [e.id]: { ...p[e.id], correct_numeric: ev.target.value } }))
                                }
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminGate>
  );
}