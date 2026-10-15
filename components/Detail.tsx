'use client';
import Icon from './Icon';
import { useEffect, useMemo, useState } from 'react';
import { sb, reasonDict, touchCadence, reasonLabel, partnerNames } from '@/lib/data';
import { useStaff, useStaffName } from './StaffContext';
import LeadWorkspace from './LeadWorkspace';
import CareWorkspace from './CareWorkspace';
import { FollowupPicker, fuLabel, defaultFollowup } from './Followup';
import { useViewers, useTrackView, useLiveEvents } from './Presence';
import PhoneTag from './PhoneTag';
import {
  NEW_STAGES, ACTIVE_STAGES, BOOK_STAGES, AE_STAGES, LINE_L, SOURCE_L, stageLabel, CONNECT, CONNECT_L, RESULT_L, AM_STATE, VOC_TAGS, RX_CODES, HESIT,
  PURPOSE, CHECK, NOTE_KIND, rfqAdminUrl, careLabel, fmtD, fmtDT, dayDiff, won, toLocalInput, fromLocalInput, outcomeText, outcomeCls, modOfPartner, ymd,
} from '@/lib/ui';

type Props = { subject: 'partner' | 'order' | 'lead' | 'care'; id: number; onClose: () => void; onChanged: () => void; ids?: number[]; onNavigate?: (id: number) => void };

// AE 리드는 전체 화면 작업창(LeadWorkspace), 나머지는 우측 드로어
export default function Detail(p: Props) {
  if (p.subject === 'lead') return <LeadWorkspace id={p.id} onClose={p.onClose} onChanged={p.onChanged} ids={p.ids} onNavigate={p.onNavigate} />;
  if (p.subject === 'care') return <CareWorkspace id={p.id} onClose={p.onClose} onChanged={p.onChanged} ids={p.ids} onNavigate={p.onNavigate} />;
  return <Drawer {...p} />;
}

// AM(신규 정착 · 캐파 확대) · 예약콜 작업창 — AE와 같은 3단: 왼쪽 = 전화 전에 볼 것, 가운데 = 콜 기록, 오른쪽 = 단계 · 이력
function Drawer({ subject, id, onClose, onChanged, ids, onNavigate }: Props) {
  const [row, setRow] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [dict, setDict] = useState<any[]>([]);
  const [cadence, setCadence] = useState<any[]>([]);
  const [err, setErr] = useState('');
  const [toast, setToast] = useState('');
  const staffName = useStaffName(); const { me } = useStaff(); const viewers = useViewers();
  useTrackView(subject, id);
  useLiveEvents(subject, id, me.id, (e) => { setToast(`${staffName(e.actor_id)}님이 방금 기록했어요 — 새로 불러왔어요`); setTimeout(() => setToast(''), 4000); load(); onChanged(); });
  const pos = ids ? ids.indexOf(id) : -1;
  const go = (d: number) => { if (!ids || !onNavigate) return; for (let i = pos + d; i >= 0 && i < ids.length; i += d) if (!viewers(subject, ids[i]).length) return onNavigate(ids[i]); };

  async function load() {
    setErr('');
    const view = subject === 'partner' ? 'v_am_board' : subject === 'lead' ? 'v_ae_board' : 'v_booking_board';
    const key = subject === 'partner' ? 'partner_id' : subject === 'lead' ? 'id' : 'order_id';
    const [{ data: r, error: e1 }, { data: ev }, d, c] = await Promise.all([
      sb().from(view).select('*').eq(key, id).maybeSingle(),
      sb().from('activity_events').select('*').eq('subject', subject).eq('subject_id', id).order('created_at', { ascending: false }).limit(200),
      reasonDict(), touchCadence(),
    ]);
    if (e1) setErr(e1.message);
    setRow(r); setEvents(ev || []); setDict(d); setCadence(c);
    if (subject === 'order') {
      const { data: q } = await sb().from('v_quote_display').select('*').eq('order_id', id).order('display_rank');
      const names = await partnerNames((q || []).map((x: any) => x.partner_id));
      setQuotes((q || []).map((x: any) => ({ ...x, name: names[x.partner_id] || x.partner_id })));
    }
  }
  useEffect(() => { setRow(null); load(); }, [subject, id]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      const typing = /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName || '');
      if (!typing && e.altKey && e.key === 'ArrowRight') go(1);
      if (!typing && e.altKey && e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [onClose, pos, ids]);
  const done = async (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2600); await load(); onChanged(); };

  if (!row) return (<><div className="scrim" onClick={onClose} /><section className="ws anim"><div className="loading">{err || '불러오는 중…'}</div></section></>);
  const module = subject === 'order' ? 'booking' : modOfPartner(row.track);
  const calls = events.filter((e) => e.event_type === 'call');
  const pinned = events.filter((e) => e.event_type === 'note' && e.pinned);
  const admin = subject === 'partner' ? rfqAdminUrl(id) : null;
  const stages = subject === 'order' ? BOOK_STAGES : row.track === 'new' ? [...NEW_STAGES, { c: 'N_RISK', t: '정착 위험' }] : ACTIVE_STAGES;
  const curIdx = stages.findIndex((s: any) => s.c === row.stage);
  const dueTouch = subject === 'partner' && row.track === 'new' ? (cadenceStates(row, cadence, events).find((t: any) => t.st === 'over') || cadenceStates(row, cadence, events).find((t: any) => t.st === 'due')) : null;

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <section className="ws anim" role="dialog" aria-label="작업창">
        <header className="ws-h">
          <div className="ws-top">
            <span className="mod">{({ am_new: '신규 정착', am_active: '캐파 확대', booking: '예약콜' } as any)[module]}</span>
            <h2>{subject !== 'order' ? row.name : `${row.customer_label || '고객'} · ${row.region || ''}`}</h2>
            {subject === 'partner' && <PhoneTag partnerId={id} subject="partner" subjectId={id} module={module} />}
            {subject === 'order' && <span className={`dd d${dayDiff(row.d0)}`}>D+{dayDiff(row.d0)}</span>}
            {viewers(subject, id).length > 0 && <span className="busy"><Icon n="eye" /> {viewers(subject, id).join(', ')}님이 지금 보고 있어요 · 중복 통화 주의</span>}
            <span className="ws-nav">
              {ids && pos >= 0 && <><button className="btn" disabled={pos <= 0} onClick={() => go(-1)} title="이전 (Alt+←)">‹ 이전</button><span className="mono">{pos + 1} / {ids.length}</span><button className="btn" disabled={pos >= ids.length - 1} onClick={() => go(1)} title="다음 (Alt+→)">다음 ›</button></>}
              <button className="x" onClick={onClose} aria-label="닫기">×</button>
            </span>
          </div>
          <div className="ws-meta">
            <span className="mono">{subject === 'partner' ? `파트너 #${id}` : `오더 #${id}`}</span>
            {subject === 'partner' ? <span>{row.region}</span> : <><span>{row.pyeong}평</span><span>이사일 <b>{fmtD(row.move_date)}</b></span><span>플래너 {row.planner_name || '–'}</span><span>관리 종료 {fmtD(row.expires_on)}</span></>}
            <span>담당 <OwnerSelect subject={subject} id={id} owner={row.owner_id} onSaved={done} /></span><span>통화 {calls.length}회</span>
            {admin && <a className="btn admin" href={admin} target="_blank" rel="noreferrer">전화번호는 어드민에서 ↗</a>}
          </div>
          {curIdx >= 0 && <div className="stepper ro" aria-label="단계">{stages.map((s: any, i: number) => <span key={s.c} className={i === curIdx ? 'cur' : i < curIdx ? 'done' : ''} title={s.d || ''}><i /><span>{s.t}</span></span>)}</div>}
        </header>
        <div className="ws-b">
          <div className="ws-col info">
            <div className="colhead">전화 전에 보기</div>
            {pinned.length > 0 && <div className="blk">{pinned.map((n) => <div className="pinned" key={n.id}><b>{NOTE_KIND[n.note_kind] || '특이'}</b>{n.memo}</div>)}</div>}
            {subject === 'partner' ? <PartnerSummary row={row} /> : <OrderSummary row={row} quotes={quotes} />}
            {subject === 'partner' && row.track === 'new' && <Cadence row={row} cadence={cadence} events={events} />}
            <RecentMemos calls={calls} dict={dict} module={module} />
          </div>
          <div className="ws-col main">
            <CallForm key={`${subject}${id}${calls.length}`} subject={subject} id={id} row={row} module={module} dict={dict} cadence={cadence} attempt={calls.length + 1} onSaved={done}
              dueTouch={dueTouch} onNext={ids && pos >= 0 && pos < ids.length - 1 ? () => go(1) : null} />
            {subject === 'partner' && row.track === 'new' && <Checklist row={row} onSaved={done} />}
            {subject === 'partner' && row.track === 'active' && <CapacityForm row={row} onSaved={done} />}
            {subject === 'order' && <ManualMatch id={id} onSaved={done} />}
            <NoteForm subject={subject} id={id} module={module} onSaved={done} />
          </div>
          <div className="ws-col hist">
            <div className="colhead">단계 · 이력</div>
            <StageMover subject={subject} id={id} row={row} quotes={quotes} dict={dict} onSaved={done} />
            <div className="blk"><h3>전체 이력</h3><Timeline events={events} dict={dict} module={module} staffName={staffName} /></div>
          </div>
        </div>
      </section>
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

