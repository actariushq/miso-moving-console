'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LATEST } from '@/lib/changelog';
import { supabaseBrowser } from '@/lib/supabase/client';

const NAV = [
  { g: '오늘', items: [['/today', '오늘의 큐']] },
  { g: 'AE', items: [['/ae', 'AE 온보딩'], ['/ae/followup', 'AE 팔로우업'], ['/ae/regions', '미소방문 권역']] },
  { g: 'AM', items: [['/am-care', '관리 대상'], ['/am-new', '신규 정착'], ['/am-active', '캐파 확대'], ['/matching', '수동매칭']] },
  { g: '예약콜 · 미소방문', items: [['/booking', '예약콜 큐']] },
  { g: '기록 · 성과', items: [['/calls', '콜 로그'], ['/history', '히스토리'], ['/performance', '성과 관리']] },
  { g: '운영', items: [['/updates', '업데이트'], ['/suggestions', '건의사항'], ['/admin/accounts', '계정관리']] },
];
export default function Rail({ me }: { me: { name: string | null; login_id: string; role?: string } }) {
  const path = usePathname();
  // 안 본 업데이트가 있으면 '업데이트' 옆에 NEW
  const [fresh, setFresh] = useState(false);
  useEffect(() => { const f = () => { try { setFresh(localStorage.getItem('updates-seen') !== LATEST); } catch {} }; f(); window.addEventListener('updates-seen', f); return () => window.removeEventListener('updates-seen', f); }, []);
  // 가장 길게 맞는 메뉴 하나만 현재 위치로 표시 (/ae 와 /ae/followup 구분)
  const cur = NAV.flatMap((g) => g.items.map(([h]) => h)).filter((h) => path === h || path.startsWith(h + '/')).sort((a, b) => b.length - a.length)[0];
  async function logout() { await supabaseBrowser().auth.signOut(); window.location.href = '/login'; }
  return (
    <nav className="rail" aria-label="모듈">
      <div className="brand"><b>이사 콘솔</b><span>가정이사 · AE · AM · 예약콜</span></div>
      {NAV.map((g) => (
        <div className="navgroup" key={g.g}><h6>{g.g}</h6>
          {g.items.filter(([href]) => href !== '/admin/accounts' || me.role === 'lead').map(([href, label]) => <Link key={href} className="nav" href={href} aria-current={href === cur ? 'page' : undefined}>{label}{href === '/updates' && fresh && <span className="cnt hot">NEW</span>}</Link>)}
        </div>
      ))}
      <div className="rail-foot">
        <div className="rail-user"><b>{me.name || me.login_id}</b><span>{me.login_id}</span></div>
        <button onClick={logout}>로그아웃</button>
      </div>
    </nav>
  );
}
