'use client';
import Icon from './Icon';
// AE 리드 작업창 — 화면 대부분을 덮는 3단 레이아웃. 왼쪽 = 파트너 정보·라벨·충전, 가운데 = 콜 기록(통화 후 단계·팔로우업), 오른쪽 = 전체 이력
import { useEffect, useMemo, useState } from 'react';
import { sb, reasonDict, reasonLabel } from '@/lib/data';
import { useStaff, useStaffName } from './StaffContext';
import { useViewers, useTrackView, useLiveEvents } from './Presence';
import PhoneTag from './PhoneTag';
import { Chips, OwnerSelect, Timeline, LeadInsight, NoteForm } from './Detail';
import { FollowupPicker, fuLabel, defaultFollowup } from './Followup';
import {
  AE_STAGES, AE_OPEN, AE_PRIO, AE_TAG_PRESETS, LINE_L, SOURCE_L, TIER_L, GRADE_CLS, CONNECT, CONNECT_L, RESULT_L, PURPOSE, NOTE_KIND,
  aeAutoPriority, aePriority, aeLabels, aeRank, sigDate, aeChecklist, aeNextSuggestion, aeOpener, aeCallPoints, COUNTERPART, AE_CONCERNS, AE_RESULT, rfqAdminUrl, stageLabel, fmtD, fmtDT, dayDiff, won, toLocalInput, fromLocalInput, outcomeText, outcomeCls, ymd, kstDow,
} from '@/lib/ui';

type Props = { id: number; onClose: () => void; onChanged: () => void; ids?: number[]; onNavigate?: (id: number) => void };

export default function LeadWorkspace({ id, onClose, onChanged, ids, onNavigate }: Props) {
  const [row, setRow] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [dict, setDict] = useState<any[]>([]);
  const [err, setErr] = useState(''); const [toast, setToast] = useState('');
  const staffName = useStaffName(); const { me } = useStaff(); const viewers = useViewers();
  useTrackView('lead', id);
  useLiveEvents('lead', id, me.id, (e) => { setToast(`${staffName(e.actor_id)}님이 방금 이 리드에 기록했어요 — 새로 불러왔어요`); setTimeout(() => setToast(''), 4000); load(); onChanged(); });

  async function load() {
    setErr('');
    const [{ data: r, error }, { data: ev }, d] = await Promise.all([
      sb().from('v_ae_board').select('*').eq('id', id).maybeSingle(),
      sb().from('activity_events').select('*').eq('subject', 'lead').eq('subject_id', id).order('created_at', { ascending: false }).limit(300),
      reasonDict(),
    ]);
    if (error) setErr(error.message);
    setRow(r); setEvents(ev || []); setDict(d);
  }
  useEffect(() => { setRow(null); load(); }, [id]);
  const pos = ids ? ids.indexOf(id) : -1;
  const go = (d: number) => {
    if (!ids || !onNavigate) return;
    for (let i = pos + d; i >= 0 && i < ids.length; i += d) if (!viewers('lead', ids[i]).length) return onNavigate(ids[i]);
  };
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
  const calls = events.filter((e) => e.event_type === 'call');
  const pinned = events.filter((e) => e.event_type === 'note' && e.pinned);
  const admin = rfqAdminUrl(row.partner_id); const pr = aePriority(row);

  return (<>
    <div className="scrim" onClick={onClose} />
    <section className="ws anim" role="dialog" aria-label={`${row.name} 작업창`}>
      <header className="ws-h">
        <div className="ws-top">
          <h2>{row.name}</h2>
          <PhoneTag partnerId={row.partner_id} subject="lead" subjectId={id} module="ae" />
          <span className={`chip ${AE_PRIO[pr].cls}`}>{AE_PRIO[pr].t}{row.manual_priority ? ' · 수동' : ''}</span>
          <span className={`chip ${row.service_line === 'miso_visit' ? 'mv' : ''}`}>{LINE_L[row.service_line]}</span>
          {row.grade && <span className={`chip ${GRADE_CLS[row.grade] || ''}`}>{row.grade}등급 · {row.score}점</span>}
          {row.region_tier && <span className={`chip ${row.region_tier === '1' ? 'warn' : ''}`}>{TIER_L[row.region_tier]}</span>}
          {viewers('lead', id).length > 0 && <span className="busy"><Icon n="eye" /> {viewers('lead', id).join(', ')}님이 지금 보고 있어요 · 중복 통화 주의</span>}
          <span className="ws-nav">
            {ids && pos >= 0 && <><button className="btn" disabled={pos <= 0} onClick={() => go(-1)} title="이전 (Alt+←)">‹ 이전</button><span className="mono">{pos + 1} / {ids.length}</span><button className="btn" disabled={pos >= ids.length - 1} onClick={() => go(1)} title="다음 (Alt+→)">다음 ›</button></>}
            <button className="x" onClick={onClose} aria-label="닫기">×</button>
          </span>
        </div>
        <div className="ws-meta">
          <span className="mono">{row.partner_id ? `파트너 #${row.partner_id}` : `리드 #${id} · 파트너 ID 미연결`}</span>
          <span>{row.region || '지역 –'}</span>
          <span>담당 <OwnerSelect subject="lead" id={id} owner={row.owner_id} onSaved={done} /></span>
          <span>통화 {calls.length}회</span>
          {admin ? <a className="btn admin" href={admin} target="_blank" rel="noreferrer">전화번호는 어드민에서 ↗</a> : <span className="chip warn">파트너 ID를 연결하면 어드민 링크가 생겨요</span>}
        </div>
        <StageBar row={row} dict={dict} onSaved={done} />
      </header>
      <div className="ws-b">
        {/* 왼쪽 = 전화할 때 볼 것 · 가운데 = 콜 기록 · 오른쪽 = 팔로우업 · 이력 관리 */}
        <div className="ws-col info">
          <div className="colhead">전화 전에 보기</div>
          {pinned.length > 0 && <div className="blk">{pinned.map((n) => <div className="pinned" key={n.id}><b>{NOTE_KIND[n.note_kind] || '특이'}</b>{n.memo}</div>)}</div>}
          <Opener row={row} />
          <Checklist row={row} onSaved={done} />
          {row.insight && <div className="blk"><h3>왜 이 파트너인가 <span className="sub">리스트 {row.list_version}</span></h3><LeadInsight row={row} /></div>}
          {row.signals && <Signals row={row} />}
        </div>
        <div className="ws-col main">
          <LeadCallForm key={`${id}-${calls.length}`} row={row} dict={dict} attempt={calls.length + 1} onSaved={done} onNext={ids && pos >= 0 && pos < ids.length - 1 ? () => go(1) : null} />
          <ChargeAndQuote row={row} onSaved={done} />
          <NoteForm subject="lead" id={id} module="ae" onSaved={done} />
        </div>
        <div className="ws-col hist">
          <div className="colhead">팔로우업 · 이력</div>
          <FollowupCard row={row} onSaved={done} />
          <Status row={row} dict={dict} onSaved={done} />
          <Fold k="labels" title="콜 우선순위 · 라벨"><Labels row={row} onSaved={done} /></Fold>
          <History events={events} dict={dict} staffName={staffName} />
        </div>
      </div>
    </section>
    {toast && <div className="toast">{toast}</div>}
  </>);
}

