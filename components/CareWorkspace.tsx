'use client';
import Icon from './Icon';
// AM 관리 대상 작업창 — AE 작업창과 같은 3단: 왼쪽 = 전화 전에 볼 것(첫마디 · 왜 관리 대상인가 · 지표), 가운데 = 콜 기록, 오른쪽 = 팔로우업 · 이력
import { useEffect, useMemo, useState } from 'react';
import { sb, reasonDict, reasonLabel } from '@/lib/data';
import { useStaff, useStaffName } from './StaffContext';
import { Chips, OwnerSelect, Timeline, NoteForm } from './Detail';
import { FollowupPicker, fuLabel, defaultFollowup } from './Followup';
import { useViewers, useTrackView, useLiveEvents } from './Presence';
import PhoneTag from './PhoneTag';
import {
  CARE_STAGES, CARE_OPEN, CARE_PRIO, CARE_CONCERNS, CARE_RESULT, CONNECT, CONNECT_L, PURPOSE, NOTE_KIND, COUNTERPART, AE_TAG_PRESETS,
  careRank, careLabel, carePriority, careMetric, carePoints, careOpener, rfqAdminUrl, fmtD, fmtDT, toLocalInput, fromLocalInput, outcomeText,
} from '@/lib/ui';

type Props = { id: number; onClose: () => void; onChanged: () => void; ids?: number[]; onNavigate?: (id: number) => void };

export default function CareWorkspace({ id, onClose, onChanged, ids, onNavigate }: Props) {
  const [row, setRow] = useState<any>(null); const [events, setEvents] = useState<any[]>([]); const [dict, setDict] = useState<any[]>([]);
  const [err, setErr] = useState(''); const [toast, setToast] = useState('');
  const staffName = useStaffName(); const { me } = useStaff(); const viewers = useViewers();
  useTrackView('care', id);
  useLiveEvents('care', id, me.id, (e) => { setToast(`${staffName(e.actor_id)}님이 방금 기록했어요 — 새로 불러왔어요`); setTimeout(() => setToast(''), 4000); load(); onChanged(); });
  async function load() {
    setErr('');
    const [{ data: r, error }, { data: ev }, d] = await Promise.all([
      sb().from('v_care_board').select('*').eq('id', id).maybeSingle(),
      sb().from('activity_events').select('*').eq('subject', 'care').eq('subject_id', id).order('created_at', { ascending: false }).limit(300), reasonDict()]);
    if (error) setErr(error.message); setRow(r); setEvents(ev || []); setDict(d);
  }
  useEffect(() => { setRow(null); load(); }, [id]);
  const pos = ids ? ids.indexOf(id) : -1;
  const go = (d: number) => { if (!ids || !onNavigate) return; for (let i = pos + d; i >= 0 && i < ids.length; i += d) if (!viewers('care', ids[i]).length) return onNavigate(ids[i]); };
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); const typing = /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName || '');
      if (!typing && e.altKey && e.key === 'ArrowRight') go(1); if (!typing && e.altKey && e.key === 'ArrowLeft') go(-1); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [onClose, pos, ids]);
  const done = async (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2600); await load(); onChanged(); };

  if (!row) return (<><div className="scrim" onClick={onClose} /><section className="ws anim"><div className="loading">{err || '불러오는 중…'}</div></section></>);
  const calls = events.filter((e) => e.event_type === 'call'); const pinned = events.filter((e) => e.event_type === 'note' && e.pinned);
  const pr = carePriority(row); const admin = rfqAdminUrl(row.partner_id);
  return (<>
    <div className="scrim" onClick={onClose} />
    <section className="ws anim" role="dialog" aria-label={`${row.name || row.partner_id} 작업창`}>
      <header className="ws-h">
        <div className="ws-top">
          <span className="mod">AM 관리 대상</span>
          <h2>{row.name || `파트너 #${row.partner_id}`}</h2>
          <PhoneTag partnerId={row.partner_id} subject="care" subjectId={id} module="am_care" />
          <span className={`chip ${CARE_PRIO[pr].cls}`}>{CARE_PRIO[pr].t}{row.manual_priority ? ' · 수동' : ''}</span>
          {row.segment && <span className="chip">{row.segment}</span>}
          {row.am_track && <span className="chip mv">{row.am_track === 'new' ? '신규 정착' : '캐파 확대'}에서도 관리 중</span>}
          {viewers('care', id).length > 0 && <span className="busy"><Icon n="eye" /> {viewers('care', id).join(', ')}님이 지금 보고 있어요 · 중복 통화 주의</span>}
          <span className="ws-nav">
            {ids && pos >= 0 && <><button className="btn" disabled={pos <= 0} onClick={() => go(-1)}>‹ 이전</button><span className="mono">{pos + 1} / {ids.length}</span><button className="btn" disabled={pos >= ids.length - 1} onClick={() => go(1)}>다음 ›</button></>}
            <button className="x" onClick={onClose} aria-label="닫기">×</button>
          </span>
        </div>
        <div className="ws-meta">
          <span className="mono">파트너 #{row.partner_id}</span>
          <span>담당 <OwnerSelect subject="care" id={id} owner={row.owner_id} onSaved={done} /></span><span>통화 {calls.length}회</span>
          {admin && <a className="btn admin" href={admin} target="_blank" rel="noreferrer">전화번호는 어드민에서 ↗</a>}
        </div>
        <CareStageBar row={row} dict={dict} onSaved={done} />
      </header>
      <div className="ws-b">
        <div className="ws-col info">
          <div className="colhead">전화 전에 보기</div>
          {pinned.length > 0 && <div className="blk">{pinned.map((n) => <div className="pinned" key={n.id}><b>{NOTE_KIND[n.note_kind] || '특이'}</b>{n.memo}</div>)}</div>}
          <Opener row={row} />
          <Why row={row} />
        </div>
        <div className="ws-col main">
          <CareCallForm key={`${id}-${calls.length}`} row={row} dict={dict} attempt={calls.length + 1} onSaved={done} onNext={ids && pos >= 0 && pos < ids.length - 1 ? () => go(1) : null} />
          <NoteForm subject="care" id={id} module="am_care" onSaved={done} />
        </div>
        <div className="ws-col hist">
          <div className="colhead">팔로우업 · 이력</div>
          <FollowupCard row={row} onSaved={done} />
          <Labels row={row} onSaved={done} />
          <div className="blk"><h3>전체 이력 <span className="sub">{events.length}건</span></h3><Timeline events={events} dict={dict} staffName={staffName} /></div>
        </div>
      </div>
    </section>
    {toast && <div className="toast">{toast}</div>}
  </>);
}

