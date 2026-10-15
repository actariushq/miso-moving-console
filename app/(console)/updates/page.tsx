'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Head } from '@/components/Kpis';
import { CHANGELOG, LATEST } from '@/lib/changelog';

// 업데이트 현황 — 본문의 <b>만 굵게, 나머지 태그는 글자로 (이전 콘솔 규칙)
const rich = (s: string) => s.split(/(<b>.*?<\/b>)/g).map((p, i) => (p.startsWith('<b>') ? <b key={i}>{p.slice(3, -4)}</b> : <span key={i}>{p}</span>));

export default function Updates() {
  const [seen, setSeen] = useState<string | null>(null);
  useEffect(() => { try { setSeen(localStorage.getItem('updates-seen')); localStorage.setItem('updates-seen', LATEST); window.dispatchEvent(new Event('updates-seen')); } catch {} }, []);
  const idx = seen ? CHANGELOG.findIndex((r) => r.v === seen) : -1;
  const total = CHANGELOG.reduce((n, r) => n + r.items.length, 0);
  return (<>
    <Head title="업데이트" sub={`현재 ${LATEST} · 바뀐 점과 반영된 건의를 기록해요.`} />
    <div className="toolbar"><Link className="btn" href="/suggestions">건의사항으로</Link></div>
    <div className="releases">{CHANGELOG.map((r, i) => (
      <section key={r.v} className="rel">
        <div className="rel-h"><span className="mono rel-v">{r.v}</span><span className={`chip ${r.tag === '수정' ? 'warn' : r.tag === '신규' ? 'solid' : 'mv'}`}>{r.tag}</span>
          <b>{r.title}</b><span className="mono why">{r.d}</span>{seen && (idx < 0 || i < idx) && <span className="chip p1">NEW</span>}</div>
        <ul>{r.items.map((c) => <li key={c.t}><b>{c.t}</b>{c.req && <span className="chip ok">{c.req.includes('건의') || c.req.startsWith('#') ? '' : ''}{c.req} 반영</span>}<div>{rich(c.d)}</div></li>)}</ul>
      </section>))}</div>
  </>);
}