// ───────── 상단 진행 막대: 단계를 눌러 바로 이동 (사유 필수) ─────────
const MOVE_REASONS = ['통화로 확인', '어드민에서 확인', '파트너가 직접 진행', '잘못 분류 정정'];
function StageBar({ row, dict, onSaved }: any) {
  const [to, setTo] = useState<string | null>(null); const [reason, setReason] = useState(''); const [lost, setLost] = useState(''); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const cur = aeRank(row.stage); const fails = dict.filter((r: any) => r.module === 'ae' && r.result === 'fail');
  useEffect(() => { setReason(''); setLost(''); setMsg(''); }, [to]);
  async function move() {
    if (!to) return;
    setBusy(true); setMsg('');
    let error: any = null;
    if (to === 'WON') ({ error } = await sb().rpc('record_first_quote', { p_lead: row.id, p_memo: reason.trim() || null }));
    else {
      if (!reason.trim()) { setBusy(false); return setMsg('사유를 고르거나 적어 주세요'); }
      if (to === 'LOST') { if (!lost) { setBusy(false); return setMsg('이탈 사유를 고르세요'); } await sb().from('ae_leads').update({ lost_reason: lost }).eq('id', row.id); }
      ({ error } = await sb().rpc('move_stage', { p_subject: 'lead', p_id: row.id, p_to: to, p_reason: reason.trim() }));
    }
    setBusy(false);
    if (error) return setMsg('실패: ' + error.message);
    const t = to; setTo(null); onSaved(t === 'WON' ? '첫 견적 제출 확인 · 완료 처리 · AM 신규 정착으로 이관' : `${t} ${stageLabel(t)}(으)로 이동 · 로그 기록됨`);
  }
  return (<div className="stagebar">
    <div className="stepper" role="group" aria-label="단계">
      {AE_STAGES.map((s) => {
        const r = aeRank(s.c); const st = s.c === row.stage ? 'cur' : row.stage !== 'LOST' && r >= 0 && r < cur ? 'done' : '';
        return <button key={s.c} type="button" className={`${st} ${s.c === 'WON' ? 'won' : ''} ${s.c === 'LOST' ? 'lost' : ''} ${to === s.c ? 'pick' : ''}`} title={s.d}
          onClick={() => setTo(s.c === row.stage || to === s.c ? null : s.c)}><i /><span><b className="mono">{s.c}</b> {s.t}</span></button>;
      })}
    </div>
    {to && <div className="stagepop">
      <b className="mono">{row.stage} → {to}</b><span>{stageLabel(to)}</span>
      {to === 'WON' ? <>
        <span className="hint">미소방문 견적을 실제로 냈는지 어드민에서 확인했을 때만 눌러 주세요. 완료로 닫히고 AM 신규 정착(N0)으로 넘어가요.{!row.charged_amount && ' 충전 기록이 아직 없어요.'}</span>
        <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="메모 (선택) 예: 10/8 부평 요청에 첫 견적" />
      </> : <>
        {to === 'LOST' && <select value={lost} onChange={(e) => setLost(e.target.value)} style={{ width: 'auto' }}><option value="">이탈 사유</option>{fails.map((r: any) => <option key={r.code} value={r.code}>{r.label}</option>)}</select>}
        <Chips opts={MOVE_REASONS.map((t) => [t, t])} value={reason} onPick={(v) => setReason(v)} />
        <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="사유 (필수 · 로그에 남음)" />
      </>}
      <button className="btn primary" disabled={busy} onClick={move}>{to === 'WON' ? '첫 견적 확인 · 완료' : '이동'}</button>
      <button className="btn" onClick={() => setTo(null)}>취소</button><span className="err">{msg}</span>
    </div>}
  </div>);
}

