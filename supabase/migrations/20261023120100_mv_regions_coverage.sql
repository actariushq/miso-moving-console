-- 미소방문 권역 · 리드 커버리지 · 액티브/이탈 (2026-10-23)
-- · mv_regions: 구 단위 권역표. 아테나에서 official(서비스 설정 region_ids)·req_30d(최근 30일 요청)를 동기화하고,
--   담당자가 manual('in'|'out')로 덮어쓸 수 있다. 실제 판단 = manual 이 있으면 manual, 없으면 official 또는 req_30d > 0 [제안]
-- · ae_leads.coverage: 파트너 커버 구(펼친 목록) · moving_quotes_30d · moving_last_submit_at · coverage_at
-- · v_ae_board: mv_in_districts(커버 ∩ 권역) · mv_in(권역 해당 여부, 커버리지 모르면 null) · active_30d(최근 30일 견적 참여)

create table if not exists mv_regions (
  district    text primary key,            -- '서울 강남구' 처럼 region.full_name
  province    text,
  req_30d     int not null default 0,
  official    text check (official in ('all', 'part')),
  manual      text check (manual in ('in', 'out')),
  note        text,
  synced_at   timestamptz,
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid()
);
alter table mv_regions enable row level security;
create policy mvr_read on mv_regions for select using (current_staff_role() is not null);
create policy mvr_insert on mv_regions for insert with check (current_staff_role() is not null);
create policy mvr_update on mv_regions for update using (current_staff_role() is not null) with check (current_staff_role() is not null);
create policy mvr_delete on mv_regions for delete using (current_staff_role() = 'lead');

-- 담당자 수정(manual·note)이면 수정 시각·사람을 남긴다 (동기화는 auth.uid() 없음 → 그대로)
create or replace function mv_regions_touch() returns trigger language plpgsql as $$
begin
  if auth.uid() is not null then new.updated_at := now(); new.updated_by := auth.uid(); end if;
  return new;
end $$;
create trigger mv_regions_touch before update on mv_regions for each row execute function mv_regions_touch();

create or replace view v_mv_regions with (security_invoker = true) as
select r.*, coalesce(r.manual = 'in', r.official is not null or r.req_30d > 0) as effective,
  case when r.manual is not null then 'manual' when r.official is not null then 'official' when r.req_30d > 0 then 'requests' end as basis,
  s.name as updated_by_name
from mv_regions r left join staff s on s.id = r.updated_by;

-- 아테나 동기화: 아테나 칸(province·req_30d·official)만 바꾸고 manual·note 는 그대로. 이번에 안 온 구는 req_30d=0·official=null
create or replace function sync_mv_regions(p_rows jsonb)
returns jsonb language plpgsql as $$
declare n_new int; n_upd int; n_gone int;
begin
  if auth.uid() is not null and current_staff_role() is distinct from 'lead' then raise exception '권한 없음'; end if;
  drop table if exists _r;
  create temp table _r on commit drop as
    select distinct on (district) * from jsonb_to_recordset(p_rows) as x(district text, province text, req_30d int, official text)
    where coalesce(trim(district), '') <> '' order by district;
  update mv_regions m set province = r.province, req_30d = coalesce(r.req_30d, 0), official = nullif(r.official, ''), synced_at = now()
  from _r r where m.district = r.district;
  get diagnostics n_upd = row_count;
  insert into mv_regions (district, province, req_30d, official, synced_at, updated_by)
  select r.district, r.province, coalesce(r.req_30d, 0), nullif(r.official, ''), now(), null from _r r
  where not exists (select 1 from mv_regions m where m.district = r.district);
  get diagnostics n_new = row_count;
  update mv_regions m set req_30d = 0, official = null, synced_at = now()
  where not exists (select 1 from _r r where r.district = m.district) and (m.req_30d <> 0 or m.official is not null);
  get diagnostics n_gone = row_count;
  return jsonb_build_object('updated', n_upd, 'inserted', n_new, 'cleared', n_gone,
    'effective', (select count(*) from v_mv_regions where effective));
end $$;

alter table ae_leads add column if not exists coverage text[];
alter table ae_leads add column if not exists moving_quotes_30d int;
alter table ae_leads add column if not exists moving_last_submit_at timestamptz;
alter table ae_leads add column if not exists coverage_at timestamptz;

-- 리드 커버리지·견적 참여 반영 (아테나 ae_lead_coverage.sql 결과). 단계·담당·이력은 건드리지 않는다
create or replace function apply_ae_coverage(p_rows jsonb)
returns jsonb language plpgsql as $$
declare n int;
begin
  if auth.uid() is not null and current_staff_role() is null then raise exception '권한 없음'; end if;
  update ae_leads l set
    coverage = case when coalesce(x.coverage_districts, '') = '' then '{}'::text[] else array(select trim(d) from unnest(string_to_array(x.coverage_districts, ',')) d) end,
    moving_quotes_30d = x.moving_quotes_30d,
    moving_last_submit_at = case when coalesce(x.moving_last_submit_at, '') = '' then null else kst_ts(x.moving_last_submit_at) end,
    coverage_at = now()
  from jsonb_to_recordset(p_rows) as x(partner_id bigint, coverage_districts text, moving_quotes_30d int, moving_last_submit_at text)
  where l.partner_id = x.partner_id and l.service_line = 'miso_visit';
  get diagnostics n = row_count;
  return jsonb_build_object('updated', n);
end $$;

revoke execute on function sync_mv_regions(jsonb) from anon;
revoke execute on function apply_ae_coverage(jsonb) from anon;

drop view if exists v_ae_board;
create view v_ae_board with (security_invoker = true) as
select l.*,
  lc.created_at as last_call_at, lc.connect::text as last_connect, lc.result::text as last_result, lc.reason_code as last_reason, lc.memo as last_memo,
  (select count(*) from activity_events e where e.subject::text='lead' and e.subject_id=l.id and e.event_type='call')::int as call_count,
  (select coalesce(sum(amount),0) from charges c where c.lead_id = l.id)::int as charged_amount,
  mv.districts as mv_in_districts,
  case when l.coverage is null then null else coalesce(cardinality(mv.districts), 0) > 0 end as mv_in,
  case when l.coverage_at is null then null else coalesce(l.moving_quotes_30d, 0) > 0 end as active_30d
from ae_leads l
left join lateral (select created_at, connect, result, reason_code, memo from activity_events e
  where e.subject::text='lead' and e.subject_id=l.id and e.event_type='call' order by created_at desc limit 1) lc on true
left join lateral (select array_agg(r.district order by r.req_30d desc) as districts from v_mv_regions r
  where r.effective and r.district = any(l.coverage)) mv on true;
