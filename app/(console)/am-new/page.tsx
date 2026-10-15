'use client';
import { useState } from 'react';
import { sb } from '@/lib/data';
import { useLoad } from '@/components/useBoard';
import Kpis, { Head, Seg } from '@/components/Kpis';
import Detail from '@/components/Detail';
import { useAssign, AssignToggle, AssignBar } from '@/components/Assign';
import { useStaff, useStaffName } from '@/components/StaffContext';
import { NEW_STAGES, dayDiff, won, fmtD, slaState, outcomeText, endOfToday } from '@/lib/ui';

export default function AmNew() {
  const { me } = useStaff(); const staffName = useStaffName();
  const a = useAssign();
  const [filter, setFilter] = useState('all'); const [q, setQ] = useState(''); const [open, setOpen] = useState<number | null>(null);
  const { data, err, reload } = useLoad(async () => {
    const { data, error } = await sb().from('v_am_board').select('*').eq('track', 'new').neq('stage', 'N_CHURN');
    if (error) throw error; return data || [];
  });
  const all = data || [];
  const list = all.filter((p: any) => (!q || (p.name + p.region + p.partner_id).includes(q)) &&
    (filter === 'all' || (filter === 'mine' && p.owner_id === me.id) || (filter === 'none' && !p.owner_id) || (filter === 'late' && slaState(p.stage, p.stage_entered_at) === 'sla-bad') || (filter === 'due' && p.next_action_at && new Date(p.next_action_at) <= endOfToday())));
  const late = all.filter((p: any) => slaState(p.stage, p.stage_entered_at) === 'sla-bad').length;
  const due = all.filter((p: any) => p.next_action_at && new Date(p.next_action_at) <= endOfToday()).length;
  const card = (p: any) => {
    const over = p.next_action_at && new Date(p.next_action_at) <= endOfToday();
    return <button key={p.partner_id} className={`card ${slaState(p.stage, p.stage_entered_at)} ${a.picked.includes(p.partner_id) ? 'picked' : ''}`} onClick={() => (a.on ? a.toggle(p.partner_id) : setOpen(p.partner_id))}>
      <div className="r1"><span className="nm">{p.name}</span><span className="rt meta"><b>D+{dayDiff(p.first_charged_at)}</b></span></div>
      <div className="meta"><span>{p.region}</span>{(p.service_types || []).map((s: string) => <span key={s} className={`chip ${s === 'miso_visit' ? 'mv' : ''}`}>{s === 'miso_visit' ? '미소방문' : '방문견적'}</span>)}{p.instant_quote_on === false && <span className="chip warn">1초견적 OFF</span>}</div>
      <div className="meta"><span>견적 <b>{p.quotes}</b></span><span>선택 <b>{p.selected}</b></span><span>평점 <b>{p.rating ?? '–'}</b></span><span>잔액 <b>{won(p.balance)}</b></span></div>
      <div className="meta" style={{ fontSize: 12.5 }}><span>담당 {p.owner_id ? staffName(p.owner_id) : '미배정'}</span></div>
      {p.last_call_at && <div className="meta" style={{ fontSize: 12.5 }}><span>{p.call_count}회 · {fmtD(p.last_call_at)} {outcomeText({ connect: p.last_connect, result: p.last_result })}</span></div>}
      {p.next_action_at ? <div className="next"><span className={`when mono ${over ? 'over' : ''}`}>{fmtD(p.next_action_at)}</span><span>{p.next_action_note || '팔로우업'}</span></div> : <div className="next"><span className="when over">팔로우업 미등록</span></div>}
    </button>;
  };
  const risk = list.filter((p: any) => p.stage === 'N_RISK');
  return (<>
    <Head title="신규 정착" sub="첫 충전한 파트너를 첫 계약 · 첫 리뷰까지. 색 띠 = 단계 기한 임박(주황) · 초과(빨강)." />
    <Kpis items={[{ l: '정착 진행 중', v: all.length }, { l: '오늘 팔로우업', v: due, s: '지난 것 포함', c: due ? 'bad' : '' }, { l: 'SLA 초과', v: late, c: late ? 'bad' : '' }, { l: '정착 위험', v: all.filter((p: any) => p.stage === 'N_RISK').length, s: '재케어 큐' }]} />
    <div className="toolbar"><Seg value={filter} onChange={setFilter} opts={[['all', '전체'], ['mine', '내 담당'], ['none', '미배정'], ['due', '오늘 팔로우업'], ['late', 'SLA 초과']]} />
      <input className="search" placeholder="파트너 검색" value={q} onChange={(e) => setQ(e.target.value)} /><AssignToggle a={a} /></div>
    {err && <div className="errbox">{err}</div>}
    {!data ? <div className="loading">불러오는 중…</div> : !all.length ? <div className="empty">아직 신규 정착 파트너가 없어요. 첫 충전 동기화가 연결되면 자동으로 채워집니다.</div> :
      <div className="board-wrap"><div className="board">
        {NEW_STAGES.map((s) => { const items = list.filter((p: any) => p.stage === s.c);
          return <section className="col" key={s.c}><div className="col-h"><div className="t"><span className="code">{s.c}</span>{s.t}<span className="n">{items.length}</span></div><div className="d">{s.d} · SLA {s.sla}일</div></div>
            <div className="col-b">{items.length ? items.map(card) : <div className="empty">없음</div>}</div></section>; })}
        <section className="col risk"><div className="col-h"><div className="t"><span className="code">N!</span>정착 위험 · 재케어<span className="n">{risk.length}</span></div><div className="d">부재 5회 · 잔액 소진 · 견적 끊김</div></div>
          <div className="col-b">{risk.length ? risk.map(card) : <div className="empty">없음</div>}</div></section>
      </div></div>}
    <AssignBar a={a} subject="partner" all={list.map((p: any) => p.partner_id)} onDone={reload} />
    {open != null && <Detail subject="partner" id={open} onClose={() => setOpen(null)} onChanged={reload} onNavigate={setOpen}
      ids={[...list].sort((x: any, y: any) => (x.next_action_at ? Date.parse(x.next_action_at) : 9e15) - (y.next_action_at ? Date.parse(y.next_action_at) : 9e15)).map((p: any) => p.partner_id)} />}
  </>);
}
