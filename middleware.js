import { NextResponse } from 'next/server';

export function middleware(req) {
  const url = req.nextUrl.clone();
  const { pathname } = url;

  // If the auth cookie exists, treat user as logged in
  const isLoggedIn = Boolean(req.cookies.get('sb-access-token')?.value);

  // Home → login or dashboard
  if (pathname === '/') {
    url.pathname = isLoggedIn ? '/dashboard' : '/login';
    return NextResponse.redirect(url);
  }

  // Logged-in users shouldn’t see /login
  if (pathname === '/login' && isLoggedIn) {
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  // Protect these paths
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