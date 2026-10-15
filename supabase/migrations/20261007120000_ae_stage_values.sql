-- AE 단계 개편 1/2: enum 값 추가·이름 변경 (새 값은 같은 트랜잭션에서 못 쓰므로 별도 파일)
-- 새 흐름: E0 미컨택 → E1 시도중 → E2 연결 → E3 관심있음 → E4 서류 → E5 프로필작업 → E6 리뷰작업
--          → E7 충전대기 → E8 첫견적제출 → WON(첫 견적 제출 확인 = AE 완료, AM 이관) / LOST(이탈, 옛 EX)
-- 2026-10-07 적용 시점에 리드 1,237건 전부 E0, 콜·충전 0건 — 옛 E3~E5 의미 변경에 따른 데이터 이관 없음
alter type ae_stage add value if not exists 'E6';
alter type ae_stage add value if not exists 'E7';
alter type ae_stage add value if not exists 'E8';
alter type ae_stage add value if not exists 'WON';
alter type ae_stage rename value 'EX' to 'LOST';
