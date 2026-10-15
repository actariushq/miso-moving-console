'use client';
// 동시 작업 충돌 방지 — Supabase Realtime Presence로 '누가 지금 어떤 리드·파트너·오더를 보고 있는지' 공유
// 작업창을 열면 track, 닫으면 해제. 목록 · 작업창에 '○○ 보는 중'을 띄우고, '저장하고 다음'은 남이 보는 건을 건너뛴다
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

type View = { subject: string; id: number } | null;
type Peer = { staff_id: string; name: string; view: View };
const Ctx = createContext<{ peers: Peer[]; setView: (v: View) => void; meId: string }>({ peers: [], setView: () => {}, meId: '' });

export function PresenceProvider({ me, children }: { me: { id: string; name: string | null; login_id: string }; children: React.ReactNode }) {
  const [peers, setPeers] = useState<Peer[]>([]);
  const ch = useRef<any>(null); const cur = useRef<View>(null); const ready = useRef(false);
  const meta = (v: View) => ({ staff_id: me.id, name: me.name || me.login_id, view: v });
  useEffect(() => {
    const sb = supabaseBrowser();
    const c = sb.channel('console-presence', { config: { presence: { key: me.id } } });
    c.on('presence', { event: 'sync' }, () => setPeers((Object.values(c.presenceState()) as any[]).flat() as Peer[]))
      .subscribe(async (status: string) => { if (status === 'SUBSCRIBED') { ready.current = true; await c.track(meta(cur.current)); } });
    ch.current = c;
    return () => { ready.current = false; sb.removeChannel(c); };
  }, [me.id]);
  const setView = useCallback((v: View) => { cur.current = v; if (ready.current) ch.current?.track(meta(v)); }, [me.id]);
  return <Ctx.Provider value={{ peers, setView, meId: me.id }}>{children}</Ctx.Provider>;
}

// 다른 사람(나 제외)이 보고 있는 대상 → 이름 목록
export function useViewers() {
  const { peers, meId } = useContext(Ctx);
  return useCallback((subject: string, id: number) => [...new Set(peers.filter((p) => p.staff_id !== meId && p.view?.subject === subject && p.view?.id === id).map((p) => p.name))], [peers, meId]);
}
// 작업창이 열려 있는 동안 '보는 중'으로 알린다
export function useTrackView(subject: string, id: number) {
  const { setView } = useContext(Ctx);
  useEffect(() => { setView({ subject, id }); return () => setView(null); }, [subject, id, setView]);
}

// 다른 담당자가 이 대상에 기록을 남기면 바로 알려 주고 새로 불러온다 (activity_events INSERT 구독, RLS 적용)
export function useLiveEvents(subject: string, id: number, meId: string, onOther: (e: any) => void) {
  const cb = useRef(onOther); cb.current = onOther;
  useEffect(() => {
    const sb = supabaseBrowser();
    const c = sb.channel(`ev-${subject}-${id}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_events', filter: `subject_id=eq.${id}` },
      (p: any) => { const e = p.new; if (e?.subject === subject && e.actor_id && e.actor_id !== meId) cb.current(e); }).subscribe();
    return () => { sb.removeChannel(c); };
  }, [subject, id, meId]);
}
