// 공통 사전·포맷 (시안 prototype_v0.2 기준)
export const TZ = 'Asia/Seoul';

export const NEW_STAGES = [
  { c: 'N0', t: '첫 충전 · 배정', d: '충전 24h 내 웰컴콜', sla: 1 },
  { c: 'N1', t: '프로필·리뷰 세팅', d: '체크리스트 5개 완료', sla: 3 },
  { c: 'N2', t: '첫 견적 대기', d: '견적 1건 제출 시 이동', sla: 7 },
  { c: 'N3', t: '제출 · 미성사', d: '미성사 피드백 · 격려', sla: 14 },
  { c: 'N4', t: '첫 계약 성공', d: '첫 이사 완료 시 이동', sla: 10 },
  { c: 'N5', t: '첫 리뷰 확보', d: '리뷰 1건 + 평점 4.5↑', sla: 7 },
];
export const ACTIVE_STAGES = [
  { c: 'A1', t: '캐파 미파악' }, { c: 'A2', t: '캐파 파악 완료' }, { c: 'A3', t: '투입 확대 중' },
  { c: 'A4', t: '핵심 파트너' }, { c: 'A_RISK', t: '이탈 위험' },
];
export const BOOK_STAGES = [
  { c: 'B0', t: '견적 수집 중', d: '방문 완료, 파트너 견적 대기' },
  { c: 'B1', t: '콜 대상', d: '노출 견적 있음 · 고객 미확정' },
  { c: 'B2', t: '통화 · 고민 중', d: '재통화 예약 필수' },
  { c: 'B3', t: '부재', d: '부재 정책으로 자동 재시도' },
  { c: 'B4_WON', t: '계약 확정', d: '' }, { c: 'BX_LOST', t: '이탈', d: '' }, { c: 'B_EXPIRED', t: '기한 만료', d: 'D+5 경과' },
];
export const AE_STAGES = [
  { c: 'E0', t: '미컨택', d: '리스트 등록, 아직 콜 전' },
  { c: 'E1', t: '시도중', d: '부재 · 재시도' },
  { c: 'E2', t: '연결', d: '통화됨 · 관심 확인 전(보류)' },
  { c: 'E3', t: '관심있음', d: '진행 의사 확인' },
  { c: 'E4', t: '서류', d: '서류 안내 · 독촉' },
  { c: 'E5', t: '프로필작업', d: '사진 · 소개문 · 서비스 세팅' },
  { c: 'E6', t: '리뷰작업', d: '기존 리뷰 이관 · 리뷰 확보' },
  { c: 'E7', t: '충전대기', d: '세팅 완료, 첫 충전 전' },
  { c: 'E8', t: '첫견적제출', d: '충전 완료 · 첫 견적 유도' },
  { c: 'WON', t: '완료', d: '첫 견적 제출 → AM 이관' },
  { c: 'LOST', t: '이탈', d: '실패 · 결번 · 거부 · 부재 5회' },
];
export const AE_OPEN = AE_STAGES.filter((s) => !['WON', 'LOST'].includes(s.c)).map((s) => s.c);
export const aeRank = (c: string) => ['E0', 'E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8', 'WON'].indexOf(c);
export const rfqAdminUrl = (partnerId?: number | null) => (partnerId ? `https://rfq-admin.miso.kr/partners/${partnerId}` : null);
export const LINE_L: Record<string, string> = { miso_visit: '미소방문', visit_quote: 'RFQ' };
// 미소방문 파트너 확보 리스트 (miso-data): 등급 = 백테스트 검증 전환 가능성, 지역 티어 1 = 인천·부천 커버
export const GRADE_CLS: Record<string, string> = { A: 'solid', B: 'mv', C: '', D: '' };
export const TIER_L: Record<string, string> = { '1': '인천·부천', '2': '인접', '3': '기타' };
export const SOURCE_L: Record<string, string> = { nurtured: '너처링', churned: '이탈 재활성', inbound: '인바운드', cross_sell: '교차판매', outbound: '아웃바운드' };
const ALL = [...AE_STAGES, ...NEW_STAGES, ...ACTIVE_STAGES, ...BOOK_STAGES, { c: 'N_RISK', t: '정착 위험' }, { c: 'N_CHURN', t: '이탈' }];
export const stageLabel = (c: string) => (ALL.find((s) => s.c === c) || { t: c }).t;
export const CLOSED = ['LOST', 'WON', 'N_CHURN', 'BX_LOST', 'B4_WON', 'B_EXPIRED'];

