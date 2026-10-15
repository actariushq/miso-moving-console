// 매일 크론: ① 견적 0건 공급 경고 → 수동매칭 요청 자동 생성 ② 슬랙에 담당자별 팔로업 요약
// env: SUPABASE_SECRET_KEY(서버 전용), CRON_SECRET(Vercel 크론 인증), SLACK_WEBHOOK_URL(선택)
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (process.env.CRON_SECRET && req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return new Response('unauthorized', { status: 401 });
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) return Response.json({ ok: false, error: 'SUPABASE_SECRET_KEY 미설정' }, { status: 500 });
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false } });

  const { data: created, error: e1 } = await sb.rpc('auto_supply_alerts');
  const [{ data: rows }, { data: staff }, { count: mmOpen }] = await Promise.all([
    sb.from('v_today').select('subject,owner_id,followup_at'),
    sb.from('staff').select('id,name,login_id,active'),
    sb.from('manual_match_requests').select('id', { count: 'exact', head: true }).eq('status', 'open'),
  ]);
  const { count: aeSignals } = await sb.from('ae_leads').select('id', { count: 'exact', head: true })
    .gte('signal_change_at', new Date(Date.now() - 24 * 3600e3).toISOString()).not('stage', 'in', '("WON","LOST")');
  const now = Date.now(); const eod = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' })); eod.setHours(23, 59, 59, 999);
  const by: Record<string, { over: number; today: number; none: number }> = {};
  (rows || []).forEach((r: any) => {
    const k = r.owner_id || 'none'; by[k] = by[k] || { over: 0, today: 0, none: 0 };
    if (!r.followup_at) by[k].none++; else if (+new Date(r.followup_at) < now) by[k].over++; else by[k].today += +new Date(r.followup_at) <= now + 24 * 3600e3 ? 1 : 0;
  });
  const name = (id: string) => (id === 'none' ? '미배정' : (staff || []).find((s: any) => s.id === id)?.name || id.slice(0, 6));
  const lines = Object.entries(by).filter(([, v]) => v.over || v.today || v.none).sort((a, b) => b[1].over - a[1].over)
    .map(([k, v]) => `• ${name(k)} — 지난 ${v.over} · 오늘 ${v.today} · 미등록 ${v.none}`);
  const text = `*이사 콘솔 오늘의 큐*\n${lines.join('\n') || '처리할 팔로업 없음'}\n수동매칭 대기 ${mmOpen ?? 0}건${created ? ` (오늘 자동 요청 ${created}건)` : ''}${aeSignals ? `\nAE 새 신호 ${aeSignals}명 (서류·충전·요청 열람 등) — https://miso-moving-console.vercel.app/ae/followup` : ''}\nhttps://miso-moving-console.vercel.app/today`;
  let slack = 'skipped';
  if (process.env.SLACK_WEBHOOK_URL) { const r = await fetch(process.env.SLACK_WEBHOOK_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) }); slack = r.ok ? 'sent' : 'failed ' + r.status; }
  return Response.json({ ok: !e1, supplyAlertsCreated: created ?? 0, error: e1?.message, slack, text });
}
