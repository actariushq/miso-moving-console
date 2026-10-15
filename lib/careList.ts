// AM 관리 대상 리스트(CSV) → import_care_list 행. 리스트 형식이 바뀔 수 있어 칸 이름을 넓게 받아들인다
// - 필수: 파트너 ID(partner_id · 파트너ID · 파트너 ID)
// - 관리구분 'P1 | 9월 참여 후 10월 미참여' → priority 1 + segment, '정상/관찰' → 4
// - 판정 근거 · 권장 액션 · 파트너명은 따로, 나머지 칸은 원래 이름 그대로 metrics 에 (숫자 · % 는 숫자로, 숫자 칸에 글자가 섞이면 비우고 표시)
import { parseCsv } from './aeList';

const pick = (r: Record<string, string>, names: RegExp) => { const k = Object.keys(r).find((x) => names.test(x.replace(/\s/g, ''))); return k ? (r[k] ?? '').trim() : ''; };
const ID = /^(partner_?id|파트너id|파트너아이디|supplier_?id)$/i;
const NAME = /^(partner_?name|파트너명|파트너|업체명|이름)$/i;
const SEG = /^(관리구분|구분|세그먼트|segment)$/i;
const REASON = /^(판정근거|근거|사유|reason)$/i;
const ACTION = /^(권장am액션|권장액션|액션|action)$/i;
const TEXT_OK = /(월$|근거|액션|구분|명$|name)/i; // 글자가 정상인 칸

export type CareRow = { partner_id: number; name: string; segment: string | null; priority: number; reason: string | null; action: string | null; metrics: Record<string, any> };

export function toCareRows(text: string): { rows: CareRow[]; warnings: string[] } {
  const raw = parseCsv(text); const warnings: string[] = []; const rows: CareRow[] = [];
  for (const r of raw) {
    const pid = Number(pick(r, ID)); if (!pid) continue;
    const segRaw = pick(r, SEG); const m = segRaw.match(/^P\s*([1-3])\s*\|?\s*(.*)$/i);
    const priority = m ? +m[1] : /정상|관찰/.test(segRaw) ? 4 : 3;
    const segment = (m ? m[2] : segRaw).trim() || null;
    const metrics: Record<string, any> = {};
    for (const [k, v0] of Object.entries(r)) {
      const key = k.replace(/^﻿/, '').trim(); const v = (v0 ?? '').trim();
      if ([ID, NAME, SEG, REASON, ACTION].some((re) => re.test(key.replace(/\s/g, '')))) continue;
      if (v === '') { metrics[key] = null; continue; }
      const num = v.replace(/,/g, ''); const pct = num.endsWith('%');
      if (/^-?\d+(\.\d+)?%?$/.test(num)) metrics[key] = pct ? `${num}` : Number(num);
      else if (TEXT_OK.test(key) || /^\d{4}-\d{2}/.test(v)) metrics[key] = v;
      else { metrics[key] = null; warnings.push(`#${pid} '${key}' 칸에 숫자가 아닌 값("${v.slice(0, 20)}")이 있어 비웠어요`); }
    }
    rows.push({ partner_id: pid, name: pick(r, NAME), segment, priority, reason: pick(r, REASON) || null, action: pick(r, ACTION) || null, metrics });
  }
  return { rows, warnings };
}
