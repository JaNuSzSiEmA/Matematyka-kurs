import { NextResponse } from 'next/server';

export function middleware(req) {
  const url = req.nextUrl.clone();
  const { pathname } = url;

  // Allow internal/asset and auth callback routes always
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname === '/favicon.ico' ||
    pathname.startsWith('/api/auth')
  ) {
    return NextResponse.next();
  }

  // Consider user logged in if common Supabase auth cookies are present.
  const isLoggedIn = Boolean(
    req.cookies.get('sb-access-token')?.value ||
    req.cookies.get('__supabase_auth_token')?.value ||
    req.cookies.get('supabase-auth-token')?.value
  );

  // Root: send everyone to the public dashboard
  if (pathname === '/') {
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  // Always allow /login
  if (pathname === '/login') {
    return NextResponse.next();
  }

  // PUBLIC: allow viewing dashboard and course pages without login
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/courses')) {
    return NextResponse.next();
  }

  // Protected prefixes (these require login)
  const protectedPrefixes = [
    '/admin',
    '/options',
    '/mathmare',
    '/generator',
    '/ai',
    '/repetytorium',
  ];
  const isProtected = protectedPrefixes.some((p) => pathname === p || pathname.startsWith(p + '/'));

  if (isProtected && !isLoggedIn) {
    // Redirect to login, preserve original path so we can navigate back after auth
    url.pathname = '/login';
    url.searchParams.set('redirectedFrom', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/',
    '/login',
    '/admin/:path*',
    '/options/:path*',
    '/mathmare/:path*',
    '/generator/:path*',
    '/ai/:path*',
    '/repetytorium/:path*',
    '/courses/:path*',
    '/dashboard/:path*',
  ],
};