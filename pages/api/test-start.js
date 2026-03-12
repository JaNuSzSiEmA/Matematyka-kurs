import { requireServerEnvs, getUserFromRequest } from './_auth';

function shuffleByDifficulty(exercises) {
  const groups = {};
  for (const ex of exercises) {
    const d = ex.difficulty || 1;
    if (!groups[d]) groups[d] = [];
    groups[d].push(ex);
  }
  const result = [];
  for (const d of [1, 2, 3, 4, 5]) {
    if (!groups[d]) continue;
    const arr = [...groups[d]];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    result.push(...arr);
  }
  return result;
}

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

    // Load island
    const { data: island, error: islErr } = await supabase
      .from('islands')
      .select('id, title, type, time_limit_seconds, passing_score_percent, intro_script')
      .eq('id', island_id)
      .single();

    if (islErr || !island) return res.status(404).json({ error: 'Island not found' });
    if (island.type !== 'test') return res.status(400).json({ error: 'Not a test island' });

    const timeLimitSeconds = Number(island.time_limit_seconds || 1800);
    const passingScorePercent = Number(island.passing_score_percent ?? 50);

    // Check if already completed
    const { data: existingResult } = await supabase
      .from('island_test_results')
      .select('id, score_percent, points_earned, points_max, passed, finished_at')
      .eq('user_id', userId)
      .eq('island_id', island_id)
      .maybeSingle();

    if (existingResult) {
      return res.status(200).json({ already_completed: true, result: existingResult });
    }

    // Check if active session exists
    const { data: existingSession } = await supabase
      .from('island_test_sessions')
      .select('id, started_at, expires_at, paused_at, pause_remaining_seconds, is_active')
      .eq('user_id', userId)
      .eq('island_id', island_id)
      .eq('is_active', true)
      .maybeSingle();

    if (existingSession) {
      // Return existing session (active or paused) with exercises
      const exercises = await loadTestExercises(supabase, island_id);
      return res.status(200).json({
        session_id: existingSession.id,
        expires_at: existingSession.expires_at,
        paused_at: existingSession.paused_at || null,
        pause_remaining_seconds: existingSession.pause_remaining_seconds || null,
        time_limit_seconds: timeLimitSeconds,
        passing_score_percent: passingScorePercent,
        exercises,
      });
    }

    // Load test exercises
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
          prompt,
          description,
          answer_type,
          points_max,
          difficulty,
          image_url,
          hints
        )
      `
      )
      .eq('island_id', island_id)
      .order('order_index', { ascending: true });

    if (itemsErr) return res.status(500).json({ error: 'Load test items failed', details: itemsErr.message });

    const exerciseIds = (testItems || []).map((t) => t.exercise_id).filter(Boolean);

    // Load answer keys (to validate later, not sent to client)
    let answerKeyMap = {};
    if (exerciseIds.length > 0) {
      const { data: keyRows } = await supabase
        .from('exercise_answer_keys')
        .select('exercise_id, answer_key')
        .in('exercise_id', exerciseIds);
      answerKeyMap = Object.fromEntries((keyRows || []).map((k) => [k.exercise_id, k.answer_key]));
    }

    // Build exercises list (without answer keys)
    const exercisesRaw = (testItems || []).map((item) => ({
      test_item_id: item.id,
      exercise_id: item.exercise_id,
      test_points: item.test_points,
      order_index: item.order_index,
      ...(item.exercises || {}),
    }));

    // Shuffle by difficulty
    const shuffled = shuffleByDifficulty(exercisesRaw);

    // Create new session
    const expiresAt = new Date(Date.now() + timeLimitSeconds * 1000).toISOString();

    // Upsert session (handles case where inactive session exists)
    const { data: session, error: sessErr } = await supabase
      .from('island_test_sessions')
      .upsert(
        {
          user_id: userId,
          island_id,
          started_at: new Date().toISOString(),
          expires_at: expiresAt,
          paused_at: null,
          pause_remaining_seconds: null,
          is_active: true,
        },
        { onConflict: 'user_id,island_id' }
      )
      .select('id, expires_at')
      .single();

    if (sessErr) return res.status(500).json({ error: 'Create session failed', details: sessErr.message });

    return res.status(200).json({
      session_id: session.id,
      expires_at: session.expires_at,
      time_limit_seconds: timeLimitSeconds,
      passing_score_percent: passingScorePercent,
      exercises: shuffled,
    });
  } catch (e) {
    console.error('test-start crashed:', e);
    return res.status(500).json({ error: 'test-start crashed', details: e?.message || String(e) });
  }
}

async function loadTestExercises(supabase, island_id) {
  const { data: testItems } = await supabase
    .from('island_test_items')
    .select(
      `
      id,
      exercise_id,
      test_points,
      order_index,
      exercises:exercise_id (
        id,
        prompt,
        description,
        answer_type,
        points_max,
        difficulty,
        image_url,
        hints
      )
    `
    )
    .eq('island_id', island_id)
    .order('order_index', { ascending: true });

  return shuffleByDifficulty(
    (testItems || []).map((item) => ({
      test_item_id: item.id,
      exercise_id: item.exercise_id,
      test_points: item.test_points,
      order_index: item.order_index,
      ...(item.exercises || {}),
    }))
  );
}