function PartnerSummary({ row }: any) {
  const kp = row.track === 'new'
    ? [['충전 후', `D+${dayDiff(row.first_charged_at)}`], ['견적 제출', row.quotes], ['선택', row.selected], ['평점', row.rating ?? '–'], ['리뷰', row.review_count ?? 0], ['잔액', won(row.balance) + '원']]
    : [['월 캐파', row.monthly_capacity ? row.monthly_capacity + '건' : '–'], ['이번 달 계약', row.contracts ?? 0], ['투입률', row.monthly_capacity ? Math.round((row.contracts || 0) / row.monthly_capacity * 100) + '%' : '–'],
       ['견적 참여율', row.requests_received ? Math.round(row.quotes_submitted / row.requests_received * 100) + '%' : '–'], ['받은 요청', row.requests_received ?? 0], ['목표', row.miso_target_month ? row.miso_target_month + '건' : '미설정']];
  return (<div className="blk"><h3>{row.track === 'new' ? '정착 지표' : '캐파 · 투입'}</h3>
    <div className="grid2">{kp.map(([l, v]: any) => <div key={l}><span>{l}</span><b>{v}</b></div>)}</div>
    {row.next_action_at && <div className="rule">팔로우업 <b className="mono">{fmtDT(row.next_action_at)}</b> · {row.next_action_note || ''}</div>}</div>);
}

function OrderSummary({ row, quotes }: any) {
  const shown = quotes.filter((q: any) => q.is_shown);
  const steps = [['요청 생성', row.requested_at], ['플래너 방문', row.visit_at], ['영상 배포', row.video_released_at], ['견적 제출', quotes[0]?.submitted_at], ['고객 노출', shown.length ? row.video_released_at : null], ['파트너 확정', row.confirmed_at]];
  const cur = steps.findIndex((s) => !s[1]);
  return (<>
    <div className="blk"><h3>오더 흐름</h3><div className="flow">{steps.map(([l, t], i) => <div key={l} className={t ? 'done' : i === cur ? 'cur' : ''}><i />{l}<small>{t ? fmtDT(t) : '—'}</small></div>)}</div>
      {row.next_call_at && <div className="rule">팔로우업 <b className="mono">{fmtDT(row.next_call_at)}</b></div>}</div>
    <div className="blk"><h3>견적 {quotes.length}건 제출 · {shown.length}건 노출</h3>
      {quotes.length ? <><div className="quotes">{quotes.map((q: any) => (
        <div key={q.quote_id} className={`q ${q.is_shown ? '' : 'hid'}`}><span className="rk">#{q.display_rank}</span><span className="nm" style={{ minWidth: 0 }}>{q.name}</span>
          <span className="amt">{won(q.amount)}원</span>{q.is_shown ? <span className="chip solid">노출</span> : <span className="chip">숨김</span>}</div>))}</div>
        {shown.length > 0 && <div className="rule">최저 {won(Math.min(...shown.map((q: any) => q.amount)))}원 · 최고 {won(Math.max(...shown.map((q: any) => q.amount)))}원. 숨김 견적은 고객에게 안 보이지만 협상 근거로 참고하세요.</div>}</>
        : <div className="pinned"><b>공급 경고</b>견적 0건 — AM 수동매칭 요청 대상</div>}</div>
  </>);
}

