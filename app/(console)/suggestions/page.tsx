'use client';
import Icon from '@/components/Icon';
import { useMemo, useState } from 'react';
import { sb } from '@/lib/data';
import { useLoad } from '@/components/useBoard';
import Kpis, { Head, Seg } from '@/components/Kpis';
import { useStaff, useStaffName } from '@/components/StaffContext';
import { fmtDT, fmtD } from '@/lib/ui';
import { CHANGELOG } from '@/lib/changelog';

// 건의 보드 (이전 miso-console 컨셉): 접수 → 검토 중 → 작업 진행중 → 반영 완료(배포됨) → 조치 완료(요청자 확인) / 보류 · 반려
const ST: [string, string][] = [['접수', ''], ['검토 중', 'mv'], ['작업 진행중', 'p3'], ['반영 완료', 'ok'], ['조치 완료', 'solid'], ['보류', 'p4'], ['반려', 'bad']];
const stCls = (s: string) => ST.find(([k]) => k === s)?.[1] || '';
const PURPOSE = ['기능 제안', '버그 신고', '프로세스 개선', '기타'];
const AREA = ['AE', 'AM', '예약콜', '오늘의 큐 · 콜 로그', '성과', '공통'];
const TPL = '[현상]\n\n\n[문제]\n\n\n[개선 제안]\n\n\n[기대 효과]\n';

export default function Suggestions() {
  const { me } = useStaff(); const staffName = useStaffName(); const isLead = me.role === 'lead';
  const [st, setSt] = useState('open'); const [sort, setSort] = useState('new'); const [mineOnly, setMineOnly] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null); const [writing, setWriting] = useState(false); const [toast, setToast] = useState('');
  const { data, err, reload } = useLoad(async () => {
    const [s, l] = await Promise.all([sb().from('suggestions').select('*').order('created_at', { ascending: false }).limit(500),
      sb().from('suggestion_logs').select('*').order('created_at').limit(3000)]);
    if (s.error) throw s.error;
    return { list: s.data || [], logs: l.data || [] };
  });
  const list = data?.list || []; const logs = data?.logs || [];
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2600); };
  const OPEN = ['접수', '검토 중', '작업 진행중', '보류'];
  const shown = useMemo(() => list.filter((g: any) => (st === 'all' || (st === 'open' ? OPEN.includes(g.status) : g.status === st)) && (!mineOnly || g.author_id === me.id))
    .sort((a: any, b: any) => (sort === 'votes' ? b.votes.length - a.votes.length : 0) || Date.parse(b.created_at) - Date.parse(a.created_at)), [list, st, sort, mineOnly]);
  const cnt = (s: string) => list.filter((g: any) => g.status === s).length;

  async function vote(id: number) { const { error } = await sb().rpc('toggle_suggestion_vote', { p_id: id }); if (error) say('실패: ' + error.message); reload(); }
  return (<>
    <Head title="건의사항" sub="불편한 점, 바꾸고 싶은 점을 남겨 주세요. 같은 생각이면 공감을 눌러 주세요." />
    <Kpis items={[{ l: '진행 중', v: OPEN.reduce((n, s) => n + cnt(s), 0), s: '접수 · 검토 · 작업 · 보류' }, { l: '접수 대기', v: cnt('접수'), c: cnt('접수') ? 'bad' : '' }, { l: '반영 완료', v: cnt('반영 완료'), s: '요청자 확인 전' }, { l: '조치 완료', v: cnt('조치 완료') }]} />
    <div className="toolbar">
      <Seg value={st} onChange={setSt} opts={[['open', '진행 중'], ['all', '전체'], ...ST.map(([k]) => [k, `${k} ${cnt(k)}`] as [string, string])]} />
      <Seg value={sort} onChange={setSort} opts={[['new', '최신순'], ['votes', '공감순']]} />
      <label className="ck"><input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} /> 내가 쓴 것</label>
      <span className="toolbar-r"><button className="btn primary" onClick={() => setWriting(!writing)}>{writing ? '닫기' : '＋ 건의 쓰기'}</button></span>
    </div>
    {writing && <Write onDone={() => { setWriting(false); say('건의 등록 완료 — 검토 후 상태가 바뀌어요'); reload(); }} />}
    {err && <div className="errbox">{err}</div>}
    {!data ? <div className="loading">불러오는 중…</div> : <div className="sugs">
      {shown.map((g: any) => { const gl = logs.filter((x: any) => x.suggestion_id === g.id); const open = openId === g.id; const voted = g.votes.includes(me.id);
        return <article key={g.id} className={`sug ${open ? 'open' : ''}`}>
          <div className="sug-h" role="button" tabIndex={0} onClick={() => setOpenId(open ? null : g.id)} onKeyDown={(e) => e.key === 'Enter' && setOpenId(open ? null : g.id)}>
            <button className={`vote ${voted ? 'on' : ''}`} onClick={(e) => { e.stopPropagation(); vote(g.id); }} aria-pressed={voted} title="공감">
              <Icon n="thumb" s={14} /> <b className="mono">{g.votes.length}</b></button>
            <div className="sug-t"><div><span className={`chip ${stCls(g.status)}`}>{g.status}</span> <span className="chip">{g.purpose}</span>{g.area && <span className="chip">{g.area}</span>} <b>{g.title}</b></div>
              <div className="why">#{g.id} · {staffName(g.author_id)} · {fmtD(g.created_at)}{gl.length ? ` · 기록 ${gl.length}` : ''}{g.released_in ? ` · ${g.released_in} 반영` : ''}</div></div>
          </div>
          {open && <Detail g={g} logs={gl} isLead={isLead} me={me} staffName={staffName} onChanged={(m: string) => { say(m); reload(); }} />}
        </article>; })}
      {!shown.length && <div className="empty">아직 없어요. 불편했던 점을 먼저 남겨 주세요.</div>}
    </div>}
    {toast && <div className="toast">{toast}</div>}
  </>);
}

