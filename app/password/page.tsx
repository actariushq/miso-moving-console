'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

export default function ChangePassword() {
  const [a, setA] = useState(''); const [b, setB] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr('');
    if (a.length < 8) return setErr('8자 이상으로 정해주세요');
    if (a !== b) return setErr('두 비밀번호가 다릅니다');
    setBusy(true);
    const { error } = await supabaseBrowser().auth.updateUser({ password: a, data: { must_change_password: false } });
    setBusy(false);
    if (error) return setErr(error.message.includes('same') ? '초기 비밀번호와 다른 비밀번호를 쓰세요' : '변경하지 못했습니다: ' + error.message);
    window.location.href = '/today';
  }
  return (
    <main className="auth">
      <form onSubmit={submit}>
        <h1>비밀번호 변경</h1>
        <p>처음 로그인하셨어요. 본인만 아는 비밀번호로 바꿔야 콘솔을 쓸 수 있어요.</p>
        <div className="f"><span>새 비밀번호 (8자 이상)</span><input id="pw1" type="password" autoComplete="new-password" value={a} onChange={(e) => setA(e.target.value)} required /></div>
        <div className="f"><span>한 번 더</span><input id="pw2" type="password" autoComplete="new-password" value={b} onChange={(e) => setB(e.target.value)} required /></div>
        {err && <div className="err">{err}</div>}
        <button className="btn primary" disabled={busy}>{busy ? '변경 중…' : '변경하고 시작'}</button>
      </form>
    </main>
  );
}