function cadenceStates(row: any, cadence: any[], events: any[]) {
  const doneKeys = new Set(events.filter((e: any) => e.event_type === 'call' && e.connect === 'connected' && e.touch_key).map((e: any) => e.touch_key));
  const d0 = row.first_quote_at ? new Date(row.first_quote_at) : null; const today = ymd(new Date());
  return cadence.filter((t: any) => t.module === 'am_new' && !t.key.startsWith('EV_')).sort((a: any, b: any) => (a.day_offset ?? -1) - (b.day_offset ?? -1)).map((t: any) => {
    const due = t.day_offset == null ? (row.first_charged_at ? new Date(row.first_charged_at) : null) : d0 ? new Date(d0.getTime() + t.day_offset * 864e5) : null;
    const st = doneKeys.has(t.key) ? 'done' : !due ? 'wait' : ymd(due) === today ? 'due' : ymd(due) < today ? (t.must ? 'over' : 'skip') : 'todo';
    return { ...t, due, st };
  });
}
function Cadence({ row, cadence, events }: any) {
  const doneKeys = new Set(events.filter((e: any) => e.event_type === 'call' && e.connect === 'connected' && e.touch_key).map((e: any) => e.touch_key));
  const d0 = row.first_quote_at ? new Date(row.first_quote_at) : null;
  const ts = cadenceStates(row, cadence, events);
  const ev: string[] = [];
  if (row.selected >= 1 && !doneKeys.has('EV_SELECTED')) ev.push('첫 선택 — 당일 축하·방문 준비');
  if ((row.balance ?? 0) < 30000 && !doneKeys.has('EV_ATBAT')) ev.push('잔액 소진 임박 — 재충전 대화');
  if (row.quotes >= 3 && row.selected === 0 && !doneKeys.has('EV_LOST3')) ev.push('미성사 3건 — 견적가·프로필 피드백');
  return (<div className="blk"><h3>AM 터치 케이던스 <span style={{ fontWeight: 400, letterSpacing: 0 }}>점선 = 선택 터치 · D0 = 첫 견적 참여일 {d0 ? fmtD(d0) : '(아직 없음)'}</span></h3>
    <div className="cadence">{ts.map((t: any) => { const { due, st } = t;
      return <div key={t.key} className={`t ${st}`} style={{ borderStyle: t.must ? undefined : 'dashed' }} title={t.success || ''}>
        <b>{t.key}</b><span>{t.title}</span><span className="mono">{st === 'done' ? '완료' : st === 'wait' ? '대기' : st === 'skip' ? '생략' : fmtD(due)}{st === 'over' ? ' 밀림' : ''}</span></div>;
    })}</div>
    {ev.length > 0 && <div className="events">{ev.map((e) => <span className="chip warn" key={e}>{e}</span>)}</div>}</div>);
}

export function RecentMemos({ calls, dict, module }: any) {
  const cs = calls.filter((c: any) => c.memo).slice(0, 3); if (!cs.length) return null;
  return (<div className="blk"><h3>최근 콜 메모</h3><div className="recent">{cs.map((c: any) => (
    <div key={c.id} className={`rc ${outcomeCls(c)}`}><div className="h">{fmtDT(c.created_at)} · {c.attempt_no}회차 · {outcomeText({ ...c, reason: reasonLabel(dict, module, c.reason_code) })}</div>{c.memo}</div>))}</div></div>);
}

export function Chips({ opts, value, onPick, multi = false, suggest }: { opts: [string, string][]; value: any; onPick: (v: string) => void; multi?: boolean; suggest?: string | null }) {
  return <div className="chips">{opts.map(([v, l]) => (
    <button type="button" key={v} data-v={v} className={suggest === v ? 'suggest' : ''} aria-pressed={multi ? (value || []).includes(v) : value === v} onClick={() => onPick(v)}>{l}</button>))}</div>;
}

