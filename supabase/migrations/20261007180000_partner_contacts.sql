-- 파트너 연락처 (2026-10-07, 사용자 요청: 작업창 이름 옆 전화번호)
-- 이전 원칙 '전화번호 저장 안 함'을 바꾼다. 담당자가 어드민에서 확인한 파트너 번호를 직접 입력해 두는 칸 — 고객(오더) 번호는 다루지 않는다
-- 보호: 콘솔 계정만 읽기/쓰기(RLS), 삭제는 관리자, 실시간 구독 대상 아님, activity_events · CSV 에 번호를 남기지 않는다(변경 사실만)
create table partner_contacts (
  partner_id bigint primary key,
  phone text not null check (phone ~ '^[0-9]{8,12}$'),   -- 숫자만 저장, 화면에서 하이픈
  label text,                                            -- 예: 대표, 실무자
  updated_by uuid default auth.uid() references staff(id),
  updated_at timestamptz not null default now()
);
alter table partner_contacts enable row level security;
create policy pc_read on partner_contacts for select using (current_staff_role() is not null);
create policy pc_insert on partner_contacts for insert with check (current_staff_role() is not null);
create policy pc_update on partner_contacts for update using (current_staff_role() is not null) with check (current_staff_role() is not null);
create policy pc_delete on partner_contacts for delete using (current_staff_role() = 'lead');
revoke all on partner_contacts from anon;
