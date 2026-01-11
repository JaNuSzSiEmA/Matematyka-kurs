import Link from 'next/link';

export default function RepetytoriumPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 dashboard-page">
      <div className="max-w-lg w-full ui-surface--strong p-8 rounded-lg text-center">
       <span className="inner">
        <span className="spanner-icon">
          <img src="/spanner-icon.png" alt="" className="icon" />
        </span>
        </span>
    
        <h1 className="text-2xl font-semibold mb-2">Zawartość chwilowo niedostępna</h1>
        <p className="text-sm text-black-600 dark:text-black-300 mb-6">
          Ta sekcja jest w przygotowaniu — zawartość zostanie dodana wkrótce.
        </p>

        <p className="text-xs text-black-500">
          Powróć do <Link href="/dashboard" className="underline ">Kursu</Link>.
        </p>
      </div>
    </main>
  );
}