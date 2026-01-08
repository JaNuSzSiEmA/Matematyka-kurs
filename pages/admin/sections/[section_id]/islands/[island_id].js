import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import AdminGate from '../../../../../components/admin/AdminGate';
import { supabase } from '../../../../../lib/admin';

export default function AdminIslandItems() {
  const router = useRouter();
  const { island_id } = router.query;

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  const [island, setIsland] = useState(null);
  const [items, setItems] = useState([]);
  const [exercises, setExercises] = useState([]);

  const [newVideo, setNewVideo] = useState({ title: '', youtube_url: '', order_index: 1 });
  const [newExercise, setNewExercise] = useState({ exercise_id: '', order_index: 1, title: '' });

  const nextOrder = useMemo(() => {
    const max = (items || []).reduce((acc, it) => Math.max(acc, it.order_index ?? 0), 0);
    return max + 1;
  }, [items]);

  async function load() {
    if (!island_id) return;
    setLoading(true);
    setMsg('');

    const { data: isl, error: islErr } = await supabase
      .from('islands')
      .select('id, title, type, section_id')
      .eq('id', island_id)
      .single();

    if (islErr) {
      setMsg(islErr.message);
      setLoading(false);
      return;
    }
    setIsland(isl);

    const { data: its, error: itsErr } = await supabase
      .from('island_items')
      .select('id, item_type, order_index, title, youtube_url, exercise_id')
      .eq('island_id', island_id)
      .order('order_index', { ascending: true });

    if (itsErr) {
      setMsg(itsErr.message);
      setItems([]);
      setLoading(false);
      return;
    }
    setItems(its || []);

    const { data: ex, error: exErr } = await supabase
      .from('exercises')
      .select('id, prompt, answer_type, points_max')
      .order('created_at', { ascending: false });

    if (exErr) {
      setMsg(exErr.message);
      setExercises([]);
      setLoading(false);
      return;
    }
    setExercises(ex || []);

    setNewVideo((v) => ({ ...v, order_index: nextOrder }));
    setNewExercise((e) => ({ ...e, order_index: nextOrder }));

    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [island_id]);

  async function addVideo() {
    setMsg('');
    const payload = {
      island_id,
      item_type: 'video',
      title: newVideo.title || 'Wideo',
      youtube_url: newVideo.youtube_url,
      order_index: Number(newVideo.order_index),
    };

    const { error } = await supabase.from('island_items').insert(payload);
    if (error) {
      setMsg(error.message);
      return;
    }
    setNewVideo({ title: '', youtube_url: '', order_index: nextOrder + 1 });
    await load();
  }

  async function addExerciseItem() {
    setMsg('');
    if (!newExercise.exercise_id) {
      setMsg('Wybierz exercise_id.');
      return;
    }

    const payload = {
      island_id,
      item_type: 'exercise',
      title: newExercise.title || 'Zadanie',
      exercise_id: newExercise.exercise_id,
      order_index: Number(newExercise.order_index),
    };

    const { error } = await supabase.from('island_items').insert(payload);
    if (error) {
      setMsg(error.message);
      return;
    }
    setNewExercise({ exercise_id: '', order_index: nextOrder + 1, title: '' });
    await load();
  }

  async function deleteItem(itemId) {
    setMsg('');
    const ok = window.confirm('Usunąć item?');
    if (!ok) return;

    const { error } = await supabase.from('island_items').delete().eq('id', itemId);
    if (error) {
      setMsg(error.message);
      return;
    }
    await load();
  }

  async function updateItem(itemId, patch) {
    setMsg('');
    const { error } = await supabase.from('island_items').update(patch).eq('id', itemId);
    if (error) {
      setMsg(error.message);
      return;
    }
    await load();
  }

  return (
    <AdminGate>
      <div className="min-h-screen bg-white">
        <div className="mx-auto max-w-5xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <Link href="/admin/sections" className="text-sm font-semibold text-gray-700 underline">
                ← Sekcje
              </Link>
              <h1 className="mt-2 text-2xl font-bold text-gray-900">Zawartość wyspy</h1>
              <p className="mt-1 text-sm text-gray-600">
                {island ? (
                  <>
                    Wyspa: <b>{island.title}</b> ({island.type})
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
            <>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-gray-200 p-4">
                  <div className="font-semibold text-gray-900">Dodaj wideo</div>
                  <div className="mt-3 grid gap-2">
                    <input
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                      placeholder="Tytuł"
                      value={newVideo.title}
                      onChange={(e) => setNewVideo((p) => ({ ...p, title: e.target.value }))}
                    />
                    <input
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                      placeholder="YouTube URL"
                      value={newVideo.youtube_url}
                      onChange={(e) => setNewVideo((p) => ({ ...p, youtube_url: e.target.value }))}
                    />
                    <input
                      type="number"
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                      placeholder="order_index"
                      value={newVideo.order_index}
                      onChange={(e) => setNewVideo((p) => ({ ...p, order_index: e.target.value }))}
                    />
                    <button
                      type="button"
                      className="rounded-xl border border-gray-900 bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
                      onClick={addVideo}
                    >
                      Dodaj wideo
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 p-4">
                  <div className="font-semibold text-gray-900">Dodaj zadanie do wyspy</div>
                  <div className="mt-3 grid gap-2">
                    <input
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                      placeholder="Tytuł itemu (opcjonalnie)"
                      value={newExercise.title}
                      onChange={(e) => setNewExercise((p) => ({ ...p, title: e.target.value }))}
                    />

                    <select
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                      value={newExercise.exercise_id}
                      onChange={(e) => setNewExercise((p) => ({ ...p, exercise_id: e.target.value }))}
                    >
                      <option value="">Wybierz exercise…</option>
                      {exercises.map((ex) => (
                        <option key={ex.id} value={ex.id}>
                          {ex.answer_type} • {String(ex.prompt || '').slice(0, 60)}
                        </option>
                      ))}
                    </select>

                    <input
                      type="number"
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                      placeholder="order_index"
                      value={newExercise.order_index}
                      onChange={(e) => setNewExercise((p) => ({ ...p, order_index: e.target.value }))}
                    />

                    <button
                      type="button"
                      className="rounded-xl border border-indigo-700 bg-indigo-700 px-4 py-2 text-sm font-semibold text-white"
                      onClick={addExerciseItem}
                    >
                      Dodaj zadanie
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-gray-200 p-4">
                <div className="font-semibold text-gray-900">Elementy wyspy (order_index)</div>

                {items.length === 0 ? (
                  <div className="mt-2 text-sm text-gray-600">Brak elementów.</div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {items.map((it) => (
                      <div key={it.id} className="rounded-xl border border-gray-200 p-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="text-sm text-gray-900">
                            <b>#{it.order_index}</b> • {it.item_type}{' '}
                            {it.item_type === 'exercise' ? <span className="text-gray-600">({it.exercise_id})</span> : null}
                          </div>

                          <div className="flex gap-2">
                            <button
                              type="button"
                              className="rounded-lg border border-gray-300 bg-white px-3 py-1 text-sm"
                              onClick={() =>
                                updateItem(it.id, { order_index: Number(it.order_index) - 1 })
                              }
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              className="rounded-lg border border-gray-300 bg-white px-3 py-1 text-sm"
                              onClick={() =>
                                updateItem(it.id, { order_index: Number(it.order_index) + 1 })
                              }
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              className="rounded-lg border border-red-700 bg-red-700 px-3 py-1 text-sm font-semibold text-white"
                              onClick={() => deleteItem(it.id)}
                            >
                              Usuń
                            </button>
                          </div>
                        </div>

                        <div className="mt-3 grid gap-2 sm:grid-cols-3">
                          <label className="sm:col-span-2">
                            <div className="text-xs font-semibold text-gray-600">Tytuł</div>
                            <input
                              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                              defaultValue={it.title || ''}
                              onBlur={(e) => updateItem(it.id, { title: e.target.value })}
                            />
                            <div className="mt-1 text-xs text-gray-500">Zapis na blur.</div>
                          </label>

                          <label>
                            <div className="text-xs font-semibold text-gray-600">Order</div>
                            <input
                              type="number"
                              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                              defaultValue={it.order_index}
                              onBlur={(e) => updateItem(it.id, { order_index: Number(e.target.value) })}
                            />
                          </label>

                          {it.item_type === 'video' ? (
                            <label className="sm:col-span-3">
                              <div className="text-xs font-semibold text-gray-600">YouTube URL</div>
                              <input
                                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                                defaultValue={it.youtube_url || ''}
                                onBlur={(e) => updateItem(it.id, { youtube_url: e.target.value })}
                              />
                            </label>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </AdminGate>
  );
}
