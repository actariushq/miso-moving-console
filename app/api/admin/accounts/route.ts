// 계정관리 API (관리자 lead 전용) — Supabase Auth 관리자 기능은 서버 전용 키(SUPABASE_SECRET_KEY)로만
// GET: 직원별 마지막 로그인 · POST: 계정 생성 / 임시 비밀번호 재발급
// 임시 비밀번호는 응답으로 한 번만 돌려주고 저장하지 않는다. 첫 로그인 때 비밀번호 변경 강제(must_change_password)
import { createClient } from '@supabase/supabase-js';
import { randomInt } from 'node:crypto';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
const ROLES = ['lead', 'operator', 'am_onboarding', 'am_growth', 'booking_call'];

async function requireLead() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { error: '로그인이 필요해요', status: 401 } as const;
  const { data: me } = await sb.from('staff').select('id, role, active').eq('id', user.id).maybeSingle();
  if (!me || !me.active || me.role !== 'lead') return { error: '관리자만 쓸 수 있어요', status: 403 } as const;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) return { error: '서버 키(SUPABASE_SECRET_KEY)가 설정되지 않았어요', status: 500 } as const;
  return { me, admin: createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false } }) } as const;
}
const tempPassword = () => { const a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; return Array.from({ length: 10 }, () => a[randomInt(a.length)]).join(''); };
const j = (body: any, status = 200) => Response.json(body, { status });

export async function GET() {
  const g = await requireLead(); if ('error' in g) return j({ error: g.error }, g.status);
  const out: Record<string, { last_sign_in_at: string | null; must_change: boolean }> = {};
  for (let page = 1; page < 20; page++) {
    const { data, error } = await g.admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return j({ error: error.message }, 500);
    (data.users as any[]).forEach((u: any) => { out[u.id] = { last_sign_in_at: u.last_sign_in_at || null, must_change: !!u.user_metadata?.must_change_password }; });
    if (data.users.length < 200) break;
  }
  return j({ users: out });
}

export async function POST(req: Request) {
  const g = await requireLead(); if ('error' in g) return j({ error: g.error }, g.status);
  const b = await req.json().catch(() => ({}));
  if (b.action === 'reset') {
    if (!b.id) return j({ error: '대상 계정이 없어요' }, 400);
    if (b.id === g.me.id) return j({ error: '내 비밀번호는 비밀번호 변경 화면에서 바꿔 주세요' }, 400);
    const { data: u, error: e0 } = await g.admin.auth.admin.getUserById(b.id);
    if (e0 || !u.user) return j({ error: e0?.message || '계정을 찾을 수 없어요' }, 404);
    const pw = tempPassword();
    const { error } = await g.admin.auth.admin.updateUserById(b.id, { password: pw, user_metadata: { ...u.user.user_metadata, must_change_password: true } });
    if (error) return j({ error: error.message }, 500);
    return j({ ok: true, password: pw });
  }
  if (b.action === 'create') {
    const login = String(b.login_id || '').trim().toLowerCase(); const name = String(b.name || '').trim() || null; const role = ROLES.includes(b.role) ? b.role : 'operator';
    if (!/^[a-z0-9._-]{2,30}$/.test(login)) return j({ error: '아이디는 영문 소문자 · 숫자 2~30자 (예: mv16)' }, 400);
    const email = String(b.email || '').trim().toLowerCase() || `${login}@getmiso.com`;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return j({ error: '이메일 형식이 아니에요' }, 400);
    const pw = tempPassword();
    const { data, error } = await g.admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { login_id: login, name, must_change_password: true } });
    if (error) return j({ error: error.message.includes('already') ? '이미 있는 이메일이에요' : error.message }, 400);
    const { error: e2 } = await g.admin.from('staff').insert({ id: data.user.id, login_id: login, email, name, role, active: true });
    if (e2) { await g.admin.auth.admin.deleteUser(data.user.id); return j({ error: e2.message.includes('login_id') ? '이미 있는 아이디예요' : e2.message }, 400); }
    return j({ ok: true, password: pw, email });
  }
  return j({ error: '알 수 없는 요청' }, 400);
}
