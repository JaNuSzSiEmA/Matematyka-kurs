import { requireServerEnvs, getUserFromRequest } from './_auth';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');

    const supabase = requireServerEnvs(res);
    if (!supabase) return;

    const auth = await getUserFromRequest(req, res, supabase);
    if (!auth) return;

    const userId = auth.user.id;

    const { island_id } = req.body || {};
    if (!island_id) return res.status(400).json({ error: 'Missing island_id' });

    // Load island + section rules
    const { data: island, error: islErr } = await supabase
      .from('islands')
      .select('id, type, section_id')
      .eq('id', island_id)
      .single();

    if (islErr || !island) return res.status(404).json({ error: 'Island not found' });
    if (island.type !== 'test') return res.status(400).json({ error: 'Not a test island' });

    const { data: section, error: secErr } = await supabase
      .from('sections')
      .select('id, test_questions_count, pass_percent')
      .eq('id', island.section_id)
      .single();

    if (secErr || !section) return res.status(404).json({ error: 'Section not found' });

    const testCount = Number(section.test_questions_count || 6);
    const passPercent = Number(section.pass_percent || 60);

    // Load test exercises in order
    const { data: items, error: itemsErr } = await supabase
      .from('island_items')
      .select('order_index, exercise_id')
      .eq('island_id', island_id)
      .eq('item_type', 'exercise')
      .order('order_index', { ascending: true });

    if (itemsErr) return res.status(500).json({ error: 'Load items failed', details: itemsErr.message });

    const orderedExerciseIds = (items || []).map((x) => x.exercise_id).filter(Boolean);

    if (orderedExerciseIds.length !== testCount) {
      return res.status(400).json({
        error: `Expected exactly ${testCount} test exercises, got ${orderedExerciseIds.length}`,
      });
    }

    // Load attempts for these exercises (latest per exercise)
    const { data: attempts, error: attErr } = await supabase
      .from('exercise_attempts')
      .select('exercise_id, is_correct, created_at, answer')
      .eq('user_id', userId)
      .eq('island_id', island_id)
      .in('exercise_id', orderedExerciseIds)
      .order('created_at', { ascending: false });

    if (attErr) return res.status(500).json({ error: 'Load attempts failed', details: attErr.message });

    const latestByExercise = new Map();
    for (const a of attempts || []) {
      if (!latestByExercise.has(a.exercise_id)) latestByExercise.set(a.exercise_id, a);
    }

    // Load exercise types
    const { data: exRows, error: exRowsErr } = await supabase
      .from('exercises')
      .select('id, answer_type')
      .in('id', orderedExerciseIds);

    if (exRowsErr) {
      return res.status(500).json({ error: 'Load exercises failed', details: exRowsErr.message });
    }

    const exById = new Map((exRows || []).map((e) => [e.id, e]));

    // Load correct answers from admin-only table (service role bypasses RLS)
    const { data: keyRows, error: keyRowsErr } = await supabase
      .from('exercise_answer_keys')
      .select('exercise_id, answer_key')
      .in('exercise_id', orderedExerciseIds);

    if (keyRowsErr) {
      return res.status(500).json({ error: 'Load answer keys failed', details: keyRowsErr.message });
    }

    const keyByExerciseId = new Map((keyRows || []).map((k) => [k.exercise_id, k.answer_key]));

    const perQuestion = orderedExerciseIds.map((exId, idx) => {
      const latest = latestByExercise.get(exId);
      const answered = Boolean(latest);
      const is_correct = answered ? latest.is_correct === true : false; // unanswered counts as wrong

      const ex = exById.get(exId);
      const answer_type = ex?.answer_type || null;

      const answer_key = keyByExerciseId.get(exId) || null;

      let correct_answer = null;
      if (answer_type === 'abcd') correct_answer = answer_key?.correct ?? null;
      if (answer_type === 'numeric') correct_answer = answer_key?.value ?? null;

      return {
        index: idx + 1,
        exercise_id: exId,
        answered,
        is_correct,
        answer_type,
        user_answer: latest?.answer ?? null,
        correct_answer,
      };
    });

    const answeredCount = perQuestion.filter((x) => x.answered).length;
    const missingCount = testCount - answeredCount;
    const correctCount = perQuestion.filter((x) => x.is_correct).length;

    const score_percent = Math.round((correctCount / testCount) * 100);
    const passed = score_percent >= passPercent;

    // Store a test attempt snapshot
    const { error: insTestErr } = await supabase.from('section_test_attempts').insert({
      user_id: userId,
      section_id: island.section_id,
      score_percent,
      passed,
    });

    if (insTestErr) {
      return res.status(500).json({ error: 'Insert test attempt failed', details: insTestErr.message });
    }

    // Upsert best score in section_progress
    const { data: existing, error: existingErr } = await supabase
      .from('section_progress')
      .select('id, best_test_score_percent')
      .eq('user_id', userId)
      .eq('section_id', island.section_id)
      .maybeSingle();

    if (existingErr) {
      return res.status(500).json({ error: 'Load section_progress failed', details: existingErr.message });
    }

    const prevBest = existing?.best_test_score_percent || 0;
    const best_test_score_percent = Math.max(prevBest, score_percent);
    const completed = best_test_score_percent >= passPercent;

    if (existing?.id) {
      const { error: upErr } = await supabase
        .from('section_progress')
        .update({ best_test_score_percent, completed, updated_at: new Date().toISOString() })
        .eq('id', existing.id);

      if (upErr) return res.status(500).json({ error: 'Update section_progress failed', details: upErr.message });
    } else {
      const { error: upErr } = await supabase.from('section_progress').insert({
        user_id: userId,
        section_id: island.section_id,
        best_test_score_percent,
        completed,
        points_done: 0,
        points_catchup: 0,
        points_total: 0,
      });

      if (upErr) return res.status(500).json({ error: 'Insert section_progress failed', details: upErr.message });
    }

    return res.status(200).json({
      test_questions_count: testCount,
      pass_percent: passPercent,
      answeredCount,
      missingCount,
      correctCount,
      score_percent,
      passed,
      best_test_score_percent,
      perQuestion,
    });
  } catch (e) {
    console.error('submit-test crashed:', e);
    return res.status(500).json({ error: 'submit-test crashed', details: e?.message || String(e) });
  }
}