export { FollowupPicker, fuLabel } from './Followup';

// ───────── 콜 기록 (AE 전용) ─────────
const PURPOSE_BY_STAGE: Record<string, string> = { E0: '확인 콜', E1: '재시도 콜', E2: '가입 안내', E3: '가입 안내', E4: '서류 독촉', E5: '프로필 작업', E6: '리뷰 작업', E7: '충전 안내', E8: '첫 견적 독려' };
const TODO_BY_STAGE: Record<string, string> = { E1: '재시도', E2: '관심 확인 재통화', E3: '가입·서류 안내', E4: '서류 받았는지 확인', E5: '프로필 세팅 확인', E6: '리뷰 작업 확인', E7: '충전 확인', E8: '첫 견적 제출 확인' };
function LeadCallForm({ row, dict, attempt, onSaved, onNext }: any) {
  const [f, setF] = useState<any>({ purpose: PURPOSE_BY_STAGE[row.stage] || PURPOSE.ae[0], connect: null, result: null, reason: null, memo: '', next: defaultFollowup(), nextTouched: false, points: [], who: null, concerns: [], note: '', noteTouched: false, stage: null, close: '', noFollow: false });
  const [plan, setPlan] = useState<any>(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const set = (p: any) => { setErr(''); setF((o: any) => ({ ...o, ...p })); };
  const holds = dict.filter((r: any) => r.module === 'ae' && r.result === 'hold');
  const fails = dict.filter((r: any) => r.module === 'ae' && r.result === 'fail');

  useEffect(() => {
    if (f.connect !== 'absent') { setPlan(null); return; }
    sb().rpc('next_attempt_after_absence', { p_subject: 'lead', p_id: row.id, p_module: 'ae' }).then(({ data }: any) => {
      const p = Array.isArray(data) ? data[0] : data; setPlan(p);
      if (p?.next_at) setF((o: any) => (o.nextTouched ? o : { ...o, next: toLocalInput(new Date(p.next_at)) }));
    });
  }, [f.connect]);

  // 콜 결과로 자동 이동할 단계 (DB log_call 규칙과 같음)
  const auto = useMemo(() => {
    const s = row.stage; if (!f.connect) return s;
    if (f.connect === 'absent') return plan?.auto_close ? 'LOST' : s === 'E0' ? 'E1' : s;
    if (f.connect === 'dead' || f.connect === 'refuse') return 'LOST';
    if (f.connect === 'etc') return s === 'E0' ? 'E1' : s;
    if (f.result === 'fail') return 'LOST';
    if (['E0', 'E1'].includes(s) && f.result) return f.result === 'go' ? 'E3' : 'E2';
    if (s === 'E2' && f.result === 'go') return 'E3';
    return s;
  }, [f.connect, f.result, plan, row.stage]);
  const closing = auto === 'LOST';
  const after = !closing && f.stage ? f.stage : auto;
  const todo = TODO_BY_STAGE[after] || '';
  useEffect(() => { if (!f.noteTouched) setF((o: any) => ({ ...o, note: f.connect ? todo : '' })); }, [after, f.connect]);

  async function save(next = false) {
    if (busy || !f.connect) return;
    const errs: string[] = [];
    if (f.connect === 'connected') {
      if (!f.result) errs.push('결과');
      if (f.result === 'fail' && !f.reason) errs.push('실패 유형');
      if (f.result === 'hold' && !f.reason) errs.push('보류 사유');
      if (!f.memo.trim()) errs.push('통화 메모');
    }
    if (!closing && !f.noFollow && !f.next) errs.push('팔로우업 날짜');
    if (!closing && f.noFollow && !f.close.trim()) errs.push('팔로우업 없이 끝내는 사유');
    if (errs.length) return setErr(errs.join(', ') + '을(를) 채워야 저장돼요');
    setBusy(true);
    const { error } = await sb().rpc('log_call', {
      p_subject: 'lead', p_id: row.id, p_module: 'ae', p_purpose: f.purpose, p_connect: f.connect,
      p_result: f.connect === 'connected' ? f.result : null, p_reason_code: f.connect === 'connected' ? f.reason : null, p_memo: f.memo.trim() || null,
      p_next_at: !closing && !f.noFollow && f.next && (f.nextTouched || f.connect !== 'absent') ? fromLocalInput(f.next).toISOString() : null,
      p_close_reason: !closing && f.noFollow ? f.close.trim() : null,
      p_next_note: !closing && !f.noFollow ? f.note.trim() || null : null,
      p_stage_to: !closing && f.stage && f.stage !== auto ? f.stage : null,
      p_points: f.points.length ? f.points : null, p_concerns: f.connect === 'connected' && f.concerns.length ? f.concerns : null, p_counterpart: f.connect === 'connected' ? f.who : null,
    });
    setBusy(false);
    if (error) return setErr('저장 실패: ' + error.message);
    await onSaved(`${attempt}회차 저장 · ${f.connect === 'connected' ? RESULT_L[f.result] : CONNECT_L[f.connect]}${after !== row.stage ? ` · ${row.stage}→${after}` : ''}${!closing && f.next && !f.noFollow ? ` · ${fuLabel(f.next)}` : ''}`);
    if (next && onNext) onNext();
  }
  // 단축키: 1~5 연결 결과 · Q/W/E 진행/보류/실패 · ⌘/Ctrl+Enter 저장(다음 건이 있으면 저장하고 다음)
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); save(!!onNext); return; }
      const el = e.target as HTMLElement; if (/INPUT|TEXTAREA|SELECT/.test(el?.tagName || '') || e.altKey || e.metaKey || e.ctrlKey) return;
      const n = '12345'.indexOf(e.key); if (n >= 0) { const v = CONNECT[n][0]; set({ connect: f.connect === v ? null : v, result: null, reason: null, stage: null, next: f.nextTouched ? f.next : defaultFollowup() }); return; }
      const rk = ({ q: 'go', w: 'hold', e: 'fail' } as any)[e.key.toLowerCase()];
      if (rk && f.connect === 'connected') set({ result: f.result === rk ? null : rk, reason: null, stage: null });
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  });

  const pts = aeCallPoints(row); const tog = (k: string, v: string) => set({ [k]: f[k].includes(v) ? f[k].filter((x: string) => x !== v) : [...f[k], v] });
  return (<div className="blk callform"><h3>콜 기록 <span className="sub">{attempt}회차</span><select className="purpose" value={f.purpose} onChange={(e) => set({ purpose: e.target.value })} aria-label="통화 목적">{PURPOSE.ae.map((p) => <option key={p}>{p}</option>)}</select></h3>
    <div className="form">
      <div className="step"><span className="lbl"><i>1</i>연결</span><Chips opts={CONNECT} value={f.connect} onPick={(v) => set({ connect: f.connect === v ? null : v, result: null, reason: null, stage: null, next: f.nextTouched ? f.next : defaultFollowup() })} /></div>
      {f.connect === 'connected' && <>
        <div className="step"><span className="lbl">다룬 콜 포인트 <span className="sub">통화하면서 눌러 두면 기록에 남아요</span></span><Chips multi opts={pts.map((t) => [t, t])} value={f.points} onPick={(v) => tog('points', v)} /></div>
        <div className="step"><span className="lbl">통화 상대</span><Chips opts={COUNTERPART.map((t) => [t, t])} value={f.who} onPick={(v) => set({ who: f.who === v ? null : v })} /></div>
        <div className="step"><span className="lbl"><i>2</i>결과 <span className="sub">{['E0', 'E1'].includes(row.stage) ? '관심 있음 → 연결을 거쳐 관심있음 단계로' : ''}</span></span>
          <Chips opts={AE_RESULT} value={f.result} onPick={(v) => set({ result: f.result === v ? null : v, reason: null, stage: null })} /></div>
        {f.result === 'hold' && <div className="step"><span className="lbl">재통화 이유</span><Chips opts={holds.map((r: any) => [r.code, r.label])} value={f.reason} onPick={(v) => set({ reason: v })} /></div>}
        {f.result === 'fail' && <div className="step"><span className="lbl">실패 유형 (필수)</span><Chips opts={fails.map((r: any) => [r.code, r.label])} value={f.reason} onPick={(v) => set({ reason: v })} /></div>}
        <div className="step"><span className="lbl">우려 · 반대 의견 <span className="sub">여러 개 선택</span></span><Chips multi opts={AE_CONCERNS.map((t) => [t, t])} value={f.concerns} onPick={(v) => tog('concerns', v)} /></div>
      </>}
      {f.connect && <>
        <div className="f"><span>통화 메모 {f.connect === 'connected' ? '(연결된 콜은 필수)' : '(선택)'}</span>
          <textarea rows={5} value={f.memo} onChange={(e) => set({ memo: e.target.value })} placeholder={'통화 요지 · 상대 반응 · 약속한 것\n예: 사장님 직접 통화. 방문견적 방식은 좋다고 함, 참여비가 걱정. 금요일까지 서류 보내기로'} /></div>
        {!closing && <>
          <div className="step"><span className="lbl"><i>3</i>통화 후 단계 <span className="sub">자동: {stageLabel(auto)} — 다르면 눌러서 바꾸세요</span></span>
            <div className="chips stagechips">{AE_OPEN.map((c) => <button type="button" key={c} aria-pressed={after === c} className={c === auto && after !== c ? 'suggest' : ''} onClick={() => set({ stage: c === auto ? null : c })}>{stageLabel(c)}</button>)}</div></div>
          <div className="step"><span className="lbl"><i>4</i>팔로우업 날짜 {plan?.next_at && !f.nextTouched ? <span className="sub">부재 정책 자동 제안 — 바꾸면 수동 조정으로 기록</span> : null}</span>
            {!f.noFollow ? <>
              <FollowupPicker value={f.next} onChange={(v) => set({ next: v, nextTouched: true })} />
              <div className="f"><span>그날 할 일</span><input type="text" value={f.note} onChange={(e) => set({ note: e.target.value, noteTouched: true })} placeholder="예: 서류 받았는지 확인" /></div>
              <button type="button" className="linkbtn" onClick={() => set({ noFollow: true })}>팔로우업 없이 끝내기</button>
            </> : <div className="row">
              <div className="f"><span>팔로우업 없이 끝내는 사유</span><input type="text" value={f.close} onChange={(e) => set({ close: e.target.value })} placeholder="예: 파트너가 직접 연락 주기로" /></div>
              <button type="button" className="linkbtn" onClick={() => set({ noFollow: false, close: '' })}>팔로우업 잡기</button></div>}
          </div>
        </>}
        <div className="preview"><b>저장하면</b>
          <span>{attempt}회차 기록 · {f.connect === 'connected' ? (f.result ? AE_RESULT.find(([k]) => k === f.result)![1] : '결과 선택 필요') : CONNECT_L[f.connect]}{f.points.length ? ` · 포인트 ${f.points.length}개` : ''}{f.concerns.length ? ` · 우려 ${f.concerns.length}개` : ''}</span>
          {after !== row.stage ? <span>단계 <b>{stageLabel(row.stage)} → {stageLabel(after)}</b>{['E0', 'E1'].includes(row.stage) && f.connect === 'connected' && aeRank(after) > aeRank('E2') ? ' (연결 단계를 거쳐 기록)' : ''}{f.stage && f.stage !== auto ? ' · 담당자 지정' : ''}</span> : <span>단계 유지 · {stageLabel(row.stage)}</span>}
          {!closing && !f.noFollow && f.next && <span>팔로우업 <b>{fuLabel(f.next)}</b>{f.note ? ` · ${f.note}` : ''} → 그날 ‘AE 팔로우업’ 탭에 올라와요</span>}
          {closing && <span>이탈로 닫히고 팔로우업이 지워져요</span>}
          {plan && <span>부재 누적 {plan.absent_total}회 · 오늘 {plan.absent_today}회{plan.send_sms ? ' · 부재 문자 발송 차례' : ''}{plan.auto_close ? ' · 자동 이탈' : ''}</span>}
          {f.connect === 'refuse' && <span>수신거부 목록에 추가 — 이후 큐에서 제외</span>}
        </div>
      </>}
      <div className="row savebar">
        {onNext ? <><button className="btn primary" disabled={!f.connect || busy} onClick={() => save(true)}>{busy ? '저장 중…' : '저장하고 다음 ›'}</button><button className="btn" disabled={!f.connect || busy} onClick={() => save(false)}>저장만</button></>
          : <button className="btn primary" disabled={!f.connect || busy} onClick={() => save(false)}>{busy ? '저장 중…' : '콜 기록 저장'}</button>}
        <span className="err">{err}</span></div>
      <div className="keys">단축키 <kbd>1</kbd>~<kbd>5</kbd> 연결 결과 · <kbd>Q</kbd><kbd>W</kbd><kbd>E</kbd> 진행/보류/실패 · <kbd>⌘</kbd>/<kbd>Ctrl</kbd>+<kbd>Enter</kbd> {onNext ? '저장하고 다음' : '저장'} · <kbd>Alt</kbd>+<kbd>←</kbd><kbd>→</kbd> 이전/다음</div>
    </div></div>);
}

