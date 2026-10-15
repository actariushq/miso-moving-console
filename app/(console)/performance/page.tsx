'use client';
// 성과 관리 — AE / AM(관리 대상 · 신규 정착 · 캐파 확대) / 예약콜 / 팀 · 팔로우업을 나눠서.
// 활동(콜 · 연결)은 기간 안 행위, 전환은 '기간 안에 처음 통화한 대상(코호트)이 지금 어디까지 갔는가'로 본다 — 기간 안 단계 이동 수만 보면 오래된 리드와 섞여 전환율이 왜곡되기 때문
import { useMemo, useState } from 'react';
import { sb, fetchAll, reasonDict, reasonLabel } from '@/lib/data';
import { useLoad } from '@/components/useBoard';
import Kpis, { Head, Seg } from '@/components/Kpis';
import { useStaff, useStaffName } from '@/components/StaffContext';
import { AE_STAGES, CARE_STAGES, LINE_L, MOD_L, aePriority, aeRank, careRank, careLabel, stageLabel, won, ymd } from '@/lib/ui';

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 + '%' : '–');
const n0 = (v: any) => +v || 0;
const med = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const days = (a?: string | null, b?: string | null) => (a && b ? (Date.parse(b) - Date.parse(a)) / 864e5 : null);
const fmtDays = (v: number | null) => (v == null ? '–' : v < 1 ? `${Math.round(v * 24)}시간` : `${Math.round(v * 10) / 10}일`);
const uniqCalls = (ev: any[]) => [...new Map(ev.filter((e) => e.event_type === 'call').map((e) => [e.call_group || e.id, e])).values()];
const top = (arr: string[], n = 8) => Object.entries(arr.reduce((m: Record<string, number>, k) => { m[k] = (m[k] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]).slice(0, n);
const LOST_L: Record<string, string> = { other_company: '타사 계약', price: '가격', cancel_postpone: '취소·연기', self_solved: '직접 해결', unreachable: '연락 불가', etc: '기타' };

function Bar({ v, max = 1, tone = 'var(--accent)' }: { v: number; max?: number; tone?: string }) {
  const w = Math.max(0, Math.min(100, (v / (max || 1)) * 100));
  return <span className="pbar"><i style={{ width: w + '%', background: tone }} /></span>;
}
function TopList({ title, rows, empty = '아직 없음', tone = 'var(--accent)' }: { title: string; rows: [string, number][]; empty?: string; tone?: string }) {
  const max = rows[0]?.[1] || 1;
  return <section className="pcard"><h3 className="h3">{title}</h3>{rows.length ? <div className="res-list">{rows.map(([k, v]) => <div className="r" key={k}><span>{k}</span><span className="b"><i style={{ width: `${(v / max) * 100}%`, background: tone }} /></span><span className="n">{v}</span></div>)}</div> : <div className="empty">{empty}</div>}</section>;
}
// 코호트 퍼널: 단계별 도달 수 · 처음 대비 · 직전 대비
function Funnel({ steps }: { steps: { t: string; n: number }[] }) {
  const base = steps[0]?.n || 0;
  return <div className="funnel">{steps.map((s, i) => <div key={s.t} className="fstep">
    <span className="ft">{s.t}</span>
    <span className="fb"><i style={{ width: `${base ? (s.n / base) * 100 : 0}%` }} /></span>
    <span className="fn mono">{s.n.toLocaleString()}</span>
    <span className="fp mono">{i ? pct(s.n, base) : '100%'}</span>
    <span className="fs mono">{i ? `직전 대비 ${pct(s.n, steps[i - 1].n)}` : ''}</span>
  </div>)}</div>;
}

export default function Performance() {
  const { staff } = useStaff(); const staffName = useStaffName();
  const [tab, setTab] = useState<'ae' | 'am' | 'booking' | 'team'>('ae');
  const [range, setRange] = useState('28'); const [who, setWho] = useState('all');
  const from = useMemo(() => {
    const today = ymd(new Date());
    if (range === 'month') return new Date(today.slice(0, 8) + '01T00:00:00+09:00');
    return new Date(Date.parse(today + 'T00:00:00+09:00') - (+range - 1) * 864e5);
  }, [range]);
  const inP = (t?: string | null) => !!t && Date.parse(t) >= +from;
  const byWho = (e: any) => who === 'all' || e.actor_id === who;
  const rangeL = range === '1' ? '오늘' : range === 'month' ? '이번 달' : `최근 ${range}일`;

  return (<>
    <Head title="성과 관리" sub="활동은 기간 안의 행위로, 전환은 기간 안에 처음 통화한 대상이 지금 어디까지 갔는지로 봐요." />
    <div className="tabs" role="tablist">{[['ae', 'AE 온보딩'], ['am', 'AM'], ['booking', '예약콜'], ['team', '팀 · 팔로우업']].map(([k, l]) =>
      <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k as any)}>{l}</button>)}</div>
    <div className="toolbar">
      <Seg value={range} onChange={setRange} opts={[['1', '오늘'], ['7', '7일'], ['28', '28일'], ['month', '이번 달'], ['90', '90일']]} />
      {(tab === 'ae' || tab === 'am') && <select value={who} onChange={(e) => setWho(e.target.value)} style={{ width: 'auto' }} aria-label="담당"><option value="all">전체 담당</option>{staff.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name || s.login_id}</option>)}</select>}
      <span className="sub-note">{rangeL} · {ymd(from)} 0시부터</span>
    </div>
    {tab === 'ae' && <AePerf inP={inP} byWho={byWho} who={who} staffName={staffName} rangeL={rangeL} />}
    {tab === 'am' && <AmPerf inP={inP} byWho={byWho} who={who} staffName={staffName} rangeL={rangeL} range={range} />}
    {tab === 'booking' && <BookingPerf from={from} rangeL={rangeL} />}
    {tab === 'team' && <TeamPerf inP={inP} from={from} staffName={staffName} rangeL={rangeL} />}
  </>);
}

