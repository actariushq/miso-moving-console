'use client';
import { useMemo, useState } from 'react';
import { sb, fetchAll } from '@/lib/data';
import { useLoad } from '@/components/useBoard';
import Kpis, { Head, Seg } from '@/components/Kpis';
import AeTabs from '@/components/AeTabs';
import { useStaff } from '@/components/StaffContext';
import { relTime } from '@/lib/ui';

// 미소방문 권역(구 단위): 아테나에서 '서비스 설정'(586 region_ids)·'최근 30일 요청'을 받아 자동 판단하고,
// 담당자가 구마다 권역에 넣기/빼기로 덮어쓸 수 있다. 판단 = 수동 값이 있으면 수동, 없으면 설정 또는 30일 요청 1건 이상 [제안]
// AE 리스트의 '권역 N개 구 / 권역 밖' 표시는 이 표와 리드 커버리지(ae_leads.coverage)로 계산된다(v_ae_board)
const PROV = [['all', '전체'], ['서울', '서울'], ['인천', '인천'], ['경기', '경기'], ['etc', '그 밖']] as [string, string][];
const BASIS_L: Record<string, string> = { manual: '수동', official: '서비스 설정', requests: '최근 요청' };

export default function Regions() {
  const { me } = useStaff(); const isLead = me?.role === 'lead';
  const [prov, setProv] = useState('all'); const [show, setShow] = useState('in'); const [add, setAdd] = useState(''); const [msg, setMsg] = useState('');
  const { data, err, reload } = useLoad(async () => {
    const [regions, leads] = await Promise.all([
      fetchAll((f, t) => sb().from('v_mv_regions').select('*').order('province').order('req_30d', { ascending: false }).range(f, t)),
      fetchAll((f, t) => sb().from('v_ae_board').select('id,coverage,stage,mv_in').eq('service_line', 'miso_visit').range(f, t)),
    ]);
    return { regions, leads };
  });
  const regions = data?.regions || []; const leads = (data?.leads || []).filter((l: any) => !['WON', 'LOST'].includes(l.stage));
  const leadCnt = useMemo(() => { const m = new Map<string, number>(); leads.forEach((l: any) => (l.coverage || []).forEach((d: string) => m.set(d, (m.get(d) || 0) + 1))); return m; }, [leads]);
  const inZone = regions.filter((r: any) => r.effective);
  const byProv = (p: string) => inZone.filter((r: any) => r.province === p).length;
  const lastSync = regions.reduce((m: string | null, r: any) => (r.synced_at && (!m || r.synced_at > m) ? r.synced_at : m), null);
  const list = regions.filter((r: any) => (prov === 'all' || (prov === 'etc' ? !['서울', '인천', '경기'].includes(r.province) : r.province === prov))
    && (show === 'all' || (show === 'in' ? r.effective : !r.effective)));

  async function setManual(district: string, manual: string | null) {
    setMsg(''); const { error } = await sb().from('mv_regions').update({ manual }).eq('district', district);
    if (error) return setMsg('저장 실패: ' + error.message); reload();
  }
  async function setNote(district: string, note: string) {
    const { error } = await sb().from('mv_regions').update({ note: note.trim() || null }).eq('district', district);
    if (error) setMsg('저장 실패: ' + error.message);
  }
  async function addDistrict() {
    const d = add.trim().replace(/\s+/g, ' ');
    if (!/^\S+ \S+/.test(d)) return setMsg("'시·도 구' 형태로 적어 주세요 (예: 경기 김포시, 인천 서구)");
    if (regions.some((r: any) => r.district === d)) { await setManual(d, 'in'); setAdd(''); return setMsg(`${d}는 이미 있어서 권역에 넣었어요`); }
    const { error } = await sb().from('mv_regions').insert({ district: d, province: d.split(' ')[0], manual: 'in' });
    if (error) return setMsg('추가 실패: ' + error.message); setAdd(''); setMsg(`${d}를 권역에 추가했어요`); reload();
  }
  async function remove(district: string) {
    const { error } = await sb().from('mv_regions').delete().eq('district', district);
    if (error) return setMsg('삭제 실패: ' + error.message); reload();
  }

  return (<>
    <Head title="미소방문 권역" sub="AE 리스트의 ‘권역’ 표시 기준이에요. 자동으로 정해지고, 구마다 직접 넣거나 뺄 수 있어요." />
    <AeTabs active="regions" />
    <Kpis items={[
      { l: '권역 구', v: inZone.length, s: `서울 ${byProv('서울')} · 인천 ${byProv('인천')} · 경기 ${byProv('경기')}` },
      { l: '직접 바꾼 구', v: regions.filter((r: any) => r.manual).length, s: `넣기 ${regions.filter((r: any) => r.manual === 'in').length} · 빼기 ${regions.filter((r: any) => r.manual === 'out').length}` },
      { l: '권역 커버 리드', v: leads.filter((l: any) => l.mv_in).length, c: 'ok', s: `권역 밖 ${leads.filter((l: any) => l.mv_in === false).length} · 진행 중 기준` },
      { l: '마지막 동기화', v: lastSync ? relTime(lastSync).split(' ')[0] : '–', s: '바탕화면 ‘AE 리스트 갱신’ 앱' },
    ]} />
    <div className="rule">자동 판단: <b>서비스 설정</b>(아테나 586 서비스의 지역 목록 — 지금은 서울 전체)에 있거나 <b>최근 30일 미소방문 요청</b>이 1건 이상 들어온 구. 직접 넣기 · 빼기를 하면 그 값이 우선이고, 다음 동기화 때도 그대로 남아요.</div>
    <div className="toolbar">
      <Seg value={show} onChange={setShow} opts={[['in', '권역'], ['out', '권역 밖'], ['all', '전체']]} />
      <Seg value={prov} onChange={setProv} opts={PROV} />
      <span className="toolbar-r">
        <input className="search" style={{ width: 200 }} placeholder="구 추가 (예: 경기 김포시)" value={add} onChange={(e) => setAdd(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addDistrict()} />
        <button className="btn" onClick={addDistrict}>권역에 추가</button>
      </span>
    </div>
    {msg && <div className="rule">{msg}</div>}
    {err && <div className="errbox">{err}</div>}
    {!data ? <div className="loading">불러오는 중…</div> : <div className="queue rtable">
      <div className="rrow head"><span>구</span><span>판단</span><span className="hide-sm">근거</span><span>30일 요청</span><span className="hide-sm">커버 리드</span><span>직접 설정</span><span className="hide-sm">메모</span></div>
      {list.map((r: any) => <div key={r.district} className="rrow">
        <span><b>{r.district}</b></span>
        <span>{r.effective ? <span className="pill zone">권역</span> : <span className="pill off">밖</span>}</span>
        <span className="hide-sm sub">{BASIS_L[r.basis] || '–'}{r.official === 'part' ? ' · 일부 동만 설정' : ''}{r.manual && r.updated_by_name ? ` · ${r.updated_by_name} ${relTime(r.updated_at).split(' ')[0]}` : ''}</span>
        <span className="mono">{r.req_30d ? r.req_30d.toLocaleString() : '–'}</span>
        <span className="hide-sm mono">{leadCnt.get(r.district) || '–'}</span>
        <span className="rset"><select value={r.manual || ''} onChange={(e) => setManual(r.district, e.target.value || null)} aria-label={`${r.district} 직접 설정`}>
          <option value="">자동 따름</option><option value="in">권역에 넣기</option><option value="out">권역에서 빼기</option></select>
          {isLead && !r.synced_at && <button className="linkbtn" onClick={() => remove(r.district)}>삭제</button>}</span>
        <span className="hide-sm"><input className="note-in" defaultValue={r.note || ''} placeholder="메모" onBlur={(e) => e.target.value !== (r.note || '') && setNote(r.district, e.target.value)} /></span>
      </div>)}
      {!list.length && <div className="empty">해당하는 구가 없어요</div>}
    </div>}
  </>);
}