// ───────── 통화 첫마디 ─────────
function Opener({ row }: any) {
  const o = aeOpener(row);
  return (<div className="blk opener"><h3>이렇게 시작해 보세요</h3>
    <p className="line">“{o.line}”</p>
    {o.facts.length > 0 && <ul>{o.facts.map((t) => <li key={t}>{t}</li>)}</ul>}
  </div>);
}

// ───────── 단계별 남은 일 ─────────
function Checklist({ row, onSaved }: any) {
  const [busy, setBusy] = useState(false); const [all, setAll] = useState(false);
  const groups = aeChecklist(row); const next = aeNextSuggestion(row);
  const cur = groups.find((g) => g.c === row.stage) || groups.find((g) => aeRank(g.c) > aeRank(row.stage));
  const shown = all || !cur ? groups : [cur];
  const items = groups.flatMap((g) => g.items); const okN = items.filter((i) => i.ok === true).length;
  if (['WON', 'LOST'].includes(row.stage)) return null;
  async function advance() {
    if (!next) return; setBusy(true);
    const { error } = await sb().rpc('move_stage', { p_subject: 'lead', p_id: row.id, p_to: next, p_reason: `${row.stage} 남은 일 완료 확인(리대시)` });
    setBusy(false); onSaved(error ? '실패: ' + error.message : `${next} ${stageLabel(next)}(으)로 이동`);
  }
  return (<div className="blk"><h3>{cur && cur.c !== row.stage ? '다음 단계 준비' : '남은 일'} <span className="sub">{row.signals ? `전체 ${okN}/${items.length} 완료 · 리대시 ${fmtDT(row.signals_at)}` : '리대시 동기화 전'}</span></h3>
    <div className="checks">{shown.map((g) => <div key={g.c} className={`cg ${g.c === row.stage ? 'cur' : ''}`}>
      <b><span className="mono">{g.c}</span> {g.t}</b>
      {g.items.map((i) => <span key={i.t} className={`ci ${i.ok === true ? 'ok' : i.ok === false ? 'no' : 'na'}`}>{i.ok === true ? '✓' : i.ok === false ? '○' : '?'} {i.t}</span>)}
    </div>)}</div>
    {next && <div className="nextsug"><span>{row.stage} 남은 일이 다 끝났어요.</span><button className="btn primary" disabled={busy} onClick={advance}>{next} {stageLabel(next)}(으)로 넘기기</button></div>}
    {cur && <button className="linkbtn" onClick={() => setAll(!all)}>{all ? '지금 단계만 보기' : '서류 ~ 첫 견적 전체 보기'}</button>}
  </div>);
}

