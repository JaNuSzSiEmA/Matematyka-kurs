import { useEffect, useState } from 'react';
import Link from 'next/link';
import AdminGate from '../../components/admin/AdminGate';
import { supabase } from '../../lib/admin';

function getCourseLabel(c) {
  return c?.title || c?.name || c?.slug || c?.id || 'course';
}

export default function AdminSections() {
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  const [courses, setCourses] = useState([]);
  const [sections, setSections] = useState([]);
  const [drafts, setDrafts] = useState({}); // { [id]: { ... } }

  async function load() {
    setLoading(true);
    setMsg('');

    const { data: courseRows, error: courseErr } = await supabase
      .from('courses')
      .select('*')
      .order('title', { ascending: true });

    if (courseErr) {
      setMsg(`Load courses failed: ${courseErr.message}`);
      setCourses([]);
    } else {
      setCourses(courseRows || []);
    }

    const { data, error } = await supabase
      .from('sections')
      .select('id, course_id, title, slug, order_index, is_free, test_questions_count, pass_percent')
      .order('order_index', { ascending: true });

    if (error) {
      setMsg(error.message);
      setSections([]);
      setLoading(false);
      return;
    }

    setSections(data || []);
    setDrafts(
      Object.fromEntries(
        (data || []).map((s) => [
          s.id,
          {
            course_id: s.course_id ?? '',
            title: s.title ?? '',
            slug: s.slug ?? '',
            order_index: s.order_index ?? 0,
            is_free: Boolean(s.is_free),
            test_questions_count: s.test_questions_count ?? 6,
            pass_percent: s.pass_percent ?? 60,
          },
        ])
      )
    );

    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function saveSection(sectionId) {
    setMsg('');
    const d = drafts[sectionId];
    if (!d) return;

    if (!d.course_id) {
      setMsg('course_id is required');
      return;
    }

    const patch = {
      course_id: String(d.course_id),
      title: d.title,
      slug: d.slug,
      order_index: Number(d.order_index),
      is_free: Boolean(d.is_free),
      test_questions_count: Number(d.test_questions_count),
      pass_percent: Number(d.pass_percent),
    };

    const { error } = await supabase.from('sections').update(patch).eq('id', sectionId);
    if (error) {
      setMsg(error.message);
      return;
    }
    await load();
  }

  async function createSection() {
    setMsg('');

    const defaultCourseId =
      courses?.[0]?.course_id ?? (courses?.[0]?.id ? String(courses[0].id) : '');

    if (!defaultCourseId) {
      setMsg('No courses found. Create a course first.');
      return;
    }

    const { error } = await supabase.from('sections').insert({
      course_id: String(defaultCourseId),
      title: 'Nowa sekcja',
      slug: `sekcja-${Date.now()}`,
      order_index: (sections?.length || 0) + 1,
      is_free: false,
      test_questions_count: 6,
      pass_percent: 60,
    });

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
              <Link href="/admin" className="text-sm font-semibold text-gray-700 underline">
                ← Admin
              </Link>
              <h1 className="mt-2 text-2xl font-bold text-gray-900">Sekcje</h1>
              <p className="mt-1 text-sm text-gray-600">
                Wymagane: <code>course_id</code>, <code>is_free</code>.
              </p>
            </div>

            <button
              type="button"
              className="rounded-xl border border-gray-900 bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
              onClick={createSection}
            >
              + Dodaj sekcję
            </button>
          </div>

          {msg ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{msg}</div>
          ) : null}

          {loading ? (
            <div className="mt-6 text-sm text-gray-700">Ładowanie…</div>
          ) : (
            <div className="mt-6 space-y-4">
              {sections.map((s) => {
                const d = drafts[s.id] || {};
                return (
                  <div key={s.id} className="rounded-2xl border border-gray-200 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="text-xs font-semibold text-gray-500">SECTION</div>
                        <div className="mt-1 text-lg font-semibold text-gray-900">{s.title}</div>
                        <div className="mt-1 text-sm text-gray-600">
                          slug: <code>{s.slug}</code>
                        </div>
                      </div>

                      <Link
                        href={`/admin/sections/${s.id}/islands`}
                        className="rounded-xl border border-gray-900 bg-white px-4 py-2 text-sm font-semibold text-gray-900"
                      >
                        Zarządzaj wyspami →
                      </Link>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-6">
                      <label className="sm:col-span-2">
                        <div className="text-xs font-semibold text-gray-600">Course</div>
                        <select
                          className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                          value={d.course_id ?? ''}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [s.id]: { ...(prev[s.id] || {}), course_id: e.target.value },
                            }))
                          }
                        >
                          <option value="">Wybierz…</option>
                          {courses.map((c) => {
                            const val = c.course_id ?? String(c.id);
                            return (
                              <option key={val} value={val}>
                                {getCourseLabel(c)}
                              </option>
                            );
                          })}
                        </select>
                      </label>

                      <label className="sm:col-span-2">
                        <div className="text-xs font-semibold text-gray-600">Tytuł</div>
                        <input
                          className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                          value={d.title ?? ''}
                          onChange={(e) =>
                            setDrafts((prev) => ({ ...prev, [s.id]: { ...(prev[s.id] || {}), title: e.target.value } }))
                          }
                        />
                      </label>

                      <label className="sm:col-span-1">
                        <div className="text-xs font-semibold text-gray-600">Slug</div>
                        <input
                          className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                          value={d.slug ?? ''}
                          onChange={(e) =>
                            setDrafts((prev) => ({ ...prev, [s.id]: { ...(prev[s.id] || {}), slug: e.target.value } }))
                          }
                        />
                      </label>

                      <label className="sm:col-span-1">
                        <div className="text-xs font-semibold text-gray-600">Order</div>
                        <input
                          type="number"
                          className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                          value={d.order_index ?? 0}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [s.id]: { ...(prev[s.id] || {}), order_index: e.target.value },
                            }))
                          }
                        />
                      </label>

                      <label className="sm:col-span-2">
                        <div className="text-xs font-semibold text-gray-600">Aktywna / Free</div>
                        <div className="mt-2 flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={Boolean(d.is_free)}
                            onChange={(e) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [s.id]: { ...(prev[s.id] || {}), is_free: e.target.checked },
                              }))
                            }
                          />
                          <span className="text-sm text-gray-700">is_free</span>
                        </div>
                      </label>

                      <label className="sm:col-span-2">
                        <div className="text-xs font-semibold text-gray-600">Test pytań</div>
                        <input
                          type="number"
                          className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                          value={d.test_questions_count ?? 6}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [s.id]: { ...(prev[s.id] || {}), test_questions_count: e.target.value },
                            }))
                          }
                        />
                      </label>

                      <label className="sm:col-span-2">
                        <div className="text-xs font-semibold text-gray-600">Próg %</div>
                        <input
                          type="number"
                          className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                          value={d.pass_percent ?? 60}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [s.id]: { ...(prev[s.id] || {}), pass_percent: e.target.value },
                            }))
                          }
                        />
                      </label>
                    </div>

                    <div className="mt-4">
                      <button
                        type="button"
                        className="rounded-xl border border-indigo-700 bg-indigo-700 px-4 py-2 text-sm font-semibold text-white"
                        onClick={() => saveSection(s.id)}
                      >
                        Zapisz
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