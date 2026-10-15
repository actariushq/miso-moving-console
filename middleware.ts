import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(req: NextRequest) {
  // 로컬 미리보기: 로그인 없이 통과 (운영 Vercel 에서는 절대 켜지지 않게 VERCEL 환경이면 무시)
  if (process.env.NEXT_PUBLIC_PREVIEW === '1' && !process.env.VERCEL) return NextResponse.next({ request: req });
  let res = NextResponse.next({ request: req });
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user } } = await sb.auth.getUser();
  const path = req.nextUrl.pathname;
  if (path.startsWith('/api/cron')) return res;
  if (!user && path !== '/login') return NextResponse.redirect(new URL('/login', req.url));
  if (user && path === '/login') return NextResponse.redirect(new URL('/today', req.url));
  return res;
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)'] };
