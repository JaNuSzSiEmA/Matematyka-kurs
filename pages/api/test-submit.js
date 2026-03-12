import { requireServerEnvs, getUserFromRequest } from './_auth';

function normalizeNumeric(v) {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const s = String(v).trim().replace(/,/g, '.');
  if (!s) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');

    const supabase = requireServerEnvs(res);
    if (!supabase) return;

    const auth = await getUserFromRequest(req, res, supabase);
    if (!auth) return;

    const userId = auth.user.id;

    const { island_id, answers } = req.body || {};
    if (!island_id) return res.status(400).json({ error: 'Missing island_id' });

    // Check if already completed
    const { data: existingResult } = await supabase
      .from('island_test_results')
      .select('id, score_percent, points_earned, points_max, passed, finished_at, answers')
      .eq('user_id', userId)
      .eq('island_id', island_id)
      .maybeSingle();

    if (existingResult) {
      return res.status(200).json({
        already_completed: true,
        score_percent: existingResult.score_percent,
        points_earned: existingResult.points_earned,
        points_max: existingResult.points_max,
        passed: existingResult.passed,
        finished_at: existingResult.finished_at,
      });
    }

    // Load island for passing_score_percent
    const { data: island, error: islErr } = await supabase
      .from('islands')
      .select('id, type, passing_score_percent')
      .eq('id', island_id)
      .single();

    if (islErr || !island) return res.status(404).json({ error: 'Island not found' });
    if (island.type !== 'test') return res.status(400).json({ error: 'Not a test island' });

    const passingScorePercent = Number(island.passing_score_percent ?? 50);

    // Load active session
    const { data: session } = await supabase
      .from('island_test_sessions')
      .select('id, started_at, is_active')
      .eq('user_id', userId)
      .eq('island_id', island_id)
      .eq('is_active', true)
      .maybeSingle();

    // Session may have expired — still allow submit (timer = 0 triggered submit)

    // Load test items with exercises and answer keys
    const { data: testItems, error: itemsErr } = await supabase
      .from('island_test_items')
      .select(
        `
        id,
        exercise_id,
        test_points,
        order_index,
        exercises:exercise_id (
          id,
          answer_type,
          difficulty
        )
      `
      )
      .eq('island_id', island_id)
      .order('order_index', { ascending: true });

    if (itemsErr) return res.status(500).json({ error: 'Load test items failed', details: itemsErr.message });

    const exerciseIds = (testItems || []).map((t) => t.exercise_id).filter(Boolean);

    let keyMap = {};
    if (exerciseIds.length > 0) {
      const { data: keyRows, error: keyErr } = await supabase
        .from('exercise_answer_keys')
        .select('exercise_id, answer_key')
        .in('exercise_id', exerciseIds);

      if (keyErr) return res.status(500).json({ error: 'Load answer keys failed', details: keyErr.message });
      keyMap = Object.fromEntries((keyRows || []).map((k) => [k.exercise_id, k.answer_key]));
    }

    let pointsEarned = 0;
    let pointsMax = 0;
    const perQuestion = [];
    const answersSnapshot = {};

    for (const item of testItems || []) {
      const tp = Number(item.test_points || 1);
      pointsMax += tp;

      const ex = item.exercises;
      const answerType = ex?.answer_type;
      const userAnswer = answers?.[item.exercise_id] || null;
      const answerKey = keyMap[item.exercise_id] || null;

      let isCorrect = false;

      if (userAnswer && answerKey) {
        if (answerType === 'numeric') {
          const userVal = normalizeNumeric(userAnswer?.value);
          const correctVal = normalizeNumeric(answerKey?.value);
          isCorrect = userVal !== null && correctVal !== null && userVal === correctVal;
        } else if (answerType === 'abcd') {
          const userChoice = String(userAnswer?.choice || '').trim().toUpperCase();
          const correct = String(answerKey?.correct || '').trim().toUpperCase();
          isCorrect = Boolean(userChoice) && userChoice === correct;
        }
      }

      if (isCorrect) pointsEarned += tp;

      let correctAnswer = null;
      if (answerType === 'abcd') correctAnswer = answerKey?.correct ?? null;
      if (answerType === 'numeric') correctAnswer = answerKey?.value ?? null;

      answersSnapshot[item.exercise_id] = {
        user_answer: userAnswer,
        is_correct: isCorrect,
        correct_answer: correctAnswer,
        answer_type: answerType,
        test_points: tp,
      };

      perQuestion.push({
        exercise_id: item.exercise_id,
        test_points: tp,
        answered: Boolean(userAnswer),
        is_correct: isCorrect,
        answer_type: answerType,
        user_answer: userAnswer,
        correct_answer: correctAnswer,
      });
    }

    const scorePercent = pointsMax > 0 ? Math.round((pointsEarned / pointsMax) * 100) : 0;
    const passed = scorePercent >= passingScorePercent;

    // Save result
    const { error: resErr } = await supabase.from('island_test_results').upsert(
      {
        user_id: userId,
        island_id,
        score_percent: scorePercent,
        points_earned: pointsEarned,
        points_max: pointsMax,
        passed,
        answers: answersSnapshot,
        started_at: session?.started_at || null,
        finished_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,island_id' }
    );

    if (resErr) return res.status(500).json({ error: 'Save result failed', details: resErr.message });

    // Deactivate session
    if (session?.id) {
      await supabase.from('island_test_sessions').update({ is_active: false }).eq('id', session.id);
    }

    return res.status(200).json({
      score_percent: scorePercent,
      points_earned: pointsEarned,
      points_max: pointsMax,
      passed,
      passing_score_percent: passingScorePercent,
      per_question: perQuestion,
    });
  } catch (e) {
    console.error('test-submit crashed:', e);
    return res.status(500).json({ error: 'test-submit crashed', details: e?.message || String(e) });
  }
}
