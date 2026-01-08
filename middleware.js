import { NextResponse } from 'next/server';
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';

export async function middleware(req) {
  const res = NextResponse.next();

  let session = null;
  try {
    // Read envs explicitly (required in Edge/middleware)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
    }

    // Create Supabase client for middleware
    const supabase = createMiddlewareClient(
      { req, res },
      { supabaseUrl, supabaseKey }
    );

    const {
      data: { session: s },
    } = await supabase.auth.getSession();
    session = s ?? null;
  } catch (err) {
    // Don’t fail the whole request — just treat as logged out
    console.error('Middleware auth error:', err?.message || err);
    session = null;
  }

  const { pathname } = req.nextUrl;

  // Root: redirect based on session
  if (pathname === '/') {
    const url = req.nextUrl.clone();
    url.pathname = session ? '/dashboard' : '/login';
    return NextResponse.redirect(url);
  }

  // Logged-in users shouldn’t see /login
  if (pathname === '/login' && session) {
    const url = req.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  // Protect /dashboard and /admin
  const protectedPrefixes = ['/dashboard', '/admin'];
  const isProtected = protectedPrefixes.some((p) => pathname.startsWith(p));
  if (isProtected && !session) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirectedFrom', pathname);
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  matcher: ['/', '/login', '/dashboard/:path*', '/admin/:path*'],
};