// ───────── AE ─────────
const AE_MILES: [string, number][] = [['연결', 2], ['관심있음', 3], ['서류', 4], ['프로필작업', 5], ['리뷰작업', 6], ['충전대기', 7], ['첫견적제출', 8], ['완료(첫 견적)', 9]];
function AePerf({ inP, byWho, who, staffName, rangeL }: any) {
  const [line, setLine] = useState('all');
  const { data, err } = useLoad(async () => {
    const [ev, board, dict] = await Promise.all([fetchAll((a, b) => sb().from('activity_events').select('*').eq('module', 'ae').order('created_at').range(a, b)),
      fetchAll((a, b) => sb().from('v_ae_board').select('*').range(a, b)), reasonDict()]);
    return { ev, board, dict };
  });
  if (err) return <div className="errbox">{err}</div>;
  if (!data) return <div className="loading">불러오는 중…</div>;
  const leads = data.board.filter((l: any) => line === 'all' || l.service_line === line); const ids = new Set(leads.map((l: any) => l.id));
  const ev = data.ev.filter((e: any) => ids.has(e.subject_id));
  // 리드별 이정표 (전체 기간)
  const rk = (s: string) => (s === 'WON' ? 9 : aeRank(s));
  const M = new Map<number, any>();
  for (const l of leads) M.set(l.id, { l, first: null as any, firstBy: null, reach: Math.max(0, rk(l.stage)), at: {} as Record<number, string> });
  for (const e of ev) { const m = M.get(e.subject_id); if (!m) continue;
    if (e.event_type === 'call' && !m.first) { m.first = e.created_at; m.firstBy = e.actor_id; }
    if (e.event_type === 'stage' && e.stage_to) { const r = rk(e.stage_to); if (r > 0) { m.reach = Math.max(m.reach, r); for (let k = 2; k <= r; k++) m.at[k] ||= e.created_at; } } }
  const all = [...M.values()];
  // 기간 활동
  const calls = uniqCalls(ev.filter((e: any) => inP(e.created_at) && byWho(e)));
  const con = calls.filter((c: any) => c.connect === 'connected');
  const touched = new Set(calls.map((c: any) => c.subject_id));
  const stageIn = ev.filter((e: any) => e.event_type === 'stage' && e.stage_from && inP(e.created_at) && (who === 'all' || e.actor_id === who));
  const charges = ev.filter((e: any) => e.field === 'charge' && inP(e.created_at) && byWho(e));
  const wonIn = stageIn.filter((e: any) => e.stage_to === 'WON');
  // 코호트: 기간 안에 처음 통화한 리드
  const cohort = all.filter((m) => inP(m.first) && (who === 'all' || m.firstBy === who));
  const steps = [{ t: '첫 통화', n: cohort.length }, ...AE_MILES.map(([t, r]) => ({ t, n: cohort.filter((m) => m.reach >= r).length }))];
  // 속도 (이정표가 기간 안에 찍힌 리드)
  const sp = (r: number) => fmtDays(med(all.filter((m) => m.first && m.at[r] && inP(m.at[r])).map((m) => days(m.first, m.at[r])!).filter((x) => x >= 0)));
  // 우선순위 검증
  const prio = [1, 2, 3, 4].map((p) => { const g = all.filter((m) => aePriority(m.l) === p); const gc = g.filter((m) => touched.has(m.l.id));
    const gcon = new Set(con.map((c: any) => c.subject_id)); return { p, n: g.length, called: gc.length, con: gc.filter((m) => gcon.has(m.l.id)).length, int: g.filter((m) => m.reach >= 3).length, won: g.filter((m) => m.reach >= 9).length }; });
  // 콜 품질
  const concerns = top(con.flatMap((c: any) => c.concerns || [])); const points = top(calls.flatMap((c: any) => c.call_points || []));
  const fails = top(con.filter((c: any) => c.result === 'fail').map((c: any) => reasonLabel(data.dict, 'ae', c.reason_code) || '미분류'));
  const holds = top(con.filter((c: any) => c.result === 'hold').map((c: any) => reasonLabel(data.dict, 'ae', c.reason_code) || '미분류'));
  const whoTalk = top(con.map((c: any) => c.counterpart || '미기록'));
  // 담당별
  const actors = [...new Set(calls.map((c: any) => c.actor_id).filter(Boolean))] as string[];
  const now = Date.now(); const open = leads.filter((l: any) => !['WON', 'LOST'].includes(l.stage));
  const per = actors.map((id) => { const c = calls.filter((x: any) => x.actor_id === id); const st = stageIn.filter((x: any) => x.actor_id === id);
    return { id, n: c.length, con: c.filter((x: any) => x.connect === 'connected').length, leads: new Set(c.map((x: any) => x.subject_id)).size, int: st.filter((x: any) => x.stage_to === 'E3').length,
      won: st.filter((x: any) => x.stage_to === 'WON').length, chg: charges.filter((x: any) => x.actor_id === id).length, fu: c.filter((x: any) => x.next_action_at).length, closing: c.filter((x: any) => x.stage_after === 'LOST').length,
      over: open.filter((l: any) => l.owner_id === id && l.next_action_at && Date.parse(l.next_action_at) < now).length, miss: open.filter((l: any) => l.owner_id === id && l.stage !== 'E0' && !l.next_action_at).length }; }).sort((a, b) => b.n - a.n);

  return (<>
    <div className="toolbar"><Seg value={line} onChange={setLine} opts={[['all', '전체 서비스'], ['miso_visit', '미소방문'], ['visit_quote', 'RFQ']]} /></div>
    <Kpis items={[
      { l: '콜', v: calls.length, s: `${rangeL} · 통화 1건 = 1회` }, { l: '연결률', v: pct(con.length, calls.length), s: `연결 ${con.length}` },
      { l: '접촉한 리드', v: touched.size, s: `콜/리드 ${touched.size ? Math.round((calls.length / touched.size) * 10) / 10 : '–'}` },
      { l: '관심 도달', v: stageIn.filter((e: any) => e.stage_to === 'E3').length, s: '기간 안 관심있음 진입' },
      { l: '충전', v: charges.length, s: charges.length ? won(charges.reduce((s: number, e: any) => s + n0(e.new_value), 0)) + '원' : '건' },
      { l: '첫 견적(완료)', v: wonIn.length, c: wonIn.length ? 'ok' : '', s: `리대시 자동 포함` },
    ]} />
    <div className="perf-2">
      <section className="pcard"><h3 className="h3">전환 퍼널 <span className="sub">{rangeL} 처음 통화한 리드 {cohort.length}명이 지금 어디까지 왔나</span></h3>
        {cohort.length ? <Funnel steps={steps} /> : <div className="empty">기간 안에 처음 통화한 리드가 없어요</div>}
        <div className="rule">처음 대비 = 첫 통화 리드 중 그 단계 이상 간 비율 · 직전 대비 = 앞 단계에 도달한 리드 중 다음 단계로 간 비율(병목 찾기)</div></section>
      <section className="pcard"><h3 className="h3">속도 <span className="sub">첫 통화부터 걸린 시간 · 중앙값 · 기간 안에 도달한 리드</span></h3>
        <div className="grid2"><div><span>→ 연결</span><b>{sp(2)}</b></div><div><span>→ 관심있음</span><b>{sp(3)}</b></div><div><span>→ 서류</span><b>{sp(4)}</b></div>
          <div><span>→ 충전대기</span><b>{sp(7)}</b></div><div><span>→ 첫견적제출</span><b>{sp(8)}</b></div><div><span>→ 완료</span><b>{sp(9)}</b></div></div>
        <h3 className="h3" style={{ marginTop: 14 }}>지금 단계 분포</h3>
        <div className="res-list">{AE_STAGES.map((s) => { const n = leads.filter((l: any) => l.stage === s.c).length; return <div className="r" key={s.c}><span>{s.t}</span><span className="b"><i style={{ width: `${(n / (leads.length || 1)) * 100}%`, background: s.c === 'LOST' ? 'var(--bad)' : s.c === 'WON' ? 'var(--ok)' : 'var(--accent)' }} /></span><span className="n">{n}</span></div>; })}</div></section>
    </div>
    <section style={{ marginTop: 16 }}><h3 className="h3">우선순위 검증 <span className="sub">P1~P4 규칙이 실제 결과와 맞는지 — P1이 연결 · 관심 · 완료율이 높아야 해요 (관심 · 완료는 지금까지 누적)</span></h3>
      <div className="tbl-wrap"><table className="perf"><thead><tr><th>우선순위</th><th className="num">리드</th><th className="num">기간 접촉</th><th className="num">접촉 중 연결</th><th className="num">관심 이상</th><th className="num">완료</th></tr></thead>
        <tbody>{prio.map((x) => <tr key={x.p} style={{ cursor: 'default' }}><td><b>P{x.p}</b></td><td className="num">{x.n}</td><td className="num">{x.called} <span className="sub">{pct(x.called, x.n)}</span></td>
          <td className="num">{pct(x.con, x.called)} <Bar v={x.con} max={x.called} /></td><td className="num">{x.int} <span className="sub">{pct(x.int, x.n)}</span></td><td className="num">{x.won} <span className="sub">{pct(x.won, x.n)}</span></td></tr>)}</tbody></table></div></section>
    <div className="perf-3">
      <TopList title="우려 · 반대 의견 TOP" rows={concerns} tone="var(--warn)" empty="연결 콜에 우려 기록 없음" />
      <TopList title="실패 사유" rows={fails} tone="var(--bad)" empty="실패 콜 없음" />
      <TopList title="재통화(보류) 이유" rows={holds} empty="보류 콜 없음" />
    </div>
    <div className="perf-2">
      <TopList title="다룬 콜 포인트" rows={points} empty="체크한 포인트 없음" />
      <TopList title="통화 상대" rows={whoTalk} empty="연결 콜 없음" />
    </div>
    <section style={{ marginTop: 16 }}><h3 className="h3">담당별 <span className="sub">{rangeL} 활동 · 지난 팔로우업 · 미등록은 지금 기준</span></h3>
      <div className="tbl-wrap"><table className="perf"><thead><tr><th>담당</th><th className="num">콜</th><th className="num">연결률</th><th className="num">접촉 리드</th><th className="num">관심 전환</th><th className="num">완료</th><th className="num">충전</th><th className="num">팔로우업 설정률</th><th className="num">지난 팔로우업</th><th className="num">미등록</th></tr></thead>
        <tbody>{per.length ? per.map((x) => <tr key={x.id} style={{ cursor: 'default' }}><td><b>{staffName(x.id)}</b></td><td className="num">{x.n}</td><td className="num">{pct(x.con, x.n)}</td><td className="num">{x.leads}</td>
          <td className="num">{x.int} <span className="sub">{pct(x.int, x.con)}</span></td><td className="num">{x.won}</td><td className="num">{x.chg}</td><td className="num">{pct(x.fu, x.n - x.closing)}</td>
          <td className="num" style={{ color: x.over ? 'var(--bad)' : undefined }}>{x.over}</td><td className="num" style={{ color: x.miss ? 'var(--bad)' : undefined }}>{x.miss}</td></tr>)
          : <tr><td colSpan={10} className="empty">기간 안 AE 콜 없음</td></tr>}</tbody></table></div>
      <div className="rule">관심 전환 = 그 담당이 기간 안에 관심있음으로 옮긴 리드(괄호는 연결 콜 대비). 팔로우업 설정률 = 이탈로 닫힌 콜을 뺀 콜 중 다음 날짜를 잡은 비율.</div></section>
  </>);
}