function Write({ onDone, init, id }: any) {
  const [f, setF] = useState(init || { purpose: '기능 제안', area: 'AE', title: '', body: TPL }); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  async function save() {
    if (!f.title.trim()) return setMsg('제목(한 줄 요약)은 꼭 써 주세요');
    setBusy(true);
    const row = { purpose: f.purpose, area: f.area, title: f.title.trim(), body: f.body.trim() === TPL.trim() ? null : f.body.trim() || null };
    const { error } = id ? await sb().from('suggestions').update(row).eq('id', id) : await sb().from('suggestions').insert(row);
    setBusy(false); if (error) return setMsg('실패: ' + error.message); onDone();
  }
  return (<div className="panelbox"><div className="form">
    <div className="row"><div className="f" style={{ flex: '0 1 150px' }}><span>종류</span><select value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })}>{PURPOSE.map((p) => <option key={p}>{p}</option>)}</select></div>
      <div className="f" style={{ flex: '0 1 170px' }}><span>화면</span><select value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })}>{AREA.map((p) => <option key={p}>{p}</option>)}</select></div>
      <div className="f"><span>제목 (한 줄 요약 · 필수)</span><input type="text" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="예: 팔로우업 탭에서 서비스별로 거르고 싶어요" /></div></div>
    <div className="f"><span>내용 — 현상 · 문제 · 개선 제안 · 기대 효과 순서로 쓰면 빨리 반영돼요. 전화번호 · 고객 개인정보는 쓰지 마세요</span><textarea rows={9} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></div>
    <div className="row"><button className="btn primary" disabled={busy} onClick={save}>{id ? '수정 저장' : '등록'}</button><span className="err">{msg}</span></div>
  </div></div>);
}

