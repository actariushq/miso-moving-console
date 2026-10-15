-- 콘솔 화면용 보조 컬럼·뷰 (2026-10-01)
alter table activity_events add column if not exists note_kind text;
alter table activity_events add column if not exists pinned boolean not null default false;
alter table activity_events alter column actor_id set default auth.uid();
alter table partner_capacity alter column recorded_by set default auth.uid();

create or replace view v_partner_quote_stats with (security_invoker = true) as
select sp.partner_id,
  (select count(*) from src_quotes q where q.partner_id = sp.partner_id)::int as quotes,
  (select count(*) from src_orders o where o.confirmed_partner_id = sp.partner_id)::int as selected,
  (select min(q.submitted_at) from src_quotes q where q.partner_id = sp.partner_id) as first_quote_at
from src_partners sp;

create or replace view v_am_board with (security_invoker = true) as
select a.partner_id, a.track, a.stage, a.stage_entered_at, a.owner_id, a.next_action_at, a.next_action_note,
  a.setup_checklist, a.graduated_at,
  sp.name, sp.region, sp.service_types, sp.first_charged_at, sp.balance, sp.instant_quote_on, sp.rating, sp.review_count,
  coalesce(st.quotes,0) as quotes, coalesce(st.selected,0) as selected, st.first_quote_at,
  lc.created_at as last_call_at, lc.connect::text as last_connect, lc.result::text as last_result, lc.reason_code as last_reason,
  (select count(*) from activity_events e where e.subject='partner' and e.subject_id=a.partner_id and e.event_type='call')::int as call_count,
  cap.teams, cap.trucks, cap.crew_regular, cap.crew_daily, cap.jobs_per_team_day, cap.working_days_month,
  cap.monthly_capacity, cap.miso_target_month, cap.other_platforms, cap.daily_quote_max, cap.quote_deadline_days,
  k.requests_received, k.quotes_submitted, k.contracts
from am_partners a
join src_partners sp on sp.partner_id = a.partner_id
left join v_partner_quote_stats st on st.partner_id = a.partner_id
left join lateral (select created_at, connect, result, reason_code from activity_events e
  where e.subject='partner' and e.subject_id=a.partner_id and e.event_type='call' order by created_at desc limit 1) lc on true
left join lateral (select * from partner_capacity pc where pc.partner_id=a.partner_id order by recorded_at desc limit 1) cap on true
left join lateral (select * from partner_monthly_kpi k where k.partner_id=a.partner_id order by month desc limit 1) k on true;

create or replace view v_booking_board with (security_invoker = true) as
select b.order_id, b.stage, b.stage_entered_at, b.owner_id, b.d0, b.expires_on, b.hesitation_tags, b.next_call_at,
  b.lost_reason, b.won_by_call, b.supply_alert,
  o.service_type, o.customer_label, o.region, o.pyeong, o.move_date, o.requested_at, o.visit_at, o.planner_name,
  o.video_released_at, o.confirmed_partner_id, o.confirmed_at, o.confirmed_amount,
  (select count(*) from src_quotes q where q.order_id=b.order_id)::int as quote_count,
  lc.created_at as last_call_at, lc.connect::text as last_connect, lc.result::text as last_result, lc.reason_code as last_reason,
  (select count(*) from activity_events e where e.subject='order' and e.subject_id=b.order_id and e.event_type='call')::int as call_count
from booking_cases b
join src_orders o on o.order_id = b.order_id
left join lateral (select created_at, connect, result, reason_code from activity_events e
  where e.subject='order' and e.subject_id=b.order_id and e.event_type='call' order by created_at desc limit 1) lc on true;
