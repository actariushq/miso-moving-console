'use client';
import { useState } from 'react';
import { sb } from '@/lib/data';
import { useLoad } from '@/components/useBoard';
import Kpis, { Head } from '@/components/Kpis';
import { useStaff } from '@/components/StaffContext';
import { fmtDT } from '@/lib/ui';

// 계정관리 (Supabase Auth + staff 연동). 이름 · 역할 · 활성은 staff 테이블(관리자 RLS), 계정 생성 · 임시 비밀번호는 서버 API(/api/admin/accounts)
const ROLE_L: Record<string, string> = { lead: '관리자', operator: '운영', am_onboarding: 'AM 신규 정착', am_growth: 'AM 캐파 확대', booking_call: '예약콜' };
const ROLE_D: Record<string, string> = { lead: '모든 화면 + 계정관리 · 건의 상태 변경', operator: '모든 화면', am_onboarding: '모든 화면 (담당 표시용)', am_growth: '모든 화면 (담당 표시용)', booking_call: '모든 화면 (담당 표시용)' };

export default function Accounts() {
  const { me } = useStaff(); const isLead = me.role === 'lead';
  const [msg, setMsg] = useState(''); const [issued, setIssued] = useState<{ who: string; email: string; password: string } | null>(null); const [adding, setAdding] = useState(false);
  const { data, err, reload } = useLoad(async () => {
    const { data: staff, error } = await sb().from('staff').select('*').order('created_at');
    if (error) throw error;
    const r = await fetch('/api/admin/accounts'); const auth = r.ok ? (await r.json()).users : {};
    return { staff: staff || [], auth: auth as Record<string, any>, authErr: r.ok ? '' : (await r.json().catch(() => ({}))).error || '' };
  });
  if (!isLead) return (<><Head title="계정관리" sub="관리자만 쓸 수 있어요." /><div className="empty">관리자 권한이 필요해요. 계정 추가 · 비밀번호 재발급이 필요하면 관리자에게 요청하세요.</div></>);
  const say = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3000); };
  async function set(id: string, patch: any, label: string) {
    if (id === me.id && ('active' in patch || ('role' in patch && patch.role !== 'lead'))) return say('내 계정의 역할 · 활성은 직접 바꿀 수 없어요 (다른 관리자에게 요청)');
    const { error } = await sb().from('staff').update(patch).eq('id', id);
    say(error ? '실패: ' + error.message : label); reload();
  }
  async function reset(s: any) {
    const r = await fetch('/api/admin/accounts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'reset', id: s.id }) });
    const b = await r.json(); if (!r.ok) return say('실패: ' + b.error);
    setIssued({ who: `${s.name || s.login_id} (${s.login_id})`, email: s.email, password: b.password }); reload();
  }
  const staff = data?.staff || []; const auth = data?.auth || {};
  const act = staff.filter((s: any) => s.active);
  return (<>
    <Head title="계정관리" sub="계정 추가 · 임시 비밀번호 발급 · 역할과 활성 상태 관리 (관리자 전용)" />
    <Kpis items={[{ l: '활성 계정', v: act.length, s: `전체 ${staff.length}` }, { l: '관리자', v: act.filter((s: any) => s.role === 'lead').length }, { l: '최근 7일 로그인', v: act.filter((s: any) => auth[s.id]?.last_sign_in_at && Date.now() - Date.parse(auth[s.id].last_sign_in_at) < 7 * 864e5).length },
      { l: '비밀번호 변경 전', v: act.filter((s: any) => auth[s.id]?.must_change).length, s: '임시 비밀번호 상태' }]} />
    <div className="toolbar"><span className="ok-msg">{msg}</span><span className="toolbar-r"><button className="btn primary" onClick={() => setAdding(!adding)}>{adding ? '닫기' : '＋ 계정 추가'}</button></span></div>
    {issued && <div className="panelbox issued"><h3>임시 비밀번호 — 지금만 보여요</h3>
      <div className="row"><span>{issued.who} · {issued.email}</span><code className="pw">{issued.password}</code>
        <button className="btn" onClick={() => { try { navigator.clipboard.writeText(`이사 콘솔 https://miso-moving-console.vercel.app\n아이디 ${issued.email}\n임시 비밀번호 ${issued.password}\n첫 로그인 후 비밀번호를 바꿔 주세요`); say('안내 문구를 복사했어요'); } catch { say('복사 실패 — 직접 적어 주세요'); } }}>안내 문구 복사</button>
        <button className="btn" onClick={() => setIssued(null)}>닫기</button></div>
      <div className="rule">본인에게 직접 전달하세요. 이 창을 닫으면 다시 볼 수 없고, 잊었으면 재발급하면 돼요.</div></div>}
    {adding && <AddForm onDone={(r: any) => { setAdding(false); setIssued(r); reload(); }} />}
    {err && <div className="errbox">{err}</div>}
    {data?.authErr && <div className="errbox">로그인 기록을 못 불러왔어요: {data.authErr}</div>}
    {!data ? <div className="loading">불러오는 중…</div> : <div className="queue">
      <div className="acrow head"><span>아이디</span><span>이름</span><span className="hide-sm">이메일</span><span>역할</span><span>상태</span><span className="hide-sm">마지막 로그인</span><span>비밀번호</span></div>
      {staff.map((s: any) => <div key={s.id} className={`acrow ${s.active ? '' : 'off'}`}>
        <span className="mono"><b>{s.login_id}</b>{s.id === me.id && <span className="chip mv">나</span>}</span>
        <span><input type="text" defaultValue={s.name || ''} placeholder="(예비)" onBlur={(e) => e.target.value !== (s.name || '') && set(s.id, { name: e.target.value.trim() || null }, '이름 저장')} /></span>
        <span className="hide-sm why">{s.email}</span>
        <span><select value={s.role} onChange={(e) => set(s.id, { role: e.target.value }, `역할 → ${ROLE_L[e.target.value]}`)} disabled={s.id === me.id} title={ROLE_D[s.role]}>{Object.entries(ROLE_L).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></span>
        <span><button className={`btn ${s.active ? '' : 'off'}`} disabled={s.id === me.id} onClick={() => set(s.id, { active: !s.active }, s.active ? '비활성으로 바꿈 — 콘솔 접근 차단' : '활성으로 바꿈')}>{s.active ? '✓ 활성' : '비활성'}</button></span>
        <span className="hide-sm why">{auth[s.id]?.last_sign_in_at ? fmtDT(auth[s.id].last_sign_in_at) : '없음'}{auth[s.id]?.must_change ? ' · 변경 전' : ''}</span>
        <span>{s.id !== me.id && <button className="btn" onClick={() => reset(s)}>임시 비밀번호 발급</button>}</span>
      </div>)}
    </div>}
    <div className="panelbox"><h3>역할별 권한</h3>
      <table className="perf"><tbody>{Object.entries(ROLE_L).map(([k, l]) => <tr key={k}><td><b>{l}</b></td><td>{ROLE_D[k]}</td></tr>)}</tbody></table>
      <div className="rule">지금은 관리자만 계정관리와 건의 상태 변경을 할 수 있고, 나머지 화면은 역할과 관계없이 모두 써요. 역할별로 화면을 나누고 싶으면 건의사항에 남겨 주세요.</div></div>
  </>);
}

function AddForm({ onDone }: any) {
  const [f, setF] = useState({ login_id: '', name: '', role: 'operator', email: '' }); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true); setMsg('');
    const r = await fetch('/api/admin/accounts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'create', ...f }) });
    const b = await r.json(); setBusy(false);
    if (!r.ok) return setMsg(b.error); onDone({ who: `${f.name || f.login_id} (${f.login_id})`, email: b.email, password: b.password });
  }
  return (<div className="panelbox"><h3>계정 추가</h3><div className="form"><div className="row">
    <div className="f" style={{ flex: '0 1 130px' }}><span>아이디</span><input type="text" value={f.login_id} onChange={(e) => setF({ ...f, login_id: e.target.value })} placeholder="mv16" /></div>
    <div className="f" style={{ flex: '0 1 140px' }}><span>이름</span><input type="text" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
    <div className="f"><span>이메일 (비우면 아이디@getmiso.com)</span><input type="text" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder={f.login_id ? `${f.login_id}@getmiso.com` : ''} /></div>
    <div className="f" style={{ flex: '0 1 150px' }}><span>역할</span><select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{Object.entries(ROLE_L).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div></div>
    <div className="row"><button className="btn primary" disabled={busy} onClick={save}>{busy ? '만드는 중…' : '만들기 + 임시 비밀번호 발급'}</button><span className="err">{msg}</span></div></div></div>);
}
