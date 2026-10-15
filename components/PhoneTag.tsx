'use client';
import Icon from './Icon';
// 작업창 이름 옆 파트너 전화번호 — 담당자가 어드민에서 확인한 번호를 직접 입력 (partner_contacts, 콘솔 계정만)
// 누르면 전화 걸기(tel:), 복사 버튼. 이력에는 '등록/변경' 사실만 남기고 번호는 남기지 않는다
import { useEffect, useState } from 'react';
import { sb } from '@/lib/data';

// 02-xxx(x)-xxxx · 010-xxxx-xxxx · 031-xxx-xxxx · 0507-xxxx-xxxx
const fmt = (d: string) => d.startsWith('02') ? d.replace(/^(02)(\d{3,4})(\d{4})$/, '$1-$2-$3')
  : d.length === 12 ? d.replace(/^(\d{4})(\d{4})(\d{4})$/, '$1-$2-$3')
  : d.length === 11 ? d.replace(/^(\d{3})(\d{4})(\d{4})$/, '$1-$2-$3')
  : d.length === 10 ? d.replace(/^(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3') : d;

export default function PhoneTag({ partnerId, subject, subjectId, module }: { partnerId?: number | null; subject: string; subjectId: number; module: string }) {
  const [phone, setPhone] = useState<string | null>(null); const [label, setLabel] = useState('');
  const [edit, setEdit] = useState(false); const [v, setV] = useState(''); const [msg, setMsg] = useState(''); const [copied, setCopied] = useState(false);
  useEffect(() => { setPhone(null); setEdit(false); if (!partnerId) return;
    sb().from('partner_contacts').select('phone,label').eq('partner_id', partnerId).maybeSingle().then(({ data }: any) => { setPhone(data?.phone || null); setLabel(data?.label || ''); }); }, [partnerId]);
  if (!partnerId) return null;
  async function save() {
    const d = v.replace(/\D/g, ''); if (!/^0\d{7,11}$/.test(d)) return setMsg('숫자 8~12자리로 입력해 주세요');
    const { error } = await sb().from('partner_contacts').upsert({ partner_id: partnerId, phone: d, label: label.trim() || null, updated_at: new Date().toISOString() });
    if (error) return setMsg('저장 실패: ' + error.message);
    await sb().from('activity_events').insert({ subject, subject_id: subjectId, module, event_type: 'field', field: 'phone', old_value: phone ? '있음' : '없음', new_value: phone ? '변경' : '등록' });
    setPhone(d); setEdit(false); setMsg('');
  }
  if (edit) return (<span className="phone-edit">
    <input type="tel" autoFocus value={v} onChange={(e) => setV(e.target.value)} placeholder="010-0000-0000" onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEdit(false); }} aria-label="파트너 전화번호" />
    <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="대표 · 실무자 (선택)" className="phone-label" />
    <button className="btn primary" onClick={save}>저장</button><button className="btn" onClick={() => setEdit(false)}>취소</button>{msg && <span className="err">{msg}</span>}
  </span>);
  if (!phone) return <button className="phone-add" onClick={() => { setV(''); setEdit(true); }} title="어드민에서 확인한 번호를 한 번 입력해 두면 다음부터 여기 보여요">+ 전화번호</button>;
  return (<span className="phone-tag">
    <a href={`tel:${phone}`} title="눌러서 전화 걸기"><Icon n="phone" /> {fmt(phone)}</a>{label && <span className="phone-who">{label}</span>}
    <button onClick={() => { try { navigator.clipboard.writeText(fmt(phone)); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {} }} title="복사">{copied ? '복사됨' : '복사'}</button>
    <button onClick={() => { setV(fmt(phone)); setEdit(true); }} title="번호 바꾸기">수정</button>
  </span>);
}