function Detail({ g, logs, isLead, me, staffName, onChanged }: any) {
  const [edit, setEdit] = useState(false); const [sure, setSure] = useState(false); const [note, setNote] = useState(''); const [to, setTo] = useState(g.status); const [rel, setRel] = useState(g.released_in || ''); const [msg, setMsg] = useState('');
  const mine = g.author_id === me.id;
  async function comment() {
    if (!note.trim()) return setMsg('내용을 써 주세요');
    const { error } = isLead && to !== g.status
      ? await sb().rpc('set_suggestion_status', { p_id: g.id, p_status: to, p_note: note.trim(), p_release: rel || null })
      : await sb().from('suggestion_logs').insert({ suggestion_id: g.id, body: note.trim() });
    if (error) return setMsg('실패: ' + error.message);
    setNote(''); onChanged(isLead && to !== g.status ? `상태 ${to}(으)로 변경` : '기록 남김');
  }
  async function status() {
    const { error } = await sb().rpc('set_suggestion_status', { p_id: g.id, p_status: to, p_note: note.trim() || null, p_release: rel || null });
    if (error) return setMsg('실패: ' + error.message); setNote(''); onChanged(`상태 ${to}(으)로 변경`);
  }
  async function confirmDone() { const { error } = await sb().from('suggestion_logs').insert({ suggestion_id: g.id, body: '요청자 확인 — 잘 반영됐어요' }); if (error) return setMsg('실패: ' + error.message); onChanged('확인 기록을 남겼어요. 관리자가 조치 완료로 닫아요'); }
  async function del() { if (!sure) { setSure(true); return setMsg('한 번 더 누르면 삭제돼요'); } const { error } = await sb().from('suggestions').delete().eq('id', g.id); if (error) return setMsg('실패: ' + error.message); onChanged('삭제됨'); }
  async function delLog(id: number) { const { error } = await sb().from('suggestion_logs').delete().eq('id', id); if (error) return setMsg('실패: ' + error.message); onChanged('기록 삭제됨'); }
  if (edit) return <Write id={g.id} init={{ purpose: g.purpose, area: g.area || '공통', title: g.title, body: g.body || '' }} onDone={() => { setEdit(false); onChanged('수정됨'); }} />;
  return (<div className="sug-b">
    {g.body ? <div className="sug-body">{g.body}</div> : <div className="why">내용 없음</div>}
    <div className="tl">{logs.map((x: any) => <div key={x.id} className={`it ${x.status_to ? 'stage' : 'note'}`}><div className="h"><b>{x.status_to ? `상태 → ${x.status_to}` : '기록'}</b><span className="ts">{fmtDT(x.created_at)} · {staffName(x.actor_id)}</span>
      {(x.actor_id === me.id || isLead) && <button className="linkbtn" onClick={() => delLog(x.id)}>삭제</button>}</div>{x.body && <div className="b">{x.body}</div>}</div>)}
      {!logs.length && <div className="empty">아직 진행 기록이 없어요</div>}</div>
    <div className="form">
      {isLead && <div className="row"><div className="f" style={{ flex: '0 1 160px' }}><span>상태 (관리자)</span><select value={to} onChange={(e) => setTo(e.target.value)}>{ST.map(([k]) => <option key={k}>{k}</option>)}</select></div>
        {['반영 완료', '조치 완료'].includes(to) && <div className="f" style={{ flex: '0 1 160px' }}><span>반영 버전</span><select value={rel} onChange={(e) => setRel(e.target.value)}><option value="">선택</option>{CHANGELOG.map((r) => <option key={r.v} value={r.v}>{r.v} · {r.title}</option>)}</select></div>}</div>}
      <div className="f"><span>{isLead ? '진행 기록 (상태를 바꾸면 함께 남아요)' : '댓글 · 추가 설명'}</span><textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></div>
      <div className="row"><button className="btn primary" onClick={comment}>{isLead && to !== g.status ? '상태 변경 + 기록' : '기록 남기기'}</button>
        {isLead && to !== g.status && <button className="btn" onClick={status}>상태만 바꾸기</button>}
        {mine && g.status === '반영 완료' && <button className="btn" onClick={confirmDone}>잘 반영됐어요</button>}
        {(mine || isLead) && <button className="btn" onClick={() => setEdit(true)}>내용 수정</button>}
        {(isLead || (mine && g.status === '접수')) && <button className="btn" onClick={del}>{sure ? '정말 삭제' : '삭제'}</button>}
        <span className="err">{msg}</span></div>
    </div>
  </div>);
}