export const CONNECT: [string, string][] = [['connected', '연결됨'], ['absent', '부재중'], ['dead', '결번·없는 번호'], ['refuse', '수신 거부'], ['etc', '기타']];
export const CONNECT_L: Record<string, string> = { connected: '연결됨', absent: '부재중', dead: '결번', refuse: '수신 거부', etc: '기타' };
export const RESULT_L: Record<string, string> = { go: '진행', hold: '보류', fail: '실패' };
export const MOD_L: Record<string, string> = { am_new: '신규 정착', am_active: '캐파 확대', booking: '예약콜', ae: 'AE 온보딩', am_care: 'AM 관리 대상' };
export const AM_STATE: Record<string, string> = { A: '순항 중', B: '연결 실패', C: '참여 중 · 성과 없음', D: '참여 끊김', E: '잔액 소진 임박' };
export const VOC_TAGS = ['가격경쟁 심함', '요청 품질 불신', '앱·절차 어려움', '정산·환불 불만', '물량 부족', '기타'];
export const RX_CODES = ['견적가 조정', '프로필 완성', '재참여 유도', '환불 대행', '재충전 대화', '방문 준비 지원', '기대치 맞추기', '기타'];
export const HESIT = ['가격 높음', '견적 편차 큼', '파트너 신뢰', '날짜 미정', '가족 상의', '타사 비교 중'];
export const PURPOSE: Record<string, string[]> = {
  am_new: ['웰컴콜', '세팅 안내', '견적 독려', '미성사 피드백', '축하 · 리뷰 요청', '재케어'],
  am_active: ['주간 투입 점검', '캐파 인터뷰', '수동매칭', '1초견적 업셀', '클레임 지원', '재케어'],
  booking: ['1차 예약콜', '재통화', '확정 확인', '이탈 사유 확인'],
  am_care: ['참여 중단 확인', '휴면 재활성화', '무계약 코칭', '참여 급감 확인', '저계약률 코칭', '근황 확인', '재시도 콜'],
  ae: ['확인 콜', '재시도 콜', '가입 안내', '서류 안내', '서류 독촉', '프로필 작업', '리뷰 작업', '충전 안내', '첫 견적 독려'],
};
export const CHECK: [string, string][] = [['profile_photo', '프로필 사진'], ['intro', '소개문 · 포함 서비스'], ['reviews_migrated', '기존 리뷰 이관'], ['instant_quote', '1초견적 설정'], ['regions_days', '가능 지역 · 일자 파악']];
export const NOTE_KIND: Record<string, string> = { special: '특이', claim: '클레임', promise: '약속', caution: '주의', correction: '정정' };

// 날짜 (KST)
const parts = (d: Date) => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' }).formatToParts(d).map((p) => [p.type, p.value]));
export const ymd = (v: string | Date) => { const p = parts(new Date(v)); return `${p.year}-${p.month}-${p.day}`; };
export const fmtD = (v?: string | Date | null) => { if (!v) return '–'; const p = parts(new Date(v)); return `${+p.month}/${p.day}`; };
export const fmtDT = (v?: string | Date | null) => { if (!v) return '–'; const p = parts(new Date(v)); return `${+p.month}/${p.day} ${p.hour === '24' ? '00' : p.hour}:${p.minute}`; };
// 상대 시각: 오늘 15:41 · 내일 10:00 · 어제 09:41 · 10/9(목) 10:00
const DOW_K = ['월', '화', '수', '목', '금', '토', '일'];
export const relTime = (v?: string | Date | null) => {
  if (!v) return '–'; const d = new Date(v); const p = parts(d); const hm = `${p.hour === '24' ? '00' : p.hour}:${p.minute}`;
  const n = Math.round((Date.parse(ymd(d)) - Date.parse(ymd(new Date()))) / 864e5);
  return `${n === 0 ? '오늘' : n === 1 ? '내일' : n === -1 ? '어제' : `${+p.month}/${+p.day}(${DOW_K[kstDow(d)]})`} ${hm}`;
};
export const sinceDay = (v?: string | Date | null) => { const n = dayDiff(v); return n <= 0 ? '오늘부터' : `${n}일째`; };
export const kstHour = (v: string | Date) => +parts(new Date(v)).hour % 24;
export const kstDow = (v: string | Date) => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts(new Date(v)).weekday);
export const dayDiff = (v?: string | Date | null) => { if (!v) return 0; return Math.round((Date.parse(ymd(new Date())) - Date.parse(ymd(v))) / 864e5); };
export const endOfToday = () => new Date(Date.parse(ymd(new Date()) + 'T23:59:59+09:00'));
export const won = (n?: number | null) => (n == null ? '–' : (n / 10000).toLocaleString('ko-KR', { maximumFractionDigits: 1 }) + '만');
export const toLocalInput = (d: Date) => { const p = parts(d); return `${p.year}-${p.month}-${p.day}T${p.hour === '24' ? '00' : p.hour}:${p.minute}`; };
export const fromLocalInput = (s: string) => new Date(s + ':00+09:00'); // 입력값은 KST로 해석