function Opener({ row }: any) {
  const o = careOpener(row);
  return (<div className="blk opener"><h3>이렇게 시작해 보세요</h3><p className="line">“{o.line}”</p>{o.facts.length > 0 && <ul>{o.facts.map((t) => <li key={t}>{t}</li>)}</ul>}</div>);
}

// 왜 관리 대상인가 — 리스트 지표. 알려진 칸은 묶어서, 모르는 칸은 '기타 지표'로 그대로
function Why({ row }: any) {
  const m = row.metrics || {}; const used = new Set<string>();
  const cell = (re: RegExp, label?: string) => { const k = Object.keys(m).find((x) => re.test(x)); if (!k) return null; used.add(k); const v = m[k]; return [label || k, v == null || v === '' ? '–' : String(v)] as [string, string]; };
  const groups: [string, ([string, string] | null)[]][] = [
    ['누적', [cell(/누적 참여/, '참여'), cell(/누적 계약건/, '계약'), cell(/누적 계약률/, '계약률')]],
    ['최근 3개월', [cell(/최근3개월 참여/, '참여'), cell(/최근3개월 계약건/, '계약'), cell(/최근3개월 계약률/, '계약률')]],
    ['이번 달 흐름', [cell(/^9월 참여/, '9월 참여'), cell(/^9월 계약/, '9월 계약'), cell(/^10월.*참여/, '10월 참여'), cell(/pace/, '9월 대비 속도'), cell(/마지막 참여/, '마지막 참여')]],
  ];
  const rest = Object.keys(m).filter((k) => !used.has(k)).map((k) => [k, m[k] == null || m[k] === '' ? '–' : String(m[k])] as [string, string]);
  return (<div className="blk"><h3>왜 관리 대상인가 <span className="sub">리스트 {row.list_version}</span></h3>
    {row.reason && <div className="why-big">{row.reason}</div>}
    {row.action && <div className="rule"><b>권장 액션</b> {row.action}</div>}
    {groups.map(([g, items]) => { const xs = items.filter(Boolean) as [string, string][]; if (!xs.length) return null;
      return <div key={g} className="siggroup"><span className="gt">{g}</span><div className="grid2">{xs.map(([l, v]) => <div key={l}><span>{l}</span><b>{v}</b></div>)}</div></div>; })}
    {rest.length > 0 && <div className="siggroup"><span className="gt">기타 지표</span><div className="grid2">{rest.map(([l, v]) => <div key={l}><span>{l}</span><b>{v}</b></div>)}</div></div>}
  </div>);
}

