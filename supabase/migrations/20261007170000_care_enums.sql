-- AM 관리 대상(파트너 케어) 1/2: enum 값 (새 값은 같은 트랜잭션에서 못 쓰므로 별도 파일)
-- 대상: 기존 가정이사 파트너 중 참여 중단 · 휴면 · 무계약 · 참여 급감 · 저계약률 등 AM이 챙길 파트너 (리스트: 261006_partner 관리대상)
alter type subject_kind add value if not exists 'care';
alter type module_kind add value if not exists 'am_care';
create type care_stage as enum ('C0','C1','C2','C3','C4','C5','WON','LOST');
