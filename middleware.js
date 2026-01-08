import { NextResponse } from 'next/server';
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';

/**
 * Redirect logic:
 * - If no session:
 *    - /           -> /login
 *    - /dashboard* -> /login
 *    - /admin*     -> /login
 * - If session exists:
 *    - /           -> /dashboard
 *    - /login      -> /dashboard
 */
export async function middleware(req) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const { pathname, origin } = req.nextUrl;

  // Root path: send to login or dashboard
  if (pathname === '/') {
    const url = req.nextUrl.clone();
    url.pathname = session ? '/dashboard' : '/login';
    return NextResponse.redirect(url);
  }

  // If logged-in user hits /login, send them to /dashboard
  if (pathname === '/login' && session) {
    const url = req.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  // Protect dashboard and admin when not logged in
  const protectedPrefixes = ['/dashboard', '/admin'];
  const isProtected = protectedPrefixes.some((p) => pathname.startsWith(p));
  if (isProtected && !session) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    // Optional: keep where they came from to redirect after login
    url.searchParams.set('redirectedFrom', pathname);
    return NextResponse.redirect(url);
  }

  return res;
}

// Only run middleware on these routes
export const config = {
  matcher: ['/', '/login', '/dashboard/:path*', '/admin/:path*'],
};