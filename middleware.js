import { NextResponse } from 'next/server';

export function middleware(req) {
  const url = req.nextUrl.clone();
  const { pathname } = url;

  // Consider user logged in if the auth cookie is present
  const isLoggedIn = Boolean(req.cookies.get('sb-access-token')?.value);

  // Root: send to login or dashboard
  if (pathname === '/') {
    url.pathname = isLoggedIn ? '/dashboard' : '/login';
    return NextResponse.redirect(url);
  }

  // IMPORTANT: always allow /login (no auto-redirect to /dashboard)
  if (pathname === '/login') {
    return NextResponse.next();
  }

  // Protect these paths when not logged in
  const protectedPrefixes = ['/dashboard', '/admin'];
  const isProtected = protectedPrefixes.some((p) => pathname.startsWith(p));
  if (isProtected && !isLoggedIn) {
    url.pathname = '/login';
    url.searchParams.set('redirectedFrom', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/login', '/dashboard/:path*', '/admin/:path*'],
};