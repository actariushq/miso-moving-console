'use client';
import { supabaseBrowser } from './supabase/client';

export const sb = () => supabaseBrowser();

let dictCache: any[] | null = null;
let cadenceCache: any[] | null = null;
export async function reasonDict() {
  if (!dictCache) { const { data } = await sb().from('reason_dict').select('*').eq('active', true).order('sort'); dictCache = data || []; }
  return dictCache;
}
export async function touchCadence() {
  if (!cadenceCache) { const { data } = await sb().from('touch_cadence').select('*'); cadenceCache = data || []; }
  return cadenceCache;
}
export const reasonLabel = (dict: any[], module: string, code?: string | null) =>
  !code ? null : dict.find((r) => r.module === module && r.code === code)?.label || code;

// 여러 페이지 로드 (PostgREST 1000행 제한 회피 — 기존 콘솔 5000행 컷오프 버그 재발 방지)
export async function fetchAll(build: (from: number, to: number) => any, page = 1000, max = 50000) {
  const out: any[] = [];
  for (let from = 0; from < max; from += page) {
    const { data, error } = await build(from, from + page - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < page) break;
  }
  return out;
}

export async function partnerNames(ids: number[]) {
  const u = [...new Set(ids)]; if (!u.length) return {} as Record<number, string>;
  const { data } = await sb().from('src_partners').select('partner_id,name').in('partner_id', u);
  return Object.fromEntries((data || []).map((r: any) => [r.partner_id, r.name]));
}
export async function orderLabels(ids: number[]) {
  const u = [...new Set(ids)]; if (!u.length) return {} as Record<number, string>;
  const { data } = await sb().from('src_orders').select('order_id,customer_label,region').in('order_id', u);
  return Object.fromEntries((data || []).map((r: any) => [r.order_id, `${r.customer_label || '고객'} · ${r.region || ''}`]));
}
export async function leadNames(ids: number[]) {
  const u = [...new Set(ids)]; if (!u.length) return {} as Record<number, string>;
  const { data } = await sb().from('ae_leads').select('id,name,service_line').in('id', u);
  return Object.fromEntries((data || []).map((r: any) => [r.id, `${r.name} · ${r.service_line === 'miso_visit' ? '미소방문' : 'RFQ'}`]));
}