// 접어 두는 블록 (열림 상태는 브라우저에 기억)
function Fold({ k, title, children }: any) {
  const key = 'ws-fold-' + k; const [open, setOpen] = useState(false);
  useEffect(() => { try { setOpen(localStorage.getItem(key) === '1'); } catch {} }, []);
  return (<details className="fold" open={open} onToggle={(e) => { const o = (e.target as HTMLDetailsElement).open; setOpen(o); try { localStorage.setItem(key, o ? '1' : '0'); } catch {} }}>
    <summary>{title}</summary>{children}</details>);
}

// ───────── 현재 팔로우업 (콜 없이 다시 잡기) ─────────
function FollowupCard({ row, onSaved }: any) {
  const [edit, setEdit] = useState(false); const [v, setV] = useState(''); const [note, setNote] = useState(''); const [msg, setMsg] = useState('');
  const closed = ['WON', 'LOST'].includes(row.stage);
  const over = row.next_action_at && new Date(row.next_action_at) <= new Date();
  async function save() {
    if (!v) return setMsg('날짜를 고르세요');
    const { error } = await sb().rpc('set_lead_followup', { p_id: row.id, p_at: fromLocalInput(v).toISOString(), p_note: note.trim() || null });
    if (error) return setMsg('실패: ' + error.message);
    setEdit(false); onSaved(`팔로우업 ${fuLabel(v)}로 변경`);
  }
  if (closed) return null;
  return (<div className={`blk fucard ${over ? 'over' : ''}`}><h3>팔로우업</h3>
    {row.next_action_at ? <div className="fu-now"><b className="mono">{fuLabel(toLocalInput(new Date(row.next_action_at)))}</b><span>{row.next_action_note || '할 일 메모 없음'}</span></div>
      : <div className="fu-now"><b>{row.stage === 'E0' ? '아직 콜 전' : '팔로우업 미등록'}</b><span>콜을 기록하면서 날짜를 잡거나, 아래에서 바로 잡을 수 있어요</span></div>}
    {!edit ? <button className="linkbtn" onClick={() => { setEdit(true); setV(row.next_action_at ? toLocalInput(new Date(row.next_action_at)) : ''); setNote(row.next_action_note || ''); }}>콜 없이 날짜만 바꾸기</button>
      : <div className="form"><FollowupPicker value={v} onChange={setV} />
        <div className="f"><span>할 일</span><input type="text" value={note} onChange={(e) => setNote(e.target.value)} /></div>
        <div className="row"><button className="btn primary" onClick={save}>저장</button><button className="btn" onClick={() => setEdit(false)}>취소</button><span className="err">{msg}</span></div></div>}
  </div>);
}