// ───────── AM ─────────
const CARE_MILES: [string, number][] = [['연결', 2], ['원인 파악', 3], ['개선 액션', 4], ['회복 확인 중', 5], ['회복', 6]];
function AmPerf({ inP, byWho, who, staffName, rangeL, range }: any) {
  const [sub, setSub] = useState<'care' | 'new' | 'active'>('care');
  const { data, err } = useLoad(async () => {
    const [cev, care, dict, p, board, stageEv] = await Promise.all([
      fetchAll((a, b) => sb().from('activity_events').select('*').eq('module', 'am_care').order('created_at').range(a, b)),
      fetchAll((a, b) => sb().from('v_care_board').select('*').range(a, b)), reasonDict(),
      sb().rpc('perf_am', { p_days: range === '1' ? 1 : range === 'month' ? new Date().getDate() : +range }),
      fetchAll((a, b) => sb().from('v_am_board').select('*').range(a, b)),
      fetchAll((a, b) => sb().from('activity_events').select('*').eq('subject', 'partner').in('event_type', ['stage', 'call']).range(a, b)),
    ]);
    return { cev, care, dict, perf: p.data || [], board, stageEv };
  }, [range]);
  if (err) return <div className="errbox">{err}</div>;
  if (!data) return <div className="loading">불러오는 중…</div>;
  return (<>
    <div className="toolbar"><Seg value={sub} onChange={(v) => setSub(v as any)} opts={[['care', `관리 대상 ${data.care.length}`], ['new', '신규 정착'], ['active', '캐파 확대']]} /></div>
    {sub === 'care' && <CarePerf data={data} inP={inP} byWho={byWho} who={who} staffName={staffName} rangeL={rangeL} />}
    {sub === 'new' && <NewPerf data={data} inP={inP} byWho={byWho} rangeL={rangeL} />}
    {sub === 'active' && <ActivePerf data={data} rangeL={rangeL} />}
  </>);
}

