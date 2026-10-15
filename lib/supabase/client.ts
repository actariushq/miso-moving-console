import { createBrowserClient } from '@supabase/ssr';
// 로컬 미리보기(NEXT_PUBLIC_PREVIEW=1)에서는 읽기 전용 사본 클라이언트 — 운영 빌드에서는 이 분기가 빠진다
export const supabaseBrowser = (): any =>
  process.env.NEXT_PUBLIC_PREVIEW === '1' ? require('@/lib/previewMock').previewClient
    : createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