// ───────── 라벨 · 콜 우선순위 ─────────
function Labels({ row, onSaved }: any) {
  const [custom, setCustom] = useState(''); const tags: string[] = row.tags || [];
  const auto = aeAutoPriority(row);
  async function saveTags(next: string[]) {
    const { error } = await sb().from('ae_leads').update({ tags: next }).eq('id', row.id);
    if (!error) await sb().from('activity_events').insert({ subject: 'lead', subject_id: row.id, module: 'ae', event_type: 'field', field: 'tags', old_value: tags.join(', '), new_value: next.join(', ') });
    onSaved(error ? '실패: ' + error.message : '라벨 저장됨');
  }
  async function savePrio(p: number | null) {
    const { error } = await sb().from('ae_leads').update({ manual_priority: p }).eq('id', row.id);
    if (!error) await sb().from('activity_events').insert({ subject: 'lead', subject_id: row.id, module: 'ae', event_type: 'field', field: 'manual_priority', old_value: row.manual_priority ? `P${row.manual_priority}` : '자동', new_value: p ? `P${p}` : '자동' });
    onSaved(error ? '실패: ' + error.message : `콜 우선순위 ${p ? 'P' + p : '자동(P' + auto + ')'}`);
  }
  const all = [...new Set([...AE_TAG_PRESETS, ...tags])];
  return (<div className="blk"><h3>콜 우선순위 · 라벨</h3>
    <div className="seg" role="group">{[[null, `자동 P${auto}`], [1, 'P1'], [2, 'P2'], [3, 'P3'], [4, 'P4']].map(([p, l]: any) => <button key={l} aria-pressed={(row.manual_priority || null) === p} onClick={() => savePrio(p)}>{l}</button>)}</div>
    {aeLabels(row).length > 0 && <div className="events">{aeLabels(row).map((l) => <span key={l.k} className={`chip ${l.tone || ''}`}>{l.t}</span>)}</div>}
    <div className="chips tags">{all.map((t) => <button type="button" key={t} aria-pressed={tags.includes(t)} onClick={() => saveTags(tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t])}>{t}</button>)}</div>
    <div className="row"><input type="text" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="라벨 직접 추가" style={{ flex: 1 }} onKeyDown={(e) => { if (e.key === 'Enter' && custom.trim()) { saveTags([...new Set([...tags, custom.trim()])]); setCustom(''); } }} />
      <button className="btn" onClick={() => { if (custom.trim()) { saveTags([...new Set([...tags, custom.trim()])]); setCustom(''); } }}>추가</button></div>
  </div>);
}

