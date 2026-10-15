'use client';
import { useState } from 'react';
import { sb } from '@/lib/data';
import { useLoad } from '@/components/useBoard';
import Kpis, { Head, Seg } from '@/components/Kpis';
import Detail from '@/components/Detail';
import { useAssign, AssignToggle, AssignBar } from '@/components/Assign';
import { useStaff } from '@/components/StaffContext';
import { BOOK_STAGES, dayDiff, fmtD, fmtDT, outcomeText, ymd } from '@/lib/ui';

const OPEN = ['B0', 'B1', 'B2', 'B3'];
function due(o: any) {
  if (!OPEN.includes(o.stage)) return null;
  if (o.stage === 'B0') return o.quote_count === 0 ? { why: '견적 0건 · 공급 경고', t: null } : null;
  if (o.stage === 'B1' && !o.next_call_at) return { why: '1차 예약콜 대기', t: null };
  if (o.next_call_at) return { why: o.stage === 'B3' ? '부재 재시도' : '예약된 재통화', t: new Date(o.next_call_at) };
  return { why: '팔로우업 미등록', t: null };
}
function Slots({ n }: { n: number }) {
  return <span className="slots" aria-label={`견적 ${n}건 중 ${Math.min(4, n)}건 노출`}>{[0, 1, 2, 3, 4, 5].map((i) => <i key={i} className={i < Math.min(4, n) ? 'shown' : i < n ? 'hidden' : ''} />)}</span>;
}
export default function Booking() {
  const { me } = useStaff();
  const a = useAssign();
  const [filter, setFilter] = useState('all'); const [q, setQ] = useState(''); const [open, setOpen] = useState<number | null>(null);
  const { data, err, reload } = useLoad(async () => {
    const since = ymd(new Date(Date.now() - 8 * 864e5));
    const { data, error } = await sb().from('v_booking_board').select('*').gte('d0', since); if (error) throw error; return data || [];
  });
  const all = data || [];
  const list = all.filter((o: any) => (!q || `${o.order_id}${o.customer_label}${o.region}${o.planner_name}`.includes(q)) &&
    (filter === 'all' || (filter === 'mine' && o.owner_id === me.id) || (filter === 'none' && !o.owner_id) || (filter === 'zero' && o.quote_count === 0)));
  const now = new Date();
  const queue = list.map((o: any) => ({ o, d: due(o) })).filter((x: any) => x.d && (!x.d.t || x.d.t <= new Date(now.getTime() + 8 * 3600e3)))
    .sort((a: any, b: any) => dayDiff(b.o.d0) - dayDiff(a.o.d0) || ((a.d.t?.getTime() ?? 0) - (b.d.t?.getTime() ?? 0)));
  const closed = all.filter((o: any) => !OPEN.includes(o.stage));
  const card = (o: any) => { const dd = dayDiff(o.d0); const d = due(o); const openStage = OPEN.includes(o.stage);
    return <button key={o.order_id} className={`card ${dd >= 4 && openStage ? 'sla-bad' : dd === 3 && openStage ? 'sla-warn' : ''} ${a.picked.includes(o.order_id) ? 'picked' : ''}`} onClick={() => (a.on ? a.toggle(o.order_id) : setOpen(o.order_id))}>
      <div className="r1"><span className="nm">{o.customer_label || '고객'} · {(o.region || '').split(' ')[0]}</span><span className={`rt dd d${dd}`} style={{ fontSize: 12, padding: '0 6px' }}>D+{dd}</span></div>
      <div className="meta"><span>{o.pyeong}평</span><span>이사 <b>{fmtD(o.move_date)}</b></span><span>플래너 {o.planner_name || '–'}</span></div>
      <div className="meta" style={{ alignItems: 'center' }}><Slots n={o.quote_count} /><span>제출 <b>{o.quote_count}</b> · 노출 <b>{Math.min(4, o.quote_count)}</b></span></div>
      {o.supply_alert ? <div className="meta"><span className="chip bad">수동매칭 요청됨</span></div> : o.quote_count === 0 ? <div className="meta"><span className="chip warn">견적 0건</span></div> : null}
      {(o.hesitation_tags || []).length > 0 && <div className="meta">{o.hesitation_tags.map((t: string) => <span className="chip" key={t}>{t}</span>)}</div>}
      {o.last_call_at && <div className="meta" style={{ fontSize: 12.5 }}><span>{o.call_count}회 · {fmtD(o.last_call_at)} {outcomeText({ connect: o.last_connect, result: o.last_result })}</span></div>}
      {o.stage === 'B4_WON' ? <div className="next"><span className="chip ok">확정</span></div> : o.stage === 'BX_LOST' ? <div className="next"><span className="chip bad">이탈</span></div> : o.stage === 'B_EXPIRED' ? <div className="next">D+5 경과 · 종료</div>
        : d ? <div className="next"><span className={`when ${!d.t || d.t <= now ? 'over' : ''}`}>{d.t ? (d.t <= now ? '지금' : fmtDT(d.t)) : '지금'}</span>{d.why}</div> : <div className="next">견적 수집 중</div>}
    </button>; };
  return (<>
    <Head title="예약콜 큐" sub="미소방문 오더를 방문일(D0)부터 D+5까지 챙겨요." />
    <Kpis items={[{ l: '진행 중 오더', v: all.filter((o: any) => OPEN.includes(o.stage)).length, s: 'D0 ~ D+5' }, { l: '지금 걸 콜', v: queue.length, s: `기한 임박(D+4↑) ${queue.filter((x: any) => dayDiff(x.o.d0) >= 4).length}건`, c: queue.length ? 'bad' : '' },
      { l: '최근 종료', v: closed.length, s: `확정 ${closed.filter((o: any) => o.stage === 'B4_WON').length}건` }, { l: '견적 0 · 공급 경고', v: all.filter((o: any) => OPEN.includes(o.stage) && o.quote_count === 0).length }]} />
    <div className="toolbar"><Seg value={filter} onChange={setFilter} opts={[['all', '전체'], ['mine', '내 담당'], ['none', '미배정'], ['zero', '견적 0건']]} />
      <input className="search" placeholder="오더·고객·지역 검색" value={q} onChange={(e) => setQ(e.target.value)} /><AssignToggle a={a} /></div>
    {err && <div className="errbox">{err}</div>}
    <h2 className="section-title">지금 걸 콜 <small>기한 임박 순 → 예약 시각 순</small></h2>
    <div className="queue">{queue.length ? queue.map(({ o, d }: any) => { const dd = dayDiff(o.d0);
      return <button key={o.order_id} className="qrow" onClick={() => setOpen(o.order_id)}><span className={`dd d${dd}`}>D+{dd}</span>
        <span style={{ minWidth: 0 }}><b>{o.customer_label || '고객'} · {o.region}</b><div className="why">{o.pyeong}평 · 이사일 {fmtD(o.move_date)} · <span className="mono">오더 {o.order_id}</span></div></span>
        <span className="hide-sm" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><Slots n={o.quote_count} /><span className="why">견적 {o.quote_count}건</span></span>
        <span className="hide-sm"><span className="code">{o.stage}</span> <span className="why">{d.why}</span></span>
        <span className="hide-sm mono" style={{ textAlign: 'right', ...(!d.t || d.t <= now ? { color: 'var(--bad)', fontWeight: 600 } : {}) }}>{d.t && d.t > now ? fmtDT(d.t) : '지금'}<div className="why">콜 {o.call_count}회</div></span></button>; })
      : <div className="empty">{data ? '지금 걸 콜이 없습니다' : '불러오는 중…'}</div>}</div>
    <div className="rule">견적 노출 규칙: 제출 0~4건은 전부 노출, 5건이면 하위 1건 · 6건이면 하위 2건을 숨기고 4건만 고객에게 보여줍니다.</div>
    <h2 className="section-title">스테이지 보드</h2>
    <div className="board-wrap"><div className="board">
      {BOOK_STAGES.filter((s) => OPEN.includes(s.c)).map((s) => { const items = list.filter((o: any) => o.stage === s.c).sort((a: any, b: any) => dayDiff(b.d0) - dayDiff(a.d0));
        return <section className="col" key={s.c}><div className="col-h"><div className="t"><span className="code">{s.c}</span>{s.t}<span className="n">{items.length}</span></div><div className="d">{s.d}</div></div>
          <div className="col-b">{items.length ? items.map(card) : <div className="empty">없음</div>}</div></section>; })}
      <section className="col"><div className="col-h"><div className="t"><span className="code">END</span>최근 종료<span className="n">{closed.length}</span></div><div className="d">확정 · 이탈 · 기한 만료 — 큐에서는 빠짐</div></div>
        <div className="col-b">{list.filter((o: any) => !OPEN.includes(o.stage)).map(card)}</div></section>
    </div></div>
    <AssignBar a={a} subject="order" all={list.filter((o: any) => OPEN.includes(o.stage)).map((o: any) => o.order_id)} onDone={reload} />
    {open != null && <Detail subject="order" id={open} onClose={() => setOpen(null)} onChanged={reload} onNavigate={setOpen}
      ids={[...new Set([...queue.map((x: any) => x.o.order_id), ...list.filter((o: any) => OPEN.includes(o.stage)).map((o: any) => o.order_id)])]} />}
  </>);
}