function CarePerf({ data, inP, byWho, who, staffName, rangeL }: any) {
  const rk = (s: string) => (s === 'WON' ? 6 : careRank(s));
  const M = new Map<number, any>(); for (const c of data.care) M.set(c.id, { c, first: null as any, firstBy: null, reach: Math.max(0, rk(c.stage)), at: {} as Record<number, string> });
  for (const e of data.cev) { const m = M.get(e.subject_id); if (!m) continue; if (e.event_type === 'call' && !m.first) { m.first = e.created_at; m.firstBy = e.actor_id; }
    if (e.event_type === 'stage' && e.stage_to) { const r = rk(e.stage_to); if (r > 0) { m.reach = Math.max(m.reach, r); for (let k = 2; k <= r; k++) m.at[k] ||= e.created_at; } } }
  const all = [...M.values()];
  const calls = uniqCalls(data.cev.filter((e: any) => inP(e.created_at) && byWho(e))); const con = calls.filter((c: any) => c.connect === 'connected');
  const touchedAll = new Set(uniqCalls(data.cev).map((c: any) => c.subject_id));
  const stageIn = data.cev.filter((e: any) => e.event_type === 'stage' && e.stage_from && inP(e.created_at) && (who === 'all' || e.actor_id === who));
  const cohort = all.filter((m) => inP(m.first) && (who === 'all' || m.firstBy === who));
  const steps = [{ t: '첫 통화', n: cohort.length }, ...CARE_MILES.map(([t, r]) => ({ t, n: cohort.filter((m) => m.reach >= r).length }))];
  const p1 = all.filter((m) => (m.c.manual_priority || m.c.priority) === 1);
  // 판정 구분별 진행 (지금까지 누적)
  const segs = [...new Set(all.map((m) => `${m.c.priority}|${m.c.segment || '관찰'}`))].sort();
  const segRows = segs.map((k) => { const [p, s] = k.split('|'); const g = all.filter((m) => `${m.c.priority}|${m.c.segment || '관찰'}` === k);
    return { p: +p, s, n: g.length, touched: g.filter((m) => touchedAll.has(m.c.id)).length, con: g.filter((m) => m.reach >= 2).length, cause: g.filter((m) => m.reach >= 3).length, act: g.filter((m) => m.reach >= 4).length, won: g.filter((m) => m.c.stage === 'WON').length, lost: g.filter((m) => m.c.stage === 'LOST').length }; });
  const concerns = top(con.flatMap((c: any) => c.concerns || [])); const lostR = top(data.care.filter((c: any) => c.stage === 'LOST').map((c: any) => reasonLabel(data.dict, 'am_care', c.lost_reason) || c.lost_reason || '미분류'));
  const actors = [...new Set(calls.map((c: any) => c.actor_id).filter(Boolean))] as string[]; const now = Date.now(); const open = data.care.filter((c: any) => !['WON', 'LOST'].includes(c.stage));
  const per = actors.map((id) => { const c = calls.filter((x: any) => x.actor_id === id); const st = stageIn.filter((x: any) => x.actor_id === id);
    return { id, n: c.length, con: c.filter((x: any) => x.connect === 'connected').length, ps: new Set(c.map((x: any) => x.subject_id)).size, cause: st.filter((x: any) => x.stage_to === 'C3').length, won: st.filter((x: any) => x.stage_to === 'WON').length,
      over: open.filter((x: any) => x.owner_id === id && x.next_action_at && Date.parse(x.next_action_at) < now).length }; }).sort((a, b) => b.n - a.n);
  return (<>
    <Kpis items={[
      { l: 'P1 접촉률', v: pct(p1.filter((m) => touchedAll.has(m.c.id)).length, p1.length), s: `P1 ${p1.length}명 중 통화한 파트너 (누적)` },
      { l: '콜', v: calls.length, s: `${rangeL} · 연결률 ${pct(con.length, calls.length)}` },
      { l: '원인 파악', v: stageIn.filter((e: any) => e.stage_to === 'C3').length, s: '기간 안 원인 파악 진입' },
      { l: '회복', v: data.care.filter((c: any) => c.stage === 'WON').length, c: 'ok', s: `관리 종료 ${data.care.filter((c: any) => c.stage === 'LOST').length} (누적)` },
    ]} />
    <div className="perf-2">
      <section className="pcard"><h3 className="h3">전환 퍼널 <span className="sub">{rangeL} 처음 통화한 파트너 {cohort.length}명</span></h3>
        {cohort.length ? <Funnel steps={steps} /> : <div className="empty">기간 안에 처음 통화한 파트너가 없어요</div>}</section>
      <TopList title="원인 · 우려 TOP" rows={concerns} tone="var(--warn)" empty="연결 콜에 원인 기록 없음" />
    </div>
    <section style={{ marginTop: 16 }}><h3 className="h3">판정 구분별 진행 <span className="sub">지금까지 누적 · 어떤 유형이 잘 살아나는지</span></h3>
      <div className="tbl-wrap"><table className="perf"><thead><tr><th>구분</th><th className="num">대상</th><th className="num">접촉</th><th className="num">연결</th><th className="num">원인 파악</th><th className="num">개선 액션</th><th className="num">회복</th><th className="num">종료</th></tr></thead>
        <tbody>{segRows.map((x) => <tr key={x.p + x.s} style={{ cursor: 'default' }}><td><span className={`chip p${x.p}`}>{x.p < 4 ? `P${x.p}` : '관찰'}</span> {x.s}</td><td className="num">{x.n}</td>
          <td className="num">{x.touched} <span className="sub">{pct(x.touched, x.n)}</span></td><td className="num">{x.con} <span className="sub">{pct(x.con, x.touched)}</span></td>
          <td className="num">{x.cause}</td><td className="num">{x.act}</td><td className="num" style={{ color: x.won ? 'var(--ok)' : undefined }}><b>{x.won}</b></td><td className="num">{x.lost}</td></tr>)}</tbody></table></div>
      <div className="rule">회복은 지금 담당자가 단계를 '회복'으로 옮겨야 잡혀요. 참여 · 계약이 실제로 돌아왔는지 자동으로 보려면 관리 대상 지표를 리대시로 갱신해야 해요(보류 중인 동기화와 함께).</div></section>
    <div className="perf-2">
      <TopList title="관리 종료 사유" rows={lostR} tone="var(--bad)" empty="종료 없음" />
      <section className="pcard"><h3 className="h3">담당별 <span className="sub">{rangeL}</span></h3>
        <div className="tbl-wrap" style={{ border: 0 }}><table className="perf" style={{ minWidth: 0 }}><thead><tr><th>담당</th><th className="num">콜</th><th className="num">연결률</th><th className="num">파트너</th><th className="num">원인 파악</th><th className="num">회복</th><th className="num">지난 팔로우업</th></tr></thead>
          <tbody>{per.length ? per.map((x) => <tr key={x.id} style={{ cursor: 'default' }}><td>{staffName(x.id)}</td><td className="num">{x.n}</td><td className="num">{pct(x.con, x.n)}</td><td className="num">{x.ps}</td><td className="num">{x.cause}</td><td className="num">{x.won}</td><td className="num" style={{ color: x.over ? 'var(--bad)' : undefined }}>{x.over}</td></tr>)
            : <tr><td colSpan={7} className="empty">기간 안 콜 없음</td></tr>}</tbody></table></div></section>
    </div>
  </>);
}