// ───────── 온보딩 현황 + 파트너 ID 연결 ─────────
function Status({ row, dict, onSaved }: any) {
  const [pid, setPid] = useState(''); const [msg, setMsg] = useState('');
  const kp = [['마지막 콜', row.last_call_at ? `${fmtD(row.last_call_at)} ${outcomeText({ connect: row.last_connect, result: row.last_result })}` : '–'],
    ['충전', row.charged_amount ? `${won(row.charged_amount)}원 · ${fmtD(row.charged_at)}` : '–'], ['첫 견적', row.first_quote_at ? fmtD(row.first_quote_at) : '–'],
    ['이탈 사유', row.lost_reason ? reasonLabel(dict, 'ae', row.lost_reason) : '–']];
  async function link() {
    const n = Number(pid); if (!n) return setMsg('숫자 파트너 ID를 입력하세요');
    const { error } = await sb().from('ae_leads').update({ partner_id: n }).eq('id', row.id);
    if (!error) await sb().from('activity_events').insert({ subject: 'lead', subject_id: row.id, module: 'ae', event_type: 'field', field: 'partner_id', old_value: null, new_value: String(n) });
    onSaved(error ? '실패: ' + (error.message.includes('ae_leads_partner_line') ? '이미 같은 서비스로 등록된 파트너예요' : error.message) : '파트너 ID 연결됨');
  }
  return (<div className="blk"><h3>온보딩 현황</h3>
    <div className="grid2">{kp.map(([l, v]: any) => <div key={l}><span>{l}</span><b>{v}</b></div>)}</div>
    {row.last_memo && <div className={`recent`}><div className={`rc ${outcomeCls({ connect: row.last_connect, result: row.last_result })}`}><div className="h">최근 콜 메모 · {fmtDT(row.last_call_at)}</div>{row.last_memo}</div></div>}
    {!row.partner_id && <div className="form"><div className="row"><div className="f"><span>파트너 ID 연결 (어드민 링크·AM 이관에 필요)</span><input type="text" value={pid} onChange={(e) => setPid(e.target.value)} placeholder="예: 13426" /></div>
      <button className="btn" style={{ alignSelf: 'flex-end' }} onClick={link}>연결</button></div><span className="err">{msg}</span></div>}
  </div>);
}

