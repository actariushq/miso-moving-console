// 미소방문 파트너 확보 리스트(CSV, ~/miso-data/output/미소방문_파트너확보리스트_*.csv) → import_ae_list RPC 행
// scripts/import_ae_targets_20261007-0710.mjs 와 같은 매핑. 전화번호·개인정보 칸은 없다

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []; let row: string[] = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur.replace(/\r$/, '')); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  if (!rows.length) return [];
  const [head, ...body] = rows; const h = head.map((x) => x.replace(/^﻿/, '').trim());
  return body.filter((r) => r.length === h.length).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i]])));
}

const num = (v?: string) => (v === '' || v == null ? null : Number(v));
// 리대시 신호 칸(sql/ae_lead_signals.sql 결과)이 같이 들어 있으면 단계 최신화에 쓴다
const SIGNAL_KEYS = ['mv_registered', 'mv_registered_at', 'mv_received_90d', 'mv_self_quotes', 'mv_first_self_quote_at', 'mv_last_self_quote_at', 'mv_admin_quotes',
  'credit_balance', 'first_charge_at', 'last_charge_at', 'charge_count', 'reviews', 'real_reviews', 'rating', 'moving_last_quote_at'];

export function toListRow(r: Record<string, string>) {
  const districts = (r['커버_활성구'] || '').split(',').map((s) => s.trim()).filter(Boolean);
  const tierLabel = r['지역티어'] || '';
  const focus = (tierLabel.startsWith('1') ? r['인천·부천_커버구'] : tierLabel.startsWith('2') ? r['인접_커버구'] : '')?.split(',').map((s) => s.trim()).filter(Boolean)[0];
  const first = focus || districts[0];
  const region = first ? `${first}${districts.length > 1 ? ` 외 ${districts.length - 1}` : ''}` : null;
  const insight = {
    tier_label: tierLabel || null, reasons: r['추천근거'] || null,
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
  // 리대시 신호 CSV(partner_id 칸)는 이름·found 를 뺀 모든 칸, 리스트 CSV는 아는 신호 칸만
  const keys = '파트너명' in r ? SIGNAL_KEYS.filter((k) => k in r) : Object.keys(r).filter((k) => !['partner_id', 'partner_name', 'found'].includes(k));
  const sig = Object.fromEntries(keys.map((k) => [k, r[k] === '' ? null : /^(true|false)$/i.test(r[k]) ? r[k].toLowerCase() === 'true' : /^-?\d+(\.\d+)?$/.test(r[k]) ? Number(r[k]) : r[k]]));
  return {
    partner_id: num(r['파트너ID'] ?? r['partner_id']), name: r['파트너명'] || r['name'] || '', region,
    priority_rank: num(r['우선순위']), grade: r['우선등급'] || null, score: num(r['점수']), region_tier: tierLabel ? tierLabel[0] : null,
    insight, signals: Object.keys(sig).length ? sig : null,
  };
}

// 파일명 끝의 _YYYYMMDD-HHMM 을 버전으로 쓴다
export const versionFromName = (name: string) => name.match(/(\d{8}-\d{4})/)?.[1] || '';