function NewPerf({ data, inP, byWho, rangeL }: any) {
  const NEW = [['N0', '첫 충전 · 배정'], ['N1', '프로필 · 리뷰 세팅'], ['N2', '첫 견적 대기'], ['N3', '제출 · 미성사'], ['N4', '첫 계약 성공'], ['N5', '첫 리뷰 확보'], ['N_RISK', '정착 위험'], ['N_CHURN', '이탈']];
  const b = data.board.filter((p: any) => p.track === 'new'); const ev = data.stageEv.filter((e: any) => e.module === 'am_new');
  const reachedN4 = ev.filter((e: any) => e.event_type === 'stage' && e.stage_to === 'N4' && inP(e.created_at));
  const toN4 = reachedN4.map((e: any) => { const p = data.board.find((x: any) => x.partner_id === e.subject_id); return p?.first_charged_at ? days(p.first_charged_at, e.created_at) : null; }).filter((x: any) => x != null) as number[];
  const calls = uniqCalls(ev.filter((e: any) => inP(e.created_at) && byWho(e)));
  return (<>
    <Kpis items={[{ l: '정착 진행 중', v: b.filter((p: any) => p.stage !== 'N_CHURN').length }, { l: '첫 계약 도달', v: reachedN4.length, s: rangeL }, { l: '충전 → 첫 계약', v: fmtDays(med(toN4)), s: '중앙값' },
      { l: '정착 위험 · 이탈', v: `${b.filter((p: any) => p.stage === 'N_RISK').length} · ${b.filter((p: any) => p.stage === 'N_CHURN').length}`, c: 'bad' }]} />
    <div className="perf-2">
      <section className="pcard"><h3 className="h3">지금 단계 분포</h3><div className="res-list">{NEW.map(([c, t]) => { const n = b.filter((p: any) => p.stage === c).length; return <div className="r" key={c}><span>{t}</span><span className="b"><i style={{ width: `${(n / (b.length || 1)) * 100}%`, background: c === 'N_CHURN' || c === 'N_RISK' ? 'var(--bad)' : 'var(--accent)' }} /></span><span className="n">{n}</span></div>; })}</div></section>
      <section className="pcard"><h3 className="h3">신규 정착 콜 <span className="sub">{rangeL}</span></h3>
        <div className="grid2"><div><span>콜</span><b>{calls.length}</b></div><div><span>연결률</span><b>{pct(calls.filter((c: any) => c.connect === 'connected').length, calls.length)}</b></div>
          <div><span>파트너</span><b>{new Set(calls.map((c: any) => c.subject_id)).size}</b></div><div><span>상태 판정 기록</span><b>{calls.filter((c: any) => c.state_code).length}</b></div></div>
        <div className="rule">AE에서 첫 견적까지 마친 파트너가 여기로 넘어와요. 상태 판정(A~E) · 현장 의견은 콜 기록에서 남겨요.</div></section>
    </div>
  </>);
}

