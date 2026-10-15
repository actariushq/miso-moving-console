'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

export default function Login() {
  const [id, setId] = useState(''); const [pw, setPw] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true);
    const email = id.includes('@') ? id.trim() : `${id.trim()}@getmiso.com`;   // mv1 만 입력해도 됨
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password: pw });
    setBusy(false);
    if (error) { setErr('아이디 또는 비밀번호가 맞지 않습니다'); return; }
    window.location.href = '/today';
  }
  return (
    <main className="auth">
      <form onSubmit={submit}>
        <h1>이사 콘솔</h1>
        <p>가정이사 AM · 예약콜 — 발급받은 계정으로 로그인하세요</p>
        <div className="f"><span>아이디</span><input id="login-id" autoComplete="username" placeholder="mv1 또는 mv1@getmiso.com" value={id} onChange={(e) => setId(e.target.value)} required /></div>
        <div className="f"><span>비밀번호</span><input id="login-pw" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required /></div>
        {err && <div className="err">{err}</div>}
        <button className="btn primary" disabled={busy}>{busy ? '로그인 중…' : '로그인'}</button>
      </form>
    </main>
  );
}
