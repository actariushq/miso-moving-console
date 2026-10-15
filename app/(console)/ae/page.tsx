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
import { parseCsv, toListRow, versionFromName } from '@/lib/aeList';
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
  const labelOk = (r: any) => label === 'all' || (label.startsWith('tag:') ? (r.tags || []).includes(label.slice(4)) : r._labels.some((l: any) => l.k === label));
  const list = inLine.filter((r: any) => gradeOk(r) && tierOk(r) && prioOk(r) && labelOk(r) && (src === 'all' || r.source === src)
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
  useEffect(() => setShown(LIST_PAGE), [line, filter, src, q, prio, gr, tier, label, stage]);
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
      <div className="meta"><span>{r.region || '지역 –'}</span>{r.partner_id ? <span className="mono">#{r.partner_id}</span> : <span className="chip warn">ID 미연결</span>}<span>담당 {r.owner_id ? staffName(r.owner_id) : '미배정'}</span></div>
      {r.last_call_at && <div className="meta" style={{ fontSize: 12.5 }}><span>{r.call_count}회 · {fmtD(r.last_call_at)} {outcomeText({ connect: r.last_connect, result: r.last_result })}</span></div>}
      {r.stage === 'E8' && r.charged_amount > 0 && <div className="meta"><span>{won(r.charged_amount)}원 · {fmtD(r.charged_at)}</span></div>}
      <div className="next">{fuCell(r)}</div>
    </button>;
  };

  // 자주 안 쓰는 필터는 '필터' 패널로 접어 두고, 켜진 개수만 버튼에 보여 준다
  const extra = [label !== 'all', view === 'list' && stage !== 'open', gr !== 'all', tier !== 'all', line !== 'all', src !== 'all'].filter(Boolean).length;
  const resetExtra = () => { setLabel('all'); setStage('open'); setGr('all'); setTier('all'); setLine('all'); setSrc('all'); };
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
      <details className="fold"><summary>파트너 직접 등록 (붙여넣기)</summary><Import me={me} onDone={() => { setPanel(''); reload(); }} /></details>
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
                  <span className="sub">{[r.region, r.grade && `${r.grade}등급`, r.region_tier && TIER_L[r.region_tier], r.partner_id ? `#${r.partner_id}` : 'ID 미연결'].filter(Boolean).join(' · ')}</span>
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

// 리스트 업데이트: 파트너 확보 리스트 CSV(또는 리대시 신호 CSV)를 올리면 기존 리드는 지표·단계만 최신화, 새 파트너만 추가
function ListUpdate({ rows, onDone }: any) {
  const [file, setFile] = useState<{ name: string; rows: any[]; signalOnly: boolean } | null>(null); const [ver, setVer] = useState('');
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false); const [res, setRes] = useState<any>(null);
  const existing = useMemo(() => new Set(rows.filter((r: any) => r.service_line === 'miso_visit' && r.partner_id).map((r: any) => r.partner_id)), [rows]);
  async function pick(f?: File | null) {
    setRes(null); setMsg(''); if (!f) return setFile(null);
    const raw = parseCsv(await f.text());
    if (!raw.length) return setMsg('CSV에서 행을 못 읽었어요');
    const signalOnly = !('파트너명' in raw[0]) && 'partner_id' in raw[0];
    const mapped = raw.map(toListRow).filter((r) => r.partner_id);
    setFile({ name: f.name, rows: mapped, signalOnly }); setVer(versionFromName(f.name) || ymd(new Date()).replace(/-/g, '') + '-0000');
  }
  const n = file?.rows.length || 0; const old = file ? file.rows.filter((r) => existing.has(r.partner_id)).length : 0;
  const missing = file && !file.signalOnly ? rows.filter((r: any) => r.service_line === 'miso_visit' && r.list_version && !['WON', 'LOST'].includes(r.stage) && !file.rows.some((x) => x.partner_id === r.partner_id)).length : 0;
  async function apply() {
    if (!file) return; if (!file.signalOnly && !ver.trim()) return setMsg('리스트 버전을 적어 주세요');
    setBusy(true); setMsg(''); const tot: any = { updated: 0, inserted: 0, won: 0, to_e8: 0 };
    for (let i = 0; i < file.rows.length; i += 300) {
      const chunk = file.rows.slice(i, i + 300);
      const { data, error } = file.signalOnly
        ? await sb().rpc('apply_ae_signals', { p_rows: chunk.map((r) => ({ partner_id: r.partner_id, ...(r.signals || {}) })), p_source: 'upload' })
        : await sb().rpc('import_ae_list', { p_rows: chunk, p_version: ver.trim() });
      if (error) { setBusy(false); return setMsg(`${i}행 이후 실패: ${error.message}`); }
      tot.updated += data.updated || 0; tot.inserted += data.inserted || 0; tot.won += data.won || data.signals?.won || 0; tot.to_e8 += data.to_e8 || data.signals?.to_e8 || 0;
      setMsg(`${Math.min(i + 300, file.rows.length)} / ${file.rows.length}행 반영 중…`);
    }
    setBusy(false); setRes(tot); setMsg(''); onDone();
  }
  return (<div className="panelbox"><h3>리스트 업데이트</h3>
    <div className="rule">~/miso-data/output 의 <b>미소방문_파트너확보리스트_*.csv</b>를 올리세요. 같은 파트너가 이미 있으면 담당·팔로우업·메모·이력은 그대로 두고 우선순위·등급·지표와 단계만 최신화하고, 처음 보는 파트너만 E0으로 추가해요. 리대시 신호 CSV(ae_lead_signals_*.csv)를 올리면 단계만 최신화해요 — 미소방문 자가 견적 → 완료(WON), 리드 등록 뒤 충전 → E8.</div>
    <div className="row"><input type="file" accept=".csv,text/csv" onChange={(e) => pick(e.target.files?.[0])} />
      {file && !file.signalOnly && <div className="f" style={{ flex: '0 1 180px' }}><span>리스트 버전</span><input type="text" value={ver} onChange={(e) => setVer(e.target.value)} /></div>}</div>
    {file && <div className="preview"><b>{file.name}</b>
      {file.signalOnly ? <span>리대시 신호 {n}행 — 콘솔에 있는 리드 {old}명의 단계·신호를 최신화</span>
        : <><span>전체 {n}행 · 기존 {old}명 (지표·단계 최신화) · <b>신규 {n - old}명</b> 추가</span>{missing > 0 && <span>이번 리스트에 없는 진행 중 리드 {missing}명 — 지우지 않고 그대로 둬요 (제출해서 빠졌을 수 있으니 리대시 동기화로 확인)</span>}</>}</div>}
    {res && <div className="preview ok"><b>반영 완료</b><span>최신화 {res.updated}명 · 신규 {res.inserted}명{res.won ? ` · 완료(WON) ${res.won}명` : ''}{res.to_e8 ? ` · E8 이동 ${res.to_e8}명` : ''}</span></div>}
    <div className="row"><button className="btn primary" disabled={!file || busy} onClick={apply}>{busy ? '반영 중…' : '반영'}</button><span className="err">{msg}</span></div>
  </div>);
}

