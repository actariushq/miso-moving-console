'use client';
import { useState } from 'react';
import { sb } from '@/lib/data';
import { useStaff } from './StaffContext';

// 보드 공통: 배정 모드 on → 카드 클릭이 선택으로 바뀜 → 하단 바에서 담당 일괄 배정
export function useAssign() {
  const [on, setOn] = useState(false); const [picked, setPicked] = useState<number[]>([]);
  const toggle = (id: number) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return { on, setOn: (v: boolean) => { setOn(v); setPicked([]); }, picked, setPicked, toggle };
}
export function AssignToggle({ a }: { a: ReturnType<typeof useAssign> }) {
  return <button className="btn" aria-pressed={a.on} onClick={() => a.setOn(!a.on)} style={a.on ? { background: 'var(--accent)', color: 'var(--accent-ink)', borderColor: 'var(--accent)' } : {}}>{a.on ? '배정 모드 끄기' : '담당 배정'}</button>;
}
export function AssignBar({ a, subject, all, onDone }: { a: ReturnType<typeof useAssign>; subject: 'partner' | 'order' | 'lead' | 'care'; all: number[]; onDone: () => void }) {
  const { staff } = useStaff(); const [owner, setOwner] = useState(''); const [msg, setMsg] = useState('');
  if (!a.on) return null;
  async function apply() {
    if (!a.picked.length) return setMsg('카드를 눌러 먼저 선택하세요');
    const { data, error } = await sb().rpc('assign_owner', { p_subject: subject, p_ids: a.picked, p_owner: owner || null });
    if (error) return setMsg('실패: ' + error.message);
    setMsg(`${data}건 배정됨`); a.setPicked([]); onDone();
  }
  return (<div className="assignbar">
    <b>{a.picked.length}건 선택</b>
    <button className="btn" onClick={() => a.setPicked(all)}>보이는 것 전체 선택</button>
    <button className="btn" onClick={() => a.setPicked([])}>선택 해제</button>
    <span>→</span>
    <select value={owner} onChange={(e) => setOwner(e.target.value)}><option value="">미배정으로</option>{staff.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name || s.login_id}</option>)}</select>
    <button className="btn primary" onClick={apply}>배정</button>
    <span style={{ fontSize: 13, opacity: .8 }}>{msg}</span>
  </div>);
}
