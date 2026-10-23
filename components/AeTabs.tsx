'use client';
import Link from 'next/link';

// AE 화면 탭: 콜 리스트 · 보드 (같은 페이지) / 팔로우업 · 미소방문 권역 (별도 페이지)
export default function AeTabs({ active, onPick, due }: { active: 'list' | 'board' | 'followup' | 'regions'; onPick?: (v: 'list' | 'board') => void; due?: number }) {
  const tab = (v: 'list' | 'board', label: string) => onPick
    ? <button role="tab" aria-selected={active === v} onClick={() => onPick(v)}>{label}</button>
    : <Link role="tab" aria-selected={active === v} href={v === 'list' ? '/ae' : '/ae?view=board'}>{label}</Link>;
  return (<div className="tabs" role="tablist">
    {tab('list', '콜 리스트')}{tab('board', '단계 보드')}
    <Link role="tab" aria-selected={active === 'followup'} href="/ae/followup">팔로우업{due ? <span className="tab-n">{due}</span> : null}</Link>
    <Link role="tab" aria-selected={active === 'regions'} href="/ae/regions">미소방문 권역</Link>
  </div>);
}