const MOVE_REASONS = ['통화로 확인', '어드민 데이터로 확인', '파트너가 직접 진행', '잘못 분류 정정'];
function CareStageBar({ row, dict, onSaved }: any) {
  const [to, setTo] = useState<string | null>(null); const [reason, setReason] = useState(''); const [lost, setLost] = useState(''); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const cur = careRank(row.stage); const fails = dict.filter((r: any) => r.module === 'am_care' && r.result === 'fail');
  useEffect(() => { setReason(''); setLost(''); setMsg(''); }, [to]);
  async function move() {
    if (!to || !reason.trim()) return setMsg('사유를 고르거나 적어 주세요');
    setBusy(true);
    if (to === 'LOST') { if (!lost) { setBusy(false); return setMsg('종료 사유를 고르세요'); } await sb().from('am_care').update({ lost_reason: lost }).eq('id', row.id); }
    const { error } = await sb().rpc('move_stage', { p_subject: 'care', p_id: row.id, p_to: to, p_reason: reason.trim() });
    setBusy(false); if (error) return setMsg('실패: ' + error.message);
    const t = to; setTo(null); onSaved(`${careLabel(t)}(으)로 이동 · 이력에 남았어요`);
  }
  return (<div className="stagebar">
    <div className="stepper" role="group" aria-label="단계">{CARE_STAGES.map((s) => { const r = careRank(s.c); const st = s.c === row.stage ? 'cur' : row.stage !== 'LOST' && r >= 0 && r < cur ? 'done' : '';
      return <button key={s.c} type="button" className={`${st} ${s.c === 'WON' ? 'won' : ''} ${s.c === 'LOST' ? 'lost' : ''} ${to === s.c ? 'pick' : ''}`} title={s.d} onClick={() => setTo(s.c === row.stage || to === s.c ? null : s.c)}><i /><span>{s.t}</span></button>; })}</div>
    {to && <div className="stagepop"><b>{careLabel(row.stage)} → {careLabel(to)}</b>
      {to === 'LOST' && <select value={lost} onChange={(e) => setLost(e.target.value)} style={{ width: 'auto' }}><option value="">종료 사유</option>{fails.map((r: any) => <option key={r.code} value={r.code}>{r.label}</option>)}</select>}
      <Chips opts={(to === 'WON' ? ['참여 재개 확인', '계약 발생 확인', ...MOVE_REASONS] : MOVE_REASONS).map((t) => [t, t])} value={reason} onPick={(v) => setReason(v)} />
      <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="사유 (필수 · 이력에 남음)" />
      <button className="btn primary" disabled={busy} onClick={move}>이동</button><button className="btn" onClick={() => setTo(null)}>취소</button><span className="err">{msg}</span></div>}
  </div>);
}