export const outcomeText = (e: { connect?: string | null; result?: string | null; reason?: string | null }) =>
  !e.connect ? '' : e.connect !== 'connected' ? CONNECT_L[e.connect] : (RESULT_L[e.result || ''] || '연결') + (e.reason ? ': ' + e.reason : '');
export const outcomeCls = (e: { connect?: string | null; result?: string | null }) =>
  e.connect === 'connected' ? (e.result === 'fail' ? 'fail' : 'connected') : e.connect || '';

export const slaState = (stage: string, since: string) => {
  const s = NEW_STAGES.find((x) => x.c === stage); if (!s) return '';
  const d = dayDiff(since); return d > s.sla ? 'sla-bad' : d >= Math.ceil(s.sla * 0.7) ? 'sla-warn' : '';
};
export const modOfPartner = (track: string) => (track === 'active' ? 'am_active' : 'am_new');

// ───────── AE 콜 우선순위 · 라벨 ─────────
// 자동 우선순위 (manual_priority 가 있으면 그것을 쓴다)
//  P1 지금 걸기: A등급 · B등급 중 인천·부천/인접 · 인바운드
//  P2: B등급(기타 지역) · C등급 중 1·2티어 또는 '요청 받고 미제출'
//  P3: 나머지 C · D등급 중 강한 신호(미제출 이력 · 대형 이사 · 크레딧 보유)
//  P4: 나머지
export const AE_PRIO: Record<number, { t: string; cls: string }> = { 1: { t: 'P1 지금 걸기', cls: 'p1' }, 2: { t: 'P2', cls: 'p2' }, 3: { t: 'P3', cls: 'p3' }, 4: { t: 'P4', cls: 'p4' } };
// 리대시 신호 시각은 KST 'YYYY-MM-DD HH:MM' 문자열
export const sigDate = (v?: string | null) => (!v ? null : /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(v) ? new Date(v.replace(' ', 'T') + ':00+09:00') : new Date(v));
export function aeAutoPriority(r: any): number {
  const i = r.insight || {}; const s = r.signals || {}; const near = r.region_tier === '1' || r.region_tier === '2';
  const unsub = (+i.mv_received_not_submitted || 0) > 0; const large = (+i.large_move_quotes_1y || 0) >= 10;
  const credit = (+(s.credit_balance ?? i.credit) || 0) > 0; const seen = (+s.mv_received_90d || 0) > 0; // 최근 90일 미소방문 요청을 앱에서 열어 봄
  let p = !r.grade ? (r.source === 'inbound' ? 1 : 2)
    : r.grade === 'A' || (r.grade === 'B' && near) ? 1
    : r.grade === 'B' || (r.grade === 'C' && (near || unsub)) ? 2
    : r.grade === 'C' || unsub || large || credit ? 3 : 4;
  if (seen) p = Math.min(p, near ? 1 : 2);
  return p;
}
export const aePriority = (r: any): number => r.manual_priority || aeAutoPriority(r);

