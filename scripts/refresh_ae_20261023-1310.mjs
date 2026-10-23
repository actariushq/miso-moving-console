// AE 리스트 한 번에 최신화 (맥에서 실행 — 리대시는 AWS VPN 안에서만 열림). 바탕화면 'AE 리스트 갱신.app'이 이걸 부른다
// 사용: node scripts/refresh_ae_20261023-1310.mjs [--no-list] [--dry]
// 1) 미소방문 권역(sql/mv_regions.sql) → sync_mv_regions   — 담당자가 고친 권역(manual)은 그대로
// 2) 파트너 확보 리스트 재추출(sql/mv_concierge_conversion_targets.sql + partner_large_move_experience.sql → build_mv_targets.py)
//    → import_ae_list(전체 리스트) — 기존 리드는 지표·단계만, 새 파트너만 E0 추가 (--no-list 면 건너뜀)
// 3) 리드 커버리지·최근 30일 견적 참여(sql/ae_lead_coverage.sql) → apply_ae_coverage — 액티브/이탈 · 권역 라벨
// 4) 리대시 신호(scripts/sync_ae_signals_20261007-0731.mjs) → apply_ae_signals — 자가 견적 → WON, 충전 → E8
// 비밀 키를 쓰지 않는다(supabase CLI 로그인 · ~/.config/miso-redash). 전화번호·개인정보는 다루지 않는다. 1회 리대시 비용 약 $0.05
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parseCsvReport, toListRow } from '../lib/aeList.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(homedir(), 'miso-data');
const dry = process.argv.includes('--dry'); const noList = process.argv.includes('--no-list');
const kst = (d = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(d);
const TS = kst().replace(/-/g, '').replace(' ', '-').replace(':', '');           // 20261023-1310
const tmp = mkdtempSync(join(tmpdir(), 'ae-refresh-'));
const log = (m) => console.log(`[${kst().slice(11)}] ${m}`);

const db = (sql) => {                                                            // supabase CLI (link 된 운영 DB)
  const f = join(tmp, `q${Math.random().toString(36).slice(2)}.sql`); writeFileSync(f, sql);
  const out = execFileSync('npx', ['supabase', 'db', 'query', '--linked', '-f', f], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 });
  return JSON.parse(out.slice(out.indexOf('{'))).rows;
};
const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;
const athena = (sqlFile, params, out) => {
  execFileSync('python3', ['scripts/run_sql.py', sqlFile, ...params, '--fresh', '--csv', out], { cwd: DATA, stdio: ['ignore', 'ignore', 'inherit'] });
  return parseCsvReport(readFileSync(out, 'utf8')).rows;
};
const call = (fn, args) => (dry ? { dry: true } : Object.values(db(`select ${fn}(${args}) r`)[0])[0]);
mkdirp(join(DATA, 'data', 'ae_refresh'));
function mkdirp(p) { if (!existsSync(p)) execFileSync('mkdir', ['-p', p]); }
const OUT = (n) => join(DATA, 'data', 'ae_refresh', `${n}_${TS}.csv`);

// 1) 권역
log('1/4 미소방문 권역 조회…');
const regions = athena('sql/mv_regions.sql', [], OUT('mv_regions'));
const r1 = call('sync_mv_regions', `${lit(JSON.stringify(regions.map((r) => ({ district: r.district, province: r.province, req_30d: Number(r.req_30d) || 0, official: r.official || null }))))}::jsonb`);
log(`   권역 ${regions.length}개 구 → ${JSON.stringify(r1)}`);

// 2) 파트너 확보 리스트
if (!noList) {
  log('2/4 파트너 확보 리스트 재추출…');
  const tgt = join(DATA, 'data', 'targets', `mv_conversion_targets_selfsubmit_${TS}.csv`);
  const large = join(DATA, 'data', 'targets', `partner_large_move_${TS}.csv`);
  const since = kst(new Date(Date.now() - 365 * 864e5)).slice(0, 10);
  athena('sql/mv_concierge_conversion_targets.sql', [], tgt);
  athena('sql/partner_large_move_experience.sql', [`SINCE=${since}`], large);
  const xlsx = join(DATA, 'output', `미소방문_파트너확보리스트_${TS}.xlsx`);
  execFileSync('python3', ['scripts/build_mv_targets.py', tgt, xlsx, kst().slice(0, 10), large], { cwd: DATA, stdio: ['ignore', 'ignore', 'inherit'] });
  const { rows } = parseCsvReport(readFileSync(xlsx.replace(/\.xlsx$/, '.csv'), 'utf8'));
  const list = rows.map(toListRow).filter((r) => r.partner_id && r.name);
  const tot = { updated: 0, inserted: 0 }; let notIn = 0;
  for (let i = 0; i < list.length; i += 300) {
    const res = call('import_ae_list', `${lit(JSON.stringify(list.slice(i, i + 300)))}::jsonb, ${lit(TS)}, true`);
    tot.updated += res.updated || 0; tot.inserted += res.inserted || 0; notIn = res.not_in_list ?? notIn;
  }
  log(`   리스트 ${list.length}명 → 최신화 ${tot.updated} · 신규 ${tot.inserted} · 이번 리스트에 없는 진행 중 리드 ${notIn}(지우지 않음)`);
} else log('2/4 리스트 재추출 건너뜀(--no-list)');

// 3) 커버리지 · 견적 참여 (액티브 = 최근 30일 전체 서비스 견적 제출 1건 이상)
log('3/4 리드 커버리지 · 최근 30일 견적 참여 조회…');
const ids = [...new Set(db(`select partner_id from ae_leads where service_line = 'miso_visit' and partner_id is not null`).map((r) => r.partner_id))];
const cov = athena('sql/ae_lead_coverage.sql', [`PARTNER_IDS=${ids.join(',')}`], OUT('ae_lead_coverage'));
let n3 = 0;
for (let i = 0; i < cov.length; i += 400) {
  const chunk = cov.slice(i, i + 400).map((r) => ({ partner_id: Number(r.partner_id), coverage_districts: r.coverage_districts || '', moving_quotes_30d: Number(r.moving_quotes_30d) || 0, all_quotes_30d: Number(r.all_quotes_30d) || 0, last_submit_at: r.last_submit_at || '' }));
  n3 += call('apply_ae_coverage', `${lit(JSON.stringify(chunk))}::jsonb`).updated || 0;
}
log(`   리드 ${ids.length}명 중 ${n3}명 반영`);

// 4) 신호 (자가 견적 → WON, 충전 → E8)
log('4/4 리대시 신호 동기화…');
if (!dry) execFileSync('node', ['scripts/sync_ae_signals_20261007-0731.mjs'], { cwd: ROOT, stdio: 'inherit' });
const sum = dry ? [] : db(`select count(*) filter (where mv_in) mv_in, count(*) filter (where mv_in = false) mv_out, count(*) filter (where active_30d) active, count(*) filter (where active_30d = false) churn from v_ae_board where service_line = 'miso_visit' and stage not in ('WON','LOST')`);
log(`완료 ${JSON.stringify(sum[0] || {})}`);