function CallForm({ subject, id, row, module, dict, cadence, attempt, onSaved, dueTouch, onNext }: any) {
  const firstTouch = module === 'am_active' ? 'WK' : dueTouch?.key || null;
  const purpose0 = dueTouch ? (PURPOSE[module].includes(dueTouch.title) ? dueTouch.title : PURPOSE[module][0]) : PURPOSE[module][0];
  const [f, setF] = useState<any>({ connect: null, result: null, reason: null, state: null, voc: [], rx: null, hes: row.hesitation_tags || [], memo: '', next: defaultFollowup(), nextTouched: false, note: '', noFollow: false, close: '', purpose: purpose0, touch: firstTouch });
  const [plan, setPlan] = useState<any>(null);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const set = (p: any) => { setErr(''); setF((o: any) => ({ ...o, ...p })); };
  const holds = dict.filter((r: any) => r.module === module && r.result === 'hold');
  const fails = dict.filter((r: any) => r.module === module && r.result === 'fail');
  const suggestState = row.balance != null && row.balance < 30000 ? 'E' : row.selected > 0 ? 'A' : row.quotes > 0 ? 'C' : row.first_quote_at ? 'D' : null;

  useEffect(() => {
    if (f.connect !== 'absent') { setPlan(null); return; }
    sb().rpc('next_attempt_after_absence', { p_subject: subject, p_id: id, p_module: module }).then(({ data }: any) => {
      const p = Array.isArray(data) ? data[0] : data; setPlan(p);
      if (p?.next_at && !f.nextTouched) setF((o: any) => ({ ...o, next: toLocalInput(new Date(p.next_at)) }));
    });
  }, [f.connect]);

  const after = useMemo(() => {
    const s = row.stage;
    if (!f.connect) return s;
    if (module === 'ae') {
      if (f.connect === 'absent') return plan?.auto_close ? 'EX' : s === 'E0' ? 'E1' : s;
      if (f.connect === 'dead' || f.connect === 'refuse') return 'EX';
      if (f.connect === 'etc') return s === 'E0' ? 'E1' : s;
      if (f.result === 'fail') return 'EX';
      if (['E0', 'E1'].includes(s) && f.result) return f.result === 'go' ? 'E3' : 'E2';
      if (s === 'E2' && f.result === 'go') return 'E3';
      return s;
    }
    if (f.connect === 'absent') return plan?.auto_close ? (module === 'booking' ? 'BX_LOST' : module === 'am_new' ? 'N_RISK' : 'A_RISK') : module === 'booking' ? 'B3' : s;
    if (f.connect === 'dead' || f.connect === 'refuse') return module === 'booking' ? 'BX_LOST' : module === 'am_new' ? 'N_CHURN' : 'A_RISK';
    if (f.connect === 'connected' && f.result === 'fail') return module === 'booking' ? 'BX_LOST' : module === 'am_new' ? 'N_CHURN' : 'A_RISK';
    if (f.connect === 'connected' && module === 'booking' && f.result) return 'B2';
    return s;
  }, [f.connect, f.result, plan, row.stage]);
  const closing = ['BX_LOST', 'N_CHURN', 'LOST'].includes(after) || plan?.auto_close || (f.connect && ['dead', 'refuse'].includes(f.connect));
  const autoGo = module === 'booking' && f.connect === 'connected' && f.result === 'go';

  async function save(next = false) {
    if (busy || !f.connect) return;
    const errs: string[] = [];
    if (f.connect === 'connected') {
      if (!f.result) errs.push('결과');
      if (f.result === 'fail' && !f.reason) errs.push(module === 'booking' ? '이탈 사유' : '실패 유형');
      if (f.result === 'hold' && module !== 'booking' && !f.reason) errs.push('보류 사유');
      if (!f.memo.trim()) errs.push('메모');
      if (module === 'am_new' && ['D2', 'D7'].includes(f.touch) && !f.state) errs.push('상태 판정');
      if (module === 'am_new' && f.touch === 'D7' && !f.voc.length) errs.push('현장 의견');
    }
    if (!closing && !autoGo && !f.noFollow && !f.next) errs.push('팔로우업 날짜');
    if (!closing && f.noFollow && !f.close.trim()) errs.push('팔로우업 없이 끝내는 사유');
    if (errs.length) { setErr(errs.join(', ') + '을(를) 채워야 저장됩니다'); return; }
    setBusy(true);
    const reason = f.connect === 'connected' ? (f.result === 'hold' && module === 'booking' ? 'thinking' : f.reason) : null;
    const { error } = await sb().rpc('log_call', {
      p_subject: subject, p_id: id, p_module: module, p_purpose: f.purpose, p_connect: f.connect,
      p_result: f.connect === 'connected' ? f.result : null, p_reason_code: reason, p_memo: f.memo.trim() || null,
      p_next_at: !closing && !f.noFollow && f.next && (f.nextTouched || (f.connect !== 'absent' && !autoGo)) ? fromLocalInput(f.next).toISOString() : null,
      p_close_reason: f.noFollow ? f.close.trim() || null : null, p_next_note: !closing && !f.noFollow ? f.note.trim() || null : null, p_touch_key: f.touch || null, p_state: f.state, p_voc: f.voc.length ? f.voc : null,
      p_rx: f.rx, p_hesitation: module === 'booking' && f.hes.length ? f.hes : null,
    });
    if (!error && module === 'booking') await sb().from('booking_cases').update({ hesitation_tags: f.hes }).eq('order_id', id);
    setBusy(false);
    if (error) { setErr('저장 실패: ' + error.message); return; }
    
    await onSaved(`${attempt}회차 저장 · ${f.connect === 'connected' ? RESULT_L[f.result] : CONNECT_L[f.connect]}${after !== row.stage ? ` · ${stageLabel(row.stage)}→${stageLabel(after)}` : ''}`);
    if (next && onNext) onNext();
  }
  // 단축키: 1~5 연결 결과 · Q/W/E 진행/보류/실패 · ⌘/Ctrl+Enter 저장(다음 건이 있으면 저장하고 다음)
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); save(!!onNext); return; }
      const el = e.target as HTMLElement; if (/INPUT|TEXTAREA|SELECT/.test(el?.tagName || '') || e.altKey || e.metaKey || e.ctrlKey) return;
      const n = '12345'.indexOf(e.key); if (n >= 0) { const v = CONNECT[n][0]; set({ connect: f.connect === v ? null : v, result: null, reason: null, next: f.nextTouched ? f.next : defaultFollowup() }); return; }
      const rk = ({ q: 'go', w: 'hold', e: 'fail' } as any)[e.key.toLowerCase()];
      if (rk && f.connect === 'connected') set({ result: f.result === rk ? null : rk, reason: null });
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  });

  const touchOpts: [string, string][] = module === 'am_new'
    ? cadence.filter((t: any) => t.module === 'am_new').map((t: any) => [t.key, `${t.key} ${t.title}`])
    : module === 'am_active' ? [['WK', 'WK 주간 투입 점검']] : [];
  return (
    <div className="blk callform"><h3>콜 기록 <span className="sub">{attempt}회차{dueTouch ? ` · 오늘 할 터치 ${dueTouch.key} ${dueTouch.title}${dueTouch.st === 'over' ? ' (밀림)' : ''}` : ''}</span></h3>
      <div className="form">
        <div className="row">
          <div className="f"><span>목적</span><select value={f.purpose} onChange={(e) => set({ purpose: e.target.value })}>{PURPOSE[module].map((p) => <option key={p}>{p}</option>)}</select></div>
          {touchOpts.length > 0 && <div className="f" style={{ flex: '0 1 170px' }}><span>터치 키</span><select value={f.touch || ''} onChange={(e) => set({ touch: e.target.value || null })}><option value="">없음</option>{touchOpts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>}
        </div>
        <div className="step"><span className="lbl"><i>1</i>연결</span><Chips opts={CONNECT} value={f.connect} onPick={(v) => set({ connect: f.connect === v ? null : v, result: null, reason: null, next: f.nextTouched ? f.next : defaultFollowup() })} /></div>
        {f.connect === 'connected' && <>
          <div className="step"><span className="lbl"><i>2</i>결과</span>
            <Chips opts={[['go', '진행'], ['hold', '보류 — 재통화'], ['fail', module === 'booking' ? '이탈' : '실패']]} value={f.result} onPick={(v) => set({ result: f.result === v ? null : v, reason: null })} /></div>
          {f.result === 'hold' && (module === 'booking'
            ? <div className="step"><span className="lbl">망설임 사유 (복수)</span><Chips multi opts={HESIT.map((t) => [t, t])} value={f.hes} onPick={(v) => set({ hes: f.hes.includes(v) ? f.hes.filter((x: string) => x !== v) : [...f.hes, v] })} /></div>
            : <div className="step"><span className="lbl">보류 사유</span><Chips opts={holds.map((r: any) => [r.code, r.label])} value={f.reason} onPick={(v) => set({ reason: v })} /></div>)}
          {f.result === 'fail' && <div className="step"><span className="lbl">{module === 'booking' ? '이탈 사유' : '실패 유형'} (필수)</span><Chips opts={fails.map((r: any) => [r.code, r.label])} value={f.reason} onPick={(v) => set({ reason: v })} /></div>}
          {module === 'am_new' && <>
            <div className="step"><span className="lbl">상태 판정 <span style={{ fontWeight: 400 }}>점선 = 데이터 기준 제안</span></span><Chips opts={Object.entries(AM_STATE).map(([k, v]) => [k, `${k} ${v}`])} value={f.state} suggest={suggestState} onPick={(v) => set({ state: f.state === v ? null : v })} /></div>
            <div className="step"><span className="lbl">현장 의견</span><Chips multi opts={VOC_TAGS.map((t) => [t, t])} value={f.voc} onPick={(v) => set({ voc: f.voc.includes(v) ? f.voc.filter((x: string) => x !== v) : [...f.voc, v] })} /></div>
            <div className="step"><span className="lbl">처방</span><Chips opts={RX_CODES.map((t) => [t, t])} value={f.rx} onPick={(v) => set({ rx: f.rx === v ? null : v })} /></div></>}
        </>}
        {f.connect && <>
          <div className="f"><span>통화 메모 {f.connect === 'connected' ? '(연결된 콜은 필수)' : '(선택)'} — 결과와 상관없이 항상 저장</span>
            <textarea rows={5} value={f.memo} onChange={(e) => set({ memo: e.target.value })} placeholder="통화 요지, 상대 반응, 약속한 것" /></div>
          {!closing && <div className="step"><span className="lbl"><i>3</i>팔로우업 날짜 <span className="sub">{plan?.next_at && !f.nextTouched ? '부재 정책 자동 제안 — 바꾸면 수동 조정으로 기록' : autoGo && !f.nextTouched ? '그대로 두면 3시간 뒤 확정 확인 콜이 자동으로 잡혀요' : '기본 = 오늘'}</span></span>
            {!f.noFollow ? <>
              <FollowupPicker value={f.next} onChange={(v) => set({ next: v, nextTouched: true })} />
              <div className="f"><span>그날 할 일</span><input type="text" value={f.note} onChange={(e) => set({ note: e.target.value })} placeholder="예: 견적 결정했는지 확인" /></div>
              <button type="button" className="linkbtn" onClick={() => set({ noFollow: true })}>팔로우업 없이 끝내기</button>
            </> : <div className="row">
              <div className="f"><span>팔로우업 없이 끝내는 사유</span><input type="text" value={f.close} onChange={(e) => set({ close: e.target.value })} /></div>
              <button type="button" className="linkbtn" onClick={() => set({ noFollow: false, close: '' })}>팔로우업 잡기</button></div>}
          </div>}
          <div className="preview"><b>저장하면</b>
            <span>{attempt}회차 기록 · {f.connect === 'connected' ? (f.result ? RESULT_L[f.result] : '결과 선택 필요') : CONNECT_L[f.connect]}</span>
            {after !== row.stage ? <span>단계 <b>{stageLabel(row.stage)} → {stageLabel(after)}</b> (자동)</span> : <span>단계 유지 · {stageLabel(row.stage)}</span>}
            {!closing && !f.noFollow && f.next && <span>팔로우업 <b>{fuLabel(f.next)}</b>{f.note ? ` · ${f.note}` : ''}</span>}
            {plan && <span>부재 누적 {plan.absent_total}회 · 오늘 {plan.absent_today}회{plan.send_sms ? ' · 부재 문자 발송 차례' : ''}{plan.auto_close ? ' · 자동 처리' : ''}</span>}
            {plan && <span className="rule">{plan.rule}</span>}
            {f.connect === 'refuse' && <span>수신거부 목록에 추가 — 이후 큐에서 제외</span>}
          </div>
        </>}
        <div className="row savebar">
          {onNext ? <><button className="btn primary" disabled={!f.connect || busy} onClick={() => save(true)}>{busy ? '저장 중…' : '저장하고 다음 ›'}</button><button className="btn" disabled={!f.connect || busy} onClick={() => save(false)}>저장만</button></>
            : <button className="btn primary" disabled={!f.connect || busy} onClick={() => save(false)}>{busy ? '저장 중…' : '콜 기록 저장'}</button>}
          <span className="err">{err}</span></div>
        <div className="keys">단축키 <kbd>1</kbd>~<kbd>5</kbd> 연결 결과 · <kbd>Q</kbd><kbd>W</kbd><kbd>E</kbd> 진행/보류/실패 · <kbd>⌘</kbd>/<kbd>Ctrl</kbd>+<kbd>Enter</kbd> {onNext ? '저장하고 다음' : '저장'}</div>
      </div>
    </div>
  );
}

