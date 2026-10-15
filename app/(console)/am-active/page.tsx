'use client';
import { useState } from 'react';
import { sb } from '@/lib/data';
import { useLoad } from '@/components/useBoard';
import Kpis, { Head, Seg } from '@/components/Kpis';
import Detail from '@/components/Detail';
import { useAssign, AssignToggle, AssignBar } from '@/components/Assign';
import { useStaff, useStaffName } from '@/components/StaffContext';
import { stageLabel, fmtD, outcomeText, endOfToday } from '@/lib/ui';

export default function AmActive() {
  const { me } = useStaff(); const staffName = useStaffName();
  const a = useAssign();
  const [filter, setFilter] = useState('all'); const [q, setQ] = useState(''); const [open, setOpen] = useState<number | null>(null);
  const { data, err, reload } = useLoad(async () => {
    const { data, error } = await sb().from('v_am_board').select('*').eq('track', 'active'); if (error) throw error; return data || [];
  });
  const all = data || [];
  const order: any = { A_RISK: 0, A1: 1, A3: 2, A2: 3, A4: 4 };
  const list = all.filter((p: any) => (!q || (p.name + p.region + p.partner_id).includes(q)) &&
    (filter === 'all' || (filter === 'mine' && p.owner_id === me.id) || (filter === 'none' && !p.owner_id) || (filter === 'risk' && p.stage === 'A_RISK') || (filter === 'nocap' && !p.monthly_capacity)))
    .sort((a: any, b: any) => order[a.stage] - order[b.stage]);
  const withCap = all.filter((p: any) => p.monthly_capacity);
  const totCap = withCap.reduce((s: number, p: any) => s + p.monthly_capacity, 0), totCon = withCap.reduce((s: number, p: any) => s + (p.contracts || 0), 0);
  const chip = (s: string) => s === 'A_RISK' ? <span className="chip bad">이탈 위험</span> : s === 'A4' ? <span className="chip ok">핵심 파트너</span> : s === 'A1' ? <span className="chip warn">캐파 미파악</span> : <span className="chip">{stageLabel(s)}</span>;
  return (<>
    <Head title="캐파 확대" sub="정착한 파트너의 캐파를 파악하고 미소 비중을 늘려요. 투입률 = 이번 달 미소 계약 ÷ 월 캐파." />
    <Kpis items={[{ l: '관리 파트너', v: all.length, s: `캐파 파악 ${withCap.length}곳` }, { l: '평균 미소 투입률', v: totCap ? Math.round(totCon / totCap * 100) + '%' : '–', s: `계약 ${totCon} / 캐파 ${totCap}건` },
      { l: '핵심 파트너', v: all.filter((p: any) => p.stage === 'A4').length, c: 'ok' }, { l: '이탈 위험', v: all.filter((p: any) => p.stage === 'A_RISK').length, c: 'bad' }]} />
    <div className="toolbar"><Seg value={filter} onChange={setFilter} opts={[['all', '전체'], ['mine', '내 담당'], ['none', '미배정'], ['nocap', '캐파 미파악'], ['risk', '이탈 위험']]} />
      <input className="search" placeholder="파트너 검색" value={q} onChange={(e) => setQ(e.target.value)} /><AssignToggle a={a} /></div>
    {err && <div className="errbox">{err}</div>}
    {!data ? <div className="loading">불러오는 중…</div> :
      <div className="tbl-wrap"><table><thead><tr><th>파트너</th><th>단계</th><th className="num">팀</th><th>차량 (톤수별)</th><th className="num">인력</th><th className="num">월 캐파</th><th className="num">계약/목표</th><th>미소 투입률</th><th className="num">견적 참여율</th><th>최근 콜</th><th className="num">팔로우업</th><th>담당</th></tr></thead>
        <tbody>{list.map((p: any) => { const sh = p.monthly_capacity ? (p.contracts || 0) / p.monthly_capacity : null; const t = p.trucks || {};
          const goal = p.miso_target_month && p.monthly_capacity ? Math.min(1, p.miso_target_month / p.monthly_capacity) : null;
          return <tr key={p.partner_id} tabIndex={0} className={a.picked.includes(p.partner_id) ? 'picked' : ''} onClick={() => (a.on ? a.toggle(p.partner_id) : setOpen(p.partner_id))} onKeyDown={(e) => e.key === 'Enter' && setOpen(p.partner_id)}>
            <td><div style={{ fontWeight: 600 }}>{p.name}</div><div style={{ fontSize: 13, color: 'var(--muted)' }}>{p.region} · <span className="mono">{p.partner_id}</span></div></td>
            <td>{chip(p.stage)}</td><td className="num">{p.teams ?? '–'}</td>
            <td>{p.teams ? <span className="trucks">1t <b>{t['1t'] ?? 0}</b> · 2.5t <b>{t['2.5t'] ?? 0}</b> · 5t <b>{t['5t'] ?? 0}</b>{t['5t+'] ? <> · 5t+ <b>{t['5t+']}</b></> : null}</span> : <span className="trucks">인터뷰 필요</span>}</td>
            <td className="num">{p.teams ? (p.crew_regular || 0) + (p.crew_daily || 0) : '–'}</td><td className="num">{p.monthly_capacity ?? '–'}</td>
            <td className="num">{p.contracts ?? 0}{p.miso_target_month ? <span style={{ color: 'var(--faint)' }}>/{p.miso_target_month}</span> : null}</td>
            <td>{sh != null ? <div className="share"><div className="bar"><i style={{ width: `${Math.min(100, sh * 100)}%`, background: sh >= 0.4 ? 'var(--ok)' : 'var(--accent)' }} />{goal ? <span className="goal" style={{ left: `${goal * 100}%` }} /> : null}</div>{Math.round(sh * 100)}%</div> : <span style={{ color: 'var(--faint)' }}>–</span>}</td>
            <td className="num">{p.requests_received ? Math.round(p.quotes_submitted / p.requests_received * 100) + '%' : '–'}</td>
            <td style={{ fontSize: 13 }}>{p.last_call_at ? <><span className="mono">{fmtD(p.last_call_at)}</span> {outcomeText({ connect: p.last_connect, result: p.last_result })}</> : '–'}</td>
            <td className="num">{p.next_action_at ? <span className="mono" style={new Date(p.next_action_at) <= endOfToday() ? { color: 'var(--bad)', fontWeight: 600 } : {}}>{fmtD(p.next_action_at)}</span> : <span style={{ color: 'var(--bad)' }}>없음</span>}</td>
            <td>{p.owner_id ? staffName(p.owner_id) : '미배정'}</td></tr>; })}
          {!list.length && <tr><td colSpan={12} className="empty">아직 캐파 확대 파트너가 없어요</td></tr>}</tbody></table></div>}
    <AssignBar a={a} subject="partner" all={list.map((p: any) => p.partner_id)} onDone={reload} />
    {open != null && <Detail subject="partner" id={open} onClose={() => setOpen(null)} onChanged={reload} onNavigate={setOpen} ids={list.map((p: any) => p.partner_id)} />}
  </>);
}
