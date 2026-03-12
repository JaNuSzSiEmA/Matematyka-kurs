import { requireServerEnvs, getUserFromRequest } from './_auth';

async function autoSubmitExpiredTest(supabase, userId, island_id, session) {
  // Load test items + answer keys
  const { data: testItems, error: itemsErr } = await supabase
    .from('island_test_items')
    .select(
      `id, exercise_id, test_points, exercises:exercise_id (id, answer_type)`
    )
    .eq('island_id', island_id);

  if (itemsErr || !testItems) return null;

  const exerciseIds = testItems.map((t) => t.exercise_id).filter(Boolean);

  const { data: keyRows } = await supabase
    .from('exercise_answer_keys')
    .select('exercise_id, answer_key')
    .in('exercise_id', exerciseIds);
  const keyMap = Object.fromEntries((keyRows || []).map((k) => [k.exercise_id, k.answer_key]));

  // Load existing attempts
  const { data: attempts } = await supabase
    .from('exercise_attempts')
    .select('exercise_id, is_correct, answer, created_at')
    .eq('user_id', userId)
    .eq('island_id', island_id)
    .in('exercise_id', exerciseIds)
    .order('created_at', { ascending: false });

  const latestByExercise = new Map();
  for (const a of attempts || []) {
    if (!latestByExercise.has(a.exercise_id)) latestByExercise.set(a.exercise_id, a);
  }

  const { data: island } = await supabase
    .from('islands')
    .select('passing_score_percent')
    .eq('id', island_id)
    .single();
  const passingScorePercent = Number(island?.passing_score_percent ?? 50);

  let pointsEarned = 0;
  let pointsMax = 0;
  const answersSnapshot = {};

  for (const item of testItems) {
    const tp = Number(item.test_points || 1);
    pointsMax += tp;
    const attempt = latestByExercise.get(item.exercise_id);
    const answerKey = keyMap[item.exercise_id] || null;
    const answerType = item.exercises?.answer_type || null;
    const isCorrect = Boolean(attempt?.is_correct);
    if (isCorrect) pointsEarned += tp;

    let correctAnswer = null;
    if (answerType === 'abcd') correctAnswer = answerKey?.correct ?? null;
    if (answerType === 'numeric') correctAnswer = answerKey?.value ?? null;

    answersSnapshot[item.exercise_id] = {
      user_answer: attempt?.answer ?? null,
      is_correct: isCorrect,
      correct_answer: correctAnswer,
      answer_type: answerType,
      test_points: tp,
    };
  }

  const scorePercent = pointsMax > 0 ? Math.round((pointsEarned / pointsMax) * 100) : 0;
  const passed = scorePercent >= passingScorePercent;

  const { data: result, error: resErr } = await supabase
    .from('island_test_results')
    .upsert(
      {
        user_id: userId,
        island_id,
        score_percent: scorePercent,
        points_earned: pointsEarned,
        points_max: pointsMax,
        passed,
        answers: answersSnapshot,
        started_at: session.started_at,
        finished_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,island_id' }
    )
    .select('id, score_percent, points_earned, points_max, passed, finished_at')
    .single();

  if (!resErr) {
    await supabase
      .from('island_test_sessions')
      .update({ is_active: false })
      .eq('id', session.id);
  }

  return result || null;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).end('Method Not Allowed');

    const supabase = requireServerEnvs(res);
    if (!supabase) return;

    const auth = await getUserFromRequest(req, res, supabase);
    if (!auth) return;

    const userId = auth.user.id;

    const { island_id } = req.query || {};
    if (!island_id) return res.status(400).json({ error: 'Missing island_id' });

    // Check if already completed
    const { data: existingResult } = await supabase
      .from('island_test_results')
      .select('id, score_percent, points_earned, points_max, passed, finished_at, answers')
      .eq('user_id', userId)
      .eq('island_id', island_id)
      .maybeSingle();

    if (existingResult) {
      return res.status(200).json({ phase: 'finished', result: existingResult });
    }

    // Check active session
    const { data: session } = await supabase
      .from('island_test_sessions')
      .select('id, started_at, expires_at, paused_at, pause_remaining_seconds, is_active')
      .eq('user_id', userId)
      .eq('island_id', island_id)
      .eq('is_active', true)
      .maybeSingle();

    if (!session) {
      return res.status(200).json({ phase: 'intro' });
    }

    // Paused
    if (session.paused_at) {
      return res.status(200).json({
        phase: 'paused',
        session_id: session.id,
        pause_remaining_seconds: session.pause_remaining_seconds,
        expires_at: session.expires_at,
      });
    }

    const now = Date.now();
    const expiresAt = new Date(session.expires_at).getTime();

    // Expired — auto submit
    if (expiresAt <= now) {
      const result = await autoSubmitExpiredTest(supabase, userId, island_id, session);
      return res.status(200).json({ phase: 'finished', result });
    }

    const timeRemainingSeconds = Math.max(0, Math.floor((expiresAt - now) / 1000));

    return res.status(200).json({
      phase: 'active',
      session_id: session.id,
      expires_at: session.expires_at,
      time_remaining_seconds: timeRemainingSeconds,
    });
  } catch (e) {
    console.error('test-status crashed:', e);
    return res.status(500).json({ error: 'test-status crashed', details: e?.message || String(e) });
  }
}