function Checklist({ row, onSaved }: any) {
  const ck = row.setup_checklist || {};
  async function toggle(k: string, v: boolean) {
    const next = { ...ck, [k]: v };
    const { error } = await sb().from('am_partners').update({ setup_checklist: next }).eq('partner_id', row.partner_id);
    if (!error) await sb().from('activity_events').insert({ subject: 'partner', subject_id: row.partner_id, module: 'am_new', event_type: 'field', field: 'setup_checklist.' + k, old_value: String(!!ck[k]), new_value: String(v) });
    onSaved(error ? '저장 실패: ' + error.message : '체크리스트 저장됨');
  }
  return (<div className="blk"><h3>세팅 체크리스트</h3><div className="check">{CHECK.map(([k, l]) => (
    <label key={k}><input type="checkbox" checked={!!ck[k]} onChange={(e) => toggle(k, e.target.checked)} /> {l}</label>))}</div></div>);
}

function CapacityForm({ row, onSaved }: any) {
  const t = row.trucks || {};
  const [c, setC] = useState<any>({ teams: row.teams ?? '', t1: t['1t'] ?? '', t25: t['2.5t'] ?? '', t5: t['5t'] ?? '', t5p: t['5t+'] ?? '', reg: row.crew_regular ?? '', daily: row.crew_daily ?? '',
    jpd: row.jobs_per_team_day ?? 1, days: row.working_days_month ?? 22, target: row.miso_target_month ?? '', dmax: row.daily_quote_max ?? '', dl: row.quote_deadline_days ?? '' });
  const [roi, setRoi] = useState<any[]>(row.other_platforms || []);
  const [r, setR] = useState({ name: '', rev: '', spend: '' });
  const [msg, setMsg] = useState('');
  const n = (v: any) => (v === '' || v == null ? null : Number(v));
  const parseWon = (s: string) => { const m = String(s).replace(/[,\s원]/g, '').match(/^([\d.]+)(만|억)?$/); return m ? Math.round(parseFloat(m[1]) * (m[2] === '만' ? 1e4 : m[2] === '억' ? 1e8 : 1)) : NaN; };
  async function save(nextRoi = roi) {
    if (!n(c.teams)) { setMsg('팀 수는 1 이상이어야 합니다'); return; }
    const { error } = await sb().from('partner_capacity').insert({
      partner_id: row.partner_id, teams: n(c.teams), trucks: { '1t': n(c.t1) || 0, '2.5t': n(c.t25) || 0, '5t': n(c.t5) || 0, '5t+': n(c.t5p) || 0 },
      crew_regular: n(c.reg), crew_daily: n(c.daily), jobs_per_team_day: n(c.jpd) || 1, working_days_month: n(c.days) || 22,
      miso_target_month: n(c.target), daily_quote_max: n(c.dmax), quote_deadline_days: n(c.dl), other_platforms: nextRoi,
    });
    if (!error) await sb().from('activity_events').insert({ subject: 'partner', subject_id: row.partner_id, module: 'am_active', event_type: 'field', field: 'capacity_snapshot', old_value: String(row.monthly_capacity ?? ''), new_value: `팀 ${c.teams} · 목표 ${c.target || '미설정'}` });
    onSaved(error ? '저장 실패: ' + error.message : '캐파 스냅샷 저장 · 투입률 재계산');
  }
  const F = (k: string, l: string, step?: string) => <div className="f" style={{ flexBasis: 90 }}><span>{l}</span><input type="number" min="0" step={step} value={c[k]} onChange={(e) => setC({ ...c, [k]: e.target.value })} /></div>;
  return (<>
    <div className="blk"><h3>캐파 · 투입 목표 <span style={{ fontWeight: 400, letterSpacing: 0 }}>(저장 시 스냅샷으로 쌓임)</span></h3><div className="form">
      <div className="row">{F('teams', '팀 수')}{F('reg', '정규 인력')}{F('daily', '일용 인력')}</div>
      <div className="row">{F('t1', '1t 차량')}{F('t25', '2.5t 차량')}{F('t5', '5t 차량')}{F('t5p', '5t+ 차량')}</div>
      <div className="row">{F('jpd', '팀당 일 처리', '0.5')}{F('days', '월 가동일')}{F('target', '월 미소 목표(건)')}</div>
      <div className="row">{F('dmax', '일 최대 견적 참여')}{F('dl', '견적 마감일(일)')}</div>
      <div className="row"><button className="btn primary" onClick={() => save()}>캐파 저장</button><span className="err">{msg}</span></div></div></div>
    <div className="blk"><h3>타사 플랫폼 ROI <span style={{ fontWeight: 400, letterSpacing: 0 }}>연결됐을 때 꼭 물어보기</span></h3><div className="form">
      <div className="roi-list">{roi.length ? roi.map((x: any) => <div key={x.name}><span>{x.name}</span><span className="mono">월 매출 {won(x.monthly_revenue)} · 비용 {won(x.monthly_spend)}</span></div>) : <div><span style={{ color: 'var(--faint)' }}>아직 없음</span></div>}</div>
      <div className="roi"><div className="f"><span>플랫폼</span><input value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} placeholder="예: 타사 A" /></div>
        <div className="f"><span>월 매출</span><input value={r.rev} onChange={(e) => setR({ ...r, rev: e.target.value })} placeholder="600만" /></div>
        <div className="f"><span>월 비용</span><input value={r.spend} onChange={(e) => setR({ ...r, spend: e.target.value })} placeholder="40만" /></div>
        <button className="btn" onClick={() => { const rev = parseWon(r.rev); if (!r.name || isNaN(rev)) { setMsg('플랫폼 이름과 월 매출을 입력하세요'); return; }
          const nx = roi.filter((x: any) => x.name !== r.name).concat([{ name: r.name, monthly_revenue: rev, monthly_spend: parseWon(r.spend || '0') || 0 }]); setRoi(nx); save(nx); setR({ name: '', rev: '', spend: '' }); }}>저장</button></div>
      <div className="hint" style={{ fontSize: 13, color: 'var(--muted)' }}>캐파 스냅샷과 함께 저장돼요. 팀 수가 먼저 있어야 해요.</div></div></div>
  </>);
}

