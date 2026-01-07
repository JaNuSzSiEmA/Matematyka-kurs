import Link from 'next/link';
import AdminGate from '../../components/admin/AdminGate';

export default function AdminIndex() {
  return (
    <AdminGate>
      <div className="min-h-screen bg-white">
        <div className="mx-auto max-w-4xl p-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">Admin</h1>
            <Link href="/dashboard" className="text-sm font-semibold text-gray-700 underline">
              ← Panel
            </Link>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Link href="/admin/sections" className="rounded-2xl border border-gray-200 p-4 hover:bg-gray-50">
              <div className="font-semibold text-gray-900">Sekcje</div>
              <div className="mt-1 text-sm text-gray-600">Reguły testów, kolejność, tytuły</div>
            </Link>

            <Link href="/admin/exercises" className="rounded-2xl border border-gray-200 p-4 hover:bg-gray-50">
              <div className="font-semibold text-gray-900">Zadania</div>
              <div className="mt-1 text-sm text-gray-600">Stary widok (edytowanie listy)</div>
            </Link>

            <Link href="/admin/exercise-bank" className="rounded-2xl border border-gray-200 p-4 hover:bg-gray-50">
              <div className="font-semibold text-gray-900">Exercise Bank</div>
              <div className="mt-1 text-sm text-gray-600">
                Szybkie dodawanie + topic + flagi (repertory/generator/minigame/course)
              </div>
            </Link>
          </div>
        </div>
      </div>
    </AdminGate>
  );
}