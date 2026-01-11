import '../styles/globals.css';
import Layout from '../components/Layout';
import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function MyApp({ Component, pageProps }) {
  const router = useRouter();

  useEffect(() => {
    if (typeof document === 'undefined') return;

    function updateRouteClass(pathname) {
      try {
        const docEl = document.documentElement;
        const normalized = (pathname || '')
          .split('?')[0]
          .split('#')[0]
          .replace(/\/+$/, '');

        const isDashboard = normalized === '/dashboard' || normalized === '/';
        const isMatematykaCourse = normalized.startsWith('/courses/matematyka_podstawa');

        if (isDashboard || isMatematykaCourse) {
          docEl.classList.add('page-target-dark');
        } else {
          docEl.classList.remove('page-target-dark');
        }
      } catch (e) {
        // ignore
      }
    }

    // initial run
    updateRouteClass(router.asPath);

    // update on client-side navigation
    const handleRouteChange = (url) => updateRouteClass(url);
    router.events.on('routeChangeComplete', handleRouteChange);

    return () => {
      router.events.off('routeChangeComplete', handleRouteChange);
    };
  }, [router]);

  return (
    <Layout>
      <Component {...pageProps} />
    </Layout>
  );
}