function StageMover({ subject, id, row, quotes, onSaved, dict = [] }: any) {
  const aeFails = dict.filter((r: any) => r.module === 'ae' && r.result === 'fail');
  const opts = subject === 'lead' ? AE_STAGES.filter((s) => s.c !== 'WON') : subject === 'order' ? BOOK_STAGES : row.track === 'new'
    ? [...NEW_STAGES, { c: 'N_RISK', t: '정착 위험' }, { c: 'N_CHURN', t: '이탈' }, { c: 'A1', t: '졸업 → 캐파 확대' }] : ACTIVE_STAGES;
  const [to, setTo] = useState(row.stage); const [reason, setReason] = useState(''); const [lost, setLost] = useState(''); const [byCall, setByCall] = useState(true); const [msg, setMsg] = useState('');
  async function move() {
    if (to === row.stage) return setMsg('현재와 같은 단계입니다');
    if (!reason.trim()) return setMsg('사유를 입력해야 이동됩니다');
    if (subject === 'order' && to === 'BX_LOST') { if (!lost) return setMsg('이탈 사유를 고르세요'); await sb().from('booking_cases').update({ lost_reason: lost }).eq('order_id', id); }
    if (subject === 'lead' && to === 'EX') { if (!lost) return setMsg('이탈 사유를 고르세요'); await sb().from('ae_leads').update({ lost_reason: lost }).eq('id', id); }
    if (subject === 'order' && to === 'B4_WON') await sb().from('booking_cases').update({ won_by_call: byCall }).eq('order_id', id);
    const { error } = await sb().rpc('move_stage', { p_subject: subject, p_id: id, p_to: to, p_reason: reason.trim() });
    if (error) return setMsg('실패: ' + error.message);
    setReason(''); onSaved(`${stageLabel(to)}(으)로 이동 · 로그 기록됨`);
  }
  return (<div className="blk"><h3>스테이지 수동 이동</h3><div className="form">
    <div className="row"><div className="f"><span>이동할 단계</span><select value={to} onChange={(e) => setTo(e.target.value)}>{opts.map((s: any) => <option key={s.c} value={s.c}>{s.c} · {s.t}</option>)}</select></div></div>
    {subject === 'order' && to === 'BX_LOST' && <div className="f"><span>이탈 사유 (필수)</span><select value={lost} onChange={(e) => setLost(e.target.value)}><option value="">선택</option>
      {[['other_company', '타사 계약'], ['price', '가격'], ['cancel_postpone', '이사 취소·연기'], ['self_solved', '직접 해결'], ['unreachable', '연락 불가'], ['etc', '기타']].map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>}
    {subject === 'lead' && to === 'EX' && <div className="f"><span>이탈 사유 (필수)</span><select value={lost} onChange={(e) => setLost(e.target.value)}><option value="">선택</option>
      {aeFails.map((r: any) => <option key={r.code} value={r.code}>{r.label}</option>)}</select></div>}
    {subject === 'lead' && <div className="rule">WON(완료)은 ‘첫 견적 제출 확인’으로만 이동해요 — AM 신규 정착으로 자동 이관됩니다.</div>}
    {subject === 'order' && to === 'B4_WON' && <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 14 }}><input type="checkbox" checked={byCall} onChange={(e) => setByCall(e.target.checked)} /> 예약콜 기여</label>}
    <div className="f"><span>사유 (필수 · 로그에 남음)</span><textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
    <div className="row"><button className="btn" onClick={move}>단계 이동</button><span className="err">{msg}</span></div></div></div>);
}

