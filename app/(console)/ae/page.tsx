'use client';
import Icon from '@/components/Icon';
import { useEffect, useMemo, useState } from 'react';
import { sb, fetchAll } from '@/lib/data';
import { useLoad } from '@/components/useBoard';
import Kpis, { Head, Seg } from '@/components/Kpis';
import Detail from '@/components/Detail';
import AeTabs from '@/components/AeTabs';
import { useAssign, AssignToggle, AssignBar } from '@/components/Assign';
import { useStaff, useStaffName } from '@/components/StaffContext';
import { useViewers } from '@/components/Presence';
import { parseCsvReport, decodeCsv, toListRow, versionFromName, isFullList, MANUAL_TEMPLATE } from '@/lib/aeList';
import { downloadCsv } from '@/lib/csv';
import {
  AE_STAGES, AE_PRIO, AE_LABEL_FILTERS, LINE_L, SOURCE_L, GRADE_CLS, TIER_L, aePriority, aeLabels, stageLabel,
  dayDiff, won, fmtD, fmtDT, outcomeText, endOfToday, ymd, relTime, sinceDay,
} from '@/lib/ui';

const startOfToday = () => new Date(ymd(new Date()) + 'T00:00:00+09:00');
const CLOSED_AE = ['WON', 'LOST'];
const LIST_PAGE = 150;
const GROUP_L: Record<string, string> = { due: '오늘 팔로우업', sig: '새 신호 — 지금 연락하기 좋아요', p1: 'P1 · 지금 걸기', p2: 'P2', p3: 'P3', p4: 'P4', closed: '완료 · 이탈' };

