// 로컬 미리보기 전용 — NEXT_PUBLIC_PREVIEW=1 이고 PREVIEW_FIXTURES 폴더가 있을 때만 응답 (운영에는 둘 다 없음 → 404)
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
export const dynamic = 'force-dynamic';
export async function GET() {
  const dir = process.env.PREVIEW_FIXTURES;
  if (process.env.NEXT_PUBLIC_PREVIEW !== '1' || !dir || process.env.VERCEL) return new Response('not found', { status: 404 });
  const out: Record<string, any> = {};
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) out[f.replace(/\.json$/, '')] = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  return Response.json(out);
}