export function NoteForm({ subject, id, module, onSaved }: any) {
  const [kind, setKind] = useState('special'); const [pin, setPin] = useState(false); const [body, setBody] = useState(''); const [msg, setMsg] = useState('');
  async function save() {
    if (!body.trim()) return setMsg('내용을 입력하세요');
    const { error } = await sb().from('activity_events').insert({ subject, subject_id: id, module, event_type: 'note', note_kind: kind, pinned: pin, memo: body.trim() });
    if (error) return setMsg('실패: ' + error.message);
    setBody(''); setPin(false); onSaved('특이사항 저장됨');
  }
  return (<div className="blk"><h3>특이사항</h3><div className="form">
    <div className="row"><div className="f" style={{ flex: '0 1 130px' }}><span>유형</span><select value={kind} onChange={(e) => setKind(e.target.value)}>{Object.entries(NOTE_KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 14, marginTop: 16 }}><input type="checkbox" checked={pin} onChange={(e) => setPin(e.target.checked)} /> 상단 고정</label></div>
    <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="다른 담당자도 알아야 할 것" />
    <div className="row"><button className="btn" onClick={save}>특이사항 저장</button><span className="err">{msg}</span></div></div></div>);
}

const FIELD_L: Record<string, (e: any) => string> = {
  charge: (e) => `충전 ${won(+e.new_value)}원`, first_quote: () => '첫 견적 제출 확인 → 완료', next_action_at: () => '팔로우업 변경',
  tags: () => '라벨 변경', signal: (e) => `${e.new_value}`, phone: (e) => `전화번호 ${e.new_value}`, manual_priority: () => '콜 우선순위 변경', partner_id: () => '파트너 ID 연결', owner_id: () => '담당 변경',
};
// 이력 한 건 → 사람이 읽는 제목 · 본문 (작업창 이력 · 히스토리 탭 · CSV 공용)
export function eventText(e: any, dict: any[], staffName: (id?: string | null) => string) {
  const module = e.module; const rl = (c?: string | null) => reasonLabel(dict, module, c);
  const title = e.event_type === 'call' ? `${e.attempt_no}회차 · ${e.purpose || ''} · ${outcomeText({ ...e, reason: rl(e.reason_code) })}`
    : e.event_type === 'sms' ? `문자${e.sms_template ? ' · ' + e.sms_template : ''}`
    : e.event_type === 'stage' ? (() => { const L = module === 'am_care' ? careLabel : stageLabel; return e.stage_from ? `단계 ${L(e.stage_from)} → ${L(e.stage_to)}` : `등록 · ${L(e.stage_to)}`; })()
    : e.event_type === 'note' ? `특이사항(${NOTE_KIND[e.note_kind] || '특이'})${e.pinned ? ' · 고정' : ''}`
    : e.event_type === 'field' ? (FIELD_L[e.field] ? FIELD_L[e.field](e) : `변경: ${e.field}`) : e.event_type;
  const fv = (v: any) => (e.field === 'next_action_at' || e.field === 'first_quote' ? (v ? fmtDT(v) : '없음') : e.field === 'owner_id' ? (v ? staffName(v) : '미배정') : v ?? '');
  const callx = e.event_type === 'call' ? [e.counterpart && `통화 상대: ${e.counterpart}`, (e.call_points || []).length && `다룬 포인트: ${e.call_points.join(' · ')}`, (e.concerns || []).length && `우려: ${e.concerns.join(' · ')}`].filter(Boolean).join('\n') : '';
  const body = [e.memo && !(e.field === 'next_action_at' && e.memo === e.next_action) && !(e.event_type === 'stage' && e.memo === 'created') ? e.memo : '', callx,
    e.event_type === 'field' && !['charge', 'first_quote', 'signal', 'phone'].includes(e.field) ? `${fv(e.old_value)} → ${fv(e.new_value)}` : '',
    e.next_action_at && e.field !== 'next_action_at' ? `팔로우업 ${fmtDT(e.next_action_at)}${e.next_action ? ' · ' + e.next_action : ''}` : e.field === 'next_action_at' && e.next_action ? `할 일: ${e.next_action}` : '',
    e.close_reason ? `종료: ${e.close_reason.startsWith('실패: ') ? '실패: ' + (rl(e.reason_code) || '') : e.close_reason}` : '', e.auto_rule ? `규칙 ${e.auto_rule}` : ''].filter(Boolean).join('\n');
  return { title, body, kind: e.event_type === 'call' || e.event_type === 'sms' ? 'call' : e.event_type === 'stage' ? 'stage' : e.event_type === 'note' ? 'note' : e.field === 'signal' ? 'signal' : 'field' };
}
export function Timeline({ events, dict, staffName }: any) {
  return (<div className="tl">{events.map((e: any) => { const t = eventText(e, dict, staffName);
    return <div key={e.id} className={`it ${t.kind}`}><div className="h"><b>{t.title}</b><span className="ts">{fmtDT(e.created_at)} · {staffName(e.actor_id)}</span></div>{t.body && <div className="b">{t.body}</div>}</div>;
  })}{!events.length && <div className="empty">아직 기록 없음</div>}</div>);
}