// 자동 라벨: 리스트 지표(insight) + 리대시 최신 신호(signals). tone = 칩 색
export type AeLabel = { k: string; t: string; tone?: 'ok' | 'warn' | 'bad' | 'mv' | '' };
export function aeLabels(r: any): AeLabel[] {
  const i = r.insight || {}; const s = r.signals || {}; const out: AeLabel[] = [];
  const days = (d?: string | null) => { const x = sigDate(d); return x && !isNaN(+x) ? Math.round((Date.now() - +x) / 864e5) : null; };
  if ((+s.mv_received_90d || 0) > 0) out.push({ k: 'seen', t: `미소방문 요청 봄 ${s.mv_received_90d}건(90일)`, tone: 'warn' });
  if ((+i.mv_received_not_submitted || 0) > 0) out.push({ k: 'unsub', t: `요청 받고 미제출 ${i.mv_received_not_submitted}`, tone: 'warn' });
  const rec = days(s.moving_last_quote_at || i.last_moving_quote);
  // 액티브/이탈은 리스트의 상태 표시(StatusPills)가 맡는다 — 커버리지 동기화 전 리드만 옛 라벨로
  if (r.active_30d == null && rec != null && rec <= 30) out.push({ k: 'active', t: '최근 30일 견적 활발', tone: 'ok' });
  else if (rec != null && rec > 365) out.push({ k: 'dormant', t: '1년+ 휴면', tone: '' });
  if ((+i.large_move_quotes_1y || 0) >= 10) out.push({ k: 'large', t: '대형 이사', tone: 'ok' });
  if (s.mv_onboarding_status === 'Onboarded') out.push({ k: 'reg', t: '미소방문 온보딩됨', tone: 'mv' });
  else if (s.mv_registered ?? i.mv_registered) out.push({ k: 'reg', t: `미소방문 등록${s.mv_onboarding_status ? ' · ' + s.mv_onboarding_status : ''}`, tone: 'mv' });
  if (s.doc_business_status === 'submitted') out.push({ k: 'doc', t: '사업자 서류 승인 대기', tone: 'warn' });
  else if (s.doc_business_status == null && 'doc_business_status' in s) out.push({ k: 'nodoc', t: '사업자 서류 없음', tone: '' });
  if ((+(s.credit_balance ?? i.credit) || 0) > 0) out.push({ k: 'credit', t: `크레딧 ${Math.round((+(s.credit_balance ?? i.credit)) / 1000)}천`, tone: 'mv' });
  const ch = days(s.last_charge_at); if (ch != null && ch <= 90) out.push({ k: 'charge90', t: '최근 90일 충전', tone: 'ok' });
  if (s.mv_registered && !i.mv_registered) out.push({ k: 'newreg', t: '리스트 이후 등록', tone: 'ok' });
  return out;
}
export const AE_LABEL_FILTERS: [string, string][] = [['seen', '미소방문 요청 봄(90일)'], ['unsub', '요청 받고 미제출'], ['active', '최근 30일 활발'], ['large', '대형 이사'], ['reg', '미소방문 등록'],
  ['doc', '서류 승인 대기'], ['nodoc', '사업자 서류 없음'], ['credit', '크레딧 보유'], ['charge90', '최근 90일 충전'], ['dormant', '1년+ 휴면']];
// 담당자가 붙이는 라벨 (자유 입력도 가능)
export const AE_TAG_PRESETS = ['관심 높음', '사장님 직접', '실무자 따로', '오전 통화', '오후 통화', '문자 선호', '가격 민감', '타 플랫폼 활발', '재통화 요청'];

