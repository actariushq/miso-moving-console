'use client';
import Icon from '@/components/Icon';
import { useMemo, useState } from 'react';
import { sb, fetchAll } from '@/lib/data';
import { useLoad } from '@/components/useBoard';
import Kpis, { Head, Seg } from '@/components/Kpis';
import Detail from '@/components/Detail';
import AeTabs from '@/components/AeTabs';
import { useStaff, useStaffName } from '@/components/StaffContext';
import { useViewers } from '@/components/Presence';
import { AE_PRIO, aePriority, aeLabels, stageLabel, fmtD, fmtDT, relTime, outcomeText, endOfToday, ymd } from '@/lib/ui';

// AE 팔로우업: 날짜가 된(또는 지난) 팔로우업을 처리하는 탭. 콜을 기록하면서 다음 날짜를 잡으면 목록에서 빠진다
const dayEnd = (n: number) => new Date(Date.parse(ymd(new Date()) + 'T23:59:59+09:00') + n * 864e5);

export default function AeFollowup() {
  const { me } = useStaff(); const staffName = useStaffName(); const viewers = useViewers();
  const [scope, setScope] = useState<string | null>(null); const [open, setOpen] = useState<number | null>(null); const [ids, setIds] = useState<number[]>([]);
  const [msg, setMsg] = useState('');
  const { data, err, reload } = useLoad(async () => {
    const rows = await fetchAll((f, t) => sb().from('v_ae_board').select('*').not('stage', 'in', '("WON","LOST")').range(f, t));
    return rows.map((r: any) => ({ ...r, _p: aePriority(r), _labels: aeLabels(r) }));
  });
  const rows = data || [];
  const cnt = (s: string) => rows.filter((r: any) => ((r.next_action_at && new Date(r.next_action_at) <= endOfToday()) || (r.signal_change_at && Date.now() - Date.parse(r.signal_change_at) < 3 * 864e5 && (!r.last_call_at || Date.parse(r.last_call_at) < Date.parse(r.signal_change_at)))) && (s === 'all' || (s === 'mine' ? r.owner_id === me.id : !r.owner_id))).length;
  const sc = scope ?? (cnt('mine') ? 'mine' : 'all');
  const mine = rows.filter((r: any) => sc === 'all' || (sc === 'mine' ? r.owner_id === me.id : !r.owner_id));
  const now = new Date(); const byTime = (x: any, y: any) => +new Date(x.next_action_at) - +new Date(y.next_action_at) || x._p - y._p;
  const inRange = (r: any, a: Date | null, b: Date) => r.next_action_at && (!a || new Date(r.next_action_at) > a) && new Date(r.next_action_at) <= b;
  const over = mine.filter((r: any) => r.next_action_at && new Date(r.next_action_at) < now).sort(byTime);
  const today = mine.filter((r: any) => r.next_action_at && new Date(r.next_action_at) >= now && new Date(r.next_action_at) <= dayEnd(0)).sort(byTime);
  const tomorrow = mine.filter((r: any) => inRange(r, dayEnd(0), dayEnd(1))).sort(byTime);
  const week = mine.filter((r: any) => inRange(r, dayEnd(1), dayEnd(7))).sort(byTime);
  // 오늘 생긴 신호: 최근 3일 안에 리대시 신호가 바뀌었고 그 뒤로 아직 콜을 안 한 리드
  const fresh = (r: any) => r.signal_change_at && Date.now() - Date.parse(r.signal_change_at) < 3 * 864e5 && (!r.last_call_at || Date.parse(r.last_call_at) < Date.parse(r.signal_change_at));
  const signals = mine.filter(fresh).sort((x: any, y: any) => x._p - y._p || Date.parse(y.signal_change_at) - Date.parse(x.signal_change_at));
  const missing = mine.filter((r: any) => !r.next_action_at && r.stage !== 'E0').sort((x: any, y: any) => x._p - y._p);
  const queue = useMemo(() => [...new Set([...signals, ...over, ...today].map((r: any) => r.id))], [data, sc]);

  async function snooze(r: any, days: number) {
    const base = new Date(r.next_action_at || Date.now()); const hm = fmtDT(base).split(' ')[1] || '10:00';
    const at = new Date(`${ymd(dayEnd(days))}T${hm}:00+09:00`);
    const { error } = await sb().rpc('set_lead_followup', { p_id: r.id, p_at: at.toISOString(), p_note: r.next_action_note });
    setMsg(error ? '실패: ' + error.message : `${r.name} → ${fmtDT(at)}로 미룸 (이력에 남아요)`); setTimeout(() => setMsg(''), 2600); reload();
  }
  const openIn = (id: number, list: any[]) => { setIds(list.map((x: any) => x.id)); setOpen(id); };
  const Row = (r: any, list: any[], tone = '') => (
    <div key={r.id} className={`frow ${tone}`} role="button" tabIndex={0} onClick={() => openIn(r.id, list)} onKeyDown={(e) => e.key === 'Enter' && openIn(r.id, list)}>
      <span className={`mono ${tone === 'bad' ? 'over' : ''}`}>{tone === 'sig' ? relTime(r.signal_change_at) : r.next_action_at ? relTime(r.next_action_at) : '미등록'}</span>
      <span style={{ minWidth: 0 }}><b>{r.name}</b> <span className={`chip ${AE_PRIO[r._p].cls}`}>P{r._p}</span>{viewers('lead', r.id).length > 0 && <span className="busy-dot"><Icon n="eye" s={13} /> {viewers('lead', r.id)[0]} 보는 중</span>}<div className="todo">{tone === 'sig' ? `${r.signal_change}` : r.next_action_note || '할 일 메모 없음'}</div></span>
      <span className="hide-sm"><b className="stgname">{stageLabel(r.stage)}</b></span>
      <span className="hide-sm why">{r.last_call_at ? `${r.call_count}회 · ${fmtD(r.last_call_at)} ${outcomeText({ connect: r.last_connect, result: r.last_result })}${r.last_memo ? ' · ' + r.last_memo : ''}` : '콜 기록 없음'}</span>
      <span className="hide-sm lbls">{r._labels.slice(0, 2).map((l: any) => <span key={l.k} className={`chip ${l.tone || ''}`}>{l.t}</span>)}{(r.tags || []).slice(0, 2).map((t: string) => <span key={t} className="chip tag">#{t}</span>)}</span>
      <span className="hide-sm why">{r.owner_id ? staffName(r.owner_id) : '미배정'}</span>
      <span className="acts" onClick={(e) => e.stopPropagation()}>
        <button className="btn primary" onClick={() => openIn(r.id, list)}>처리</button>
        {r.next_action_at && <button className="btn" title="콜 없이 하루 미루기" onClick={() => snooze(r, 1)}>내일로</button>}
      </span>
    </div>);
  const Sec = ({ title, sub, list, tone }: any) => (<section className="today-sec"><h2 className="section-title">{title} <span className="n">{list.length}</span> <small>{sub}</small></h2>
    <div className="queue">{list.length ? list.map((r: any) => Row(r, list, tone)) : <div className="empty">없음</div>}</div></section>);

  return (<>
    <Head title="AE 팔로우업" sub="날짜가 된 팔로우업과 새 신호. ‘처리’를 누르고 콜을 기록하면 빠져요." />
    <AeTabs active="followup" due={cnt('all')} />
    <div className="toolbar"><Seg value={sc} onChange={setScope} opts={[['mine', `내 담당 ${cnt('mine')}`], ['none', `미배정 ${cnt('none')}`], ['all', `전체 ${cnt('all')}`]]} />
      {queue.length > 0 && <button className="btn primary" onClick={() => { setIds(queue); setOpen(queue[0]); }}>신호 → 지난 것 → 오늘 순서대로 처리 ({queue.length})</button>}
      {msg && <span className="ok-msg">{msg}</span>}</div>
    {err && <div className="errbox">{err}</div>}
    <Kpis items={[{ l: '오늘 생긴 신호', v: signals.length, c: signals.length ? 'ok' : '', s: '최근 3일 · 콜 전' }, { l: '지난 팔로우업', v: over.length, c: over.length ? 'bad' : '', s: '가장 오래된 것부터' }, { l: '오늘 남은', v: today.length }, { l: '내일', v: tomorrow.length }, { l: '이번 주 (2~7일)', v: week.length }, { l: '팔로우업 미등록', v: missing.length, c: missing.length ? 'bad' : '', s: '콜 했는데 다음 일정 없음' }]} />
    {!data ? <div className="loading">불러오는 중…</div> : <>
      <Sec title="오늘 생긴 신호" sub="리대시에서 서류·충전·요청 열람 등이 바뀐 리드 — 연락하기 가장 좋은 때예요 (콜을 기록하면 빠져요)" list={signals} tone="sig" />
      <Sec title="지난 팔로우업" sub="날짜가 지났는데 아직 처리 안 됨" list={over} tone="bad" />
      <Sec title="오늘" sub="오늘 안에 걸 콜" list={today} />
      <Sec title="내일" sub="미리 보기" list={tomorrow} />
      <Sec title="이번 주" sub="2~7일 뒤" list={week} />
      <Sec title="팔로우업 미등록" sub="콜은 했는데 다음 날짜가 없는 진행 중 리드" list={missing} tone="bad" />
    </>}
    {open != null && <Detail subject="lead" id={open} ids={ids} onNavigate={setOpen} onClose={() => setOpen(null)} onChanged={reload} />}
  </>);
}
