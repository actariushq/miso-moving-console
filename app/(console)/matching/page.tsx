'use client';
import { useState } from 'react';
import { sb, partnerNames } from '@/lib/data';
import { useLoad } from '@/components/useBoard';
import Kpis, { Head, Seg } from '@/components/Kpis';
import Detail from '@/components/Detail';
import { useStaffName } from '@/components/StaffContext';
import { fmtDT, fmtD, dayDiff } from '@/lib/ui';

export default function Matching() {
  const staffName = useStaffName();
  const [st, setSt] = useState('open'); const [open, setOpen] = useState<number | null>(null); const [edit, setEdit] = useState<string | null>(null);
  const [form, setForm] = useState({ note: '', partners: '' }); const [msg, setMsg] = useState('');
  const { data, err, reload } = useLoad(async () => {
    const { data, error } = await sb().from('v_manual_match').select('*').order('created_at', { ascending: false }).limit(300); if (error) throw error;
    const names = await partnerNames((data || []).flatMap((r: any) => r.matched_partner_ids || []));
    return (data || []).map((r: any) => ({ ...r, _matched: (r.matched_partner_ids || []).map((p: number) => names[p] || p).join(', ') }));
  });
  const rows = (data || []).filter((r: any) => st === 'all' || r.status === st);
  async function resolve(id: string, status: string) {
    const partners = form.partners.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean).map(Number).filter((n) => !isNaN(n));
    const { error } = await sb().rpc('resolve_manual_match', { p_id: id, p_status: status, p_note: form.note, p_partners: partners });
    if (error) return setMsg(error.message.includes('필수') ? '처리 메모를 적어주세요' : '실패: ' + error.message);
    setEdit(null); setForm({ note: '', partners: '' }); setMsg(''); reload();
  }
  const openN = (data || []).filter((r: any) => r.status === 'open');
  return (<>
    <Head title="수동매칭" sub="견적이 모자란 미소방문 오더에 파트너를 직접 연결해요." />
    <Kpis items={[{ l: '처리 대기', v: openN.length, c: openN.length ? 'bad' : '' }, { l: 'D+1 이상 대기', v: openN.filter((r: any) => dayDiff(r.created_at) >= 1).length, s: '오래된 요청' }, { l: '매칭 완료', v: (data || []).filter((r: any) => r.status === 'matched').length }, { l: '종료', v: (data || []).filter((r: any) => r.status === 'closed').length }]} />
    <div className="toolbar"><Seg value={st} onChange={setSt} opts={[['open', '처리 대기'], ['matched', '매칭 완료'], ['closed', '종료'], ['all', '전체']]} /></div>
    {err && <div className="errbox">{err}</div>}
    <div className="tbl-wrap"><table><thead><tr><th>요청</th><th>오더</th><th className="num">평수</th><th>이사일</th><th className="num">견적</th><th>사유</th><th>요청자</th><th>처리</th></tr></thead>
      <tbody>{rows.map((r: any) => <tr key={r.id} style={{ cursor: 'default' }}>
        <td className="mono">{fmtDT(r.created_at)}</td>
        <td><button className="subj" style={{ background: 'none', border: 0, padding: 0, color: 'var(--accent)', fontWeight: 600, cursor: 'pointer' }} onClick={() => setOpen(r.order_id)}>{r.customer_label || '고객'} · {r.region}</button><div style={{ fontSize: 13, color: 'var(--muted)' }}>오더 {r.order_id} · D+{dayDiff(r.d0)} · {r.booking_stage}</div></td>
        <td className="num">{r.pyeong}</td><td className="mono">{fmtD(r.move_date)}</td><td className="num">{r.quote_count}</td>
        <td style={{ maxWidth: 260 }}>{r.reason}</td><td>{r.requested_by ? staffName(r.requested_by) : '자동'}</td>
        <td style={{ minWidth: 260 }}>{r.status === 'open' ? (edit === r.id ? <div className="form" style={{ padding: 8 }}>
            <input placeholder="연결한 파트너 ID (쉼표로 여러 개)" value={form.partners} onChange={(e) => setForm({ ...form, partners: e.target.value })} />
            <input placeholder="처리 메모 (필수)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            <div className="row"><button className="btn primary" onClick={() => resolve(r.id, 'matched')}>매칭 완료</button><button className="btn" onClick={() => resolve(r.id, 'closed')}>매칭 없이 종료</button><button className="btn" onClick={() => setEdit(null)}>취소</button></div>
            <span className="err">{msg}</span></div>
          : <button className="btn" onClick={() => { setEdit(r.id); setMsg(''); }}>처리</button>)
          : <span style={{ fontSize: 13.5 }}>{r.status === 'matched' ? '매칭' : '종료'} · {fmtDT(r.resolved_at)} · {r.resolved_by ? staffName(r.resolved_by) : ''}<div style={{ color: 'var(--muted)' }}>{r.note}{r._matched ? ` · ${r._matched}` : ''}</div></span>}</td></tr>)}
        {data && !rows.length && <tr><td colSpan={8} className="empty">없음</td></tr>}</tbody></table></div>
    {open != null && <Detail subject="order" id={open} onClose={() => setOpen(null)} onChanged={reload} />}
  </>);
}
