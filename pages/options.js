import ThemeToggle from '../components/ThemeToggle';

export default function OptionsPage() {
  return (
    <main className="p-6 dashboard-page">
      <div className="max-w-md">
        <h1 className="text-2xl font-semibold text-white mb-4">Opcje</h1>

        <section className="mb-6">
          <label className="flex items-center gap-4">
            <div>
              <div className="text-sm text-white font-medium">Motyw</div>
              <div className="text-xs text-white">Przełącz pomiędzy jasnym i ciemnym motywem</div>
            </div>

            <div className="ml-auto">
              <ThemeToggle />
            </div>
          </label>
        </section>

        <section>
          <p className="text-sm text-gray-600">
            Light (default) keeps the UI as you have it. Dark theme makes UI backgrounds very dark gray/almost black.
          </p>
        </section>
      </div>

      <style jsx>{`
        main { min-height: calc(100vh - 32px); } /* little spacing for nice look */
      `}</style>
    </main>
  );
}