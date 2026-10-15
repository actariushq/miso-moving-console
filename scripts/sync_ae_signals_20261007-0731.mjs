// 리대시 → AE 리드 신호 동기화 (맥에서 실행 — 리대시는 AWS VPN 안에서만 열림)
// 사용: node scripts/sync_ae_signals_<생성일시>.mjs [--dry]
// 1) 콘솔의 미소방문 리드(완료 제외) 파트너 ID를 읽는다 (supabase CLI, link 필요)
// 2) ~/miso-data/sql/ae_lead_signals.sql 을 리대시(Athena 63)에서 실행 — 1회 약 591MB · $0.03, 같은 SQL은 rd.py 1시간 캐시
// 3) apply_ae_signals RPC로 반영: 신호 저장 + 미소방문 자가 견적 → 완료(WON, AM 이관) · 리드 등록 이후 충전 → E8. 앞으로만 움직이고 되돌리지 않는다
// 비밀 키를 쓰지 않는다(supabase CLI 로그인 · ~/.config/miso-redash). partner_name 은 콘솔에 저장하지 않는다(DB에서도 걸러냄)
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const dry = process.argv.includes('--dry');
const DATA = join(homedir(), 'miso-data');
const q = (sql) => JSON.parse(execFileSync('supabase', ['db', 'query', '--linked', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).rows;
const kst = (d = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(d);

const leads = q(`select partner_id, created_at from ae_leads where service_line = 'miso_visit' and partner_id is not null and stage <> 'WON'`);
if (!leads.length) { console.log('동기화할 리드 없음'); process.exit(0); }
const ids = [...new Set(leads.map((r) => r.partner_id))];
const since = kst(new Date(Math.min(...leads.map((r) => Date.parse(r.created_at))))).slice(0, 10);
const stamp = kst().replace(/[-: ]/g, (c) => (c === ' ' ? '-' : '')).slice(0, 13);
const out = join(DATA, 'data', `ae_lead_signals_${stamp}.csv`);
console.log(`리드 ${ids.length}명 · 충전 기준일 ${since} · 리대시 실행…`);
execFileSync('python3', ['scripts/run_sql.py', 'sql/ae_lead_signals.sql', `PARTNER_IDS=${ids.join(',')}`, `SINCE=${since}`, '--csv', out], { cwd: DATA, stdio: ['ignore', 'ignore', 'inherit'] });

// CSV → JSON (따옴표 필드 처리, 빈 값은 null, True/False → boolean, 숫자 → number, 시각은 KST 문자열 그대로 — DB kst_ts 가 +09로 해석)
function parseCsv(text) {
  const rows = []; let row = [], cur = '', inq = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inq) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') inq = false; else cur += c; }
    else if (c === '"') inq = true; else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur.replace(/\r$/, '')); rows.push(row); row = []; cur = ''; } else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const [h, ...body] = rows; const head = h.map((x) => x.replace(/^﻿/, ''));
  return body.filter((r) => r.length === head.length).map((r) => Object.fromEntries(head.map((k, i) => [k, r[i]])));
}
const val = (v) => (v === '' ? null : v === 'True' || v === 'true' ? true : v === 'False' || v === 'false' ? false : /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v);
const rows = parseCsv(readFileSync(out, 'utf8')).filter((r) => r.found !== 'False')
  .map((r) => { const o = Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'partner_name' && k !== 'found').map(([k, v]) => [k, val(v)])); return o; });
console.log(`리대시 ${rows.length}행 → ${out}`);
const preview = { self: rows.filter((r) => r.mv_self_quotes > 0).length, charged: rows.filter((r) => r.last_charge_at && Date.parse(r.last_charge_at.replace(' ', 'T') + ':00+09:00') > Date.parse(leads.find((l) => l.partner_id === r.partner_id)?.created_at || 0)).length };
console.log(`예상: 자가 견적 ${preview.self}명 → 완료 후보 · 리드 등록 이후 충전 ${preview.charged}명 → E8 후보`);
if (dry) { console.log('[dry] 반영하지 않음'); process.exit(0); }

const dir = mkdtempSync(join(tmpdir(), 'ae-sync-')); const tot = { updated: 0, changed: 0, won: 0, to_e8: 0 };
for (let i = 0; i < rows.length; i += 300) {
  const json = JSON.stringify(rows.slice(i, i + 300)).replace(/'/g, "''");
  const path = join(dir, `chunk_${i}.sql`); writeFileSync(path, `select apply_ae_signals('${json}'::jsonb, 'redash') as r;`);
  const res = JSON.parse(execFileSync('supabase', ['db', 'query', '--linked', '-f', path], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })).rows[0].r;
  const r = typeof res === 'string' ? JSON.parse(res) : res;
  for (const k of Object.keys(tot)) tot[k] += r[k] || 0;
}
console.log(`반영 완료 ${kst()}: 신호 갱신 ${tot.updated}명 · 변화 ${tot.changed}명 · 완료(WON) ${tot.won}명 · E8 이동 ${tot.to_e8}명`);