// 붙여넣기 등록: 한 줄에 "파트너ID(없으면 비움), 이름, 지역" — 탭/쉼표 구분. 전화번호는 넣지 않는다
function Import({ me, onDone }: any) {
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
  return (<div className="panelbox">
    <h3>리드 등록</h3><div className="form">
      <div className="row">
        <div className="f" style={{ flex: '0 1 150px' }}><span>서비스</span><select value={line} onChange={(e) => setLine(e.target.value)}><option value="miso_visit">미소방문</option><option value="visit_quote">RFQ (방문견적)</option></select></div>
        <div className="f" style={{ flex: '0 1 150px' }}><span>소스</span><select value={src} onChange={(e) => setSrc(e.target.value)}>{Object.entries(SOURCE_L).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 14, marginTop: 16 }}><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> 내 담당으로</label>
      </div>
      <div className="f"><span>한 줄에 하나: 파트너ID(없으면 생략), 이름, 지역 — 엑셀에서 복사해 붙여넣어도 돼요. 전화번호는 넣지 마세요</span>
        <textarea rows={6} value={txt} onChange={(e) => setTxt(e.target.value)} placeholder={'12345, 한결이사, 서울 강서\n든든익스프레스, 경기 부천'} /></div>
      {parsed.length > 0 && <div className="rule">{parsed.length - bad}건 등록 예정{bad ? ` · ${bad}건 제외(이름 없음 또는 전화번호 포함)` : ''} · 같은 파트너ID+서비스는 중복으로 건너뜀</div>}
      <div className="row"><button className="btn primary" disabled={busy} onClick={save}>{busy ? '등록 중…' : '등록'}</button><span className="err">{msg}</span></div>
    </div></div>);
}