function CareCallForm({ row, dict, attempt, onSaved, onNext }: any) {
  const p0 = (row.segment || '').includes('10월 미참여') ? '참여 중단 확인' : (row.segment || '').includes('핵심') ? '휴면 재활성화' : (row.segment || '').includes('무계약') ? '무계약 코칭'
    : (row.segment || '').includes('급감') ? '참여 급감 확인' : (row.segment || '').includes('저계약률') ? '저계약률 코칭' : row.stage === 'C1' ? '재시도 콜' : '근황 확인';
  const [f, setF] = useState<any>({ purpose: p0, connect: null, result: null, reason: null, memo: '', next: defaultFollowup(), nextTouched: false, note: '', stage: null, close: '', noFollow: false, points: [], who: null, concerns: [] });
  const [plan, setPlan] = useState<any>(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const set = (p: any) => { setErr(''); setF((o: any) => ({ ...o, ...p })); };
  const tog = (k: string, v: string) => set({ [k]: f[k].includes(v) ? f[k].filter((x: string) => x !== v) : [...f[k], v] });
  const holds = dict.filter((r: any) => r.module === 'am_care' && r.result === 'hold'); const fails = dict.filter((r: any) => r.module === 'am_care' && r.result === 'fail');
  useEffect(() => {
    if (f.connect !== 'absent') { setPlan(null); return; }
    sb().rpc('next_attempt_after_absence', { p_subject: 'care', p_id: row.id, p_module: 'am_care' }).then(({ data }: any) => { const p = Array.isArray(data) ? data[0] : data; setPlan(p);
      if (p?.next_at) setF((o: any) => (o.nextTouched ? o : { ...o, next: toLocalInput(new Date(p.next_at)) })); });
  }, [f.connect]);
  const auto = useMemo(() => { const s = row.stage; if (!f.connect) return s;
    if (f.connect === 'absent') return plan?.auto_close ? 'LOST' : s === 'C0' ? 'C1' : s;
    if (f.connect === 'dead' || f.connect === 'refuse') return 'LOST'; if (f.connect === 'etc') return s === 'C0' ? 'C1' : s;
    if (f.result === 'fail') return 'LOST'; if (['C0', 'C1'].includes(s) && f.result) return f.result === 'go' ? 'C3' : 'C2'; if (s === 'C2' && f.result === 'go') return 'C3'; return s; }, [f.connect, f.result, plan, row.stage]);
  const closing = auto === 'LOST'; const after = !closing && f.stage ? f.stage : auto;
  async function save(next = false) {
    if (busy || !f.connect) return; const errs: string[] = [];
    if (f.connect === 'connected') { if (!f.result) errs.push('결과'); if (f.result === 'fail' && !f.reason) errs.push('종료 사유'); if (f.result === 'hold' && !f.reason) errs.push('재통화 이유'); if (!f.memo.trim()) errs.push('통화 메모'); }
    if (!closing && !f.noFollow && !f.next) errs.push('팔로우업 날짜'); if (!closing && f.noFollow && !f.close.trim()) errs.push('팔로우업 없이 끝내는 사유');
    if (errs.length) return setErr(errs.join(', ') + '을(를) 채워야 저장돼요');
    setBusy(true);
    const { error } = await sb().rpc('log_call', { p_subject: 'care', p_id: row.id, p_module: 'am_care', p_purpose: f.purpose, p_connect: f.connect,
      p_result: f.connect === 'connected' ? f.result : null, p_reason_code: f.connect === 'connected' ? f.reason : null, p_memo: f.memo.trim() || null,
      p_next_at: !closing && !f.noFollow && f.next && (f.nextTouched || f.connect !== 'absent') ? fromLocalInput(f.next).toISOString() : null,
      p_close_reason: !closing && f.noFollow ? f.close.trim() : null, p_next_note: !closing && !f.noFollow ? f.note.trim() || null : null,
      p_stage_to: !closing && f.stage && f.stage !== auto ? f.stage : null,
      p_points: f.points.length ? f.points : null, p_concerns: f.connect === 'connected' && f.concerns.length ? f.concerns : null, p_counterpart: f.connect === 'connected' ? f.who : null });
    setBusy(false); if (error) return setErr('저장 실패: ' + error.message);
    await onSaved(`${attempt}회차 저장${after !== row.stage ? ` · ${careLabel(row.stage)}→${careLabel(after)}` : ''}${!closing && !f.noFollow && f.next ? ` · ${fuLabel(f.next)}` : ''}`);
    if (next && onNext) onNext();
  }
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); save(!!onNext); return; }
      const el = e.target as HTMLElement; if (/INPUT|TEXTAREA|SELECT/.test(el?.tagName || '') || e.altKey || e.metaKey || e.ctrlKey) return;
      const n = '12345'.indexOf(e.key); if (n >= 0) { const v = CONNECT[n][0]; set({ connect: f.connect === v ? null : v, result: null, reason: null, stage: null, next: f.nextTouched ? f.next : defaultFollowup() }); return; }
      const rk = ({ q: 'go', w: 'hold', e: 'fail' } as any)[e.key.toLowerCase()]; if (rk && f.connect === 'connected') set({ result: f.result === rk ? null : rk, reason: null, stage: null }); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  });
  return (<div className="blk callform"><h3>콜 기록 <span className="sub">{attempt}회차</span><select className="purpose" value={f.purpose} onChange={(e) => set({ purpose: e.target.value })} aria-label="통화 목적">{PURPOSE.am_care.map((p) => <option key={p}>{p}</option>)}</select></h3><div className="form">
    <div className="step"><span className="lbl"><i>1</i>연결</span><Chips opts={CONNECT} value={f.connect} onPick={(v) => set({ connect: f.connect === v ? null : v, result: null, reason: null, stage: null, next: f.nextTouched ? f.next : defaultFollowup() })} /></div>
    {f.connect === 'connected' && <>
      <div className="step"><span className="lbl">다룬 콜 포인트 <span className="sub">통화하면서 눌러 두면 기록에 남아요</span></span><Chips multi opts={carePoints(row).map((t) => [t, t])} value={f.points} onPick={(v) => tog('points', v)} /></div>
      <div className="step"><span className="lbl">통화 상대</span><Chips opts={COUNTERPART.map((t) => [t, t])} value={f.who} onPick={(v) => set({ who: f.who === v ? null : v })} /></div>
      <div className="step"><span className="lbl"><i>2</i>결과</span><Chips opts={CARE_RESULT} value={f.result} onPick={(v) => set({ result: f.result === v ? null : v, reason: null, stage: null })} /></div>
      {f.result === 'hold' && <div className="step"><span className="lbl">재통화 이유</span><Chips opts={holds.map((r: any) => [r.code, r.label])} value={f.reason} onPick={(v) => set({ reason: v })} /></div>}
      {f.result === 'fail' && <div className="step"><span className="lbl">종료 사유 (필수)</span><Chips opts={fails.map((r: any) => [r.code, r.label])} value={f.reason} onPick={(v) => set({ reason: v })} /></div>}
      <div className="step"><span className="lbl">원인 · 우려 <span className="sub">여러 개 선택</span></span><Chips multi opts={CARE_CONCERNS.map((t) => [t, t])} value={f.concerns} onPick={(v) => tog('concerns', v)} /></div>
    </>}
    {f.connect && <>
      <div className="f"><span>통화 메모 {f.connect === 'connected' ? '(연결된 콜은 필수)' : '(선택)'}</span><textarea rows={5} value={f.memo} onChange={(e) => set({ memo: e.target.value })} placeholder="원인 · 파트너 반응 · 약속한 것" /></div>
      {!closing && <>
        <div className="step"><span className="lbl"><i>3</i>통화 후 단계 <span className="sub">자동: {careLabel(auto)}</span></span>
          <div className="chips stagechips">{CARE_OPEN.map((c) => <button type="button" key={c} aria-pressed={after === c} className={c === auto && after !== c ? 'suggest' : ''} onClick={() => set({ stage: c === auto ? null : c })}>{careLabel(c)}</button>)}</div></div>
        <div className="step"><span className="lbl"><i>4</i>팔로우업 날짜 <span className="sub">{plan?.next_at && !f.nextTouched ? '부재 정책 자동 제안' : '기본 = 오늘'}</span></span>
          {!f.noFollow ? <><FollowupPicker value={f.next} onChange={(v) => set({ next: v, nextTouched: true })} />
            <div className="f"><span>그날 할 일</span><input type="text" value={f.note} onChange={(e) => set({ note: e.target.value })} placeholder="예: 이번 주 참여했는지 확인" /></div>
            <button type="button" className="linkbtn" onClick={() => set({ noFollow: true })}>팔로우업 없이 끝내기</button></>
            : <div className="row"><div className="f"><span>팔로우업 없이 끝내는 사유</span><input type="text" value={f.close} onChange={(e) => set({ close: e.target.value })} /></div><button type="button" className="linkbtn" onClick={() => set({ noFollow: false, close: '' })}>팔로우업 잡기</button></div>}</div>
      </>}
      <div className="preview"><b>저장하면</b>
        <span>{attempt}회차 · {f.connect === 'connected' ? (f.result ? CARE_RESULT.find(([k]) => k === f.result)![1] : '결과 선택 필요') : CONNECT_L[f.connect]}{f.points.length ? ` · 포인트 ${f.points.length}개` : ''}</span>
        {after !== row.stage ? <span>단계 <b>{careLabel(row.stage)} → {careLabel(after)}</b></span> : <span>단계 유지 · {careLabel(row.stage)}</span>}
        {!closing && !f.noFollow && f.next && <span>팔로우업 <b>{fuLabel(f.next)}</b>{f.note ? ` · ${f.note}` : ''}</span>}
        {closing && <span>관리 종료로 닫히고 팔로우업이 지워져요</span>}
      </div>
    </>}
    <div className="row savebar">{onNext ? <><button className="btn primary" disabled={!f.connect || busy} onClick={() => save(true)}>{busy ? '저장 중…' : '저장하고 다음 ›'}</button><button className="btn" disabled={!f.connect || busy} onClick={() => save(false)}>저장만</button></>
      : <button className="btn primary" disabled={!f.connect || busy} onClick={() => save(false)}>{busy ? '저장 중…' : '콜 기록 저장'}</button>}<span className="err">{err}</span></div>
    <div className="keys">단축키 <kbd>1</kbd>~<kbd>5</kbd> 연결 · <kbd>Q</kbd><kbd>W</kbd><kbd>E</kbd> 결과 · <kbd>⌘</kbd>/<kbd>Ctrl</kbd>+<kbd>Enter</kbd> {onNext ? '저장하고 다음' : '저장'}</div>
  </div></div>);
}

