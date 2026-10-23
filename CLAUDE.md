# miso-moving-console

미소 가정이사 AE 온보딩(미소방문·RFQ) + AM(신규 정착·캐파 확대) + 미소방문 예약콜 운영 콘솔 + 성과 관리.

## 좌표
- Supabase 프로젝트 `ibenzoidvrekjhewoswp` (이름 miso-moving-console, 서울). 스키마는 `supabase/migrations/` 15개로 적용됨 (… 20261007160000 · 20261007170000 · 20261007170100 · 20261007180000). 2026-10-07 원격 이력 복구(db:mark-applied) 후 `supabase link` 상태 — 이후엔 `npm run db:push`만 쓰면 된다
- 배포: https://miso-moving-console.vercel.app (Vercel 92jhson-3856s-projects/miso-moving-console) — 재배포는 `npx vercel --prod`
- 설계: `docs/설계서_v0.2_20261001-0631.md` · 화면 시안(동작하는 목업): `design/prototype_v0.2_20261001-0631.html` — 화면 구성·문구·상호작용은 이 시안을 기준으로 구현
- 계정: mv1~mv15@getmiso.com (staff 테이블). 관리자(lead) = mv2 손재혁(2026-10-07 지정), 나머지 operator. 자가 가입 꺼져 있음. 계정 생성 · 임시 비밀번호 재발급은 계정관리 탭(`app/api/admin/accounts`, 서버 전용 SUPABASE_SECRET_KEY, lead만)