export function OwnerSelect({ subject, id, owner, onSaved }: any) {
  const { staff } = useStaff();
  async function change(v: string) {
    const { error } = await sb().rpc('assign_owner', { p_subject: subject, p_ids: [id], p_owner: v || null });
    onSaved(error ? '실패: ' + error.message : '담당 변경됨 · 로그 기록');
  }
  return <select className="owner-sel" value={owner || ''} onChange={(e) => change(e.target.value)}>
    <option value="">미배정</option>{staff.filter((s: any) => s.active).map((s: any) => <option key={s.id} value={s.id}>{s.name || s.login_id}</option>)}</select>;
}

function ManualMatch({ id, onSaved }: any) {
  const [reqs, setReqs] = useState<any[] | null>(null); const [reason, setReason] = useState(''); const [msg, setMsg] = useState('');
  useEffect(() => { sb().from('manual_match_requests').select('*').eq('order_id', id).order('created_at', { ascending: false }).then(({ data }: any) => setReqs(data || [])); }, [id]);
  if (!reqs) return null;
  const open = reqs.find((r) => r.status === 'open');
  async function request() {
    if (!reason.trim()) return setMsg('요청 사유를 적어주세요 (예: 견적 1건뿐, 강남 5t 필요)');
    const { error } = await sb().rpc('request_manual_match', { p_order: id, p_reason: reason.trim() });
    if (error) return setMsg('실패: ' + error.message);
    setReason(''); onSaved('수동매칭 요청됨 — AM 수동매칭 목록에 올라갔어요');
  }
  return (<div className="blk"><h3>수동매칭</h3>
    {open ? <div className="pinned"><b>요청 중</b>{fmtDT(open.created_at)} · {open.reason}</div>
      : <div className="form"><div className="f"><span>견적이 부족하면 AM에게 파트너 연결을 요청하세요</span><input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="요청 사유" /></div>
        <div className="row"><button className="btn" onClick={request}>수동매칭 요청</button><span className="err">{msg}</span></div></div>}
    {reqs.filter((r) => r.status !== 'open').slice(0, 3).map((r) => <div key={r.id} className="rule">{r.status === 'matched' ? '매칭 완료' : '종료'} · {fmtDT(r.resolved_at)} · {r.note}</div>)}
  </div>);
}

// 미소방문 파트너 확보 리스트에서 온 리드의 근거 지표 (miso-data, 전화번호 없음)
export function LeadInsight({ row }: any) {
  const i = row.insight || {}; const n = (v: any, u = '') => (v == null || v === '' ? '–' : `${v}${u}`);
  const kp = [
    ['우선순위', `${n(row.priority_rank, '위')} · ${n(row.grade)}등급 ${n(row.score, '점')}`], ['지역 티어', i.tier_label || '–'],
    ['가정이사 마지막 견적', n(i.last_moving_quote)], ['가정이사 견적 30·90일', `${n(i.moving_quotes_30d)} · ${n(i.moving_quotes_90d)}건`],
    ['가정이사 계약 1년', n(i.moving_contracts_365d, '건')], ['소형이사 마지막 견적', n(i.last_small_moving_quote)],
    ['리뷰 · 평점', `${n(i.reviews)}개 (실고객 ${n(i.real_reviews)}) · ${n(i.rating)}`], ['대형 이사(26평+) 견적 1년', `${n(i.large_move_quotes_1y, '건')} · 계약 ${n(i.large_move_contracts_1y, '건')}`],
    ['미소방문 서비스 등록', i.mv_registered ? '등록됨' : '미등록'], ['미소방문 요청 받고 미제출', i.mv_received_not_submitted ? `${i.mv_received_not_submitted}건 (마지막 ${n(i.mv_received_not_submitted_last)})` : '–'],
  ];
  return (<div className="insight" style={{ marginTop: 10 }}><h3 style={{ margin: 0 }}>왜 이 파트너인가</h3>
    {i.reasons && <div className="why">{i.reasons}</div>}
    <div className="grid2">{kp.map(([l, v]: any) => <div key={l}><span>{l}</span><b>{v}</b></div>)}</div>
    {(i.incheon_bucheon_districts || i.adjacent_districts) && <div className="rule">커버: {i.incheon_bucheon_districts || i.adjacent_districts}</div>}
    <div className="rule">리스트 {row.list_version} 기준 · 미소방문 견적을 직접 낸 적 없는 가정이사 파트너</div>
  </div>);
}
