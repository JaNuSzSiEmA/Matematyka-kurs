import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function PaymentSuccessPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/login');
        return;
      }
      setUser(session.user);
    })();
  }, [router]);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      router.push('/dashboard');
    }
  }, [countdown, router]);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-gray-600">Ładowanie...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-green-100 flex items-center justify-center p-6">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center animate-scale-in">
          {/* Success Icon */}
          <div className="mb-6 flex justify-center">
            <div className="rounded-full bg-green-100 p-4">
              <svg className="w-16 h-16 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>

          <h1 className="text-3xl font-bold text-gray-900 mb-3">
            Płatność zakończona!
          </h1>
          
          <p className="text-gray-600 mb-2">
            Dziękujemy za zakup pełnego dostępu do kursu.
          </p>
          
          <p className="text-sm text-gray-500 mb-8">
            Wszystkie działy zostały odblokowane.
          </p>

          {/* Features unlocked */}
          <div className="bg-green-50 rounded-xl p-4 mb-6">
            <p className="text-sm font-semibold text-green-900 mb-3">
              Co otrzymałeś:
            </p>
            <ul className="space-y-2 text-sm text-left">
              <li className="flex items-center gap-2 text-green-800">
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Dostęp do wszystkich działów kursu</span>
              </li>
              <li className="flex items-center gap-2 text-green-800">
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Setki zadań z wyjaśnieniami</span>
              </li>
              <li className="flex items-center gap-2 text-green-800">
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Dożywotni dostęp do materiałów</span>
              </li>
            </ul>
          </div>

          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2 w-full py-3 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition-colors"
          >
            <span>Rozpocznij naukę</span>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>

          <p className="mt-4 text-xs text-gray-500">
            Przekierowanie za {countdown} sekund...
          </p>
        </div>

        {/* Email confirmation note */}
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            📧 Potwierdzenie płatności zostało wysłane na Twój adres email
          </p>
        </div>
      </div>
    </div>
  );
}