export default function Ae() {
  const { me } = useStaff(); const staffName = useStaffName(); const viewers = useViewers();
  const a = useAssign();
  const [view, setView] = useState<'board' | 'list'>('list');
  const [line, setLine] = useState('all'); const [filter, setFilter] = useState('all'); const [src, setSrc] = useState('all');
  const [q, setQ] = useState(''); const [open, setOpen] = useState<number | null>(null); const [panel, setPanel] = useState<'' | 'filter' | 'manage'>('');
  const [prio, setPrio] = useState('all'); const [gr, setGr] = useState('all'); const [tier, setTier] = useState('all'); const [label, setLabel] = useState('all');
  const [stage, setStage] = useState('open'); const [shown, setShown] = useState(LIST_PAGE);
  const [act, setAct] = useState('all'); const [zone, setZone] = useState('all');   // 액티브/이탈 · 미소방문 권역
  useEffect(() => { try { const v = new URLSearchParams(window.location.search).get('view'); if (v === 'board' || v === 'list') setView(v); } catch {} }, []);
  const pickView = (v: 'board' | 'list') => { setView(v); try { history.replaceState(null, '', v === 'list' ? '/ae' : '/ae?view=board'); } catch {} };

  const { data, err, reload } = useLoad(async () => {
    const [rows, perf] = await Promise.all([
      fetchAll((f, t) => sb().from('v_ae_board').select('*').order('priority_rank', { ascending: true, nullsFirst: false }).order('id').range(f, t)),
      sb().rpc('perf_ae', { p_from: startOfToday().toISOString(), p_to: new Date(Date.now() + 60e3).toISOString() }),
    ]);
    if (perf.error) throw perf.error;
    return { rows: rows.map((r: any) => ({ ...r, _p: aePriority(r), _labels: aeLabels(r) })), perf: perf.data || [] };
  });
  const rows = data?.rows || []; const perf = (data?.perf || []).filter((p: any) => line === 'all' || p.service_line === line);
  const sum = (k: string) => perf.reduce((s: number, p: any) => s + (+p[k] || 0), 0);
  const eod = endOfToday(); const recent = (r: any) => dayDiff(r.stage_entered_at) <= 14;
  const isDue = (r: any) => !CLOSED_AE.includes(r.stage) && r.next_action_at && new Date(r.next_action_at) <= eod;
  const isFresh = (r: any) => !CLOSED_AE.includes(r.stage) && r.signal_change_at && Date.now() - Date.parse(r.signal_change_at) < 3 * 864e5 && (!r.last_call_at || Date.parse(r.last_call_at) < Date.parse(r.signal_change_at));
  const inLine = rows.filter((r: any) => line === 'all' || r.service_line === line);
  // 리스트에서 온 리드(grade·region_tier 있음)만 등급·티어 필터를 적용하고, 수동 등록 리드는 항상 보인다
  const gradeOk = (r: any) => gr === 'all' || !r.grade || gr.includes(r.grade);
  const tierOk = (r: any) => tier === 'all' || !r.region_tier || r.region_tier === tier;
  const prioOk = (r: any) => prio === 'all' || r._p <= +prio;
  const actOk = (r: any) => act === 'all' || (act === 'on' ? r.active_30d === true : r.active_30d === false);
  const zoneOk = (r: any) => zone === 'all' || (zone === 'in' ? r.mv_in === true : r.mv_in === false);
  const labelOk = (r: any) => label === 'all' || (label.startsWith('tag:') ? (r.tags || []).includes(label.slice(4)) : r._labels.some((l: any) => l.k === label));
  const list = inLine.filter((r: any) => gradeOk(r) && tierOk(r) && prioOk(r) && labelOk(r) && actOk(r) && zoneOk(r) && (src === 'all' || r.source === src)
    && (!q || `${r.name}${r.region || ''}${r.partner_id || ''}${r.insight?.reasons || ''}${(r.tags || []).join('')}`.includes(q))
    && (filter === 'all' || (filter === 'mine' && r.owner_id === me.id) || (filter === 'none' && !r.owner_id) || (filter === 'due' && isDue(r))));
  const live = inLine.filter((r: any) => !CLOSED_AE.includes(r.stage));
  const due = live.filter(isDue).length;
  const att = sum('attempts'), con = sum('connected');
  const tagsInUse = useMemo(() => [...new Set(rows.flatMap((r: any) => r.tags || []))].sort(), [rows]);

  // 콜 리스트 순서: 오늘까지 팔로우업(시간순) → 우선순위 P1→P4 → 리스트 순위
  const callOrder = useMemo(() => list.filter((r: any) => stage === 'all' || (stage === 'open' ? !CLOSED_AE.includes(r.stage) : r.stage === stage))
    .sort((x: any, y: any) => {
      const dx = isDue(x) ? 0 : isFresh(x) ? 1 : 2, dy = isDue(y) ? 0 : isFresh(y) ? 1 : 2; if (dx !== dy) return dx - dy;
      if (dx === 0) return +new Date(x.next_action_at) - +new Date(y.next_action_at);
      if (x._p !== y._p) return x._p - y._p;
      return (x.priority_rank ?? 1e9) - (y.priority_rank ?? 1e9) || x.id - y.id;
    }), [list, stage]);
  useEffect(() => setShown(LIST_PAGE), [line, filter, src, q, prio, gr, tier, label, stage, act, zone]);
  const orderIds = callOrder.map((r: any) => r.id);

  // 콜 리스트 구간: 오늘 팔로우업 → 새 신호 → P1~P4 (완료·이탈은 맨 아래)
  const groupOf = (r: any) => (CLOSED_AE.includes(r.stage) ? 'closed' : isDue(r) ? 'due' : isFresh(r) ? 'sig' : `p${r._p}`);
  const groupCount = useMemo(() => callOrder.reduce((m: Record<string, number>, r: any) => { const g = groupOf(r); m[g] = (m[g] || 0) + 1; return m; }, {}), [callOrder]);
  const todoCell = (r: any) => {
    if (r.stage === 'WON') return <b className="okc">완료 · 첫 견적 {fmtD(r.first_quote_at)}</b>;
    if (r.stage === 'LOST') return <span className="sub">이탈</span>;
    if (r.next_action_at) { const over = new Date(r.next_action_at) < new Date(); return <><b className={over ? 'over' : ''}>{relTime(r.next_action_at)}{over ? ' · 지남' : ''}</b><span className="sub">{r.next_action_note || '팔로우업'}</span></>; }
    return r.stage === 'E0' ? <><b>첫 통화</b><span className="sub">{r.signal_change && isFresh(r) ? '신호 확인 후 연락' : '소개 · 관심 확인'}</span></> : <b className="over">팔로우업 미등록</b>;
  };
  const labelsOf = (r: any, n = 3) => <>{r._labels.slice(0, n).map((l: any) => <span key={l.k} className={`chip ${l.tone || ''}`}>{l.t}</span>)}{(r.tags || []).map((t: string) => <span key={t} className="chip tag">#{t}</span>)}</>;
  const fuCell = (r: any) => {
    if (r.stage === 'WON') return <span className="chip ok">완료 · 첫 견적 {fmtD(r.first_quote_at)}</span>;
    if (r.stage === 'LOST') return <span className="why">이탈 · {r.lost_reason || '–'}</span>;
    if (r.next_action_at) { const over = new Date(r.next_action_at) <= eod; return <span><b className={`mono ${over ? 'over' : ''}`}>{fmtDT(r.next_action_at)}</b> <span className="why">{r.next_action_note || ''}</span></span>; }
    return r.stage === 'E0' ? <span className="why">콜 전</span> : <span className="over">미등록</span>;
  };

  const card = (r: any) => {
    const stale = !['E0', ...CLOSED_AE].includes(r.stage) && dayDiff(r.stage_entered_at) > 7;
    return <button key={r.id} className={`card ${stale ? 'sla-warn' : ''} ${a.picked.includes(r.id) ? 'picked' : ''}`} onClick={() => (a.on ? a.toggle(r.id) : setOpen(r.id))}>
      <div className="r1"><span className={`chip ${AE_PRIO[r._p].cls}`}>P{r._p}</span><span className="nm">{r.name}</span><span className="rt meta"><span className={`chip ${r.service_line === 'miso_visit' ? 'mv' : ''}`}>{LINE_L[r.service_line]}</span></span></div>
      {r.grade && <div className="meta"><span className={`chip ${GRADE_CLS[r.grade] || ''}`}>{r.grade}등급 · {r.score}점</span>{r.region_tier && <span className={`chip ${r.region_tier === '1' ? 'warn' : ''}`}>{TIER_L[r.region_tier]}</span>}{r.priority_rank && <span className="mono">#{r.priority_rank}</span>}</div>}
      {(r._labels.length > 0 || (r.tags || []).length > 0) && <div className="meta">{labelsOf(r, 2)}</div>}
      <div className="meta"><StatusPills r={r} /><span>{r.region || '지역 –'}</span>{r.partner_id ? <span className="mono">#{r.partner_id}</span> : <span className="chip warn">ID 미연결</span>}<span>담당 {r.owner_id ? staffName(r.owner_id) : '미배정'}</span></div>
      {r.last_call_at && <div className="meta" style={{ fontSize: 12.5 }}><span>{r.call_count}회 · {fmtD(r.last_call_at)} {outcomeText({ connect: r.last_connect, result: r.last_result })}</span></div>}
      {r.stage === 'E8' && r.charged_amount > 0 && <div className="meta"><span>{won(r.charged_amount)}원 · {fmtD(r.charged_at)}</span></div>}
      <div className="next">{fuCell(r)}</div>
    </button>;
  };

  // 자주 안 쓰는 필터는 '필터' 패널로 접어 두고, 켜진 개수만 버튼에 보여 준다
  const extra = [act !== 'all', zone !== 'all', label !== 'all', view === 'list' && stage !== 'open', gr !== 'all', tier !== 'all', line !== 'all', src !== 'all'].filter(Boolean).length;
  const resetExtra = () => { setAct('all'); setZone('all'); setLabel('all'); setStage('open'); setGr('all'); setTier('all'); setLine('all'); setSrc('all'); };
  const fresh = live.filter(isFresh).length;
  return (<>
    <Head title="AE 온보딩" sub="파트너를 첫 견적 제출까지. 콜 리스트 위에서부터 차례로 전화하면 돼요." />
    <AeTabs active={view} onPick={pickView} due={due} />
    <Kpis items={[
      { l: '오늘 콜', v: att, s: att ? `연결 ${con} · 연결률 ${Math.round(con / att * 100)}%` : '아직 없음' },
      { l: '오늘 팔로우업', v: due, c: due ? 'bad' : '', s: due ? '지난 것 포함 · 맨 위에 있어요' : '없음' },
      { l: '새 신호', v: fresh, c: fresh ? 'ok' : '', s: '서류·충전·요청 열람 등 (3일)' },
      { l: 'P1 미컨택', v: live.filter((r: any) => r._p === 1 && r.stage === 'E0').length, s: `진행 중 ${live.length.toLocaleString()}명` },
    ]} />
    <div className="toolbar">
      <input className="search" placeholder="이름 · 지역 · 파트너 ID 검색" value={q} onChange={(e) => setQ(e.target.value)} />
      <Seg value={filter} onChange={setFilter} opts={[['all', '전체'], ['mine', '내 담당'], ['none', '미배정']]} />
      <Seg value={prio} onChange={setPrio} opts={[['all', '모든 우선순위'], ['1', 'P1'], ['2', 'P1–2'], ['3', 'P1–3']]} />
      <button className={`btn ${extra ? 'on' : ''}`} aria-expanded={panel === 'filter'} onClick={() => setPanel(panel === 'filter' ? '' : 'filter')}>필터{extra ? ` ${extra}` : ''}</button>
      <span className="toolbar-r">
        <button className="btn ghost" aria-pressed={panel === 'manage'} onClick={() => setPanel(panel === 'manage' ? '' : 'manage')}>리스트 관리</button>
        <AssignToggle a={a} />
      </span>
    </div>
    {panel === 'filter' && <div className="filterbox">
      <label><span>견적 활동</span><select value={act} onChange={(e) => setAct(e.target.value)}><option value="all">전체</option><option value="on">액티브 (최근 30일 견적)</option><option value="off">이탈 (30일 견적 없음)</option></select></label>
      <label><span>미소방문 권역</span><select value={zone} onChange={(e) => setZone(e.target.value)}><option value="all">전체</option><option value="in">권역 커버</option><option value="out">권역 밖</option></select></label>
      <label><span>라벨</span><select value={label} onChange={(e) => setLabel(e.target.value)}><option value="all">전체</option>
        <optgroup label="자동 라벨">{AE_LABEL_FILTERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</optgroup>
        {tagsInUse.length > 0 && <optgroup label="담당자 라벨">{tagsInUse.map((t) => <option key={t} value={`tag:${t}`}>#{t}</option>)}</optgroup>}</select></label>
      {view === 'list' && <label><span>단계</span><select value={stage} onChange={(e) => setStage(e.target.value)}><option value="open">진행 중 전체</option><option value="all">완료·이탈 포함</option>{AE_STAGES.map((s) => <option key={s.c} value={s.c}>{s.t}</option>)}</select></label>}
      <label><span>등급</span><select value={gr} onChange={(e) => setGr(e.target.value)}><option value="all">전체</option><option value="A">A</option><option value="AB">A·B</option><option value="ABC">A·B·C</option></select></label>
      <label><span>지역</span><select value={tier} onChange={(e) => setTier(e.target.value)}><option value="all">전체</option><option value="1">인천·부천 커버</option><option value="2">인접 지역 커버</option><option value="3">기타</option></select></label>
      <label><span>서비스</span><select value={line} onChange={(e) => setLine(e.target.value)}><option value="all">전체</option><option value="miso_visit">미소방문</option><option value="visit_quote">RFQ</option></select></label>
      <label><span>유입</span><select value={src} onChange={(e) => setSrc(e.target.value)}><option value="all">전체</option>{Object.entries(SOURCE_L).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      {extra > 0 && <button className="linkbtn" onClick={resetExtra}>필터 초기화</button>}
    </div>}
    {panel === 'manage' && <div className="managebox">
      <ListUpdate rows={rows} onDone={reload} />
      <details className="fold"><summary>파트너 직접 등록 (붙여넣기)</summary><Import me={me} rows={rows} onDone={() => { setPanel(''); reload(); }} /></details>
    </div>}
    {err && <div className="errbox">{err}</div>}
    {!data ? <div className="loading">불러오는 중…</div> : !rows.length ? <div className="empty">아직 AE 리드가 없어요. ‘리스트 업데이트’로 파트너 확보 리스트를 올리세요.</div>
      : view === 'list' ? <>
        <div className="listbar"><span><b>{callOrder.length.toLocaleString()}명</b> · 위에서부터 오늘 팔로우업 → 새 신호 → 우선순위 순</span>
          {callOrder.length > 0 && <button className="btn primary" onClick={() => setOpen(callOrder[0].id)}>맨 위부터 콜 시작</button>}</div>
        <div className="queue clist">
          <div className="clrow head"><span>우선</span><span>파트너</span><span className="hide-sm">지금 단계</span><span>다음 할 일</span><span className="hide-sm">최근 통화</span><span className="hide-sm">담당</span></div>
          {callOrder.slice(0, shown).map((r: any, i: number) => {
            const g = groupOf(r); const head = i === 0 || groupOf(callOrder[i - 1]) !== g;
            return <div key={r.id} className="clgroup">
              {head && <div className={`clsec ${g}`}>{GROUP_L[g]}<span className="mono">{groupCount[g]}</span></div>}
              <button className={`clrow ${a.picked.includes(r.id) ? 'picked' : ''} ${isDue(r) ? 'due' : ''}`} onClick={() => (a.on ? a.toggle(r.id) : setOpen(r.id))}>
                <span><span className={`chip ${AE_PRIO[r._p].cls}`}>P{r._p}</span></span>
                <span className="who"><b className="nm">{r.name}{viewers('lead', r.id).length > 0 && <span className="busy-dot" title={`${viewers('lead', r.id).join(', ')}님이 보는 중`}><Icon n="eye" s={13} /> {viewers('lead', r.id)[0]} 보는 중</span>}</b>
                  <span className="sub"><StatusPills r={r} />{[r.region, r.grade && `${r.grade}등급`, r.region_tier && TIER_L[r.region_tier], r.partner_id ? `#${r.partner_id}` : 'ID 미연결'].filter(Boolean).join(' · ')}</span>
                  {isFresh(r) ? <span className="hl ok">{r.signal_change}</span> : r._labels[0] || (r.tags || [])[0] ? <span className="hl">{r._labels[0]?.t || `#${r.tags[0]}`}{r._labels.length + (r.tags || []).length > 1 ? ` 외 ${r._labels.length + (r.tags || []).length - 1}` : ''}</span> : null}</span>
                <span className="hide-sm stg"><b>{stageLabel(r.stage)}</b><span className="sub">{r.stage === 'E0' ? '콜 전' : sinceDay(r.stage_entered_at)}</span></span>
                <span className="todo">{todoCell(r)}</span>
                <span className="hide-sm last">{r.last_call_at ? <><b>{relTime(r.last_call_at).split(' ')[0]} · {outcomeText({ connect: r.last_connect, result: r.last_result })}</b>{r.last_memo && <span className="sub">{r.last_memo}</span>}</> : <span className="sub">통화 기록 없음</span>}</span>
                <span className="hide-sm sub">{r.owner_id ? staffName(r.owner_id) : '미배정'}</span>
              </button></div>; })}
          {!callOrder.length && <div className="empty">조건에 맞는 리드가 없어요</div>}
        </div>
        {callOrder.length > shown && <button className="btn" style={{ alignSelf: 'center' }} onClick={() => setShown(shown + LIST_PAGE * 2)}>더 보기 ({(callOrder.length - shown).toLocaleString()}명 남음)</button>}
      </>
      : <div className="board-wrap"><div className="board">
        {AE_STAGES.map((s) => { const all = list.filter((r: any) => r.stage === s.c).sort((x: any, y: any) => x._p - y._p || (x.priority_rank ?? 1e9) - (y.priority_rank ?? 1e9)); const items = CLOSED_AE.includes(s.c) ? all.filter(recent) : all;
          return <section className={`col ${s.c === 'LOST' ? 'risk' : s.c === 'WON' ? 'won' : ''}`} key={s.c}><div className="col-h"><div className="t"><span className="code">{s.c}</span>{s.t}<span className="n">{items.length}</span></div>
            <div className="d">{s.d}{CLOSED_AE.includes(s.c) ? ' · 최근 14일' : ''}</div></div>
            <div className="col-b">{items.length ? items.slice(0, 60).map(card) : <div className="empty">없음</div>}{items.length > 60 && <div className="empty">외 {items.length - 60}명 — 콜 리스트 탭에서 보세요</div>}</div></section>; })}
      </div></div>}
    <AssignBar a={a} subject="lead" all={(view === 'list' ? callOrder : list).filter((r: any) => !CLOSED_AE.includes(r.stage)).map((r: any) => r.id)} onDone={reload} />
    {open != null && <Detail subject="lead" id={open} onClose={() => setOpen(null)} onChanged={reload} ids={view === 'list' ? orderIds : undefined} onNavigate={setOpen} />}
  </>);
}

// 리스트에 늘 보이는 두 가지 상태: 최근 30일 견적 참여(액티브/이탈) · 미소방문 권역 커버 여부. 아직 동기화 전이면 안 보인다
function StatusPills({ r }: { r: any }) {
  const act = r.active_30d == null ? null : r.active_30d
    ? <span className="pill on" title={`최근 30일 견적 ${r.all_quotes_30d ?? r.moving_quotes_30d}건 (가정이사 ${r.moving_quotes_30d ?? 0}) · 마지막 ${relTime(r.moving_last_submit_at)}`}>액티브</span>
    : <span className="pill off" title={r.moving_last_submit_at ? `마지막 견적 ${relTime(r.moving_last_submit_at)}` : '1년 넘게 견적 없음'}>이탈</span>;
  const zone = r.mv_in == null ? null : r.mv_in
    ? <span className="pill zone" title={`커버하는 권역: ${(r.mv_in_districts || []).join(', ')}`}>권역 {(r.mv_in_districts || []).length}개 구</span>
    : <span className="pill off" title="커버 지역이 미소방문 권역과 겹치지 않아요">권역 밖</span>;
  return act || zone ? <span className="pills">{act}{zone}</span> : null;
}

// 리스트 업데이트: ① 바탕화면 'AE 리스트 갱신' 앱(리대시 자동) ② CSV 직접 올리기(파트너 확보 리스트 · 수동 양식 · 리대시 신호)
// 중복 대조는 파트너 ID 기준: 파일 안 중복은 첫 줄만, 콘솔에 이미 있으면 새로 만들지 않고 값만 갱신(빈 칸 = 기존 값 유지)
const normName = (s: string) => (s || '').replace(/\s|\(주\)|㈜|주식회사/g, '').toLowerCase();
const GUIDE_COLS: [string, string, string, string][] = [
  ['파트너ID', '필수', '13426', '숫자만. 어드민 주소 rfq-admin.miso.kr/partners/ 뒤 숫자. 중복 대조 기준'],
  ['파트너명', '새 파트너만 필수', '칠백리', '이미 있는 파트너는 비워도 그대로'],
  ['지역', '선택', '인천 서구', '리스트에 보이는 지역'],
  ['우선등급', '선택', 'A · B · C · D', '등급 필터 · 우선순위(P1~P4)에 쓰여요'],
  ['지역티어', '선택', '1 인천·부천 · 2 인접 · 3 기타', '맨 앞 숫자만 봐요'],
  ['추천근거', '선택', '소개 받음 · 박람회', "작업창 '왜 이 파트너인가'에 보여요"],
];
function ListGuide() {
  return (<details className="fold guide"><summary>올리는 형식 · 수동 업로드 가이드</summary>
    <ol className="steps">
      <li><b>양식 받기</b>로 빈 양식을 받아 엑셀에서 채워요. 첫 줄 칸 이름만 맞으면 칸 순서는 상관없어요</li>
      <li>엑셀에서 <b>CSV</b>로 저장해요 (‘CSV UTF-8’ · 그냥 ‘CSV’ 둘 다 읽어요)</li>
      <li>아래 파일 고르기 → 미리보기에서 <b>중복 · 신규 · 건너뛸 행</b>을 확인하고 <b>반영</b></li>
    </ol>
    <table className="gtable"><thead><tr><th>칸 이름</th><th>필수</th><th>예시</th><th>설명</th></tr></thead>
      <tbody>{GUIDE_COLS.map(([k, req, ex, d]) => <tr key={k}><td><b className="mono">{k}</b></td><td>{req}</td><td>{ex}</td><td>{d}</td></tr>)}</tbody></table>
    <ul className="gnotes">
      <li><b>중복 대조</b> — 파트너 ID 기준. 이미 콘솔에 있으면 새로 만들지 않고 값만 갱신, 담당 · 단계 · 팔로우업 · 이력은 그대로. 같은 파일에 같은 ID가 여러 번이면 첫 줄만 반영</li>
      <li><b>빈 칸은 지우지 않아요</b> — 비워 둔 칸은 기존 값을 유지해요. 리스트에 없는 리드도 지우지 않아요</li>
      <li><b>같은 이름 · 다른 ID</b>가 있으면 미리보기에서 알려 줘요 (같은 업체를 다른 ID로 넣는 실수 방지)</li>
      <li>칸 이름 별칭도 돼요: 파트너 ID · ID → 파트너ID, 업체명 · 이름 → 파트너명, 등급, 티어, 메모 → 추천근거</li>
      <li><b>전화번호 · 연락처 칸은 자동으로 빼요.</b> 번호는 작업창 이름 옆 ‘+ 전화번호’에 넣어요</li>
      <li>리대시 전체 리스트(<span className="mono">미소방문_파트너확보리스트_*.csv</span> — 우선순위 · 점수 · 커버_활성구 칸)는 <b>전체 리스트</b>로 알아보고 리스트 버전을 바꿔요. 리대시 신호 CSV(<span className="mono">ae_lead_signals_*.csv</span>)는 단계 · 신호만 갱신</li>
    </ul>
    <button className="btn" onClick={() => downloadCsv('AE_수동업로드_양식.csv', MANUAL_TEMPLATE.trim().split(','), [])}>양식 받기 (CSV)</button>
  </details>);
}

function ListUpdate({ rows, onDone }: any) {
  const [file, setFile] = useState<any>(null); const [ver, setVer] = useState('');
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false); const [res, setRes] = useState<any>(null);
  const mv = useMemo(() => rows.filter((r: any) => r.service_line === 'miso_visit' && r.partner_id), [rows]);
  const byId = useMemo(() => new Map(mv.map((r: any) => [r.partner_id, r])), [mv]);
  const byName = useMemo(() => { const m = new Map<string, any[]>(); mv.forEach((r: any) => { const k = normName(r.name); if (k) m.set(k, [...(m.get(k) || []), r]); }); return m; }, [mv]);
  const lastSync = useMemo(() => mv.reduce((m: string | null, r: any) => (r.coverage_at && (!m || r.coverage_at > m) ? r.coverage_at : m), null), [mv]);
  async function pick(f?: File | null) {
    setRes(null); setMsg(''); setFile(null); if (!f) return;
    const rep = parseCsvReport(decodeCsv(await f.arrayBuffer()));
    if (!rep.rows.length) return setMsg('CSV에서 행을 못 읽었어요 — 첫 줄이 칸 이름인지 확인해 주세요');
    const signalOnly = !rep.header.includes('파트너명') && rep.header.includes('partner_id');
    if (!signalOnly && !rep.header.includes('파트너ID')) return setMsg(`‘파트너ID’ 칸이 없어요. 지금 칸: ${rep.header.slice(0, 8).join(', ')}`);
    const mapped = rep.rows.map(toListRow); const noId = mapped.filter((r) => !r.partner_id).length;
    const seen = new Map<number, number>(); const uniq: any[] = [];
    mapped.forEach((r) => { if (!r.partner_id) return; const n = seen.get(r.partner_id) || 0; seen.set(r.partner_id, n + 1); if (!n) uniq.push(r); });
    const dups = [...seen].filter(([, n]) => n > 1);
    const old = uniq.filter((r) => byId.has(r.partner_id)); const fresh = uniq.filter((r) => !byId.has(r.partner_id));
    const noName = fresh.filter((r) => !r.name).length;
    const sameName = fresh.flatMap((r) => (byName.get(normName(r.name)) || []).map((x: any) => ({ name: r.name, id: r.partner_id, other: x.partner_id })));
    const closed = old.filter((r) => CLOSED_AE.includes((byId.get(r.partner_id) as any).stage)).length;
    setFile({ name: f.name, rows: uniq, signalOnly, full: isFullList(rep.header), old: old.length, fresh: fresh.length - noName, noId, noName, dups, sameName, closed, bad: rep.badLines, phone: rep.phoneCols });
    setVer(versionFromName(f.name) || ymd(new Date()).replace(/-/g, '') + (isFullList(rep.header) ? '-0000' : '-수동'));
  }
  const missing = file?.full ? mv.filter((r: any) => r.list_version && !CLOSED_AE.includes(r.stage) && !file.rows.some((x: any) => x.partner_id === r.partner_id)).length : 0;
  async function apply() {
    if (!file) return; if (!file.signalOnly && !ver.trim()) return setMsg('리스트 버전을 적어 주세요');
    setBusy(true); setMsg(''); const tot: any = { updated: 0, inserted: 0, won: 0, to_e8: 0 };
    for (let i = 0; i < file.rows.length; i += 300) {
      const chunk = file.rows.slice(i, i + 300);
      const { data, error } = file.signalOnly
        ? await sb().rpc('apply_ae_signals', { p_rows: chunk.map((r: any) => ({ partner_id: r.partner_id, ...(r.signals || {}) })), p_source: 'upload' })
        : await sb().rpc('import_ae_list', { p_rows: chunk, p_version: ver.trim(), p_full: file.full });
      if (error) { setBusy(false); return setMsg(`${i}행 이후 실패: ${error.message}`); }
      tot.updated += data.updated || 0; tot.inserted += data.inserted || 0; tot.won += data.won || data.signals?.won || 0; tot.to_e8 += data.to_e8 || data.signals?.to_e8 || 0;
      setMsg(`${Math.min(i + 300, file.rows.length)} / ${file.rows.length}행 반영 중…`);
    }
    setBusy(false); setRes(tot); setMsg(''); onDone();
  }
  const warn: string[] = !file ? [] : [
    file.dups.length && `파일 안 중복 ID ${file.dups.length}개 — 첫 줄만 반영 (${file.dups.slice(0, 5).map(([id, n]: any) => `#${id}×${n}`).join(', ')}${file.dups.length > 5 ? ' …' : ''})`,
    file.sameName.length && `같은 이름 · 다른 ID ${file.sameName.length}건 — 같은 업체인지 확인 (${file.sameName.slice(0, 3).map((x: any) => `${x.name} #${x.id} ↔ 콘솔 #${x.other}`).join(', ')}${file.sameName.length > 3 ? ' …' : ''})`,
    file.noId && `파트너ID가 없거나 숫자가 아닌 행 ${file.noId}개 — 건너뜀`,
    file.noName && `새 파트너인데 이름이 빈 행 ${file.noName}개 — 건너뜀`,
    file.bad.length && `칸 수가 머리줄과 다른 줄 ${file.bad.length}개 — 건너뜀 (${file.bad.slice(0, 6).join(', ')}번째 줄${file.bad.length > 6 ? ' …' : ''})`,
    file.phone.length && `전화번호로 보이는 칸(${file.phone.join(', ')})은 저장하지 않고 뺐어요`,
    file.closed && `완료 · 이탈 리드 ${file.closed}명은 지표만 갱신 (단계는 그대로)`,
  ].filter(Boolean) as string[];
  return (<div className="panelbox"><h3>리스트 업데이트</h3>
    <div className="ways">
      <div className="way"><b>자동 · 한 번에</b><span>맥 바탕화면 <b>‘AE 리스트 갱신’</b> 앱을 더블클릭 (AWS VPN 켠 상태). 리대시에서 파트너 확보 리스트 · 미소방문 권역 · 커버리지 · 최근 30일 견적 · 신호를 가져와 반영해요. 약 2~3분{lastSync ? ` · 마지막 ${relTime(lastSync)}` : ''}</span></div>
      <div className="way"><b>수동 · CSV 올리기</b><span>직접 발굴한 파트너나 다른 리스트를 넣을 때. 형식은 아래 가이드 — 파트너ID · 파트너명만 있으면 돼요</span></div>
    </div>
    <ListGuide />
    <div className="row"><input type="file" accept=".csv,text/csv" onChange={(e) => pick(e.target.files?.[0])} />
      {file && !file.signalOnly && <div className="f" style={{ flex: '0 1 200px' }}><span>리스트 버전</span><input type="text" value={ver} onChange={(e) => setVer(e.target.value)} /></div>}</div>
    {file && <div className="preview"><b>{file.name} · {file.signalOnly ? '리대시 신호' : file.full ? '전체 리스트(리대시)' : '수동 업로드'}</b>
      {file.signalOnly ? <span>신호 {file.rows.length}행 — 콘솔에 있는 리드 {file.old}명의 단계 · 신호를 갱신</span>
        : <span>읽은 파트너 {file.rows.length}명 → <b>이미 있음 {file.old}명</b>(값만 갱신 · 담당 · 단계 · 팔로우업 그대로) · <b>신규 {file.fresh}명</b>(미컨택으로 추가)</span>}
      {missing > 0 && <span>이번 리스트에 없는 진행 중 리드 {missing}명 — 지우지 않고 그대로 둬요</span>}
      {warn.map((w) => <span key={w} className="warnline">주의: {w}</span>)}</div>}
    {res && <div className="preview ok"><b>반영 완료</b><span>갱신 {res.updated}명 · 신규 {res.inserted}명{res.won ? ` · 완료(WON) ${res.won}명` : ''}{res.to_e8 ? ` · E8 이동 ${res.to_e8}명` : ''}</span></div>}
    <div className="row"><button className="btn primary" disabled={!file || busy || (!file.signalOnly && !file.old && !file.fresh)} onClick={apply}>{busy ? '반영 중…' : '반영'}</button><span className="err">{msg}</span></div>
  </div>);
}

// 붙여넣기 등록: 한 줄에 "파트너ID(없으면 비움), 이름, 지역" — 탭/쉼표 구분. 전화번호는 넣지 않는다
function Import({ me, rows = [], onDone }: any) {
  const [line, setLine] = useState('miso_visit'); const [src, setSrc] = useState('nurtured'); const [mine, setMine] = useState(true);
  const [txt, setTxt] = useState(''); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const parsed = txt.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const c = l.split(/\t|,/).map((x) => x.trim()); const hasId = /^-?\d+$/.test(c[0] || '');
    const [pid, name, region] = hasId ? [Number(c[0]), c[1], c[2]] : [null, c[0], c[1]];
    return { partner_id: pid, name, region: region || null, bad: !name || /\d{3,4}-?\d{4}/.test(l) };
  });
  async function save() {
    const ok = parsed.filter((p) => !p.bad); if (!ok.length) return setMsg('등록할 줄이 없어요');
    setBusy(true); let n = 0, dup = 0; const errs: string[] = [];
    for (const p of ok) {
      const { error } = await sb().from('ae_leads').insert({ partner_id: p.partner_id, name: p.name, region: p.region, service_line: line, source: src, owner_id: mine ? me.id : null });
      if (!error) n++; else if (error.code === '23505' || error.message.includes('ae_leads_partner_line')) dup++; else errs.push(`${p.name}: ${error.message}`);
    }
    setBusy(false); setMsg(`${n}건 등록${dup ? ` · 중복 ${dup}건 건너뜀` : ''}${errs.length ? ` · 실패 ${errs.length}건 (${errs[0]})` : ''}`);
    if (n && !errs.length) setTimeout(onDone, 900);
  }
  const bad = parsed.filter((p) => p.bad).length;
  // 중복 대조: 같은 파트너ID+서비스가 이미 있으면 건너뛰고, ID 없이 같은 이름이 있으면 알려 준다
  const dupIds = parsed.filter((p) => !p.bad && p.partner_id && rows.some((r: any) => r.partner_id === p.partner_id && r.service_line === line));
  const sameNm = parsed.filter((p) => !p.bad && !p.partner_id && rows.some((r: any) => normName(r.name) === normName(p.name || '')));
  return (<div className="panelbox">
    <h3>리드 등록</h3><div className="form">
      <div className="row">
        <div className="f" style={{ flex: '0 1 150px' }}><span>서비스</span><select value={line} onChange={(e) => setLine(e.target.value)}><option value="miso_visit">미소방문</option><option value="visit_quote">RFQ (방문견적)</option></select></div>
        <div className="f" style={{ flex: '0 1 150px' }}><span>소스</span><select value={src} onChange={(e) => setSrc(e.target.value)}>{Object.entries(SOURCE_L).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 14, marginTop: 16 }}><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> 내 담당으로</label>
      </div>
      <div className="f"><span>한 줄에 하나: 파트너ID(없으면 생략), 이름, 지역 — 엑셀에서 복사해 붙여넣어도 돼요. 전화번호는 넣지 마세요</span>
        <textarea rows={6} value={txt} onChange={(e) => setTxt(e.target.value)} placeholder={'12345, 한결이사, 서울 강서\n든든익스프레스, 경기 부천'} /></div>
      {parsed.length > 0 && <div className="rule">{parsed.length - bad - dupIds.length}건 등록 예정{bad ? ` · ${bad}건 제외(이름 없음 또는 전화번호 포함)` : ''}{dupIds.length ? ` · 이미 있음 ${dupIds.length}건 건너뜀 (${dupIds.slice(0, 3).map((p) => p.name).join(', ')})` : ''}{sameNm.length ? ` · 주의: ID 없이 같은 이름이 이미 있어요 (${sameNm.slice(0, 3).map((p) => p.name).join(', ')}) — 파트너ID를 넣어 주세요` : ''}</div>}
      <div className="row"><button className="btn primary" disabled={busy} onClick={save}>{busy ? '등록 중…' : '등록'}</button><span className="err">{msg}</span></div>
    </div></div>);
}