// ───────── 단계별 남은 일 (리대시 신호로 자동 체크) ─────────
// 기준은 [제안] — 운영하면서 조정. 신호가 없으면(동기화 전) 확인 불가로 표시
export type CheckItem = { t: string; ok: boolean | null };
export function aeChecklist(r: any): { c: string; t: string; items: CheckItem[] }[] {
  const s = r.signals; const has = (k: string) => !!s && k in s;
  const v = (k: string, f: (x: any) => boolean): boolean | null => (has(k) ? f(s[k]) : null);
  return [
    { c: 'E4', t: '서류', items: [{ t: '사업자 서류 승인', ok: v('doc_business_status', (x) => x === 'verified') }, { t: '신분증 승인', ok: v('doc_idcard_status', (x) => x === 'verified') }] },
    { c: 'E5', t: '프로필', items: [{ t: '미소방문 서비스 등록', ok: v('mv_registered', (x) => x === true) }, { t: '프로필 사진', ok: v('has_profile_photo', (x) => x === true) },
      { t: '사진 5장 이상', ok: v('photo_count', (x) => +x >= 5) }, { t: '소개문 100자 이상', ok: v('description_len', (x) => +x >= 100) }] },
    { c: 'E6', t: '리뷰', items: [{ t: '실고객 리뷰 5개 이상', ok: v('real_reviews', (x) => +x >= 5) }, { t: '평점 4.5 이상', ok: v('rating', (x) => +x >= 4.5) }] },
    { c: 'E7', t: '충전', items: [{ t: '크레딧 잔액 있음', ok: v('credit_balance', (x) => +x > 0) }] },
    { c: 'E8', t: '첫 견적', items: [{ t: '미소방문 요청 봄', ok: v('mv_received_90d', (x) => +x > 0) }, { t: '미소방문 견적 제출', ok: v('mv_self_quotes', (x) => +x > 0) }] },
  ];
}
// 지금 단계의 일이 다 끝났으면 다음 단계를 제안 (자동 이동은 하지 않음)
export function aeNextSuggestion(r: any): string | null {
  const g = aeChecklist(r).find((x) => x.c === r.stage); if (!g || g.c === 'E8') return null;
  return g.items.every((i) => i.ok === true) ? `E${+g.c.slice(1) + 1}` : null;
}

// ───────── 통화 첫마디: 왜 지금 이 파트너에게 전화하나 ─────────
export function aeOpener(r: any): { facts: string[]; line: string } {
  const i = r.insight || {}; const s = r.signals || {}; const f: string[] = [];
  const md = (v?: string | null) => { const d = sigDate(v); return d && !isNaN(+d) ? `${d.getMonth() + 1}/${d.getDate()}` : null; };
  if (r.signal_change && r.signal_change_at && Date.now() - Date.parse(r.signal_change_at) < 7 * 864e5) f.push(`최근 변화: ${r.signal_change}`);
  if (+s.mv_received_90d > 0) f.push(`미소방문 요청 ${s.mv_received_90d}건 봄${md(s.mv_last_seen_at) ? ` (마지막 ${md(s.mv_last_seen_at)})` : ''} · 견적 0건`);
  else if (+i.mv_received_not_submitted > 0) f.push(`예전에 미소방문 요청 ${i.mv_received_not_submitted}건 받고 미제출`);
  if (+(s.moving_quotes_90d ?? i.moving_quotes_90d) > 0) f.push(`가정이사 90일 견적 ${s.moving_quotes_90d ?? i.moving_quotes_90d}건`);
  if (+i.large_move_quotes_1y >= 10) f.push(`대형 이사(26평+) 견적 ${i.large_move_quotes_1y}건/1년`);
  if (+s.credit_balance > 0) f.push(`크레딧 ${won(+s.credit_balance)}원 남음`);
  if (s.doc_business_status === 'submitted') f.push('사업자 서류 승인 대기 중');
  const line =
    r.stage === 'E8' ? '충전하셨으니, 이번 주 들어오는 미소방문 요청에 첫 견적 내는 것까지 같이 볼게요.'
    : r.stage === 'E7' ? '세팅은 끝났어요. 충전만 하시면 바로 미소방문 요청을 받아 견적을 내실 수 있어요.'
    : r.stage === 'E6' ? '기존 고객 리뷰를 옮겨 오면 미소방문 고객이 고를 때 훨씬 유리해요.'
    : r.stage === 'E5' ? '프로필 사진과 소개만 채우면 미소방문 고객에게 보이기 시작해요.'
    : r.stage === 'E4' ? '서류만 승인되면 다음 단계로 바로 넘어가요.'
    : +s.mv_received_90d > 0 ? '최근 미소방문 요청 보셨죠? 왜 견적은 안 내셨는지, 어떤 점이 걸리셨는지 여쭤봐도 될까요?'
    : +(s.moving_quotes_90d ?? i.moving_quotes_90d) > 0 ? '가정이사로 꾸준히 견적 내고 계신데, 플래너가 미리 방문해 둔 미소방문 요청도 받아 보실 수 있어요.'
    : '미소방문은 플래너가 먼저 방문해 짐을 확인한 요청이라, 견적이 빗나갈 일이 적어요.';
  return { facts: f.slice(0, 4), line };
}

