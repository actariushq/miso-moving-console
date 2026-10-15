'use client';
import { useState } from 'react';
import { sb } from '@/lib/data';
import { useLoad } from '@/components/useBoard';
import Kpis, { Head, Seg } from '@/components/Kpis';
import Detail from '@/components/Detail';
import { useStaff, useStaffName } from '@/components/StaffContext';
import { MOD_L, fmtDT, fmtD, endOfToday, stageLabel, careLabel, relTime } from '@/lib/ui';

export default function Today() {
  const { me } = useStaff(); const staffName = useStaffName();
  const [scope0, setScope] = useState<string | null>(null); const [open, setOpen] = useState<{ s: 'partner' | 'order' | 'lead'; id: number } | null>(null);
  const { data, err, reload } = useLoad(async () => { const { data, error } = await sb().from('v_today').select('*'); if (error) throw error; return data || []; });
  const cntOf = (sc: string) => (data || []).filter((r: any) => sc === 'all' || (sc === 'mine' ? r.owner_id === me.id : !r.owner_id)).length;
  const scope = scope0 ?? (cntOf('mine') ? 'mine' : 'all');
  const all = (data || []).filter((r: any) => scope === 'all' || (scope === 'mine' ? r.owner_id === me.id : !r.owner_id));
  const now = new Date(), eod = endOfToday();
  const overdue = all.filter((r: any) => r.followup_at && new Date(r.followup_at) < now).sort((a: any, b: any) => +new Date(a.followup_at) - +new Date(b.followup_at));
  const today = all.filter((r: any) => r.followup_at && new Date(r.followup_at) >= now && new Date(r.followup_at) <= eod).sort((a: any, b: any) => +new Date(a.followup_at) - +new Date(b.followup_at));
  const missing = all.filter((r: any) => !r.followup_at && !(r.subject === 'order' && r.stage === 'B0'));
  const later = all.filter((r: any) => r.followup_at && new Date(r.followup_at) > eod).length;
  const Row = (r: any, tone: string) => (
    <button key={r.subject + r.subject_id} className="trow" onClick={() => setOpen({ s: r.subject, id: r.subject_id })}>
      <span className="mono" style={tone === 'bad' ? { color: 'var(--bad)', fontWeight: 600 } : {}}>{r.followup_at ? relTime(r.followup_at) : '미등록'}</span>
      <span style={{ minWidth: 0 }}><b>{r.title}</b><div className="why">{r.note || ''}</div></span>
      <span className="hide-sm"><span className="mod">{MOD_L[r.module]}</span></span>
      <span className="hide-sm why"><span className="code">{r.stage}</span> {r.module === 'am_care' ? careLabel(r.stage) : stageLabel(r.stage)}</span>
      <span className="hide-sm why">최근 콜 {r.last_call_at ? fmtD(r.last_call_at) : '없음'}</span>
      <span className="hide-sm why">{r.owner_id ? staffName(r.owner_id) : '미배정'}</span>
    </button>);
  const Sec = ({ title, sub, rows, tone }: any) => (<section className="today-sec"><h2 className="section-title">{title} <small>{sub}</small></h2>
    <div className="queue">{rows.length ? rows.map((r: any) => Row(r, tone)) : <div className="empty">없음</div>}</div></section>);
  return (<>
    <Head title="오늘의 큐" sub="모든 업무의 팔로우업을 시간순으로. 지난 것부터 처리하세요." />
    <div className="toolbar"><Seg value={scope} onChange={setScope} opts={[['mine', `내 담당 ${cntOf('mine')}`], ['none', `미배정 ${cntOf('none')}`], ['all', `전체 ${cntOf('all')}`]]} /></div>
    {err && <div className="errbox">{err}</div>}
    <Kpis items={[{ l: '지난 팔로우업', v: overdue.length, c: overdue.length ? 'bad' : '', s: '가장 오래된 것부터' }, { l: '오늘 남은 팔로우업', v: today.length }, { l: '팔로우업 미등록', v: missing.length, c: missing.length ? 'bad' : '' }, { l: '내일 이후', v: later }]} />
    {!data ? <div className="loading">불러오는 중…</div> : <>
      <Sec title="지난 팔로우업" sub="시간이 지났는데 아직 처리 안 됨" rows={overdue} tone="bad" />
      <Sec title="오늘" sub="오늘 안에 걸 콜" rows={today} />
      <Sec title="팔로우업 미등록" sub="다음 일정이 없는 진행 중 대상" rows={missing} tone="bad" />
    </>}
    {open && <Detail subject={open.s} id={open.id} onClose={() => setOpen(null)} onChanged={reload} />}
  </>);
}
