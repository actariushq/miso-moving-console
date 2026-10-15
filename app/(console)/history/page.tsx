'use client';
// 히스토리 — 콜 · 문자 · 단계 이동 · 특이사항 · 변경(담당 · 팔로우업 · 충전 · 라벨 · 신호)을 한 곳에서 시간순으로. 필터 그대로 CSV로 내보낸다
import { useMemo, useState } from 'react';
import { sb, fetchAll, reasonDict, partnerNames, orderLabels } from '@/lib/data';
import { useLoad } from '@/components/useBoard';
import Kpis, { Head, Seg } from '@/components/Kpis';
import Detail, { eventText } from '@/components/Detail';
import { useStaff, useStaffName } from '@/components/StaffContext';
import { MOD_L, CONNECT_L, RESULT_L, stageLabel, careLabel, fmtDT, ymd, aePriority, TIER_L, LINE_L, outcomeText } from '@/lib/ui';
import { downloadCsv } from '@/lib/csv';

const KIND: [string, string][] = [['call', '콜 · 문자'], ['stage', '단계 이동'], ['note', '특이사항'], ['field', '변경'], ['signal', '신호']];
const SUBJ_L: Record<string, string> = { lead: 'AE 리드', partner: '파트너', order: '오더', care: 'AM 관리 대상' };
const kst = (v?: string | null) => (v ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', dateStyle: 'short', timeStyle: 'short' }).format(new Date(v)) : '');

export default function History() {
  const { staff } = useStaff(); const staffName = useStaffName();
  const [range, setRange] = useState('7'); const [mod, setMod] = useState('all'); const [who, setWho] = useState('all'); const [q, setQ] = useState('');
  const [kinds, setKinds] = useState<string[]>(['call', 'stage', 'note', 'field', 'signal']); const [hideAuto, setHideAuto] = useState(true);
  const [open, setOpen] = useState<{ s: any; id: number } | null>(null); const [shown, setShown] = useState(300); const [busy, setBusy] = useState(''); const [msg, setMsg] = useState('');

  const { data, err, reload } = useLoad(async () => {
    const since = range === 'all' ? null : new Date(Date.parse(ymd(new Date()) + 'T00:00:00+09:00') - (+range - 1) * 864e5);
    const rows = await fetchAll((a, b) => { let x = sb().from('activity_events').select('*').order('created_at', { ascending: false }); if (since) x = x.gte('created_at', since.toISOString()); return x.range(a, b); });
    const leadIds = [...new Set(rows.filter((r) => r.subject === 'lead').map((r) => r.subject_id))];
    const leads: Record<number, any> = {};
    for (let i = 0; i < leadIds.length; i += 500) { const { data: l } = await sb().from('ae_leads').select('id,partner_id,name,service_line').in('id', leadIds.slice(i, i + 500)); (l || []).forEach((x: any) => { leads[x.id] = x; }); }
    const careIds = [...new Set(rows.filter((r) => r.subject === 'care').map((r) => r.subject_id))]; const cares: Record<number, any> = {};
    for (let i = 0; i < careIds.length; i += 500) { const { data: c } = await sb().from('am_care').select('id,partner_id,name').in('id', careIds.slice(i, i + 500)); (c || []).forEach((x: any) => { cares[x.id] = x; }); }
    const [pn, ol, dict] = await Promise.all([partnerNames(rows.filter((r) => r.subject === 'partner').map((r) => r.subject_id)), orderLabels(rows.filter((r) => r.subject === 'order').map((r) => r.subject_id)), reasonDict()]);
    return { dict, rows: rows.map((r) => ({ ...r,
      _name: r.subject === 'care' ? cares[r.subject_id]?.name || `파트너 ${cares[r.subject_id]?.partner_id || ''}` : r.subject === 'partner' ? pn[r.subject_id] || `파트너 ${r.subject_id}` : r.subject === 'lead' ? leads[r.subject_id]?.name || `리드 #${r.subject_id}` : `${ol[r.subject_id] || '오더'}`,
      _pid: r.subject === 'partner' ? r.subject_id : r.subject === 'lead' ? leads[r.subject_id]?.partner_id : r.subject === 'care' ? cares[r.subject_id]?.partner_id : null,
      _kind: r.event_type === 'call' || r.event_type === 'sms' ? 'call' : r.event_type === 'stage' ? 'stage' : r.event_type === 'note' ? 'note' : r.field === 'signal' ? 'signal' : 'field' })) };
  }, [range]);
  const dict = data?.dict || [];
  const rows = useMemo(() => (data?.rows || []).filter((e: any) => kinds.includes(e._kind) && (mod === 'all' || e.module === mod) && (who === 'all' || e.actor_id === who)
    && (!hideAuto || e.actor_id) && !(e.event_type === 'stage' && e.memo === 'created' && hideAuto)
    && (!q || `${e._name} ${e._pid || ''} ${e.subject_id} ${e.memo || ''} ${e.next_action || ''}`.includes(q))), [data, kinds, mod, who, q, hideAuto]);
  const cnt = (k: string) => rows.filter((e: any) => e._kind === k).length;
  const toggle = (k: string) => setKinds(kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k]);

  function exportEvents() {
    const head = ['시각(KST)', '담당', '업무', '대상 종류', '대상 ID', '파트너 ID', '대상', '종류', '내용', '상세', '단계(전)', '단계(후)', '연결', '결과', '사유', '통화 상대', '다룬 포인트', '우려', '메모', '팔로우업', '할 일', '종료 사유', '자동 규칙', '기록 ID'];
    const out = rows.map((e: any) => { const t = eventText(e, dict, staffName);
      const from = e.event_type === 'stage' ? e.stage_from : e.event_type === 'call' ? e.stage_at : ''; const to = e.event_type === 'stage' ? e.stage_to : e.event_type === 'call' ? e.stage_after : '';
      return [kst(e.created_at), e.actor_id ? staffName(e.actor_id) : '시스템', MOD_L[e.module] || e.module, SUBJ_L[e.subject] || e.subject, e.subject_id, e._pid || '', e._name, KIND.find(([k]) => k === e._kind)?.[1] || e._kind,
        t.title, t.body, from ? (e.module === 'am_care' ? careLabel : stageLabel)(from) : '', to ? (e.module === 'am_care' ? careLabel : stageLabel)(to) : '', e.connect ? CONNECT_L[e.connect] : '', e.result ? RESULT_L[e.result] : '', e.reason_code || '', e.counterpart || '',
        (e.call_points || []).join(' · '), (e.concerns || []).join(' · '), e.memo === 'created' ? '' : e.memo || '', kst(e.next_action_at), e.next_action || '', e.close_reason || '', e.auto_rule || '', e.id]; });
    downloadCsv(`히스토리_행위_${ymd(new Date())}.csv`, head, out);
  }
  // 딜(대상) 단위 현재 상태 — AE 리드 · AM 파트너 · 예약콜 오더
  async function exportDeals(kind: 'ae' | 'am' | 'booking' | 'care') {
    setBusy(kind);
    try {
      if (kind === 'ae') {
        const r = await fetchAll((a, b) => sb().from('v_ae_board').select('*').order('priority_rank', { ascending: true, nullsFirst: false }).range(a, b));
        downloadCsv(`딜현황_AE_${ymd(new Date())}.csv`,
          ['리드 ID', '파트너 ID', '파트너', '서비스', '단계', '단계 진입', '담당', '콜 우선순위', '등급', '점수', '지역', '라벨', '통화 수', '마지막 통화', '마지막 결과', '마지막 메모', '팔로우업', '할 일', '충전액', '충전일', '첫 견적일', '이탈 사유', '최근 신호', '신호 시각', '등록일', '리스트 버전'],
          r.map((x: any) => [x.id, x.partner_id || '', x.name, LINE_L[x.service_line], stageLabel(x.stage), kst(x.stage_entered_at), x.owner_id ? staffName(x.owner_id) : '미배정', `P${aePriority(x)}`, x.grade || '', x.score ?? '',
            x.region_tier ? TIER_L[x.region_tier] : '', (x.tags || []).join(' · '), x.call_count, kst(x.last_call_at), x.last_connect ? outcomeText({ connect: x.last_connect, result: x.last_result }) : '', x.last_memo || '',
            kst(x.next_action_at), x.next_action_note || '', x.charged_amount || '', kst(x.charged_at), kst(x.first_quote_at), x.lost_reason || '', x.signal_change || '', kst(x.signal_change_at), kst(x.created_at), x.list_version || '']));
      } else if (kind === 'care') {
        const r = await fetchAll((a, b) => sb().from('v_care_board').select('*').order('priority').range(a, b));
        const mk = [...new Set(r.flatMap((x: any) => Object.keys(x.metrics || {})))];
        downloadCsv(`딜현황_AM관리대상_${ymd(new Date())}.csv`, ['관리 ID', '파트너 ID', '파트너', '우선순위', '판정 구분', '판정 근거', '권장 액션', '단계', '단계 진입', '담당', '라벨', '통화 수', '마지막 통화', '마지막 결과', '마지막 메모', '팔로우업', '할 일', '회복일', '종료 사유', '리스트 버전', ...mk],
          r.map((x: any) => [x.id, x.partner_id, x.name || '', x.manual_priority || x.priority, x.segment || '', x.reason || '', x.action || '', careLabel(x.stage), kst(x.stage_entered_at), x.owner_id ? staffName(x.owner_id) : '미배정', (x.tags || []).join(' · '),
            x.call_count, kst(x.last_call_at), x.last_connect ? outcomeText({ connect: x.last_connect, result: x.last_result }) : '', x.last_memo || '', kst(x.next_action_at), x.next_action_note || '', kst(x.recovered_at), x.lost_reason || '', x.list_version || '',
            ...mk.map((k) => x.metrics?.[k] ?? '')]));
      } else if (kind === 'am') {
        const r = await fetchAll((a, b) => sb().from('v_am_board').select('*').range(a, b));
        downloadCsv(`딜현황_AM_${ymd(new Date())}.csv`, ['파트너 ID', '파트너', '트랙', '단계', '단계 진입', '담당', '지역', '팔로우업', '할 일', '첫 충전', '잔액', '견적', '선택', '평점', '리뷰', '월 캐파', '이번 달 계약'],
          r.map((x: any) => [x.partner_id, x.name, x.track === 'active' ? '캐파 확대' : '신규 정착', stageLabel(x.stage), kst(x.stage_entered_at), x.owner_id ? staffName(x.owner_id) : '미배정', x.region || '', kst(x.next_action_at), x.next_action_note || '',
            kst(x.first_charged_at), x.balance ?? '', x.quotes ?? '', x.selected ?? '', x.rating ?? '', x.review_count ?? '', x.monthly_capacity ?? '', x.contracts ?? '']));
      } else {
        const r = await fetchAll((a, b) => sb().from('v_booking_board').select('*').range(a, b));
        downloadCsv(`딜현황_예약콜_${ymd(new Date())}.csv`, ['오더 ID', '고객', '지역', '평수', '이사일', '방문일(D0)', '단계', '담당', '플래너', '견적 수', '다음 콜', '이탈 사유', '관리 종료'],
          r.map((x: any) => [x.order_id, x.customer_label || '', x.region || '', x.pyeong ?? '', x.move_date || '', x.d0 || '', stageLabel(x.stage), x.owner_id ? staffName(x.owner_id) : '미배정', x.planner_name || '', x.quote_count ?? '', kst(x.next_call_at), x.lost_reason || '', x.expires_on || '']));
      }
    } catch (e: any) { setMsg('내보내기 실패: ' + (e.message || e)); } finally { setBusy(''); }
  }

  let lastDay = '';
  return (<>
    <Head title="히스토리" sub="콜 · 단계 이동 · 특이사항 · 담당 · 팔로우업 · 충전 · 신호 변경을 시간순으로. 필터 그대로 CSV로 받을 수 있어요." />
    <div className="toolbar">
      <Seg value={range} onChange={(v) => { setRange(v); setShown(300); }} opts={[['1', '오늘'], ['7', '7일'], ['30', '30일'], ['90', '90일'], ['all', '전체']]} />
      <Seg value={mod} onChange={setMod} opts={[['all', '전체 업무'], ['ae', 'AE'], ['am_care', '관리 대상'], ['am_new', '신규 정착'], ['am_active', '캐파 확대'], ['booking', '예약콜']]} />
      <select style={{ width: 'auto' }} value={who} onChange={(e) => setWho(e.target.value)}><option value="all">전체 담당</option>{staff.map((x) => <option key={x.id} value={x.id}>{x.name || x.login_id}</option>)}</select>
      <input className="search" placeholder="파트너 · ID · 메모 검색" value={q} onChange={(e) => setQ(e.target.value)} />
    </div>
    <div className="toolbar">
      <div className="chips">{KIND.map(([k, l]) => <button key={k} type="button" aria-pressed={kinds.includes(k)} onClick={() => toggle(k)}>{l} <span className="mono">{data ? (data.rows.filter((e: any) => e._kind === k).length) : ''}</span></button>)}</div>
      <label className="ck"><input type="checkbox" checked={hideAuto} onChange={(e) => setHideAuto(e.target.checked)} /> 사람이 한 것만 (자동 처리 · 등록 숨김)</label>
      <span className="toolbar-r">
        <button className="btn primary" disabled={!rows.length} onClick={exportEvents}>행위 CSV ({rows.length.toLocaleString()}건)</button>
        <select className="btn" value="" onChange={(e) => e.target.value && exportDeals(e.target.value as any)} disabled={!!busy} aria-label="딜 현황 CSV">
          <option value="">{busy ? '만드는 중…' : '딜 현황 CSV ▾'}</option><option value="ae">AE 리드 전체</option><option value="care">AM 관리 대상 전체</option><option value="am">AM 파트너 전체</option><option value="booking">예약콜 오더 전체</option></select>
      </span>
    </div>
    {(err || msg) && <div className="errbox">{err || msg}</div>}
    <Kpis items={[{ l: '행위', v: rows.length.toLocaleString(), s: range === 'all' ? '전체 기간' : range === '1' ? '오늘' : `최근 ${range}일` }, { l: '콜 · 문자', v: cnt('call') }, { l: '단계 이동', v: cnt('stage') }, { l: '변경 · 특이사항', v: cnt('field') + cnt('note') + cnt('signal') }]} />
    {!data ? <div className="loading">불러오는 중…</div> : <div className="queue hist-list">
      {rows.slice(0, shown).map((e: any) => { const t = eventText(e, dict, staffName); const d = ymd(e.created_at); const head = d !== lastDay; lastDay = d;
        return <div key={e.id} className="hgroup">
          {head && <div className="clsec">{d}</div>}
          <div className={`hrow ${t.kind}`}>
            <span className="mono ts">{fmtDT(e.created_at).split(' ')[1]}</span>
            <span className={`kind ${t.kind === 'signal' ? 'call' : t.kind}`}>{KIND.find(([k]) => k === e._kind)?.[1]}</span>
            <span className="tgt"><button className="subj" onClick={() => setOpen({ s: e.subject, id: e.subject_id })}>{e._name}</button><span className="sub">{MOD_L[e.module]}{e._pid ? ` · #${e._pid}` : ''}</span></span>
            <span className="what"><b>{t.title}</b>{t.body && <span className="sub">{t.body}</span>}</span>
            <span className="sub who">{e.actor_id ? staffName(e.actor_id) : '자동'}</span>
          </div></div>; })}
      {!rows.length && <div className="empty">조건에 맞는 기록이 없어요</div>}
    </div>}
    {rows.length > shown && <button className="btn" style={{ alignSelf: 'center' }} onClick={() => setShown(shown + 500)}>더 보기 ({(rows.length - shown).toLocaleString()}건 남음 · CSV에는 전부 들어가요)</button>}
    {open && <Detail subject={open.s} id={open.id} onClose={() => setOpen(null)} onChanged={reload} />}
  </>);
}
