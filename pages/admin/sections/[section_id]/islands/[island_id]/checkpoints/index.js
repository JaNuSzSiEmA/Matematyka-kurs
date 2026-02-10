import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import AdminGate from '../../../../../../../components/admin/AdminGate';
import { supabase } from '../../../../../../../lib/admin';

export default function AdminIslandCheckpoints() {
  const router = useRouter();
  const { section_id, island_id } = router.query;

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [island, setIsland] = useState(null);
  const [checkpoints, setCheckpoints] = useState([]);
  const [drafts, setDrafts] = useState({});

  async function load() {
    if (!island_id) return;
    setLoading(true);
    setMsg('');

    const { data: isl, error: islErr } = await supabase
      .from('islands')
      .select('id, title, section_id')
      .eq('id', island_id)
      .single();

    if (islErr) {
      setMsg(islErr.message);
      setLoading(false);
      return;
    }
    setIsland(isl);

    const { data: cps, error: cpsErr } = await supabase
      .from('island_checkpoints')
      .select('id, title, order_index, is_active')
      .eq('island_id', island_id)
      .order('order_index', { ascending: true });

    if (cpsErr) {
      setMsg(cpsErr.message);
      setCheckpoints([]);
      setLoading(false);
      return;
    }

    setCheckpoints(cps || []);
    setDrafts(
      Object.fromEntries(
        (cps || []).map((c) => [
          c.id,
          {
            title: c.title ?? '',
            order_index: c.order_index ?? 1,
            is_active: c.is_active !== false,
          },
        ])
      )
    );

    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [island_id]);

  async function addCheckpoint() {
    setMsg('');
    const order = (checkpoints?.length || 0) + 1;

    const { error } = await supabase.from('island_checkpoints').insert({
      island_id,
      title: `Checkpoint ${order}`,
      order_index: order,
      is_active: true,
    });

    if (error) {
      setMsg(error.message);
      return;
    }
    await load();
  }

  async function saveCheckpoint(id) {
    setMsg('');
    const d = drafts[id];
    if (!d) return;

    const { error } = await supabase
      .from('island_checkpoints')
      .update({
        title: d.title,
        order_index: Number(d.order_index),
        is_active: Boolean(d.is_active),
      })
      .eq('id', id);

    if (error) {
      setMsg(error.message);
      return;
    }
    await load();
  }
    async function deleteCheckpoint(checkpointId) {
    setMsg('');

    const { count, error: countErr } = await supabase
      .from('island_checkpoint_items')
      .select('id', { count: 'exact' })
      .eq('checkpoint_id', checkpointId);

    if (countErr) {
      setMsg(countErr.message);
      return;
    }

    const taskCount = count || 0;
    const ok = window.confirm(`Na pewno usunąć checkpoint? Znajduje się w nim ${taskCount} zadań.`);
    if (!ok) return;

    const { error } = await supabase.from('island_checkpoints').delete().eq('id', checkpointId);
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
              <Link
                href={section_id ? `/admin/sections/${section_id}/islands` : '/admin/sections'}
                className="text-sm font-semibold text-gray-700 underline"
              >
                ← Wyspy
              </Link>
              <h1 className="mt-2 text-2xl font-bold text-gray-900">Checkpointy wyspy</h1>
              <p className="mt-1 text-sm text-gray-600">
                {island ? <>Wyspa: <b>{island.title}</b></> : '—'}
              </p>
            </div>

            <button
              type="button"
              className="rounded-xl border border-gray-900 bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
              onClick={addCheckpoint}
            >
              + Dodaj checkpoint
            </button>
          </div>

          {msg ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{msg}</div>
          ) : null}

          {loading ? (
            <div className="mt-6 text-sm text-gray-700">Ładowanie…</div>
          ) : (
            <div className="mt-6 space-y-4">
              {checkpoints.map((cp) => {
                const d = drafts[cp.id] || {};
                return (
                  <div key={cp.id} className="rounded-2xl border border-gray-200 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="text-xs font-semibold text-gray-500">CHECKPOINT</div>
                        <div className="mt-1 text-lg font-semibold text-gray-900">{cp.title}</div>
                      </div>

                      <Link
                        href={`/admin/sections/${section_id}/islands/${island_id}/checkpoints/${cp.id}`}
                        className="rounded-xl border border-indigo-700 bg-indigo-700 px-4 py-2 text-sm font-semibold text-white"
                      >
                        Edytuj zawartość →
                      </Link>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-4">
                      <label className="sm:col-span-2">
                        <div className="text-xs font-semibold text-gray-600">Tytuł</div>
                        <input
                          className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                          value={d.title ?? ''}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [cp.id]: { ...(prev[cp.id] || {}), title: e.target.value },
                            }))
                          }
                        />
                      </label>

                      <label>
                        <div className="text-xs font-semibold text-gray-600">Order</div>
                        <input
                          type="number"
                          className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                          value={d.order_index ?? 1}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [cp.id]: { ...(prev[cp.id] || {}), order_index: e.target.value },
                            }))
                          }
                        />
                      </label>

                      <label>
                        <div className="text-xs font-semibold text-gray-600">Aktywny</div>
                        <div className="mt-2 flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={Boolean(d.is_active)}
                            onChange={(e) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [cp.id]: { ...(prev[cp.id] || {}), is_active: e.target.checked },
                              }))
                            }
                          />
                          <span className="text-sm text-gray-700">is_active</span>
                        </div>
                      </label>
                    </div>

                    <div className="mt-4 flex items-center justify-end gap-2">
  <button
    type="button"
    className="rounded-xl border border-gray-900 bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
    onClick={() => saveCheckpoint(cp.id)}
  >
    Zapisz checkpoint
  </button>

  <button
    type="button"
    className="rounded-xl border border-red-700 bg-red-700 px-4 py-2 text-sm font-semibold text-white"
    onClick={() => deleteCheckpoint(cp.id)}
  >
    Usuń checkpoint
  </button>
</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AdminGate>
  );
}