// ───────── AE 콜 포인트 · 통화 상대 · 우려 사항 (콜 기록용) ─────────
const AE_POINTS: Record<string, string[]> = {
  E0: ['업체 · 담당자 확인', '미소방문 소개 (플래너가 먼저 방문한 요청)', '견적 참여 방식 · 비용 안내', '관심 여부 확인'],
  E1: ['업체 · 담당자 확인', '미소방문 소개 (플래너가 먼저 방문한 요청)', '관심 여부 확인'],
  E2: ['지난 통화 이어서', '관심 확인', '가입 · 서류 안내'],
  E3: ['가입 절차 안내', '필요 서류 안내', '서류 제출 날짜 약속'],
  E4: ['서류 제출 확인', '반려 · 보완 안내'],
  E5: ['프로필 사진 · 소개문 안내', '미소방문 서비스 등록'],
  E6: ['기존 리뷰 옮기기 안내', '리뷰 요청 방법'],
  E7: ['충전 금액 · 방법 안내', '충전 날짜 약속'],
  E8: ['첫 요청 알림 확인', '견적 작성 요령', '첫 견적 제출 약속'],
};
export function aeCallPoints(r: any): string[] {
  const s = r.signals || {}; const i = r.insight || {}; const out = [...(AE_POINTS[r.stage] || [])];
  if (+s.mv_received_90d > 0) out.push('본 요청에 견적 안 낸 이유 묻기');
  if (+i.large_move_quotes_1y >= 10) out.push('대형 이사 경험 강점으로 안내');
  if (s.doc_business_status === 'submitted') out.push('사업자 서류 승인 대기 안내');
  if (+s.credit_balance > 0) out.push('남은 크레딧으로 바로 시작 가능');
  return [...new Set(out)];
}
export const COUNTERPART = ['대표', '실무 담당', '가족 · 직원', '모름'];
export const AE_CONCERNS = ['수수료 · 참여비 부담', '요청이 적어 보임', '지역이 안 맞음', '일정이 바쁨', '앱 · 절차 어려움', '방문견적 방식이 낯섦', '타 플랫폼으로 충분', '기타'];
// AE 결과 버튼: 무엇으로 넘어가는지 드러나게
export const AE_RESULT: [string, string][] = [['go', '관심 있음'], ['hold', '연결됨 · 재통화'], ['fail', '관심 없음 · 실패']];