function FollowupCard({ row, onSaved }: any) {
  const [edit, setEdit] = useState(false); const [v, setV] = useState(''); const [note, setNote] = useState(''); const [msg, setMsg] = useState('');
  if (['WON', 'LOST'].includes(row.stage)) return null;
  const over = row.next_action_at && new Date(row.next_action_at) <= new Date();
  async function save() { if (!v) return setMsg('날짜를 고르세요');
    const { error } = await sb().rpc('set_care_followup', { p_id: row.id, p_at: fromLocalInput(v).toISOString(), p_note: note.trim() || null });
    if (error) return setMsg('실패: ' + error.message); setEdit(false); onSaved(`팔로우업 ${fuLabel(v)}로 변경`); }
  return (<div className={`blk fucard ${over ? 'over' : ''}`}><h3>팔로우업</h3>
    {row.next_action_at ? <div className="fu-now"><b>{fuLabel(toLocalInput(new Date(row.next_action_at)))}</b><span>{row.next_action_note || '할 일 메모 없음'}</span></div>
      : <div className="fu-now"><b>{row.stage === 'C0' ? '아직 콜 전' : '팔로우업 미등록'}</b><span>콜을 기록하면서 날짜를 잡아요</span></div>}
    {!edit ? <button className="linkbtn" onClick={() => { setEdit(true); setV(row.next_action_at ? toLocalInput(new Date(row.next_action_at)) : defaultFollowup()); setNote(row.next_action_note || ''); }}>콜 없이 날짜만 바꾸기</button>
      : <div className="form"><FollowupPicker value={v} onChange={setV} /><div className="f"><span>할 일</span><input type="text" value={note} onChange={(e) => setNote(e.target.value)} /></div>
        <div className="row"><button className="btn primary" onClick={save}>저장</button><button className="btn" onClick={() => setEdit(false)}>취소</button><span className="err">{msg}</span></div></div>}
  </div>);
}

