// 미소 이사 콘솔 — 직원 계정 15개 생성 (mv1 ~ mv15)
// 실행: npm run accounts   (.env 의 SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY 사용)
// 초기 비밀번호는 환경변수 INITIAL_PASSWORD — 첫 로그인 후 변경 필수 (must_change_password)
// ⚠ service_role 키는 이 스크립트 실행에만 쓰고, 프론트엔드 코드·Vercel 공개 env에 넣지 말 것
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const initPw = process.env.INITIAL_PASSWORD;
if (!url || !key || !initPw) { console.error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, INITIAL_PASSWORD 환경변수가 필요합니다'); process.exit(1); }
const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

// 순서대로 매핑, mv13~15는 예비(비활성). 이름은 환경변수 ACCOUNT_NAMES(쉼표 구분)
const NAMES = (process.env.ACCOUNT_NAMES || '').split(',').map((x) => x.trim()).filter(Boolean);
const ACCOUNTS = Array.from({ length: 15 }, (_, i) => {
  const id = `mv${i + 1}`;
  return { login_id: id, email: `${id}@getmiso.com`, password: initPw, name: NAMES[i] ?? null, active: i < NAMES.length };
});

async function findUserByEmail(email) {
  for (let page = 1; page < 20; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find((x) => x.email === email);
    if (u) return u;
    if (data.users.length < 200) return null;
  }
  return null;
}

const results = [];
for (const a of ACCOUNTS) {
  let user = await findUserByEmail(a.email);
  let status = '기존 계정 유지';
  if (!user) {
    const { data, error } = await sb.auth.admin.createUser({
      email: a.email, password: a.password, email_confirm: true,
      user_metadata: { login_id: a.login_id, name: a.name, must_change_password: true },
    });
    if (error) { results.push({ ...a, status: '실패: ' + error.message }); continue; }
    user = data.user; status = '생성';
  }
  const { error: e2 } = await sb.from('staff').upsert(
    { id: user.id, login_id: a.login_id, email: a.email, name: a.name, role: 'operator', active: a.active },
    { onConflict: 'id' });
  results.push({ login_id: a.login_id, name: a.name ?? '(예비)', active: a.active, status: e2 ? `${status} / staff 실패: ${e2.message}` : status });
}
console.table(results.map(({ password, ...r }) => r));
