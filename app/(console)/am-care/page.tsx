'use client';
import Icon from '@/components/Icon';
// AM 관리 대상 — 참여 중단 · 휴면 · 무계약 · 참여 급감 · 저계약률 파트너를 다시 살리는 콜 리스트 (AE 콜 리스트와 같은 구성)
import { useMemo, useState } from 'react';
import { sb, fetchAll } from '@/lib/data';
import { useLoad } from '@/components/useBoard';
import Kpis, { Head, Seg } from '@/components/Kpis';
import Detail from '@/components/Detail';
import { useAssign, AssignToggle, AssignBar } from '@/components/Assign';
import { useStaff, useStaffName } from '@/components/StaffContext';
import { useViewers } from '@/components/Presence';
import { toCareRows } from '@/lib/careList';
import { versionFromName } from '@/lib/aeList';
import { CARE_STAGES, CARE_PRIO, carePriority, careLabel, careMetric, fmtD, fmtDT, outcomeText, dayDiff, ymd, relTime, sinceDay } from '@/lib/ui';

const CLOSED = ['WON', 'LOST'];
const LIST_PAGE = 150;

export default function AmCare() {
  const { me } = useStaff(); const staffName = useStaffName(); const viewers = useViewers(); const a = useAssign();
  const [q, setQ] = useState(''); const [filter, setFilter] = useState('all'); const [prio, setPrio] = useState('3'); const [seg, setSeg] = useState('all'); const [stage, setStage] = useState('open');
  const [open, setOpen] = useState<number | null>(null); const [panel, setPanel] = useState(''); const [shown, setShown] = useState(LIST_PAGE);
  const { data, err, reload } = useLoad(async () => (await fetchAll((f, t) => sb().from('v_care_board').select('*').order('priority').order('id').range(f, t))).map((r: any) => ({ ...r, _p: carePriority(r) })));
  const rows = data || [];
  const now = new Date(); const eod = new Date(Date.parse(ymd(now) + 'T23:59:59+09:00'));
  const isDue = (r: any) => !CLOSED.includes(r.stage) && r.next_action_at && new Date(r.next_action_at) <= eod;
  const segs = useMemo(() => [...new Set(rows.map((r: any) => r.segment).filter(Boolean))].sort(), [rows]);
  const list = rows.filter((r: any) => (prio === 'all' || r._p <= +prio) && (seg === 'all' || r.segment === seg)
    && (stage === 'all' || (stage === 'open' ? !CLOSED.includes(r.stage) : r.stage === stage))
    && (filter === 'all' || (filter === 'mine' && r.owner_id === me.id) || (filter === 'none' && !r.owner_id))
    && (!q || `${r.name || ''}${r.partner_id}${r.segment || ''}${r.reason || ''}${(r.tags || []).join('')}`.includes(q)));
  const groupOf = (r: any) => (CLOSED.includes(r.stage) ? 'closed' : isDue(r) ? 'due' : `p${r._p}|${r._p < 4 ? r.segment || '' : ''}`);
  const order = useMemo(() => [...list].sort((x: any, y: any) => {
    const dx = isDue(x) ? 0 : CLOSED.includes(x.stage) ? 9 : 1, dy = isDue(y) ? 0 : CLOSED.includes(y.stage) ? 9 : 1; if (dx !== dy) return dx - dy;
    if (dx === 0) return +new Date(x.next_action_at) - +new Date(y.next_action_at);
    return x._p - y._p || (x.segment || '').localeCompare(y.segment || '') || (+careMetric(y, /최근3개월 참여/) || 0) - (+careMetric(x, /최근3개월 참여/) || 0) || x.id - y.id;
  }), [list]);
  const gCount = useMemo(() => order.reduce((m: any, r: any) => { const g = groupOf(r); m[g] = (m[g] || 0) + 1; return m; }, {}), [order]);
  const gLabel = (g: string) => g === 'due' ? '오늘 팔로우업' : g === 'closed' ? '회복 · 관리 종료' : g.startsWith('p4') ? '관찰 (정기 모니터링)' : `P${g[1]} · ${g.split('|')[1] || '기타'}`;
  const live = rows.filter((r: any) => !CLOSED.includes(r.stage)); const due = live.filter(isDue).length;
  const ids = order.map((r: any) => r.id);
  const todo = (r: any) => {
    if (r.stage === 'WON') return <b className="okc">회복 {fmtD(r.recovered_at)}</b>;
    if (r.stage === 'LOST') return <span className="sub">관리 종료</span>;
    if (r.next_action_at) { const over = new Date(r.next_action_at) < now; return <><b className={over ? 'over' : ''}>{relTime(r.next_action_at)}{over ? ' · 지남' : ''}</b><span className="sub">{r.next_action_note || '팔로우업'}</span></>; }
    return r.stage === 'C0' ? <><b>첫 통화</b><span className="sub">{r.action || '근황 · 원인 확인'}</span></> : <b className="over">팔로우업 미등록</b>;
  };
  return (<>
    <Head title="AM 관리 대상" sub="참여가 멈추거나 성과가 떨어진 파트너를 다시 살려요. 위에서부터 차례로 전화하면 돼요." />
    <Kpis items={[
      { l: 'P1 미컨택', v: live.filter((r: any) => r._p === 1 && r.stage === 'C0').length, s: `P1 전체 ${live.filter((r: any) => r._p === 1).length}` },
      { l: '오늘 팔로우업', v: due, c: due ? 'bad' : '', s: due ? '지난 것 포함 · 맨 위에 있어요' : '없음' },
      { l: '진행 중', v: live.filter((r: any) => r.stage !== 'C0').length, s: `대상 ${live.length}` },
      { l: '회복', v: rows.filter((r: any) => r.stage === 'WON').length, c: 'ok', s: `관리 종료 ${rows.filter((r: any) => r.stage === 'LOST').length}` },
    ]} />
    <div className="toolbar">
      <input className="search" placeholder="파트너 · ID · 근거 검색" value={q} onChange={(e) => setQ(e.target.value)} />
      <Seg value={filter} onChange={setFilter} opts={[['all', '전체'], ['mine', '내 담당'], ['none', '미배정']]} />
      <Seg value={prio} onChange={setPrio} opts={[['1', 'P1'], ['2', 'P1–2'], ['3', 'P1–3'], ['all', '관찰 포함']]} />
      <select value={seg} onChange={(e) => setSeg(e.target.value)} style={{ width: 'auto' }} aria-label="판정 구분"><option value="all">판정 구분 전체</option>{segs.map((s) => <option key={s as string}>{s as string}</option>)}</select>
      <select value={stage} onChange={(e) => setStage(e.target.value)} style={{ width: 'auto' }} aria-label="단계"><option value="open">진행 중 전체</option><option value="all">회복 · 종료 포함</option>{CARE_STAGES.map((s) => <option key={s.c} value={s.c}>{s.t}</option>)}</select>
      <span className="toolbar-r"><button className="btn ghost" aria-pressed={panel === 'list'} onClick={() => setPanel(panel === 'list' ? '' : 'list')}>리스트 관리</button><AssignToggle a={a} /></span>
    </div>
    {panel === 'list' && <CareListUpdate rows={rows} onDone={reload} />}
    {err && <div className="errbox">{err}</div>}
    {!data ? <div className="loading">불러오는 중…</div> : !rows.length ? <div className="empty">아직 관리 대상이 없어요. ‘리스트 관리’에서 관리 대상 CSV를 올리세요.</div> : <>
      <div className="listbar"><span><b>{order.length.toLocaleString()}명</b> · 위에서부터 오늘 팔로우업 → P1 → P2 → P3 순</span>{order.length > 0 && <button className="btn primary" onClick={() => setOpen(order[0].id)}>맨 위부터 콜 시작</button>}</div>
      <div className="queue clist">
        <div className="clrow head"><span>우선</span><span>파트너 · 판정 근거</span><span className="hide-sm">지금 단계</span><span>다음 할 일</span><span className="hide-sm">최근 통화</span><span className="hide-sm">담당</span></div>
        {order.slice(0, shown).map((r: any, i: number) => { const g = groupOf(r); const head = i === 0 || groupOf(order[i - 1]) !== g; const pr = CARE_PRIO[r._p];
          return <div key={r.id} className="clgroup">
            {head && <div className={`clsec ${g === 'due' ? 'due' : g.startsWith('p1') ? 'p1' : ''}`}>{gLabel(g)}<span className="mono">{gCount[g]}</span></div>}
            <button className={`clrow ${a.picked.includes(r.id) ? 'picked' : ''} ${isDue(r) ? 'due' : ''}`} onClick={() => (a.on ? a.toggle(r.id) : setOpen(r.id))}>
              <span><span className={`chip ${pr.cls}`}>{pr.t}</span></span>
              <span className="who"><b className="nm">{r.name || `파트너 #${r.partner_id}`}{viewers('care', r.id).length > 0 && <span className="busy-dot"><Icon n="eye" s={13} /> {viewers('care', r.id)[0]} 보는 중</span>}</b>
                <span className="sub">#{r.partner_id}{r.segment ? ` · ${r.segment}` : ''}{r.am_track ? ` · ${r.am_track === 'new' ? '신규 정착' : '캐파 확대'} 중` : ''}</span>
                {r.reason && <span className="hl">{r.reason}</span>}</span>
              <span className="hide-sm stg"><b>{careLabel(r.stage)}</b><span className="sub">{r.stage === 'C0' ? '콜 전' : sinceDay(r.stage_entered_at)}</span></span>
              <span className="todo">{todo(r)}</span>
              <span className="hide-sm last">{r.last_call_at ? <><b>{relTime(r.last_call_at).split(' ')[0]} · {outcomeText({ connect: r.last_connect, result: r.last_result })}</b>{r.last_memo && <span className="sub">{r.last_memo}</span>}</> : <span className="sub">통화 기록 없음</span>}</span>
              <span className="hide-sm sub">{r.owner_id ? staffName(r.owner_id) : '미배정'}</span>
            </button></div>; })}
        {!order.length && <div className="empty">조건에 맞는 파트너가 없어요</div>}
      </div>
      {order.length > shown && <button className="btn" style={{ alignSelf: 'center' }} onClick={() => setShown(shown + LIST_PAGE * 2)}>더 보기 ({(order.length - shown).toLocaleString()}명 남음)</button>}
    </>}
    <AssignBar a={a} subject="care" all={order.filter((r: any) => !CLOSED.includes(r.stage)).map((r: any) => r.id)} onDone={reload} />
    {open != null && <Detail subject="care" id={open} ids={ids} onNavigate={setOpen} onClose={() => setOpen(null)} onChanged={reload} />}
  </>);
}

