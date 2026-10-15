-- 운영 기능 보강 (2026-10-01): 오늘의 큐 · 담당 배정 · 수동매칭 · 공급 경고 자동화

-- 1) 수동매칭 요청: 처리 기록 컬럼 + 오더당 열린 요청 1건
alter table manual_match_requests add column if not exists requested_by uuid default auth.uid();
alter table manual_match_requests add column if not exists note text;
alter table manual_match_requests add column if not exists matched_partner_ids bigint[] not null default '{}';
alter table manual_match_requests add column if not exists resolved_at timestamptz;
alter table manual_match_requests add column if not exists resolved_by uuid;
create unique index if not exists mmr_one_open_per_order on manual_match_requests(order_id) where status = 'open';

create or replace function request_manual_match(p_order bigint, p_reason text)
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  if coalesce(trim(p_reason),'') = '' then raise exception '요청 사유는 필수입니다'; end if;
  select id into v_id from manual_match_requests where order_id = p_order and status = 'open';
  if v_id is not null then return v_id; end if;
  insert into manual_match_requests(order_id, reason) values (p_order, p_reason) returning id into v_id;
  update booking_cases set supply_alert = true where order_id = p_order;
  insert into activity_events(subject, subject_id, module, event_type, field, new_value, memo)
  values ('order', p_order, 'booking', 'field', 'manual_match', 'open', p_reason);
  return v_id;
end $$;

create or replace function resolve_manual_match(p_id uuid, p_status text, p_note text, p_partners bigint[] default '{}')
returns void language plpgsql as $$
declare v_order bigint;
begin
  if p_status not in ('matched','closed') then raise exception '상태는 matched 또는 closed'; end if;
  if coalesce(trim(p_note),'') = '' then raise exception '처리 메모는 필수입니다'; end if;
  update manual_match_requests set status = p_status, note = p_note, matched_partner_ids = coalesce(p_partners,'{}'),
         resolved_at = now(), resolved_by = auth.uid()
   where id = p_id and status = 'open' returning order_id into v_order;
  if v_order is null then raise exception '열린 요청이 아닙니다'; end if;
  update booking_cases set supply_alert = false where order_id = v_order;
  insert into activity_events(subject, subject_id, module, event_type, field, old_value, new_value, memo)
  values ('order', v_order, 'booking', 'field', 'manual_match', 'open', p_status,
          p_note || case when coalesce(array_length(p_partners,1),0) > 0 then ' · 매칭 파트너 ' || array_to_string(p_partners, ',') else '' end);
end $$;

-- 2) 공급 경고 자동: 견적 0건인 B0 오더 — D0 18시(KST) 지나면 수동매칭 요청 생성 (크론이 호출, 여러 번 불러도 안전)
create or replace function auto_supply_alerts() returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; kst timestamp := now() at time zone 'Asia/Seoul';
begin
  for r in select b.order_id from booking_cases b
            where b.stage = 'B0' and not exists (select 1 from src_quotes q where q.order_id = b.order_id)
              and (b.d0 < kst::date or (b.d0 = kst::date and extract(hour from kst) >= 18))
              and not exists (select 1 from manual_match_requests m where m.order_id = b.order_id and m.status = 'open') loop
    insert into manual_match_requests(order_id, reason, requested_by) values (r.order_id, '견적 0건 · D0 18시 경과 (자동)', null);
    update booking_cases set supply_alert = true where order_id = r.order_id;
    insert into activity_events(subject, subject_id, module, event_type, field, new_value, memo, actor_id, auto_rule)
    values ('order', r.order_id, 'booking', 'field', 'manual_match', 'open', '견적 0건 · D0 18시 경과', null, 'supply_alert:d0_18h');
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function auto_supply_alerts() from anon, authenticated;

-- 3) 오늘의 큐: 파트너·오더 팔로업을 한 목록으로 (이름·담당 포함, 종료 상태 제외)
create or replace view v_today with (security_invoker = true) as
select 'partner'::text as subject, a.partner_id as subject_id,
       case when a.track = 'active' then 'am_active' else 'am_new' end as module,
       a.stage::text as stage, sp.name as title, sp.region, a.owner_id,
       a.next_action_at as followup_at, a.next_action_note as note,
       (select max(created_at) from activity_events e where e.subject='partner' and e.subject_id=a.partner_id and e.event_type='call') as last_call_at
from am_partners a join src_partners sp on sp.partner_id = a.partner_id
where a.stage not in ('N_CHURN')
union all
select 'order', b.order_id, 'booking', b.stage::text, coalesce(o.customer_label,'고객') || ' · ' || coalesce(o.region,''), o.region, b.owner_id,
       b.next_call_at, null,
       (select max(created_at) from activity_events e where e.subject='order' and e.subject_id=b.order_id and e.event_type='call')
from booking_cases b join src_orders o on o.order_id = b.order_id
where b.stage in ('B0','B1','B2','B3');

-- 4) 수동매칭 목록
create or replace view v_manual_match with (security_invoker = true) as
select m.*, o.customer_label, o.region, o.pyeong, o.move_date, o.planner_name, b.d0, b.stage as booking_stage,
       (select count(*) from src_quotes q where q.order_id = m.order_id)::int as quote_count
from manual_match_requests m
join src_orders o on o.order_id = m.order_id
left join booking_cases b on b.order_id = m.order_id;

-- 5) 담당 배정: 트리거가 owner 변경을 activity_events(field)로 이미 기록함. 일괄 배정 RPC (사유 기록)
create or replace function assign_owner(p_subject text, p_ids bigint[], p_owner uuid)
returns int language plpgsql as $$
declare n int;
begin
  if p_subject = 'partner' then update am_partners set owner_id = p_owner where partner_id = any(p_ids);
  else update booking_cases set owner_id = p_owner where order_id = any(p_ids); end if;
  get diagnostics n = row_count; return n;
end $$;
