// AM 관리 대상 리스트(CSV) → am_care (import_care_list RPC). 웹 '리스트 관리'와 같은 규칙(lib/careList.ts)
// 사용: node scripts/import_care_list_<생성일시>.mjs <리스트.csv> <버전> [--dry]
// 기존 파트너는 판정 · 지표만 갱신(단계 · 담당 · 팔로우업 유지), 새 파트너만 추가. supabase CLI(link) 사용, 비밀 키 안 씀
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
const [file, version, ...rest] = process.argv.slice(2);
if (!file || !version) { console.error('사용: node import_care_list.mjs <csv> <버전> [--dry]'); process.exit(1); }
function parseCsv(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) { const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cur); cur = ''; } else if (c === '\n') { row.push(cur.replace(/\r$/, '')); rows.push(row); row = []; cur = ''; } else cur += c; }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const [h, ...b] = rows; const head = h.map((x) => x.replace(/^﻿/, '').trim());
  return b.filter((r) => r.length === head.length).map((r) => Object.fromEntries(head.map((k, i) => [k, r[i]])));
}
const pick = (r, re) => { const k = Object.keys(r).find((x) => re.test(x.replace(/\s/g, ''))); return k ? (r[k] ?? '').trim() : ''; };
const ID = /^(partner_?id|파트너id|파트너아이디|supplier_?id)$/i, NAME = /^(partner_?name|파트너명|파트너|업체명|이름)$/i, SEG = /^(관리구분|구분|세그먼트|segment)$/i,
  REASON = /^(판정근거|근거|사유|reason)$/i, ACTION = /^(권장am액션|권장액션|액션|action)$/i, TEXT_OK = /(월$|근거|액션|구분|명$|name)/i;
const warn = []; const rows = [];
for (const r of parseCsv(readFileSync(file, 'utf8'))) {
  const pid = Number(pick(r, ID)); if (!pid) continue;
  const sr = pick(r, SEG); const m = sr.match(/^P\s*([1-3])\s*\|?\s*(.*)$/i);
  const metrics = {};
  for (const [k0, v0] of Object.entries(r)) { const k = k0.trim(), v = (v0 ?? '').trim();
    if ([ID, NAME, SEG, REASON, ACTION].some((re) => re.test(k.replace(/\s/g, '')))) continue;
    if (v === '') { metrics[k] = null; continue; } const n = v.replace(/,/g, '');
    if (/^-?\d+(\.\d+)?%?$/.test(n)) metrics[k] = n.endsWith('%') ? n : Number(n);
    else if (TEXT_OK.test(k) || /^\d{4}-\d{2}/.test(v)) metrics[k] = v;
    else { metrics[k] = null; warn.push(`#${pid} '${k}' = "${v.slice(0, 20)}" → 비움`); } }
  rows.push({ partner_id: pid, name: pick(r, NAME), segment: (m ? m[2] : sr).trim() || null, priority: m ? +m[1] : /정상|관찰/.test(sr) ? 4 : 3, reason: pick(r, REASON) || null, action: pick(r, ACTION) || null, metrics });
}
console.log(`${rows.length}명 · P1 ${rows.filter((x) => x.priority === 1).length} · P2 ${rows.filter((x) => x.priority === 2).length} · P3 ${rows.filter((x) => x.priority === 3).length} · 관찰 ${rows.filter((x) => x.priority === 4).length}`);
warn.forEach((w) => console.log('⚠', w));
if (rest.includes('--dry')) process.exit(0);
const dir = mkdtempSync(join(tmpdir(), 'care-')); let tot = { updated: 0, inserted: 0 };
for (let i = 0; i < rows.length; i += 200) {
  const p = join(dir, `c${i}.sql`); writeFileSync(p, `select import_care_list('${JSON.stringify(rows.slice(i, i + 200)).replace(/'/g, "''")}'::jsonb, '${version.replace(/'/g, "''")}') as r;`);
  const out = JSON.parse(execFileSync('supabase', ['db', 'query', '--linked', '-f', p], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })).rows[0].r;
  const r = typeof out === 'string' ? JSON.parse(out) : out; tot.updated += r.updated; tot.inserted += r.inserted;
}
console.log(`완료: 갱신 ${tot.updated} · 신규 ${tot.inserted} (버전 ${version})`);