function ActivePerf({ data, rangeL }: any) {
  const LINES = ['miso_visit', 'visit_quote'];
  const amLine = LINES.map((l) => data.perf.find((x: any) => x.service_line === l) || { service_line: l, active_partners: 0, capa_known: 0, max_capa: 0, actual_jobs: 0, utilization: null, quotes: 0, selected: 0, selection_rate: null });
  const act = data.board.filter((p: any) => p.track === 'active');
  return (<>
    <Kpis items={[{ l: '캐파 확대 파트너', v: act.length }, { l: '캐파 파악', v: act.filter((p: any) => p.monthly_capacity).length, s: pct(act.filter((p: any) => p.monthly_capacity).length, act.length) },
      { l: '핵심 파트너', v: act.filter((p: any) => p.stage === 'A4').length, c: 'ok' }, { l: '이탈 위험', v: act.filter((p: any) => p.stage === 'A_RISK').length, c: 'bad' }]} />
    <div className="tbl-wrap" style={{ marginTop: 12 }}><table className="perf">
      <thead><tr><th>서비스</th><th className="num">활동 파트너</th><th className="num">캐파 파악</th><th className="num">맥스캐파</th><th className="num">실제 투입</th><th className="num">가동률</th><th className="num">견적</th><th className="num">선택</th><th className="num">선택률</th></tr></thead>
      <tbody>{amLine.map((x: any) => <tr key={x.service_line} style={{ cursor: 'default' }}><td><b>{LINE_L[x.service_line]}</b></td><td className="num">{x.active_partners}</td>
        <td className="num">{x.capa_known} <span className="sub">{pct(x.capa_known, x.active_partners)}</span></td><td className="num">{x.max_capa}건</td><td className="num">{x.actual_jobs}건</td>
        <td className="num"><b>{x.utilization == null ? '–' : Math.round(x.utilization * 1000) / 10 + '%'}</b> <Bar v={n0(x.utilization)} max={1} tone={n0(x.utilization) >= 0.3 ? 'var(--ok)' : 'var(--warn)'} /></td>
        <td className="num">{x.quotes}</td><td className="num">{x.selected}</td><td className="num">{x.selection_rate == null ? '–' : Math.round(x.selection_rate * 1000) / 10 + '%'}</td></tr>)}</tbody></table></div>
    <div className="rule" style={{ marginTop: 6 }}>{rangeL} 기준 · 가동률 = 캐파 파악된 활동 파트너의 미소 확정 건 ÷ 월 캐파 환산. 캐파 파악률이 낮으면 일부 파트너만의 값이에요.</div>
  </>);
}

