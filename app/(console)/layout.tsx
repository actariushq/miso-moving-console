import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import Rail from '@/components/Rail';
import { StaffProvider } from '@/components/StaffContext';
import { PresenceProvider } from '@/components/Presence';

export const dynamic = 'force-dynamic';

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NEXT_PUBLIC_PREVIEW === '1' && !process.env.VERCEL) {
    const pv = { id: 'preview', login_id: 'preview', name: '미리보기', role: 'lead', active: true };
    const fx = (() => { try { return JSON.parse(require('node:fs').readFileSync(require('node:path').join(process.env.PREVIEW_FIXTURES || '', 'staff.json'), 'utf8')); } catch { return []; } })();
    return <StaffProvider me={pv as any} staff={[pv as any, ...fx]}><PresenceProvider me={pv}><div className="app"><Rail me={pv} /><main className="main">{children}</main></div></PresenceProvider></StaffProvider>;
  }
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');
  if (user.user_metadata?.must_change_password) redirect('/password');
  const { data: me } = await sb.from('staff').select('id, login_id, name, role, active').eq('id', user.id).maybeSingle();
  if (!me || !me.active) {
    return <main className="auth"><form><h1>접근 권한 없음</h1><p>이 계정({user.email})은 콘솔 사용 권한이 없거나 비활성 상태예요. 관리자에게 요청하세요.</p></form></main>;
  }
  const { data: staff } = await sb.from('staff').select('id, login_id, name, role, active').order('created_at');
  return (
    <StaffProvider me={me} staff={staff || []}>
      <PresenceProvider me={me}>
        <div className="app">
          <Rail me={me} />
          <main className="main">{children}</main>
        </div>
      </PresenceProvider>
    </StaffProvider>
  );
}