## 스택
- Next.js 15 (App Router, TypeScript) + `@supabase/ssr`. 스타일은 `app/globals.css`(시안 CSS 이식, 토큰·다크모드 포함) — Tailwind 안 씀. Vercel 배포
- 화면: `app/(console)/{today,ae,ae/followup,am-new,am-active,matching,booking,calls,history,performance,updates,suggestions,admin/accounts}` · 작업창은 모두 3단(왼쪽 전화 전에 볼 것 · 가운데 콜 기록 · 오른쪽 팔로우업/이력): AE는 `components/LeadWorkspace.tsx`, AM·예약콜은 `components/Detail.tsx` Drawer. 팔로우업 선택기 `components/Followup.tsx`(기본 오늘), 동시 작업 표시·실시간 `components/Presence.tsx`(Realtime presence + activity_events INSERT 구독), 이력 문장 `eventText`(Detail.tsx), CSV `lib/csv.ts` · 크론 `app/api/cron/digest`(vercel.json crons, CRON_SECRET·SUPABASE_SECRET_KEY·SLACK_WEBHOOK_URL) · 상세 드로어·콜 폼 `components/Detail.tsx` · 사전/포맷 `lib/ui.ts` · 데이터 `lib/data.ts`
- env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`(sb_publishable_…), 서버 전용 `SUPABASE_SECRET_KEY`(sb_secret_…, NEXT_PUBLIC_ 금지). 옛 anon/service_role JWT 키는 쓰지 않는다

## DB 규칙
- DB 변경은 `supabase/migrations/`에 새 파일 추가 후 `npm run db:push`. 적용된 파일은 수정 금지. 대시보드에서 직접 고치지 않는다
- 콜 저장은 반드시 RPC `log_call`, 스테이지 이동은 `move_stage`(사유 필수). 특이사항(note)·필드 변경(field)만 `activity_events`에 직접 insert, 체크리스트·캐파 스냅샷은 각 테이블에 직접 쓴다
- 담당 배정은 RPC `assign_owner`, 수동매칭은 `request_manual_match` / `resolve_manual_match`, 공급 경고 자동은 `auto_supply_alerts`(크론 전용)
- AE 단계(2026-10-07 개편): E0 미컨택 → E1 시도중 → E2 연결 → E3 관심있음 → E4 서류 → E5 프로필작업 → E6 리뷰작업 → E7 충전대기 → E8 첫견적제출 → WON(첫 견적 제출 확인 = AE 완료, AM N0 이관) / LOST(이탈, 옛 EX). 사전은 `lib/ui.ts` AE_STAGES
- AE RPC: 콜은 `log_call`(+`p_next_note` 팔로우업 할 일, `p_stage_to` 통화 후 단계 지정 — WON·LOST 불가, `p_points`·`p_concerns`·`p_counterpart` → activity_events.call_points·concerns·counterpart). 미컨택·시도중에서 첫 연결 콜로 관심있음 이상 가면 E2 연결 경유 이력을 먼저 남긴다. 충전 `record_charge` = E8 이동(AM 이관 안 함). 첫 견적 확인 `record_first_quote` → `ae_mark_won`(WON + AM 이관). 콜 없이 팔로우업 변경 `set_lead_followup`. 성과는 `perf_ae` · `perf_am` · 뷰 `v_ae_funnel`/`v_ae_board`
- 콜 우선순위: `lib/ui.ts` aeAutoPriority(P1~P4, 등급·지역 티어·리대시 신호) · `ae_leads.manual_priority`(수동) · 자동 라벨 aeLabels · 담당자 라벨 `ae_leads.tags`
- 리대시 신호: `ae_leads.signals`(jsonb, partner_name 저장 안 함)·`signals_at`. 맥에서 `node scripts/sync_ae_signals_20261007-0731.mjs [--dry]`(AWS VPN 필요, ~/miso-data/sql/ae_lead_signals.sql, 1회 약 $0.03) → RPC `apply_ae_signals`: 미소방문 자가 견적 → WON, 리드 등록 이후 충전(last_charge_at) → E8. 앞으로만 움직임. 리스트의 '크레딧잔액'(partner.credit)은 옛 값이라 판단에 쓰지 않는다
- 신호 변화: `apply_ae_signals`가 전날 신호와 비교(`ae_signal_diff`)해 `ae_leads.signal_change(_at)` + activity_events(field='signal') 기록 → AE 팔로우업 '오늘 생긴 신호'(3일, 그 뒤 콜 전), 콜 리스트 2순위, 슬랙 요약. 작업창 남은 일 체크리스트·첫마디는 `lib/ui.ts` aeChecklist·aeOpener(기준값은 제안)
- AM 관리 대상(파트너 케어): 테이블 `am_care`(partner_id 유니크, segment·priority 1~4(4=관찰)·reason·action·metrics jsonb(원래 칸 이름)·stage C0~C5·WON·LOST), subject='care' · module='am_care'. 화면 `/am-care`, 작업창 `components/CareWorkspace.tsx`, 뷰 `v_care_board`, 리스트는 `import_care_list`(웹 '리스트 관리' 또는 `node scripts/import_care_list_20261007-1125.mjs <csv> <버전>`; 해석 규칙 `lib/careList.ts`), 팔로우업 `set_care_followup`. 단계는 [제안] — 사용자 확정 전
- 건의 보드: `suggestions`·`suggestion_logs`. 상태 변경은 lead만(RPC `set_suggestion_status`, 트리거로 강제), 공감은 RPC `toggle_suggestion_vote`
- 한 번에 최신화(2026-10-23): 바탕화면 `AE 리스트 갱신.app` → `scripts/refresh_ae_app_20261023-1310.sh` → `node scripts/refresh_ae_20261023-1310.mjs [--no-list] [--dry]` (VPN·supabase CLI, 비밀 키 없음). 순서: ~/miso-data `sql/mv_regions.sql` → `sync_mv_regions` / 파트너 확보 리스트 재추출(`mv_concierge_conversion_targets.sql`+`partner_large_move_experience.sql`→`build_mv_targets.py`, python openpyxl 필요) → `import_ae_list(…, p_full=true)` / `sql/ae_lead_coverage.sql` → `apply_ae_coverage` / 신호 스크립트. 로그 ~/miso-data/data/ae_refresh/refresh.log. 자동 예약(launchd)은 사용자가 보류 — 버튼만
- 미소방문 권역: 테이블 `mv_regions`(구 단위, official 'all'|'part' = 아테나 public_service 586 region_ids, req_30d, manual 'in'|'out' 덮어쓰기, note) · 뷰 `v_mv_regions`(effective = manual 우선, 없으면 official 또는 req_30d>0 [제안]) · 화면 `/ae/regions`. 리드 `ae_leads.coverage`(펼친 커버 구)·`moving_quotes_30d`·`all_quotes_30d`·`moving_last_submit_at`(전체 서비스 마지막 제출) → `v_ae_board.mv_in`·`mv_in_districts`·`active_30d`(최근 30일 전체 서비스 견적 ≥1). 리스트 표시는 ae/page.tsx StatusPills
- 수동 업로드: 리스트 관리 패널(가이드·양식 `MANUAL_TEMPLATE`). `lib/aeList.ts` parseCsvReport(칸 별칭·전화번호 칸 제거·칸 수 불일치 줄)·decodeCsv(EUC-KR 대응)·isFullList. `import_ae_list(p_rows, p_version, p_full)` 는 빈 값 = 기존 값 유지(insight 병합), p_full=false면 list_version 유지
- 리스트 업데이트: AE 화면 '리스트 업데이트'에서 CSV 업로드 → RPC `import_ae_list`(기존 리드 = 지표·단계 최신화, 담당·팔로우업·이력 유지 / 새 파트너만 E0 추가). 신호 CSV(ae_lead_signals_*.csv)를 올리면 `apply_ae_signals`만. 원본은 `~/miso-data/output/미소방문_파트너확보리스트_*.csv`. 예전 스크립트 `scripts/import_ae_targets_20261007-0710.mjs`도 동작 (INSERT…ON CONFLICT 금지: BEFORE INSERT 트리거가 등록 이력을 중복 기록)
- enum 값 추가(alter type … add value)는 같은 트랜잭션에서 못 쓰므로 별도 마이그레이션 파일로 분리
- 화면 조회는 뷰 `v_today` · `v_am_board` · `v_booking_board` · `v_quote_display` · `v_manual_match` 사용 (security_invoker라 RLS 적용)
- 모든 기록은 `activity_events` 한 테이블(INSERT 전용). 콜 수 집계는 `count(distinct call_group)`
- 대상 키는 파트너 ID / 오더 ID. 이름으로 찾거나 저장하지 않는다 (기존 콘솔 동명이인 오기록 버그)
- 📌 팔로업 = `next_action_at`(파트너) / `next_call_at`(오더). 콜 저장 시 팔로업 일시 또는 종료 사유 필수
- 종료 상태(N_CHURN, BX_LOST, B4_WON, B_EXPIRED, AE WON·LOST)는 모든 큐·팔로업 목록에서 제외
- 고객(오더) 개인정보는 저장하지 않는다. **파트너 전화번호만 예외**(2026-10-07 사용자 결정): 담당자가 어드민에서 확인한 번호를 작업창 이름 옆에 직접 입력 → `partner_contacts`(partner_id 키, 숫자만, RLS 콘솔 계정만, 삭제는 lead, 실시간 구독 제외). 번호는 activity_events · CSV · 로그에 남기지 않는다(field='phone' 은 '등록/변경'만). 리대시 등에서 번호를 대량으로 끌어오는 건 사용자 판단 없이 하지 않는다. UI `components/PhoneTag.tsx`. 파트너 어드민 링크 = `https://rfq-admin.miso.kr/partners/<파트너ID>` (`lib/ui.ts` rfqAdminUrl)
- `archive_miso_motion` 스키마는 옛 미소모션 보관본. 건드리지 않는다

