-- 미소 이사 콘솔 (moving-console) · Supabase schema v0.3 (새 프로젝트 초기 마이그레이션) · 2026-09-30 (기존 miso-console lead_events 방식 반영)
-- src_*  : 미소 운영 DB(Redash)에서 동기화되는 원천 (콘솔에서 수정하지 않음)
-- 나머지 : 콘솔 운영 레이어. 로그 테이블은 INSERT 전용.

create extension if not exists pgcrypto;

-- ───────── 공통 ─────────
create type staff_role as enum ('operator','am_onboarding','am_growth','booking_call','lead');
-- operator = 초기 공통 권한 (AM·예약콜 모두 편집). 역할 분리 시 개별 역할로 바꾼다.
create table staff (
  id uuid primary key references auth.users(id) on delete cascade,
  login_id text unique not null,            -- mv1 ~ mv15
  email text unique not null,
  name text,                                -- 예비 계정은 null
  role staff_role not null default 'operator',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function current_staff_role() returns staff_role
language sql stable security definer set search_path = public as $$ select role from staff where id = auth.uid() and active $$;

-- ───────── 원천 (동기화) ─────────
create table src_partners (
  partner_id bigint primary key,            -- rfq-admin 파트너 ID
  name text not null,
  service_types text[] not null default '{}', -- {'visit_quote','miso_visit'}
  region text,
  first_charged_at timestamptz,
  balance int,
  instant_quote_on boolean,
  rating numeric(2,1),
  review_count int,
  synced_at timestamptz not null default now()
);

create table src_orders (
  order_id bigint primary key,
  service_type text not null check (service_type in ('visit_quote','miso_visit')),
  customer_label text,                      -- 마스킹된 표시명만 (전화번호 저장 안 함)
  region text,
  pyeong int,
  move_date date,
  requested_at timestamptz,
  visit_at timestamptz,                     -- 플래너 방문(D0)
  planner_name text,
  video_released_at timestamptz,
  confirmed_partner_id bigint,
  confirmed_at timestamptz,
  confirmed_amount int,
  cancelled_at timestamptz,
  synced_at timestamptz not null default now()
);

create table src_quotes (
  quote_id bigint primary key,
  order_id bigint not null references src_orders(order_id),
  partner_id bigint not null references src_partners(partner_id),
  amount int not null,
  submitted_at timestamptz not null,
  rank_score numeric,                       -- 숨김 순위 기준 (미결: 운영 로직 확인 후 채움)
  synced_at timestamptz not null default now()
);

-- 견적 노출 규칙: 노출 = min(제출,4). 5개→1개 숨김, 6개→2개 숨김. 하위 rank_score부터 숨김.
create view v_quote_display as
select q.*,
       count(*) over (partition by q.order_id) as submitted_count,
       row_number() over (partition by q.order_id
                          order by q.rank_score desc nulls last, q.submitted_at) as display_rank,
       row_number() over (partition by q.order_id
                          order by q.rank_score desc nulls last, q.submitted_at) <= 4 as is_shown
from src_quotes q;

-- ───────── AM 트랙 ─────────
create type am_track as enum ('new','active');
create type am_stage as enum (
  'N0','N1','N2','N3','N4','N5','N_RISK','N_CHURN',   -- 신규 정착
  'A1','A2','A3','A4','A_RISK'                         -- 캐파 확대
);

create table am_partners (
  partner_id bigint primary key references src_partners(partner_id),
  track am_track not null default 'new',
  stage am_stage not null default 'N0',
  stage_entered_at timestamptz not null default now(),
  owner_id uuid references staff(id),
  next_action_at timestamptz,               -- 📌 현재 팔로업 일시 (마지막 콜/수동 설정 값)
  next_action_note text,
  setup_checklist jsonb not null default
    '{"profile_photo":false,"intro":false,"reviews_migrated":false,"instant_quote":false,"regions_days":false}',
  graduated_at timestamptz,
  created_at timestamptz not null default now()
);

-- 캐파 스냅샷: 수정이 아니라 새 행으로 쌓아서 변화 추적
create table partner_capacity (
  id uuid primary key default gen_random_uuid(),
  partner_id bigint not null references src_partners(partner_id),
  teams int not null,
  trucks jsonb not null default '{}',       -- {"1t":0,"2.5t":1,"5t":2,"5t+":0,"ladder":0}
  crew_regular int,
  crew_daily int,
  jobs_per_team_day numeric not null default 1,
  working_days_month int not null default 22,
  channel_mix jsonb,                        -- {"self":50,"other_platform":30,"miso":20}
  other_platforms jsonb,                    -- [{"name":"타사A","monthly_revenue":6000000,"monthly_spend":400000}] — 기존 콘솔 '타사 플랫폼 ROI' 계승
  daily_quote_max int,
  quote_deadline_days int,                  -- 견적 마감일 설정
  miso_target_month int,                    -- 합의한 월 목표 건수
  monthly_capacity int generated always as
    (floor(teams * jobs_per_team_day * working_days_month)::int) stored,
  recorded_by uuid references staff(id),
  recorded_at timestamptz not null default now()
);

-- 월별 투입 지표 (동기화 잡이 계산)
create table partner_monthly_kpi (
  partner_id bigint references src_partners(partner_id),
  month date,
  requests_received int,
  quotes_submitted int,
  contracts int,
  primary key (partner_id, month)
);

create view v_partner_utilization as
select k.partner_id, k.month, k.requests_received, k.quotes_submitted, k.contracts,
       round(k.quotes_submitted::numeric / nullif(k.requests_received,0), 3) as quote_participation,
       c.monthly_capacity,
       round(k.contracts::numeric / nullif(c.monthly_capacity,0), 3) as miso_share
from partner_monthly_kpi k
left join lateral (
  select monthly_capacity from partner_capacity pc
  where pc.partner_id = k.partner_id order by recorded_at desc limit 1
) c on true;

-- ───────── 예약콜 ─────────
create type booking_stage as enum ('B0','B1','B2','B3','B4_WON','BX_LOST','B_EXPIRED');
create type lost_reason as enum ('other_company','price','cancel_postpone','self_solved','unreachable','etc');

create table booking_cases (
  order_id bigint primary key references src_orders(order_id),
  stage booking_stage not null default 'B0',
  stage_entered_at timestamptz not null default now(),
  owner_id uuid references staff(id),
  d0 date not null,                         -- 플래너 방문일
  expires_on date generated always as (d0 + 6) stored, -- 이 날짜 0시에 종료 (D+5까지 관리)
  hesitation_tags text[] not null default '{}',
  next_call_at timestamptz,
  lost_reason lost_reason,
  won_by_call boolean,                      -- 예약콜 기여 여부
  supply_alert boolean not null default false,
  created_at timestamptz not null default now(),
  constraint lost_needs_reason check (stage <> 'BX_LOST' or lost_reason is not null)
);

-- 견적 0건 → AM 수동매칭 요청
create table manual_match_requests (
  id uuid primary key default gen_random_uuid(),
  order_id bigint not null references src_orders(order_id),
  reason text not null,
  status text not null default 'open' check (status in ('open','matched','closed')),
  assignee_id uuid references staff(id),
  created_at timestamptz not null default now()
);

-- ───────── 기록: 통합 원장 (INSERT 전용) ─────────
-- 기존 miso-console lead_events 방식 계승: 콜·문자·스테이지·노트·필드변경·시스템 감지를 한 테이블에.
create type subject_kind as enum ('partner','order');
create type module_kind  as enum ('am_new','am_active','booking');
create type event_kind   as enum ('call','sms','stage','note','field','system');
create type connect_kind as enum ('connected','absent','dead','refuse','etc');
create type result_kind  as enum ('go','hold','fail');

-- 결과·사유 사전 (모듈별로 다른 보류 사유·실패 유형 — 코드 배포 없이 관리)
create table reason_dict (
  module module_kind not null,
  result result_kind not null,
  code text not null,
  label text not null,
  parent_code text,                         -- 2단계 세부 사유
  sort int not null default 0,
  active boolean not null default true,
  primary key (module, result, code)
);

-- AM 터치 케이던스 정의 (기존 AM_TOUCH 이식)
create table touch_cadence (
  key text primary key,                     -- W0, D1, D2, D3, D7, D14, D21, D30, EV_SELECTED, EV_48H, EV_ATBAT, EV_LOST3, WK
  module module_kind not null,
  title text not null,
  channel text not null,
  day_offset int,                           -- D0(첫 견적 참여일) 기준. 이벤트형은 null
  must boolean not null default false,
  goal text, prep text[], success text, sla text
);

create table activity_events (
  id bigint generated always as identity primary key,
  subject subject_kind not null,
  subject_id bigint not null,               -- 파트너 ID(rfq-admin) / 오더 ID — 이름으로 저장하지 않음
  module module_kind not null,
  event_type event_kind not null,
  call_group uuid,                          -- 한 통화 = 한 그룹. 집계는 count(distinct call_group)
  attempt_no int,                           -- 이 대상에 대한 콜 회차
  purpose text,
  touch_key text references touch_cadence(key),
  connect connect_kind,
  result result_kind,
  reason_code text,
  reason_detail text,
  state_code char(1) check (state_code in ('A','B','C','D','E')),
  voc_tags text[],
  rx_code text,
  hesitation_tags text[],
  memo text,
  stage_at text,                            -- 콜 당시 스테이지
  stage_after text,                         -- 콜 직후 스테이지 (자동/수동 이동 반영)
  stage_from text, stage_to text,           -- event_type='stage'일 때
  next_action_at timestamptz,               -- 📌 팔로업 일시 (기존 콘솔 '팔로업'과 같은 개념)
  next_action text,                         -- 팔로업 내용
  close_reason text,
  auto_rule text,                           -- 'absence:+2h', 'absence:next_day_10', 'absence:max→risk', '수동 조정' …
  sms_template text,
  field text, old_value text, new_value text,
  actor_id uuid,                            -- null = system
  created_at timestamptz not null default now(),
  constraint call_shape check (event_type <> 'call' or (connect is not null and call_group is not null and attempt_no is not null)),
  constraint call_result_only_when_connected check (result is null or connect = 'connected'),
  constraint connected_needs_memo check (event_type <> 'call' or connect <> 'connected' or coalesce(trim(memo),'') <> ''),
  constraint call_next_or_close check (event_type <> 'call' or next_action_at is not null or close_reason is not null),
  constraint stage_shape check (event_type <> 'stage' or stage_to is not null)
);
create index on activity_events (subject, subject_id, created_at desc);
create index on activity_events (created_at desc);
create index on activity_events (call_group);

create table dnc_list (                     -- 수신 거부
  subject subject_kind not null,
  subject_id bigint not null,
  reason text not null,
  created_at timestamptz not null default now(),
  primary key (subject, subject_id)
);

-- 부재 정책: 다음 시도 시각 계산 (기존 콘솔 v20.93 규칙 + 예약콜 제안값)
create or replace function next_attempt_after_absence(
  p_subject subject_kind, p_id bigint, p_module module_kind, p_now timestamptz default now())
returns table(next_at timestamptz, rule text, absent_total int, absent_today int, send_sms boolean, auto_close boolean)
language plpgsql stable as $$
declare
  kst timestamp := p_now at time zone 'Asia/Seoul';
  tot int; today int; lim_day int; cutoff int; sms_at int; max_abs int := 5;
  tomorrow10 timestamptz := ((kst::date + 1) + time '10:00') at time zone 'Asia/Seoul';
begin
  select count(*) filter (where true), count(*) filter (where (created_at at time zone 'Asia/Seoul')::date = kst::date)
    into tot, today
  from activity_events
  where subject = p_subject and subject_id = p_id and event_type = 'call' and connect = 'absent';
  tot := tot + 1; today := today + 1;            -- 지금 기록할 부재 포함
  if p_module = 'booking' then lim_day := 3; cutoff := 19; sms_at := 2;
  else lim_day := 2; cutoff := 17; sms_at := 3; end if;

  absent_total := tot; absent_today := today;
  send_sms := (tot = sms_at);
  auto_close := (tot >= max_abs);
  if auto_close then next_at := null; rule := 'absence:max'; return next; return; end if;
  if today >= lim_day then next_at := tomorrow10; rule := 'absence:same_day_limit→next_day_10';
  elsif extract(hour from kst) < cutoff then next_at := p_now + interval '2 hours'; rule := 'absence:+2h';
  else next_at := tomorrow10; rule := 'absence:after_cutoff→next_day_10'; end if;
  return next;
end $$;

-- 스테이지 변경 자동 로그 (am_partners, booking_cases)
create or replace function log_stage_change() returns trigger
language plpgsql security definer as $$
declare v_subject subject_kind; v_id bigint; v_mod module_kind;
begin
  if tg_table_name = 'am_partners' then
    v_subject := 'partner'; v_id := new.partner_id;
    v_mod := case when new.track = 'active' then 'am_active'::module_kind else 'am_new'::module_kind end;
  else v_subject := 'order'; v_id := new.order_id; v_mod := 'booking'; end if;

  if tg_op = 'INSERT' then
    insert into activity_events(subject, subject_id, module, event_type, stage_from, stage_to, memo, auto_rule, actor_id)
    values (v_subject, v_id, v_mod, 'stage', null, new.stage::text, 'created', current_setting('app.auto_rule', true), auth.uid());
  elsif new.stage is distinct from old.stage then
    new.stage_entered_at := now();
    insert into activity_events(subject, subject_id, module, event_type, stage_from, stage_to, memo, auto_rule, actor_id)
    values (v_subject, v_id, v_mod, 'stage', old.stage::text, new.stage::text,
            current_setting('app.stage_reason', true), nullif(current_setting('app.auto_rule', true),''), auth.uid());
  end if;
  if tg_op = 'UPDATE' and new.owner_id is distinct from old.owner_id then
    insert into activity_events(subject, subject_id, module, event_type, field, old_value, new_value, actor_id)
    values (v_subject, v_id, v_mod, 'field', 'owner_id', old.owner_id::text, new.owner_id::text, auth.uid());
  end if;
  return new;
end $$;

create trigger trg_am_stage before insert or update on am_partners
  for each row execute function log_stage_change();
create trigger trg_booking_stage before insert or update on booking_cases
  for each row execute function log_stage_change();

-- 수동 스테이지 이동 RPC (사유 필수)
create or replace function move_stage(p_subject subject_kind, p_id bigint, p_to text, p_reason text, p_auto_rule text default null)
returns void language plpgsql as $$
begin
  if coalesce(trim(p_reason),'') = '' then raise exception '스테이지 이동 사유는 필수입니다'; end if;
  perform set_config('app.stage_reason', p_reason, true);
  perform set_config('app.auto_rule', coalesce(p_auto_rule,''), true);
  if p_subject = 'partner' then
    update am_partners set stage = p_to::am_stage,
      track = case when p_to like 'A%' then 'active'::am_track else track end,
      graduated_at = case when p_to = 'A1' and graduated_at is null then now() else graduated_at end
    where partner_id = p_id;
  else
    update booking_cases set stage = p_to::booking_stage where order_id = p_id;
  end if;
end $$;

-- 콜 기록 RPC: 콜 행 + (필요 시) 자동 스테이지 이동 + 다음 액션 갱신을 한 트랜잭션으로
create or replace function log_call(
  p_subject subject_kind, p_id bigint, p_module module_kind, p_purpose text,
  p_connect connect_kind, p_result result_kind default null,
  p_reason_code text default null, p_reason_detail text default null,
  p_memo text default null, p_next_at timestamptz default null, p_close_reason text default null,
  p_touch_key text default null, p_state char(1) default null, p_voc text[] default null, p_rx text default null,
  p_hesitation text[] default null, p_call_group uuid default gen_random_uuid())
returns bigint language plpgsql as $$
declare
  v_stage text; v_after text; v_attempt int; v_rule text; v_next timestamptz := p_next_at;
  a record; v_id bigint; v_track am_track; v_close text := p_close_reason;
begin
  if p_subject = 'partner' then select stage::text, track into v_stage, v_track from am_partners where partner_id = p_id;
  else select stage::text into v_stage from booking_cases where order_id = p_id; end if;
  select coalesce(max(attempt_no),0)+1 into v_attempt from activity_events
   where subject = p_subject and subject_id = p_id and event_type = 'call';
  v_after := v_stage;

  if p_connect = 'absent' then
    select * into a from next_attempt_after_absence(p_subject, p_id, p_module);
    if v_next is null then v_next := a.next_at; v_rule := a.rule; else v_rule := '수동 조정'; end if;
    if a.auto_close then
      v_close := coalesce(v_close, '부재 '||a.absent_total||'회 — 자동 처리');
      v_after := case p_module when 'booking' then 'BX_LOST' when 'am_new' then 'N_RISK' else 'A_RISK' end;
    elsif p_module = 'booking' then v_after := 'B3';
    end if;
  elsif p_connect in ('dead','refuse') then
    v_after := case p_module when 'booking' then 'BX_LOST' when 'am_new' then 'N_CHURN' else 'A_RISK' end;
    if p_connect = 'refuse' then insert into dnc_list values (p_subject, p_id, '수신 거부') on conflict do nothing; end if;
    v_rule := 'connect:'||p_connect;
    v_close := coalesce(v_close, case p_connect when 'dead' then '결번' else '수신 거부' end);
  elsif p_connect = 'connected' then
    if p_result = 'fail' then v_close := coalesce(v_close, '실패: '||coalesce(p_reason_code,'')); v_after := case p_module when 'booking' then 'BX_LOST' when 'am_new' then 'N_CHURN' else 'A_RISK' end;
    elsif p_module = 'booking' and p_result in ('hold','go') then v_after := 'B2';
      if p_result = 'go' and v_next is null then v_next := now() + interval '3 hours'; v_rule := 'go→확정 확인 +3h'; end if;
    end if;
  end if;
  if v_next is null and v_close is null then
    raise exception '팔로업 일시 또는 종료 사유가 필요합니다';
  end if;

  insert into activity_events(subject, subject_id, module, event_type, call_group, attempt_no, purpose, touch_key,
    connect, result, reason_code, reason_detail, state_code, voc_tags, rx_code, hesitation_tags, memo,
    stage_at, stage_after, next_action_at, close_reason, auto_rule, actor_id)
  values (p_subject, p_id, p_module, 'call', p_call_group, v_attempt, p_purpose, p_touch_key,
    p_connect, p_result, p_reason_code, p_reason_detail, p_state, p_voc, p_rx, p_hesitation, p_memo,
    v_stage, v_after, v_next, v_close,
    v_rule, auth.uid())
  returning id into v_id;

  if p_subject = 'order' and v_after = 'BX_LOST' then   -- 이탈 사유를 먼저 채워야 제약 통과
    update booking_cases set lost_reason = case
      when p_connect <> 'connected' then 'unreachable'::lost_reason
      when p_reason_code in ('other_company','price','cancel_postpone','self_solved') then p_reason_code::lost_reason
      else 'etc'::lost_reason end
    where order_id = p_id;
  end if;
  if v_after is distinct from v_stage then
    perform move_stage(p_subject, p_id, v_after, '콜 결과 반영: '||p_connect||coalesce('/'||p_result,'')||coalesce(' · '||p_reason_code,''), v_rule);
  end if;
  if p_subject = 'partner' then update am_partners set next_action_at = v_next where partner_id = p_id;
  else update booking_cases set next_call_at = v_next where order_id = p_id; end if;
  return v_id;
end $$;

-- 콜 로그 집계 뷰 (1통화 1건)
create view v_call_stats_daily as
select (created_at at time zone 'Asia/Seoul')::date as day, module, actor_id,
       count(distinct call_group) as calls,
       count(distinct call_group) filter (where connect = 'connected') as connected,
       count(distinct call_group) filter (where connect = 'absent') as absent,
       count(distinct call_group) filter (where stage_after is distinct from stage_at) as moved,
       count(distinct subject_id) as touched,
       count(distinct call_group) filter (where next_action_at is not null) as followups
from activity_events where event_type = 'call'
group by 1,2,3;

create view v_call_heatmap as
select extract(isodow from created_at at time zone 'Asia/Seoul')::int as dow,
       extract(hour from created_at at time zone 'Asia/Seoul')::int as hour,
       count(distinct call_group) as calls,
       count(distinct call_group) filter (where connect = 'connected') as connected
from activity_events where event_type = 'call' group by 1,2;

create view v_timeline as
select subject, subject_id, created_at, event_type, module, purpose, connect, result, reason_code,
       coalesce(stage_from,'') || case when event_type='stage' then ' → '||stage_to else '' end as stage_move,
       memo, next_action_at, actor_id
from activity_events;

-- ───────── RLS ─────────
alter table activity_events enable row level security;
alter table dnc_list enable row level security;
alter table am_partners   enable row level security;
alter table booking_cases enable row level security;
alter table partner_capacity enable row level security;

-- 로그: 직원은 읽기·쓰기(INSERT)만. UPDATE/DELETE 정책 없음 = 불가
do $$ declare t text; begin
  foreach t in array array['activity_events','partner_capacity','dnc_list'] loop
    execute format('create policy %I_read on %I for select using (current_staff_role() is not null)', t, t);
    execute format('create policy %I_insert on %I for insert with check (current_staff_role() is not null)', t, t);
  end loop;
end $$;

create policy am_rw on am_partners for all
  using (current_staff_role() in ('operator','am_onboarding','am_growth','lead'))
  with check (current_staff_role() in ('operator','am_onboarding','am_growth','lead'));
create policy am_read_all on am_partners for select using (current_staff_role() is not null);

create policy booking_rw on booking_cases for all
  using (current_staff_role() in ('operator','booking_call','lead'))
  with check (current_staff_role() in ('operator','booking_call','lead'));
create policy booking_read_all on booking_cases for select using (current_staff_role() is not null);

-- reason_dict · touch_cadence 는 누구나 읽기, lead·operator 수정 (초기 동일 권한)
alter table reason_dict enable row level security;
alter table touch_cadence enable row level security;
create policy rd_read on reason_dict for select using (current_staff_role() is not null);
create policy rd_write on reason_dict for all using (current_staff_role() in ('lead','operator')) with check (current_staff_role() in ('lead','operator'));
create policy tc_read on touch_cadence for select using (current_staff_role() is not null);
create policy tc_write on touch_cadence for all using (current_staff_role() in ('lead','operator')) with check (current_staff_role() in ('lead','operator'));

-- ───────── 사전 시드 ─────────
insert into reason_dict(module,result,code,label,sort) values
 ('am_new','hold','callback','통화 곤란 — 재통화',1),('am_new','hold','thinking','고민해본다 함',2),('am_new','hold','onsite','현장 작업 중',3),('am_new','hold','no_budget','충전 여력 없음',4),
 ('am_new','fail','reduce','미소 비중 축소 의사',1),('am_new','fail','other_platform','타 플랫폼 전환',2),('am_new','fail','closed','폐업·휴업',3),('am_new','fail','complaint_dnc','불만 — 전화 금지 요청',4),('am_new','fail','etc','기타',9),
 ('am_active','hold','callback','통화 곤란 — 재통화',1),('am_active','hold','after_peak','성수기 이후 논의',2),('am_active','hold','check_team','팀 사정 확인 후 회신',3),
 ('am_active','fail','reduce','투입 축소 의사',1),('am_active','fail','other_platform','타 플랫폼 전환',2),('am_active','fail','complaint_dnc','불만 — 전화 금지 요청',3),('am_active','fail','etc','기타',9),
 ('booking','hold','thinking','고민 중',1),
 ('booking','fail','other_company','타사 계약',1),('booking','fail','price','가격',2),('booking','fail','cancel_postpone','이사 취소·연기',3),('booking','fail','self_solved','직접 해결',4),('booking','fail','etc','기타',9);

insert into touch_cadence(key,module,title,channel,day_offset,must,success,sla) values
 ('W0','am_new','웰컴콜','전화',null,true,'서비스 유형·가능 지역·일정 확인','첫 충전 24h'),
 ('D1','am_new','첫 참여 리뷰','전화',1,true,'프로필 마감 or 액션 1개 합의 + 환불 제도 인지',null),
 ('D2','am_new','선택 분기 체크','알림톡 (B는 콜)',2,false,'전원 상태 판정',null),
 ('D3','am_new','환불·신뢰 콜','전화 (B 필수)',3,false,'B 환불 접수 100%',null),
 ('D7','am_new','첫 주 결산','전화',7,true,'현장 의견 태그 기록 100%',null),
 ('D14','am_new','상태 기반 터치','🟡🔴만 콜',14,false,'처방 합의',null),
 ('D21','am_new','재충전 사전 대화','전화',21,true,'재충전 의사 or 미충전 사유 1개',null),
 ('D30','am_new','졸업 판정','전화',30,true,'졸업 사유 기록',null),
 ('EV_SELECTED','am_new','첫 선택 발생','메시지',null,true,'당일 발송','당일'),
 ('EV_48H','am_new','48h 접촉 불명','전화',null,true,'24h 내 콜','24h'),
 ('EV_ATBAT','am_new','남은 견적 ≤ 2','전화',null,true,'재충전 대화','다음 영업일'),
 ('EV_LOST3','am_new','미성사 3건','전화',null,true,'견적가·프로필 피드백 1개','2영업일'),
 ('WK','am_active','주간 투입 점검','전화',null,true,'가용 팀·투입 예정 건수·타사 ROI 갱신','주 1회');

-- ───────── staff 테이블 RLS: 본인·동료 목록은 읽기, 수정은 lead만 ─────────
alter table staff enable row level security;
create policy staff_read on staff for select using (current_staff_role() is not null or id = auth.uid());
create policy staff_write on staff for all using (current_staff_role() = 'lead') with check (current_staff_role() = 'lead');

-- 운영 레이어 · 원천 테이블 RLS (직원만 읽기, 원천은 서버(service_role) 동기화만 쓰기)
alter table src_partners enable row level security;
alter table src_orders enable row level security;
alter table src_quotes enable row level security;
alter table partner_monthly_kpi enable row level security;
alter table manual_match_requests enable row level security;
create policy srcp_read on src_partners for select using (current_staff_role() is not null);
create policy srco_read on src_orders for select using (current_staff_role() is not null);
create policy srcq_read on src_quotes for select using (current_staff_role() is not null);
create policy kpi_read on partner_monthly_kpi for select using (current_staff_role() is not null);
create policy mm_rw on manual_match_requests for all using (current_staff_role() is not null) with check (current_staff_role() is not null);

-- 📌 팔로업 목록: 종료 상태는 자동 제외 (기존 콘솔의 'lost인데 팔로업에 남는' 문제 방지)
create view v_followups as
select 'partner'::subject_kind as subject, a.partner_id as subject_id,
       case when a.track='active' then 'am_active' else 'am_new' end as module,
       a.stage::text as stage, a.next_action_at as followup_at, a.next_action_note as note, a.owner_id,
       a.next_action_at < now() as overdue
from am_partners a
where a.next_action_at is not null and a.stage not in ('N_CHURN')
union all
select 'order', b.order_id, 'booking', b.stage::text, b.next_call_at, null, b.owner_id, b.next_call_at < now()
from booking_cases b
where b.next_call_at is not null and b.stage in ('B0','B1','B2','B3');
-- 팔로업 없이 열려 있는 대상 (팔로업 미등록 점검용)
create view v_followup_missing as
select 'partner'::subject_kind as subject, partner_id as subject_id, stage::text as stage, owner_id from am_partners
 where next_action_at is null and stage not in ('N_CHURN')
union all
select 'order', order_id, stage::text, owner_id from booking_cases where next_call_at is null and stage in ('B1','B2','B3');

-- 뷰도 호출자 권한(RLS)을 따르게 (2026-10-01 적용본에 포함)
alter view v_quote_display set (security_invoker = true);
alter view v_partner_utilization set (security_invoker = true);
alter view v_call_stats_daily set (security_invoker = true);
alter view v_call_heatmap set (security_invoker = true);
alter view v_timeline set (security_invoker = true);
alter view v_followups set (security_invoker = true);
alter view v_followup_missing set (security_invoker = true);
