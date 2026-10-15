'use client';
import { useMemo, useState } from 'react';
import { sb, fetchAll, reasonDict, reasonLabel, partnerNames, orderLabels, leadNames } from '@/lib/data';
import { useLoad } from '@/components/useBoard';
import Kpis, { Head, Seg } from '@/components/Kpis';
import Detail from '@/components/Detail';
import { useStaff, useStaffName } from '@/components/StaffContext';
import { MOD_L, fmtD, fmtDT, ymd, kstHour, kstDow, outcomeText, outcomeCls } from '@/lib/ui';

function stats(rows: any[]) {
  const g = new Map<string, any>(); rows.filter((e) => e.event_type === 'call').forEach((e) => { if (!g.has(e.call_group)) g.set(e.call_group, e); });
  const u = [...g.values()]; const con = u.filter((e) => e.connect === 'connected');
  return { n: u.length, con: con.length, abs: u.filter((e) => e.connect === 'absent').length, oth: u.filter((e) => ['dead', 'refuse', 'etc'].includes(e.connect)).length,
    fail: con.filter((e) => e.result === 'fail').length, moved: u.filter((e) => e.stage_after !== e.stage_at).length, movedCon: con.filter((e) => e.stage_after !== e.stage_at).length,
    touched: new Set(u.map((e) => e.subject + e.subject_id)).size, fu: u.filter((e) => e.next_action_at).length, list: u };
}

function Daily({ s, days }: { s: any; days: number }) {
  const W = 640, H = 170, pl = 28, pb = 20, pt = 8, bw = (W - pl) / days;
  const data = [...Array(days)].map((_, i) => { const d = new Date(Date.now() - (days - 1 - i) * 864e5); const k = ymd(d); const L = s.list.filter((e: any) => ymd(e.created_at) === k);
    return { d, con: L.filter((e: any) => e.connect === 'connected').length, abs: L.filter((e: any) => e.connect === 'absent').length, oth: L.filter((e: any) => !['connected', 'absent'].includes(e.connect)).length }; });
  const max = Math.max(4, ...data.map((x) => x.con + x.abs + x.oth)); const step = max > 12 ? 5 : 2; const top = Math.ceil(max / step) * step; const y = (v: number) => pt + (H - pt - pb) * (1 - v / top);
  const grid = []; for (let v = 0; v <= top; v += step) grid.push(<g key={v}><line className="grid" x1={pl} x2={W} y1={y(v)} y2={y(v)} /><text x={pl - 6} y={y(v) + 3} textAnchor="end">{v}</text></g>);
  return <div className="chart"><svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="일자별 콜 결과">{grid}{data.map((x, i) => {
    const bx = pl + i * bw + bw * 0.18, w = bw * 0.64; let yy = y(0); const segs: any[] = [];
    ([['con', 'var(--ok)'], ['abs', 'var(--warn)'], ['oth', 'var(--faint)']] as const).forEach(([k, c]) => { const v = (x as any)[k]; if (!v) return; const h = y(0) - y(v); segs.push(<rect key={k} x={bx} y={yy - h + 1} width={w} height={Math.max(0, h - 2)} rx={2} fill={c} />); yy -= h; });
    return <g key={i}>{segs}{(i % Math.ceil(days / 7) === 0 || i === days - 1) && <text x={bx + w / 2} y={H - 5} textAnchor="middle">{fmtD(x.d)}</text>}
      <rect className="hit" x={pl + i * bw} y={pt} width={bw} height={H - pt - pb}><title>{`${fmtD(x.d)} · 콜 ${x.con + x.abs + x.oth} · 연결 ${x.con} · 부재 ${x.abs} · 기타 ${x.oth}`}</title></rect></g>; })}</svg></div>;
}
function Heat({ s }: { s: any }) {
  const days = ['월', '화', '수', '목', '금', '토', '일']; const hours = [...Array(14)].map((_, i) => i + 8); const cell: any = {};
  s.list.forEach((e: any) => { const k = kstDow(e.created_at) + '-' + kstHour(e.created_at); cell[k] = cell[k] || { n: 0, c: 0 }; cell[k].n++; if (e.connect === 'connected') cell[k].c++; });
  return <><div className="hm"><span />{hours.map((h) => <span key={h} className="hd">{h % 2 ? '' : h}</span>)}
    {days.map((d, dw) => [<span key={d}>{d}</span>, ...hours.map((h) => { const c = cell[dw + '-' + h]; if (!c) return <span key={h} className="c" />;
      const r = c.c / c.n; return <span key={h} className="c v" title={`${d} ${h}시 · 콜 ${c.n} · 연결 ${c.c} (${Math.round(r * 100)}%)`} style={{ background: `color-mix(in srgb,var(--accent) ${Math.round(15 + r * 85)}%,var(--surface))` }} />; })])}</div>
    <div className="legend"><span>연결률</span><span><i style={{ background: 'color-mix(in srgb,var(--accent) 15%,var(--surface))' }} />0%</span><span><i style={{ background: 'color-mix(in srgb,var(--accent) 57%,var(--surface))' }} />50%</span><span><i style={{ background: 'var(--accent)' }} />100%</span><span>· 빈 칸 = 콜 없음</span></div></>;
}