// ───────── 예약콜 ─────────
function BookingPerf({ from, rangeL }: any) {
  const { data, err } = useLoad(async () => fetchAll((a, b) => sb().from('v_booking_board').select('order_id,stage,d0,lost_reason,won_by_call,call_count,service_type').gte('d0', ymd(from)).range(a, b)), [+from]);
  if (err) return <div className="errbox">{err}</div>; if (!data) return <div className="loading">불러오는 중…</div>;
  const book = data; const won4 = book.filter((b: any) => b.stage === 'B4_WON'); const lost = book.filter((b: any) => b.stage === 'BX_LOST'); const closed = book.filter((b: any) => ['B4_WON', 'BX_LOST', 'B_EXPIRED'].includes(b.stage));
  const called = closed.filter((b: any) => b.call_count > 0); const uncalled = closed.filter((b: any) => !b.call_count);
  const lostBy = top(lost.map((b: any) => LOST_L[b.lost_reason || 'etc'] || b.lost_reason));
  return (<>
    <Kpis items={[{ l: '관리 오더', v: book.length, s: `방문일 ${rangeL}` }, { l: '계약 확정', v: won4.length, s: `종료 중 ${pct(won4.length, closed.length)}`, c: 'ok' }, { l: '예약콜 기여', v: won4.filter((b: any) => b.won_by_call).length }, { l: '이탈', v: lost.length, c: lost.length ? 'bad' : '' }]} />
    <div className="perf-2">
      <section className="pcard"><h3 className="h3">콜 효과</h3><div className="grid2"><div><span>콜 한 오더 확정률</span><b>{pct(called.filter((b: any) => b.stage === 'B4_WON').length, called.length)}</b></div>
        <div><span>콜 안 한 오더 확정률</span><b>{pct(uncalled.filter((b: any) => b.stage === 'B4_WON').length, uncalled.length)}</b></div></div>
        <div className="rule">두 값 차이가 예약콜의 효과 추정치예요(오더 성격 차이는 걸러지지 않음).</div></section>
      <TopList title="이탈 사유" rows={lostBy} tone="var(--bad)" empty="이탈 없음" />
    </div>
  </>);
}