// 리스트 업데이트: 기존 파트너는 판정 · 지표만 갱신(단계 · 담당 · 팔로우업 · 이력 유지), 새 파트너만 추가
function CareListUpdate({ rows, onDone }: any) {
  const [file, setFile] = useState<any>(null); const [ver, setVer] = useState(''); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false); const [res, setRes] = useState<any>(null);
  const existing = useMemo(() => new Set(rows.map((r: any) => r.partner_id)), [rows]);
  async function pick(f?: File | null) {
    setRes(null); setMsg(''); if (!f) return setFile(null);
    const { rows: rs, warnings } = toCareRows(await f.text()); if (!rs.length) return setMsg('파트너 ID 칸을 찾지 못했어요 (partner_id · 파트너ID)');
    setFile({ name: f.name, rows: rs, warnings }); setVer(versionFromName(f.name) || (f.name.match(/^(\d{6})/)?.[1] ? '20' + f.name.slice(0, 6) : ymd(new Date()).replace(/-/g, '')));
  }
  async function apply() {
    if (!file || !ver.trim()) return; setBusy(true); const tot = { updated: 0, inserted: 0, not_in_list: 0 };
    for (let i = 0; i < file.rows.length; i += 300) {
      const { data, error } = await sb().rpc('import_care_list', { p_rows: file.rows.slice(i, i + 300), p_version: ver.trim() });
      if (error) { setBusy(false); return setMsg(`${i}행 이후 실패: ${error.message}`); }
      tot.updated += data.updated; tot.inserted += data.inserted; tot.not_in_list = data.not_in_list;
    }
    setBusy(false); setRes(tot); onDone();
  }
  const n = file?.rows.length || 0; const old = file ? file.rows.filter((r: any) => existing.has(r.partner_id)).length : 0;
  const by = file ? [1, 2, 3, 4].map((p) => file.rows.filter((r: any) => r.priority === p).length) : [];
  return (<div className="panelbox"><h3>관리 대상 리스트 업데이트</h3>
    <div className="rule">관리 대상 CSV를 올리세요. 꼭 필요한 칸은 <b>파트너 ID</b>뿐이고, 관리구분('P1 | …')·판정 근거·권장 액션은 있으면 쓰고 나머지 칸은 지표로 그대로 보여 줘요. 이미 있는 파트너는 <b>판정·지표만 바꾸고 단계·담당·팔로우업·이력은 그대로</b>, 처음 보는 파트너만 추가해요.</div>
    <div className="row"><input type="file" accept=".csv,text/csv" onChange={(e) => pick(e.target.files?.[0])} />
      {file && <div className="f" style={{ flex: '0 1 180px' }}><span>리스트 버전</span><input type="text" value={ver} onChange={(e) => setVer(e.target.value)} /></div>}</div>
    {file && <div className="preview"><b>{file.name}</b><span>전체 {n}명 · 기존 {old}명 갱신 · <b>신규 {n - old}명</b> 추가 · P1 {by[0]} · P2 {by[1]} · P3 {by[2]} · 관찰 {by[3]}</span>
      {file.warnings.map((w: string) => <span key={w} className="err">주의: {w}</span>)}</div>}
    {res && <div className="preview ok"><b>반영 완료</b><span>갱신 {res.updated}명 · 신규 {res.inserted}명{res.not_in_list ? ` · 이번 리스트에 없는 진행 중 파트너 ${res.not_in_list}명(그대로 둠)` : ''}</span></div>}
    <div className="row"><button className="btn primary" disabled={!file || busy} onClick={apply}>{busy ? '반영 중…' : '반영'}</button><span className="err">{msg}</span></div>
  </div>);
}