export default function Calls() {
  const { staff } = useStaff(); const staffName = useStaffName();
  const [range, setRange] = useState('14'); const [mod, setMod] = useState('all'); const [who, setWho] = useState('all'); const [conn, setConn] = useState('all');
  const [moved, setMoved] = useState(false); const [memo, setMemo] = useState(false); const [q, setQ] = useState(''); const [open, setOpen] = useState<{ s: 'partner' | 'order' | 'lead'; id: number } | null>(null);
  const { data, err, reload } = useLoad(async () => {
    const since = new Date(Date.now() - (+range - 1) * 864e5); since.setHours(0, 0, 0, 0);
    const rows = await fetchAll((a, b) => sb().from('activity_events').select('*').in('event_type', ['call', 'sms']).gte('created_at', since.toISOString()).order('created_at', { ascending: false }).range(a, b));
    const [pn, ol, ln, dict] = await Promise.all([partnerNames(rows.filter((r) => r.subject === 'partner').map((r) => r.subject_id)), orderLabels(rows.filter((r) => r.subject === 'order').map((r) => r.subject_id)), leadNames(rows.filter((r) => r.subject === 'lead').map((r) => r.subject_id)), reasonDict()]);
    return rows.map((r) => ({ ...r, _name: r.subject === 'partner' ? pn[r.subject_id] || `파트너 ${r.subject_id}` : r.subject === 'lead' ? ln[r.subject_id] || `리드 #${r.subject_id}` : `${ol[r.subject_id] || '오더'} (${r.subject_id})`, _reason: reasonLabel(dict, r.module, r.reason_code) }));
  }, [range]);
  const rows = useMemo(() => (data || []).filter((e: any) => (mod === 'all' || e.module === mod) && (who === 'all' || e.actor_id === who)
    && (conn === 'all' || (e.event_type === 'call' && (conn === 'fail' ? e.result === 'fail' : conn === 'other' ? ['dead', 'refuse', 'etc'].includes(e.connect) : e.connect === conn)))
    && (!moved || (e.event_type === 'call' && e.stage_after !== e.stage_at)) && (!memo || (e.memo || '').trim()) && (!q || `${e._name} ${e.memo || ''} ${e.purpose || ''}`.includes(q))), [data, mod, who, conn, moved, memo, q]);
  const s = stats(rows);
  const byWho = staff.map((st) => ({ st, x: stats(rows.filter((e: any) => e.actor_id === st.id)) })).filter((v) => v.x.n);
  const outs: Record<string, { n: number; cls: string }> = {}; s.list.forEach((e: any) => { const k = outcomeText({ ...e, reason: e._reason }); outs[k] = outs[k] || { n: 0, cls: outcomeCls(e) }; outs[k].n++; });
  const outList = Object.entries(outs).sort((a, b) => b[1].n - a[1].n).slice(0, 7); const omax = outList[0]?.[1].n || 1;
  const col: any = { connected: 'var(--ok)', absent: 'var(--warn)', fail: 'var(--bad)', dead: 'var(--bad)', refuse: 'var(--bad)', etc: 'var(--faint)' };
  let lastDay = '';
  function csv() {
    const head = ['시각', '담당', '대상', '회차', '모듈', '목적', '결과', '컨택 시', '콜 후', '메모', '팔로우업', '자동 규칙'];
    const lines = rows.filter((e: any) => e.event_type === 'call').map((e: any) => [fmtDT(e.created_at), staffName(e.actor_id), e._name, e.attempt_no, MOD_L[e.module], e.purpose, outcomeText({ ...e, reason: e._reason }), e.stage_at, e.stage_after, e.memo || '', e.next_action_at ? fmtDT(e.next_action_at) : '', e.auto_rule || '']
      .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));
    const blob = new Blob(['﻿' + [head.join(','), ...lines].join('\n')], { type: 'text/csv' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `콜로그_${ymd(new Date())}.csv`; a.click();
  }
  return (<>
    <Head title="콜 로그" sub="모든 콜·문자 기록. 콜 수는 통화 1건 = 1회로 세요." />
    <div className="toolbar">
      <Seg value={range} onChange={setRange} opts={[['1', '오늘'], ['7', '7일'], ['14', '14일'], ['30', '30일'], ['90', '90일']]} />
      <Seg value={mod} onChange={setMod} opts={[['all', '전체 모듈'], ['ae', 'AE'], ['am_new', '신규 정착'], ['am_active', '캐파 확대'], ['booking', '예약콜']]} />
      <select style={{ width: 'auto' }} value={who} onChange={(e) => setWho(e.target.value)}><option value="all">전체 담당</option>{staff.filter((x) => x.active).map((x) => <option key={x.id} value={x.id}>{x.name || x.login_id}</option>)}</select>
      <Seg value={conn} onChange={setConn} opts={[['all', '모든 결과'], ['connected', '연결'], ['absent', '부재'], ['fail', '실패'], ['other', '결번·거부·기타']]} />
      <label style={{ fontSize: 14, display: 'flex', gap: 5, alignItems: 'center' }}><input type="checkbox" checked={moved} onChange={(e) => setMoved(e.target.checked)} /> 이동한 콜만</label>
      <label style={{ fontSize: 14, display: 'flex', gap: 5, alignItems: 'center' }}><input type="checkbox" checked={memo} onChange={(e) => setMemo(e.target.checked)} /> 메모 있는 것만</label>
      <input className="search" placeholder="대상·메모·목적 검색" value={q} onChange={(e) => setQ(e.target.value)} />
      <button className="btn" onClick={csv}>CSV (필터 반영)</button>
    </div>
    {err && <div className="errbox">{err}</div>}
    <Kpis items={[{ l: '콜 (통화 단위)', v: s.n, s: `연결 ${s.con} · 부재 ${s.abs} · 기타 ${s.oth}` }, { l: '연결률', v: s.n ? Math.round(s.con / s.n * 100) + '%' : '–' },
      { l: '스테이지 이동', v: s.moved, s: `연결 콜 중 ${s.movedCon}건 (${s.con ? Math.round(s.movedCon / s.con * 100) : 0}%)` }, { l: '접촉 대상', v: s.touched, s: '파트너·오더 유니크' },
      { l: '팔로우업 예약', v: s.fu }, { l: '실패', v: s.fail, c: s.fail ? 'bad' : '' }]} />
    <div className="cl-grid">
      <section className="panel"><h3>일자별 콜 결과 <small>막대에 올리면 수치</small></h3><Daily s={s} days={+range} />
        <div className="legend"><span><i style={{ background: 'var(--ok)' }} />연결</span><span><i style={{ background: 'var(--warn)' }} />부재</span><span><i style={{ background: 'var(--faint)' }} />결번·거부·기타</span></div></section>
      <section className="panel"><h3>요일 × 시간 연결률 <small>연결 잘 되는 시간대</small></h3><Heat s={s} /></section>
    </div>
    <div className="cl-grid">
      <section className="panel"><h3>담당별 비교</h3><div className="tbl-wrap" style={{ border: 0 }}><table style={{ minWidth: 520 }}><thead><tr><th>담당</th><th className="num">콜</th><th className="num">연결률</th><th>결과 구성</th><th className="num">이동</th><th className="num">팔로우업</th></tr></thead>
        <tbody>{byWho.map(({ st, x }) => <tr key={st.id} style={{ cursor: 'default' }}><td><b>{st.name || st.login_id}</b></td><td className="num">{x.n}</td><td className="num">{Math.round(x.con / x.n * 100)}%</td>
          <td><span className="stack">{[[x.con - x.fail, 'var(--ok)'], [x.fail, 'var(--bad)'], [x.abs, 'var(--warn)'], [x.oth, 'var(--faint)']].filter((a: any) => a[0]).map(([v, c]: any, i) => <i key={i} style={{ flex: v, background: c }} />)}</span></td>
          <td className="num">{x.moved}</td><td className="num">{x.fu}</td></tr>)}{!byWho.length && <tr><td colSpan={6} className="empty">기간 내 콜 없음</td></tr>}</tbody></table></div></section>
      <section className="panel"><h3>결과 분포 <small>상위 7</small></h3><div className="res-list">{outList.map(([k, v]) => <div className="r" key={k}><span>{k}</span><span className="b"><i style={{ width: `${v.n / omax * 100}%`, background: col[v.cls] || 'var(--accent)' }} /></span><span className="n">{v.n}</span></div>)}
        {!outList.length && <div className="empty">기간 내 콜 없음</div>}</div></section>
    </div>
    <section className="ledger"><div className="tbl-wrap"><table><thead><tr><th>시각</th><th>담당</th><th>대상</th><th>회차</th><th>모듈</th><th>목적</th><th>결과</th><th>컨택 시 → 콜 후</th><th>메모 · 태그</th><th>팔로우업</th><th>자동 규칙</th></tr></thead>
      <tbody>{rows.slice(0, 500).flatMap((e: any) => {
        const d = ymd(e.created_at); const out: any[] = [];
        if (d !== lastDay) { lastDay = d; const x = stats(rows.filter((r: any) => ymd(r.created_at) === d)); out.push(<tr className="day" key={'d' + d}><td colSpan={11}>{d} · 콜 {x.n} · 연결 {x.con} · 이동 {x.moved}</td></tr>); }
        const target = <button className="subj" onClick={() => setOpen({ s: e.subject, id: e.subject_id })}>{e._name}</button>;
        if (e.event_type === 'sms') out.push(<tr className="sms" key={e.id}><td className="mono">{fmtDT(e.created_at).split(' ')[1]}</td><td>{staffName(e.actor_id)}</td><td>{target}</td><td /><td><span className="mod">{MOD_L[e.module]}</span></td><td>{e.sms_template || '문자'}</td><td colSpan={5} className="memo">{e.memo}</td></tr>);
        else { const tags = [e.touch_key, e.state_code && `상태 ${e.state_code}`, (e.voc_tags || []).length && '의견 ' + e.voc_tags.join('·'), e.rx_code && '처방 ' + e.rx_code, (e.hesitation_tags || []).length && '망설임 ' + e.hesitation_tags.join('·')].filter(Boolean).join(' · ');
          out.push(<tr key={e.id}><td className="mono">{fmtDT(e.created_at).split(' ')[1]}</td><td>{staffName(e.actor_id)}</td><td>{target}</td><td className="mono">{e.attempt_no}회차</td><td><span className="mod">{MOD_L[e.module]}</span></td><td>{e.purpose}</td>
            <td><span className={`out ${outcomeCls(e)}`}>{outcomeText({ ...e, reason: e._reason })}</span></td>
            <td className="st">{e.stage_at}{e.stage_after !== e.stage_at && <> → <b>{e.stage_after}</b></>}</td>
            <td className="memo">{e.memo ? '' + e.memo : <span style={{ color: 'var(--faint)' }}>—</span>}{tags && <div style={{ marginTop: 3, fontSize: 12.5 }}>{tags}</div>}</td>
            <td className="mono" style={{ fontSize: 13 }}>{e.next_action_at ? '' + fmtDT(e.next_action_at) : e.close_reason ? '종료: ' + (e.close_reason.startsWith('실패: ') && e._reason ? '실패: ' + e._reason : e.close_reason) : ''}</td>
            <td className="mono" style={{ fontSize: 12, color: 'var(--faint)' }}>{e.auto_rule || ''}</td></tr>); }
        return out; })}
        {data && !rows.length && <tr><td colSpan={11} className="empty">조건에 맞는 기록 없음</td></tr>}</tbody></table></div>
      {rows.length > 500 && <div className="rule">화면에는 최근 500건만 보여요. 전체는 CSV로 받으세요 ({rows.length}건).</div>}</section>
    {open && <Detail subject={open.s} id={open.id} onClose={() => setOpen(null)} onChanged={reload} />}
  </>);
}