// ───────── 팀 · 팔로우업 ─────────
function TeamPerf({ inP, from, staffName, rangeL }: any) {
  const { data, err } = useLoad(async () => {
    const [calls, today] = await Promise.all([fetchAll((a, b) => sb().from('activity_events').select('call_group,actor_id,module,connect,next_action_at,stage_after,created_at').eq('event_type', 'call').gte('created_at', from.toISOString()).range(a, b)),
      sb().from('v_today').select('subject,followup_at,stage,owner_id')]);
    return { calls, today: today.data || [] };
  }, [+from]);
  if (err) return <div className="errbox">{err}</div>; if (!data) return <div className="loading">불러오는 중…</div>;
  const u = uniqCalls(data.calls.map((c: any) => ({ ...c, event_type: 'call' }))).filter((c: any) => inP(c.created_at)); const now = Date.now();
  const ids = [...new Set(u.map((c: any) => c.actor_id).filter(Boolean))] as string[];
  const mods = ['ae', 'am_care', 'am_new', 'am_active', 'booking'];
  const rows = ids.map((id) => { const r = u.filter((c: any) => c.actor_id === id); return { id, n: r.length, con: r.filter((c: any) => c.connect === 'connected').length, by: mods.map((m) => r.filter((c: any) => c.module === m).length), fu: r.filter((c: any) => c.next_action_at).length,
    over: data.today.filter((t: any) => t.owner_id === id && t.followup_at && Date.parse(t.followup_at) < now).length }; }).sort((a, b) => b.n - a.n);
  const overdue = data.today.filter((t: any) => t.followup_at && Date.parse(t.followup_at) < now).length; const missing = data.today.filter((t: any) => !t.followup_at && !(t.subject === 'order' && t.stage === 'B0')).length;
  return (<>
    <Kpis items={[{ l: '총 콜', v: u.length, s: rangeL }, { l: '연결률', v: pct(u.filter((c: any) => c.connect === 'connected').length, u.length) }, { l: '지난 팔로우업', v: overdue, c: overdue ? 'bad' : '', s: '지금 · 전 업무' }, { l: '팔로우업 미등록', v: missing, c: missing ? 'bad' : '', s: '지금 · 진행 중 대상' }]} />
    <div className="tbl-wrap" style={{ marginTop: 12 }}><table className="perf"><thead><tr><th>담당</th><th className="num">콜</th><th className="num">연결률</th>{mods.map((m) => <th key={m} className="num">{MOD_L[m]}</th>)}<th className="num">팔로우업 설정</th><th className="num">지난 팔로우업</th></tr></thead>
      <tbody>{rows.length ? rows.map((x) => <tr key={x.id} style={{ cursor: 'default' }}><td><b>{staffName(x.id)}</b></td><td className="num">{x.n}</td><td className="num">{pct(x.con, x.n)}</td>{x.by.map((v, i) => <td key={i} className="num">{v || ''}</td>)}<td className="num">{pct(x.fu, x.n)}</td><td className="num" style={{ color: x.over ? 'var(--bad)' : undefined }}>{x.over}</td></tr>)
        : <tr><td colSpan={9} className="empty">기간 안 콜 없음</td></tr>}</tbody></table></div>
  </>);
}