function Labels({ row, onSaved }: any) {
  const [custom, setCustom] = useState(''); const tags: string[] = row.tags || [];
  async function saveTags(next: string[]) { const { error } = await sb().from('am_care').update({ tags: next }).eq('id', row.id);
    if (!error) await sb().from('activity_events').insert({ subject: 'care', subject_id: row.id, module: 'am_care', event_type: 'field', field: 'tags', old_value: tags.join(', '), new_value: next.join(', ') });
    onSaved(error ? '실패: ' + error.message : '라벨 저장됨'); }
  async function savePrio(p: number | null) { const { error } = await sb().from('am_care').update({ manual_priority: p }).eq('id', row.id);
    if (!error) await sb().from('activity_events').insert({ subject: 'care', subject_id: row.id, module: 'am_care', event_type: 'field', field: 'manual_priority', old_value: row.manual_priority ? `P${row.manual_priority}` : '리스트', new_value: p ? `P${p}` : '리스트' });
    onSaved(error ? '실패: ' + error.message : '우선순위 변경'); }
  const all = [...new Set([...AE_TAG_PRESETS, ...tags])];
  return (<div className="blk"><h3>우선순위 · 라벨</h3>
    <div className="seg" role="group">{[[null, `리스트 ${CARE_PRIO[row.priority || 4].t}`], [1, 'P1'], [2, 'P2'], [3, 'P3'], [4, '관찰']].map(([p, l]: any) => <button key={l} aria-pressed={(row.manual_priority || null) === p} onClick={() => savePrio(p)}>{l}</button>)}</div>
    <div className="chips tags">{all.map((t) => <button type="button" key={t} aria-pressed={tags.includes(t)} onClick={() => saveTags(tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t])}>{t}</button>)}</div>
    <div className="row"><input type="text" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="라벨 직접 추가" style={{ flex: 1 }} onKeyDown={(e) => { if (e.key === 'Enter' && custom.trim()) { saveTags([...new Set([...tags, custom.trim()])]); setCustom(''); } }} /></div>
  </div>);
}
