import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

import AdminGate from '../../../../components/admin/AdminGate';
import { supabase } from '../../../../lib/admin';


export default function AdminSectionIslands() {
  const router = useRouter();
  const { section_id } = router.query;

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [section, setSection] = useState(null);
  const [islands, setIslands] = useState([]);
  const [drafts, setDrafts] = useState({}); // { [id]: { title, type, order_index, max_points, is_active } }

  async function load() {
    if (!section_id) return;
    setLoading(true);
    setMsg('');

    const { data: sec, error: secErr } = await supabase
      .from('sections')
      .select('id, title, slug, course_id')
      .eq('id', section_id)
      .single();

    if (secErr) {
      setMsg(secErr.message);
      setLoading(false);
      return;
    }
    setSection(sec);

    const { data: isl, error: islErr } = await supabase
      .from('islands')
      .select('id, title, type, order_index, max_points, is_active')
      .eq('section_id', section_id)
      .order('order_index', { ascending: true });

    if (islErr) {
      setMsg(islErr.message);
      setIslands([]);
      setLoading(false);
      return;
    }

    setIslands(isl || []);
    setDrafts(
      Object.fromEntries(
        (isl || []).map((x) => [
          x.id,
          {
            title: x.title ?? '',
            type: x.type ?? 'normal',
            order_index: x.order_index ?? 0,
            max_points: x.max_points ?? 0,
            is_active: x.is_active !== false,
          },
        ])
      )
    );

    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [section_id]);

  async function createIsland() {
    setMsg('');
    const order = (islands?.length || 0) + 1;

    // sensible defaults:
    // - normal island: max_points can be 0 (or you can set to sum of exercises later)
    // - test island: you might want max_points = test_questions_count (or points sum)
    const { error } = await supabase.from('islands').insert({
      section_id,
      title: `Wyspa ${order}`,
      type: 'normal',
      order_index: order,
      max_points: 0,
      is_active: true,
    });

    if (error) {
      setMsg(error.message);
      return;
    }
    await load();
  }

  async function saveIsland(id) {
    setMsg('');
    const d = drafts[id];
    if (!d) return;

    const { error } = await supabase
      .from('islands')
      .update({
        title: d.title,
        type: d.type,
        order_index: Number(d.order_index),
        max_points: Number(d.max_points),
        is_active: Boolean(d.is_active),
      })
      .eq('id', id);

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
              <h1 className="mt-2 text-2xl font-bold text-gray-900">Wyspy w sekcji</h1>
              <p className="mt-1 text-sm text-gray-600">
                {section ? (
                  <>
                    Sekcja: <b>{section.title}</b> (<code>{section.slug}</code>) • course_id:{' '}
                    <code>{section.course_id}</code>
                  </>
                ) : (
                  '—'
                )}
              </p>
            </div>

            <button
              type="button"
              className="rounded-xl border border-gray-900 bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
              onClick={createIsland}
            >
              + Dodaj wyspę
            </button>
          </div>

          {msg ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{msg}</div>
          ) : null}

          {loading ? (
            <div className="mt-6 text-sm text-gray-700">Ładowanie…</div>
          ) : (
            <div className="mt-6 space-y-4">
              {islands.map((isl) => {
                const d = drafts[isl.id] || {};
                return (
                  <div key={isl.id} className="rounded-2xl border border-gray-200 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="text-xs font-semibold text-gray-500">ISLAND</div>
                        <div className="mt-1 text-lg font-semibold text-gray-900">{isl.title}</div>
                      </div>

                      <Link
                        href={`/admin/islands/${isl.id}`}
                        className="rounded-xl border border-indigo-700 bg-indigo-700 px-4 py-2 text-sm font-semibold text-white"
                      >
                        Edytuj zawartość →
                      </Link>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-5">
                      <label className="sm:col-span-2">
                        <div className="text-xs font-semibold text-gray-600">Tytuł</div>
                        <input
                          className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                          value={d.title ?? ''}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [isl.id]: { ...(prev[isl.id] || {}), title: e.target.value },
                            }))
                          }
                        />
                      </label>

                      <label>
                        <div className="text-xs font-semibold text-gray-600">Typ</div>
                        <select
                          className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                          value={d.type ?? 'normal'}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [isl.id]: { ...(prev[isl.id] || {}), type: e.target.value },
                            }))
                          }
                        >
                          <option value="normal">normal</option>
                          <option value="test">test</option>
                        </select>
                      </label>

                      <label>
                        <div className="text-xs font-semibold text-gray-600">Order</div>
                        <input
                          type="number"
                          className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                          value={d.order_index ?? 0}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [isl.id]: { ...(prev[isl.id] || {}), order_index: e.target.value },
                            }))
                          }
                        />
                      </label>

                      <label>
                        <div className="text-xs font-semibold text-gray-600">max_points</div>
                        <input
                          type="number"
                          className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                          value={d.max_points ?? 0}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [isl.id]: { ...(prev[isl.id] || {}), max_points: e.target.value },
                            }))
                          }
                        />
                      </label>

                      <label className="sm:col-span-2">
                        <div className="text-xs font-semibold text-gray-600">Aktywna</div>
                        <div className="mt-2 flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={Boolean(d.is_active)}
                            onChange={(e) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [isl.id]: { ...(prev[isl.id] || {}), is_active: e.target.checked },
                              }))
                            }
                          />
                          <span className="text-sm text-gray-700">is_active</span>
                        </div>
                      </label>
                    </div>

                    <div className="mt-4">
                      <button
                        type="button"
                        className="rounded-xl border border-gray-900 bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
                        onClick={() => saveIsland(isl.id)}
                      >
                        Zapisz wyspę
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
