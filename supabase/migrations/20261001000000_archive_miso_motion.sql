-- 2026-10-01 실제 적용본 (miso-motion 프로젝트 ibenzoidvrekjhewoswp)
-- 삭제 대신 보관: 기존 public(미소모션 hub 테이블 10개: cams, deals, vendors, assignments, activity_log …)을
-- archive_miso_motion 스키마로 옮기고 빈 public을 새로 만든다. API(anon/authenticated)에서는 보이지 않음.
begin;
do $$
declare t record;
begin
  for t in select tablename from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' loop
    execute format('alter publication supabase_realtime drop table public.%I', t.tablename);
  end loop;
end $$;
alter schema public rename to archive_miso_motion;
revoke all on all tables in schema archive_miso_motion from anon, authenticated;
revoke usage on schema archive_miso_motion from anon, authenticated;
create schema public;
alter schema public owner to pg_database_owner;
grant usage on schema public to postgres, anon, authenticated, service_role;
grant create on schema public to postgres;
alter default privileges in schema public grant all on tables    to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;
commit;

-- 되돌리기(필요 시): 이사 콘솔 public을 다른 이름으로 옮기고 보관본을 public으로 복귀
--   alter schema public rename to moving_console;  alter schema archive_miso_motion rename to public;  (+ grant 복구)
-- 완전 삭제(더 이상 필요 없을 때, 대시보드에서 직접): drop schema archive_miso_motion cascade;
