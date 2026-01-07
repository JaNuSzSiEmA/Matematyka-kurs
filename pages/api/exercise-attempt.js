import { requireServerEnvs, getUserFromRequest } from './_auth';

function normalizeNumeric(v) {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const s = String(v).trim().replace(',', '.');
  if (!s) return null;
  const n = Number(s);
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

    const { exercise_id, island_id, answer, time_spent_sec } = req.body || {};
    if (!exercise_id || !island_id) {
      return res.status(400).json({ error: 'Missing exercise_id or island_id' });
    }

    const { data: ex, error: exErr } = await supabase
      .from('exercises')
      .select('id, answer_type, points_max')
      .eq('id', exercise_id)
      .single();

    if (exErr || !ex) return res.status(404).json({ error: 'Exercise not found' });

    const { data: keyRow, error: keyErr } = await supabase
      .from('exercise_answer_keys')
      .select('answer_key')
      .eq('exercise_id', exercise_id)
      .single();

    if (keyErr || !keyRow?.answer_key) {
      return res.status(500).json({ error: 'Missing answer key for exercise', details: keyErr?.message });
    }

    const answer_key = keyRow.answer_key;

    let is_correct = false;

    if (ex.answer_type === 'numeric') {
      const userVal = normalizeNumeric(answer?.value);
      const correctVal = normalizeNumeric(answer_key?.value);
      is_correct = userVal !== null && correctVal !== null && userVal === correctVal;
    } else if (ex.answer_type === 'abcd') {
      const userChoice = String(answer?.choice || '').trim().toUpperCase();
      const correct = String(answer_key?.correct || '').trim().toUpperCase();
      is_correct = Boolean(userChoice) && userChoice === correct;
    } else {
      return res.status(400).json({ error: `Unsupported answer_type: ${ex.answer_type}` });
    }

    const points_awarded = is_correct ? ex.points_max : 0;

    const { error: insErr } = await supabase.from('exercise_attempts').insert({
      user_id: userId,
      exercise_id: ex.id,
      island_id,
      answer,
      is_correct,
      points_awarded,
      time_spent_sec: Math.max(0, Number(time_spent_sec || 0) || 0),
    });

    if (insErr) {
      return res.status(500).json({ error: 'DB insert failed', details: insErr.message });
    }

    return res.status(200).json({ is_correct, points_awarded });
  } catch (e) {
    console.error('exercise-attempt crashed:', e);
    return res.status(500).json({ error: 'exercise-attempt crashed', details: e?.message || String(e) });
  }
}