// ───────── 리대시 최신 신호 ─────────
const SIG_L: [string, string, 'bool' | 'date' | 'won' | 'num' | 'text'][] = [
  ['mv_onboarding_status', '미소방문 상태', 'text'], ['mv_registered_at', '미소방문 등록', 'date'], ['mv_received_90d', '미소방문 요청 봄(90일)', 'num'],
  ['mv_skipped_90d', '요청 건너뜀(90일)', 'num'], ['mv_last_seen_at', '마지막으로 요청 본 날', 'date'], ['mv_self_quotes', '미소방문 자가 견적', 'num'],
  ['mv_admin_quotes', '어드민 대리 견적', 'num'], ['credit_balance', '크레딧 잔액(지갑)', 'won'], ['last_charge_at', '마지막 충전', 'date'],
  ['charge_count', '충전 횟수', 'num'], ['doc_business_status', '사업자 서류', 'text'], ['doc_idcard_status', '신분증', 'text'],
  ['has_profile_photo', '프로필 사진', 'bool'], ['photo_count', '사진 수', 'num'], ['description_len', '소개문 글자', 'num'],
  ['real_reviews', '실고객 리뷰', 'num'], ['rating', '평점', 'num'], ['moving_last_quote_at', '가정이사 마지막 견적', 'date'], ['moving_quotes_90d', '가정이사 견적(90일)', 'num'],
];
const DOC_L: Record<string, string> = { verified: '승인', submitted: '제출 · 승인 대기' };
function Signals({ row }: any) {
  const s = row.signals; if (!s) return null;
  const fmt = (v: any, k: string, key: string) => v == null || v === '' ? (key.startsWith('doc_') ? '없음' : '–') : k === 'bool' ? (v === true || v === 'true' ? '있음' : '없음')
    : k === 'date' ? fmtD(sigDate(v)) : k === 'won' ? won(+v) + '원' : key.startsWith('doc_') ? DOC_L[v] || v : String(v);
  const GROUPS: [string, string[]][] = [['미소방문', ['mv_onboarding_status', 'mv_registered_at', 'mv_received_90d', 'mv_skipped_90d', 'mv_last_seen_at', 'mv_self_quotes', 'mv_admin_quotes']],
    ['충전', ['credit_balance', 'last_charge_at', 'charge_count']], ['서류 · 프로필', ['doc_business_status', 'doc_idcard_status', 'has_profile_photo', 'photo_count', 'description_len']],
    ['리뷰 · 활동', ['real_reviews', 'rating', 'moving_last_quote_at', 'moving_quotes_90d']]];
  return (<div className="blk"><h3>실데이터 <span className="sub">리대시 {fmtDT(row.signals_at)}</span></h3>
    {GROUPS.map(([g, keys]) => { const items = SIG_L.filter(([k]) => keys.includes(k) && k in s); if (!items.length) return null;
      return <div key={g} className="siggroup"><span className="gt">{g}</span><div className="grid2">{items.map(([k, l, t]) => <div key={k}><span>{l}</span><b>{fmt(s[k], t, k)}</b></div>)}</div></div>; })}
    <div className="hintline">자가 견적이 잡히면 완료(WON), 리드 등록 뒤 충전이 잡히면 첫견적제출로 자동 이동</div></div>);
}

// ───────── 충전 · 첫 견적 ─────────
function ChargeAndQuote({ row, onSaved }: any) {
  const [amt, setAmt] = useState(''); const [memo, setMemo] = useState(''); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const parse = (s: string) => { const m = s.replace(/[,\s원]/g, '').match(/^([\d.]+)(만)?$/); return m ? Math.round(parseFloat(m[1]) * (m[2] ? 1e4 : 1)) : NaN; };
  async function charge() {
    const n = parse(amt); if (!(n > 0)) return setMsg('금액을 입력하세요 (예: 30만, 300000)');
    setBusy(true); const { error } = await sb().rpc('record_charge', { p_lead: row.id, p_amount: n, p_memo: memo.trim() || null }); setBusy(false);
    if (error) return setMsg('실패: ' + error.message);
    setAmt(''); setMemo(''); onSaved(`${won(n)}원 충전 기록 · E8 첫견적제출로 이동`);
  }
  async function firstQuote() {
    setBusy(true); const { data, error } = await sb().rpc('record_first_quote', { p_lead: row.id, p_memo: null }); setBusy(false);
    if (error) return setMsg('실패: ' + error.message);
    onSaved(data === 'handed_to_am' ? '첫 견적 확인 · 완료 · AM 신규 정착(N0)으로 이관' : data === 'won_no_partner_id' ? '첫 견적 확인 · 완료 (파트너 ID가 없어 AM 이관은 대기)' : '첫 견적 확인 · 완료');
  }
  if (row.stage === 'WON') return <div className="blk"><h3>완료</h3><div className="rule">첫 견적 {fmtD(row.first_quote_at)} · 충전 {row.charged_amount ? won(row.charged_amount) + '원' : '–'} · AM 신규 정착에서 이어서 관리해요.</div></div>;
  return (<div className="blk"><h3>충전 · 첫 견적 {row.charged_amount ? <span className="sub">누적 충전 {won(row.charged_amount)}원</span> : null}</h3><div className="form">
    <div className="row"><div className="f" style={{ flex: '0 1 120px' }}><span>충전 금액</span><input type="text" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="30만" /></div>
      <div className="f"><span>메모 (선택)</span><input type="text" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예: 첫 충전, 프로모션" /></div>
      <button className="btn" disabled={busy} style={{ alignSelf: 'flex-end' }} onClick={charge}>충전 기록</button></div>
    <div className="rule">충전을 기록하면 E8 첫견적제출로 넘어가고 내일 ‘첫 견적 독려’ 팔로우업이 잡혀요(이미 있으면 유지).</div>
    <div className="row"><button className="btn primary" disabled={busy} onClick={firstQuote}>첫 견적 제출 확인 → 완료</button><span className="err">{msg}</span></div>
  </div></div>);
}

// ───────── 이력 (필터) ─────────
function History({ events, dict, staffName }: any) {
  const [k, setK] = useState('all');
  const list = events.filter((e: any) => k === 'all' || e.event_type === k);
  return (<div className="blk"><h3>전체 이력 <span className="sub">{events.length}건</span></h3>
    <div className="seg" role="group">{[['all', '전체'], ['call', '콜'], ['stage', '단계'], ['note', '특이사항'], ['field', '변경']].map(([v, l]) => <button key={v} aria-pressed={k === v} onClick={() => setK(v)}>{l}</button>)}</div>
    <Timeline events={list} dict={dict} module="ae" staffName={staffName} /></div>);
}