// ───────── AM 관리 대상(파트너 케어) ─────────
// 단계 [제안] — 운영하며 조정
export const CARE_STAGES = [
  { c: 'C0', t: '미컨택', d: '리스트 등록, 아직 콜 전' }, { c: 'C1', t: '시도중', d: '부재 · 재시도' }, { c: 'C2', t: '연결', d: '통화됨 · 원인 확인 전' },
  { c: 'C3', t: '원인 파악', d: '중단 · 저조 사유 확인' }, { c: 'C4', t: '개선 액션', d: '견적가 · 지역 · 프로필 코칭 등' }, { c: 'C5', t: '회복 확인 중', d: '참여 · 계약이 돌아오는지 보기' },
  { c: 'WON', t: '회복', d: '참여 · 계약 정상화' }, { c: 'LOST', t: '관리 종료', d: '재참여 의사 없음 · 폐업 등' },
];
export const CARE_OPEN = CARE_STAGES.filter((s) => !['WON', 'LOST'].includes(s.c)).map((s) => s.c);
export const careRank = (c: string) => ['C0', 'C1', 'C2', 'C3', 'C4', 'C5', 'WON'].indexOf(c);
export const careLabel = (c: string) => (CARE_STAGES.find((s) => s.c === c) || { t: c }).t;
export const CARE_PRIO: Record<number, { t: string; cls: string }> = { 1: { t: 'P1', cls: 'p1' }, 2: { t: 'P2', cls: 'p2' }, 3: { t: 'P3', cls: 'p3' }, 4: { t: '관찰', cls: 'p4' } };
export const carePriority = (r: any): number => r.manual_priority || r.priority || 4;
// 지표 칸은 리스트 형식이 바뀌어도 찾을 수 있게 이름 패턴으로 찾는다
export const careMetric = (r: any, re: RegExp) => { const m = r.metrics || {}; const k = Object.keys(m).find((x) => re.test(x)); return k ? m[k] : null; };
const CARE_POINTS: Record<string, string[]> = {
  '9월 참여 후 10월 미참여': ['이번 달 참여가 멈춘 이유 묻기', '요청이 안 보이는지 · 보고도 안 내는지 확인', '앱 알림 · 서비스 지역 설정 확인', '이번 주 참여 약속'],
  '핵심 과거 참여 후 휴면': ['쉬게 된 이유(수익성 · 운영 불편) 듣기', '그동안 달라진 점 안내', '다시 참여할 조건 확인'],
  '최근 참여 중 무계약': ['견적가 수준 점검', '서비스 지역 · 차량 점검', '프로필 · 리뷰 보강', '견적 메시지 품질 코칭'],
  '참여 급감': ['줄어든 이유(일정 · 인력 · 요청 품질) 확인', '적정 요청량 · 지역 재설정'],
  '저계약률 참여': ['계약이 안 된 이유 확인', '가격 경쟁력 점검', '견적 응답 속도 점검'],
  '일반 휴면': ['다시 참여할 의향 확인', '유지 / 관리 종료 구분'],
};
export function carePoints(r: any): string[] {
  const k = Object.keys(CARE_POINTS).find((x) => (r.segment || '').includes(x));
  return [...(k ? CARE_POINTS[k] : ['요즘 미소 요청은 어떤지 근황 확인', '불편한 점 확인']), '캐파(팀 · 차량) 변화 확인'];
}
export const CARE_CONCERNS = ['요청이 적음', '가격 경쟁이 심함', '계약이 안 됨', '참여비 · 수수료 부담', '일정 · 인력 부족', '지역이 안 맞음', '앱 · 절차 불편', '타 플랫폼에 집중', '기타'];
export const CARE_RESULT: [string, string][] = [['go', '협조적 · 원인 파악'], ['hold', '연결됨 · 재통화'], ['fail', '거부 · 관리 종료']];
export function careOpener(r: any): { facts: string[]; line: string } {
  const g = (re: RegExp) => careMetric(r, re); const seg = r.segment || '';
  const line = seg.includes('10월 미참여') ? `9월엔 ${g(/^9월 참여/) ?? '꾸준히'}건 참여해 주셨는데 이번 달엔 아직 참여가 없으셔서요. 혹시 요청이 잘 안 보이시나요?`
    : seg.includes('휴면') && seg.includes('핵심') ? `예전에 ${g(/누적 참여/) ?? '많이'}건이나 참여해 주셨는데, ${g(/마지막 참여/) || '최근'} 이후로 쉬고 계셔서 어떤 점이 불편하셨는지 여쭤보려고요.`
    : seg.includes('무계약') ? `최근 3개월 ${g(/최근3개월 참여/) ?? ''}건 참여해 주셨는데 계약이 안 나와서, 견적가나 지역을 같이 점검해 드리려고요.`
    : seg.includes('급감') ? `9월 ${g(/^9월 참여/) ?? ''}건에서 이번 달 ${g(/^10월.*참여/) ?? ''}건으로 줄어서, 일정이나 요청 쪽에 변화가 있으셨는지 여쭤보려고요.`
    : seg.includes('저계약률') ? `참여는 많이 해 주시는데 계약률이 ${g(/최근3개월 계약률/) ?? '낮아서'}라, 계약이 안 되는 이유를 같이 보려고요.`
    : seg.includes('휴면') ? '다시 참여하실 생각이 있으신지, 쉬시게 된 이유가 있는지 여쭤보려고요.'
    : '요즘 미소 요청은 어떠신지, 불편한 점은 없으신지 여쭤보려고요.';
  const f = [r.reason, r.action && `권장 액션: ${r.action}`, r.signal_change].filter(Boolean) as string[];
  return { facts: f, line };
}
