-- 액티브/이탈 기준을 '최근 30일 전체 서비스 견적 제출'로 (2026-10-23) — 가정이사(112)만 세면 리드 1,241명 중 46명뿐이라
-- ae_leads.all_quotes_30d 추가, moving_last_submit_at 은 이제 전체 서비스 기준 마지막 제출 시각
alter table ae_leads add column if not exists all_quotes_30d int;

-- 리드 커버리지·견적 참여 반영 (아테나 ae_lead_coverage.sql 결과). 단계·담당·이력은 건드리지 않는다
create or replace function apply_ae_coverage(p_rows jsonb)
returns jsonb language plpgsql as $$
declare n int;
begin
  if auth.uid() is not null and current_staff_role() is null then raise exception '권한 없음'; end if;
  update ae_leads l set
    coverage = case when coalesce(x.coverage_districts, '') = '' then '{}'::text[] else array(select trim(d) from unnest(string_to_array(x.coverage_districts, ',')) d) end,
    moving_quotes_30d = x.moving_quotes_30d, all_quotes_30d = coalesce(x.all_quotes_30d, x.moving_quotes_30d),
    moving_last_submit_at = kst_ts(nullif(coalesce(x.last_submit_at, x.moving_last_submit_at), '')),
    coverage_at = now()
  from jsonb_to_recordset(p_rows) as x(partner_id bigint, coverage_districts text, moving_quotes_30d int, all_quotes_30d int, last_submit_at text, moving_last_submit_at text)
  where l.partner_id = x.partner_id and l.service_line = 'miso_visit';
  get diagnostics n = row_count;
  return jsonb_build_object('updated', n);
end $$;

drop view if exists v_ae_board;
create view v_ae_board with (security_invoker = true) as
select l.*,
  lc.created_at as last_call_at, lc.connect::text as last_connect, lc.result::text as last_result, lc.reason_code as last_reason, lc.memo as last_memo,
  (select count(*) from activity_events e where e.subject::text='lead' and e.subject_id=l.id and e.event_type='call')::int as call_count,
  (select coalesce(sum(amount),0) from charges c where c.lead_id = l.id)::int as charged_amount,
  mv.districts as mv_in_districts,
  case when l.coverage is null then null else coalesce(cardinality(mv.districts), 0) > 0 end as mv_in,
  case when l.coverage_at is null then null else coalesce(l.all_quotes_30d, l.moving_quotes_30d, 0) > 0 end as active_30d
from ae_leads l
left join lateral (select created_at, connect, result, reason_code, memo from activity_events e
  where e.subject::text='lead' and e.subject_id=l.id and e.event_type='call' order by created_at desc limit 1) lc on true
left join lateral (select array_agg(r.district order by r.req_30d desc) as districts from v_mv_regions r
  where r.effective and r.district = any(l.coverage)) mv on true;
