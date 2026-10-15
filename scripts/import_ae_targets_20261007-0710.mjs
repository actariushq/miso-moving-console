// 미소방문 파트너 확보 리스트(CSV) → ae_leads 가져오기
// 사용: node scripts/import_ae_targets_20261007-0710.mjs <리스트.csv> <리스트버전> [--limit N] [--dry]
//   예: node scripts/import_ae_targets_20261007-0710.mjs ~/miso-data/output/미소방문_파트너확보리스트_20261007-0656.csv 20261007-0656
// - 원본: ~/miso-data (Redash 추출 → scripts/build_mv_targets.py). 전화번호·개인정보는 없다
// - service_line=miso_visit, source=cross_sell(가정이사 파트너 → 미소방문), stage=E0, 담당 미배정으로 넣는다
// - 같은 파트너ID+서비스가 이미 있으면 단계·담당·팔로업은 건드리지 않고 우선순위·등급·지표만 갱신한다 (재실행해도 '등록' 이력이 중복되지 않음)
// - 실행: supabase CLI(로그인·link 필요) `supabase db query --linked -f` — 비밀 키를 쓰지 않는다
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const [file, version, ...rest] = process.argv.slice(2);
if (!file || !version) { console.error('사용: node import_ae_targets.mjs <csv> <버전> [--limit N] [--dry]'); process.exit(1); }
const limit = rest.includes('--limit') ? Number(rest[rest.indexOf('--limit') + 1]) : Infinity;
const dry = rest.includes('--dry');

// CSV (따옴표·쉼표 포함 필드 처리)
function parseCsv(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur.replace(/\r$/, '')); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const [head, ...body] = rows; const h = head.map((x) => x.replace(/^﻿/, ''));
  return body.filter((r) => r.length === h.length).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i]])));
}

const num = (v) => (v === '' || v == null ? null : Number(v));
const lit = (v) => (v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const rows = parseCsv(readFileSync(file, 'utf8')).slice(0, limit);

const values = rows.map((r) => {
  const districts = (r['커버_활성구'] || '').split(',').map((s) => s.trim()).filter(Boolean);
  const tierLabel = r['지역티어'];                       // "1 인천·부천" 등
  // 지역 표시: 1티어는 인천·부천, 2티어는 인접 구를 먼저 보여 준다
  const focus = ((tierLabel || '').startsWith('1') ? r['인천·부천_커버구'] : (tierLabel || '').startsWith('2') ? r['인접_커버구'] : '')?.split(',').map((s) => s.trim()).filter(Boolean)[0];
  const first = focus || districts[0];
  const region = first ? `${first}${districts.length > 1 ? ` 외 ${districts.length - 1}` : ''}` : null;
  const insight = {
    tier_label: tierLabel, reasons: r['추천근거'],
    incheon: r['인천커버'] === 'Y', bucheon: r['부천커버'] === 'Y',
    incheon_bucheon_districts: r['인천·부천_커버구'] || null, adjacent_districts: r['인접_커버구'] || null,
    covered_active_districts: districts, mv_requests_30d_in_coverage: num(r['커버구_미소방문요청_30일']),
    last_moving_quote: r['가정이사_마지막견적일'] || null, last_small_moving_quote: r['소형이사_마지막견적일'] || null,
    moving_quotes_30d: num(r['가정이사_견적수_30일']), moving_quotes_90d: num(r['가정이사_견적수_90일']), moving_quotes_all: num(r['가정이사_견적수_누적']),
    auto_quote_share_90d: num(r['가정이사_자동견적비중_90일']), moving_contracts_365d: num(r['가정이사_계약수_365일']), moving_contracts_all: num(r['가정이사_계약수_누적']),
    small_moving_quotes_90d: num(r['소형이사_견적수_90일']),
    reviews: num(r['리뷰수']), real_reviews: num(r['실고객리뷰수']), rating: num(r['평점']),
    mv_registered: r['미소방문_서비스등록'] === 'True', mv_received_not_submitted: num(r['미소방문_받고미제출_건수']),
    mv_received_not_submitted_last: r['미소방문_받고미제출_마지막일'] || null, mv_admin_quotes: num(r['미소방문_어드민대리_건수']),
    large_move_quotes_1y: num(r['대형이사_견적_1년']), large_move_contracts_1y: num(r['대형이사_계약_1년']), xlarge_move_quotes_1y: num(r['36평이상_견적_1년']),
    partner_tier: r['파트너티어'] || null, verified: r['인증'] === 'True', credit: num(r['크레딧잔액']), joined: r['가입일'] || null,
  };
  return `(${num(r['파트너ID'])}::bigint, ${lit(r['파트너명'])}, ${lit(region)}, ${num(r['우선순위'])}::int, ${lit(r['우선등급'])}, ${num(r['점수'])}::int, ${lit(tierLabel?.[0])}, ${lit(JSON.stringify(insight))}::jsonb, ${lit(version)})`;
});

const dir = mkdtempSync(join(tmpdir(), 'ae-import-'));
let done = 0;
for (let i = 0; i < values.length; i += 150) {
  const chunk = values.slice(i, i + 150);
  // 이미 있는 리드는 UPDATE(단계·담당·팔로업 유지), 없는 리드만 INSERT.
  // INSERT … ON CONFLICT 를 쓰면 BEFORE INSERT 트리거가 '등록' 이력을 중복으로 남기므로 쓰지 않는다
  const sql = `with v(partner_id, name, region, priority_rank, grade, score, region_tier, insight, list_version) as (values
${chunk.join(',\n')}
), upd as (
  update ae_leads l set name = v.name, priority_rank = v.priority_rank, grade = v.grade, score = v.score,
    region_tier = v.region_tier, insight = v.insight, list_version = v.list_version,
    region = case when l.list_version is not null then v.region else l.region end
  from v where l.partner_id = v.partner_id and l.service_line = 'miso_visit'
  returning l.id
)
insert into ae_leads (partner_id, name, region, service_line, source, priority_rank, grade, score, region_tier, insight, list_version)
select v.partner_id, v.name, v.region, 'miso_visit', 'cross_sell', v.priority_rank, v.grade, v.score, v.region_tier, v.insight, v.list_version
from v where not exists (select 1 from ae_leads l where l.partner_id = v.partner_id and l.service_line = 'miso_visit');`;
  const path = join(dir, `chunk_${i}.sql`); writeFileSync(path, sql);
  if (dry) { console.log(`[dry] ${chunk.length}행 → ${path}`); continue; }
  execFileSync('supabase', ['db', 'query', '--linked', '-f', path], { stdio: ['ignore', 'ignore', 'inherit'] });
  done += chunk.length; console.log(`${done}/${values.length}행 반영`);
}
console.log(dry ? '예행 완료' : `완료: ${done}행 (버전 ${version})`);