## 작업 방식
- 화면 확인(로컬 미리보기): 운영 데이터를 읽기 전용 JSON으로 내려받아(`supabase db query --linked "select json_agg(t) from v_ae_board t"` 등 → 폴더에 `<뷰이름>.json`) `NEXT_PUBLIC_PREVIEW=1 PREVIEW_FIXTURES=<폴더> npx next dev -p 3939` → http://localhost:3939 (로그인 없이, 저장은 아무 것도 안 함). 코드: `lib/previewMock.ts`, `app/api/preview-fixtures`, middleware·(console)/layout 의 PREVIEW 분기 — Vercel(VERCEL env)에서는 항상 꺼짐. 사본은 저장소 밖(스크래치패드)에 둔다
- 운영 배포할 때마다 `lib/changelog.ts` 맨 위에 버전 · 변경 항목을 추가한다(업데이트 탭). 건의를 반영했으면 req에 `#건의번호`, 건의 상태는 '반영 완료' + 버전
- 단계별로 진행하고, 각 단계 끝에 `npm run build` 통과 + 확인 방법을 보고
- 모르는 운영 규칙은 추측하지 말고 설계서의 [제안]/미결 항목으로 표시 후 질문

## 파일 이름 규칙
- 새로 만드는 문서·스크립트·산출물 파일명 끝에 생성일시를 붙인다: `이름_YYYYMMDD-HHMM.확장자` (KST)
- 예외(도구가 이름을 고정으로 찾는 파일): package.json, CLAUDE.md, .env*, .gitignore, supabase/config.toml, Next.js 규약 파일(app/**/page.tsx 등). 마이그레이션은 이미 타임스탬프 접두어 사용
