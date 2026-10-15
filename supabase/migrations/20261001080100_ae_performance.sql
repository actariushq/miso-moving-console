-- AE 온보딩(미소방문·방문견적) + 성과 관리 (2026-10-01)

create type ae_stage as enum ('E0','E1','E2','E3','E4','E5','EX');
create type service_line as enum ('miso_visit','visit_quote');

create table ae_leads (
  id bigint generated always as identity primary key,
  partner_id bigint,                        -- rfq-admin 파트너 ID (있으면)
  name text not null,
  region text,
  service_line service_line not null,
  source text not null default 'nurtured' check (source in ('nurtured','churned','inbound','cross_sell','outbound')),
  stage ae_stage not null default 'E0',
  stage_entered_at timestamptz not null default now(),
  owner_id uuid references staff(id),
  next_action_at timestamptz,
  next_action_note text,
  lost_reason text,
  charged_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index ae_leads_partner_line on ae_leads(partner_id, service_line) where partner_id is not null;
create index on ae_leads(stage);

create table charges (
  id bigint generated always as identity primary key,
  lead_id bigint references ae_leads(id),
  partner_id bigint,
  service_line service_line not null,
  amount int not null check (amount > 0),
  charged_at timestamptz not null default now(),
  source text not null default 'manual' check (source in ('manual','sync')),
  actor_id uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index on charges(charged_at);

alter table ae_leads enable row level security;
alter table charges enable row level security;
create policy ae_rw on ae_leads for all using (current_staff_role() is not null) with check (current_staff_role() is not null);
create policy ch_read on charges for select using (current_staff_role() is not null);
create policy ch_insert on charges for insert with check (current_staff_role() is not null);

-- AE 결과 사전 (기존 miso-console 콜 진행 분류 계승)
insert into reason_dict(module,result,code,label,sort) values
 ('ae','hold','docs_before','서류 준비 전',1),('ae','hold','docs_preparing','서류 준비 중',2),('ae','hold','callback','지금 통화 곤란 — 재통화',3),('ae','hold','thinking','고민해본다 함',4),
 ('ae','fail','no_will','자격은 있으나 의지가 없음',1),('ae','fail','no_qual_no_will','자격 없고 의지도 없음',2),('ae','fail','not_miso','의지는 있으나 미소는 안 함',3),('ae','fail','complaint_dnc','불만 — 전화 금지 요청',4),('ae','fail','etc','기타',9);

-- 스테이지 로그 트리거: lead 추가
create or replace function log_stage_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_subject subject_kind; v_id bigint; v_mod module_kind;
begin
  if tg_table_name = 'am_partners' then
    v_subject := 'partner'; v_id := new.partner_id;
    v_mod := case when new.track = 'active' then 'am_active'::module_kind else 'am_new'::module_kind end;
  elsif tg_table_name = 'ae_leads' then v_subject := 'lead'; v_id := new.id; v_mod := 'ae';
  else v_subject := 'order'; v_id := new.order_id; v_mod := 'booking'; end if;
  if tg_op = 'INSERT' then
    insert into activity_events(subject, subject_id, module, event_type, stage_from, stage_to, memo, auto_rule, actor_id)
    values (v_subject, v_id, v_mod, 'stage', null, new.stage::text, 'created', nullif(current_setting('app.auto_rule', true),''), auth.uid());
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
create trigger trg_ae_stage before insert or update on ae_leads for each row execute function log_stage_change();

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
  elsif p_subject::text = 'lead' then
    update ae_leads set stage = p_to::ae_stage where id = p_id;
  else
    update booking_cases set stage = p_to::booking_stage where order_id = p_id;
  end if;
end $$;

-- log_call: lead(AE) 지원 — 부재 정책은 파트너 규칙(17시·같은 날 2회·3회째 문자·5회), 결과로 스테이지 이동
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
  a record; v_id bigint; v_close text := p_close_reason; is_lead boolean := p_subject::text = 'lead';
begin
  if p_subject = 'partner' then select stage::text into v_stage from am_partners where partner_id = p_id;
  elsif is_lead then select stage::text into v_stage from ae_leads where id = p_id;
  else select stage::text into v_stage from booking_cases where order_id = p_id; end if;
  select coalesce(max(attempt_no),0)+1 into v_attempt from activity_events
   where subject = p_subject and subject_id = p_id and event_type = 'call';
  v_after := v_stage;

  if p_connect = 'absent' then
    select * into a from next_attempt_after_absence(p_subject, p_id, p_module);
    if v_next is null then v_next := a.next_at; v_rule := a.rule; else v_rule := '수동 조정'; end if;
    if a.auto_close then
      v_close := coalesce(v_close, '부재 '||a.absent_total||'회 — 자동 처리');
      v_after := case when is_lead then 'EX' when p_module = 'booking' then 'BX_LOST' when p_module = 'am_new' then 'N_RISK' else 'A_RISK' end;
    elsif p_module = 'booking' then v_after := 'B3';
    elsif is_lead and v_stage = 'E0' then v_after := 'E1';
    end if;
  elsif p_connect in ('dead','refuse') then
    v_after := case when is_lead then 'EX' when p_module = 'booking' then 'BX_LOST' when p_module = 'am_new' then 'N_CHURN' else 'A_RISK' end;
    if p_connect = 'refuse' then insert into dnc_list values (p_subject, p_id, '수신 거부') on conflict do nothing; end if;
    v_rule := 'connect:'||p_connect;
    v_close := coalesce(v_close, case p_connect when 'dead' then '결번' else '수신 거부' end);
  elsif p_connect = 'connected' then
    if p_result = 'fail' then
      v_close := coalesce(v_close, '실패: '||coalesce(p_reason_code,''));
      v_after := case when is_lead then 'EX' when p_module = 'booking' then 'BX_LOST' when p_module = 'am_new' then 'N_CHURN' else 'A_RISK' end;
    elsif p_module = 'booking' and p_result in ('hold','go') then v_after := 'B2';
      if p_result = 'go' and v_next is null then v_next := now() + interval '3 hours'; v_rule := 'go→확정 확인 +3h'; end if;
    elsif is_lead and v_stage in ('E0','E1') then v_after := case when p_result = 'go' then 'E3' else 'E2' end;
    elsif is_lead and v_stage = 'E2' and p_result = 'go' then v_after := 'E3';
    end if;
  elsif p_connect = 'etc' and is_lead and v_stage = 'E0' then v_after := 'E1';
  end if;
  if v_next is null and v_close is null then raise exception '팔로업 일시 또는 종료 사유가 필요합니다'; end if;

  insert into activity_events(subject, subject_id, module, event_type, call_group, attempt_no, purpose, touch_key,
    connect, result, reason_code, reason_detail, state_code, voc_tags, rx_code, hesitation_tags, memo,
    stage_at, stage_after, next_action_at, close_reason, auto_rule, actor_id)
  values (p_subject, p_id, p_module, 'call', p_call_group, v_attempt, p_purpose, p_touch_key,
    p_connect, p_result, p_reason_code, p_reason_detail, p_state, p_voc, p_rx, p_hesitation, p_memo,
    v_stage, v_after, v_next, v_close, v_rule, auth.uid())
  returning id into v_id;

  if p_subject = 'order' and v_after = 'BX_LOST' then
    update booking_cases set lost_reason = case
      when p_connect <> 'connected' then 'unreachable'::lost_reason
      when p_reason_code in ('other_company','price','cancel_postpone','self_solved') then p_reason_code::lost_reason
      else 'etc'::lost_reason end
    where order_id = p_id;
  end if;
  if is_lead and v_after = 'EX' then update ae_leads set lost_reason = coalesce(p_reason_code, p_connect::text) where id = p_id; end if;
  if v_after is distinct from v_stage then
    perform move_stage(p_subject, p_id, v_after, '콜 결과 반영: '||p_connect||coalesce('/'||p_result,'')||coalesce(' · '||p_reason_code,''), v_rule);
  end if;
  if p_subject = 'partner' then update am_partners set next_action_at = v_next where partner_id = p_id;
  elsif is_lead then update ae_leads set next_action_at = v_next where id = p_id;
  else update booking_cases set next_call_at = v_next where order_id = p_id; end if;
  return v_id;
end $$;

-- 충전 기록 → E5 + AM 신규 정착(N0)으로 이관
create or replace function record_charge(p_lead bigint, p_amount int, p_memo text default null)
returns text language plpgsql security definer set search_path = public as $$
declare l record; v_pid bigint;
begin
  -- src_partners는 화면에서 읽기 전용이라 definer로 실행. 콘솔 계정만 호출 가능
  if current_staff_role() is null then raise exception '권한 없음'; end if;
  select * into l from ae_leads where id = p_lead;
  if l is null then raise exception '리드를 찾을 수 없습니다'; end if;
  if p_amount is null or p_amount <= 0 then raise exception '충전 금액을 입력하세요'; end if;
  insert into charges(lead_id, partner_id, service_line, amount) values (p_lead, l.partner_id, l.service_line, p_amount);
  update ae_leads set charged_at = coalesce(charged_at, now()) where id = p_lead;
  insert into activity_events(subject, subject_id, module, event_type, field, new_value, memo)
  values ('lead', p_lead, 'ae', 'field', 'charge', p_amount::text, coalesce(p_memo, '충전 ' || p_amount || '원'));
  if l.stage <> 'E5' then perform move_stage('lead', p_lead, 'E5', '충전 ' || p_amount || '원 확인'); end if;
  v_pid := l.partner_id;
  if v_pid is null then return 'charged_no_partner_id'; end if;
  insert into src_partners(partner_id, name, region, service_types, first_charged_at, balance)
  values (v_pid, l.name, l.region, array[l.service_line::text], now(), p_amount)
  on conflict (partner_id) do update set first_charged_at = coalesce(src_partners.first_charged_at, now()),
    service_types = (select array_agg(distinct x) from unnest(src_partners.service_types || array[l.service_line::text]) x);
  if not exists (select 1 from am_partners where partner_id = v_pid) then
    perform set_config('app.auto_rule', 'ae_charge→am_new', true);
    insert into am_partners(partner_id, next_action_at, next_action_note) values (v_pid, now() + interval '1 day', 'W0 웰컴콜 (AE 이관)');
    return 'handed_to_am';
  end if;
  return 'charged';
end $$;

-- 일괄 배정: lead 지원
create or replace function assign_owner(p_subject text, p_ids bigint[], p_owner uuid)
returns int language plpgsql as $$
declare n int;
begin
  if p_subject = 'partner' then update am_partners set owner_id = p_owner where partner_id = any(p_ids);
  elsif p_subject = 'lead' then update ae_leads set owner_id = p_owner where id = any(p_ids);
  else update booking_cases set owner_id = p_owner where order_id = any(p_ids); end if;
  get diagnostics n = row_count; return n;
end $$;

-- AE 보드 뷰
create or replace view v_ae_board with (security_invoker = true) as
select l.*,
  lc.created_at as last_call_at, lc.connect::text as last_connect, lc.result::text as last_result, lc.reason_code as last_reason,
  (select count(*) from activity_events e where e.subject::text='lead' and e.subject_id=l.id and e.event_type='call')::int as call_count,
  (select coalesce(sum(amount),0) from charges c where c.lead_id = l.id)::int as charged_amount
from ae_leads l
left join lateral (select created_at, connect, result, reason_code from activity_events e
  where e.subject::text='lead' and e.subject_id=l.id and e.event_type='call' order by created_at desc limit 1) lc on true;

-- 오늘의 큐에 AE 리드 포함
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
where b.stage in ('B0','B1','B2','B3')
union all
select 'lead', l.id, 'ae', l.stage::text, l.name || case l.service_line when 'miso_visit' then ' · 미소방문' else ' · RFQ' end, l.region, l.owner_id,
       l.next_action_at, l.next_action_note,
       (select max(created_at) from activity_events e where e.subject::text='lead' and e.subject_id=l.id and e.event_type='call')
from ae_leads l
where l.stage in ('E1','E2','E3','E4') or (l.stage = 'E0' and l.next_action_at is not null);

-- ───────── 성과 ─────────
-- AE: 기간·서비스라인·담당별 시도/연결/충전 (콜 수는 통화 단위)
create or replace function perf_ae(p_from timestamptz, p_to timestamptz)
returns table(service_line text, actor_id uuid, attempts int, connected int, moved int, charges int, charge_amount bigint)
language sql stable as $$
  with calls as (
    select distinct on (e.call_group) e.call_group, l.service_line::text as line, e.actor_id, e.connect, e.stage_at, e.stage_after
    from activity_events e join ae_leads l on l.id = e.subject_id
    where e.subject::text = 'lead' and e.event_type = 'call' and e.created_at >= p_from and e.created_at < p_to
  ), c as (
    select service_line::text as line, actor_id, count(*) n, sum(amount) amt from charges
    where charged_at >= p_from and charged_at < p_to group by 1,2
  ), k as (
    select line, actor_id, count(*) attempts, count(*) filter (where connect = 'connected') connected,
           count(*) filter (where stage_after is distinct from stage_at) moved
    from calls group by 1,2
  )
  select coalesce(k.line, c.line), coalesce(k.actor_id, c.actor_id), coalesce(k.attempts,0)::int, coalesce(k.connected,0)::int, coalesce(k.moved,0)::int,
         coalesce(c.n,0)::int, coalesce(c.amt,0)::bigint
  from k full join c on c.line = k.line and c.actor_id is not distinct from k.actor_id;
$$;

-- AM: 최근 N일 활동 파트너(견적 제출 기준) 중 캐파 파악 수, 맥스캐파(N일 환산) 대비 실제 투입(확정 건)·가동률 — 서비스라인별
create or replace function perf_am(p_days int default 28)
returns table(service_line text, active_partners int, capa_known int, max_capa numeric, actual_jobs int, utilization numeric,
              quotes int, selected int, selection_rate numeric)
language sql stable as $$
  with w as (select now() - make_interval(days => p_days) as since),
  act as (
    select distinct o.service_type as line, q.partner_id
    from src_quotes q join src_orders o on o.order_id = q.order_id, w
    where q.submitted_at >= w.since
  ),
  cap as (
    select distinct on (partner_id) partner_id, monthly_capacity from partner_capacity order by partner_id, recorded_at desc
  ),
  jobs as (
    select o.service_type as line, o.confirmed_partner_id as partner_id, count(*) n
    from src_orders o, w where o.confirmed_at >= w.since and o.confirmed_partner_id is not null group by 1,2
  ),
  qs as (
    select o.service_type as line, count(*) quotes,
           count(*) filter (where o.confirmed_partner_id = q.partner_id) selected
    from src_quotes q join src_orders o on o.order_id = q.order_id, w where q.submitted_at >= w.since group by 1
  )
  select a.line,
         count(*)::int,
         count(cap.partner_id)::int,
         round(coalesce(sum(cap.monthly_capacity) * p_days / 30.0, 0), 1),
         coalesce(sum(j.n) filter (where cap.partner_id is not null), 0)::int,
         case when sum(cap.monthly_capacity) > 0 then round(coalesce(sum(j.n) filter (where cap.partner_id is not null),0) / (sum(cap.monthly_capacity) * p_days / 30.0), 4) end,
         max(qs.quotes)::int, max(qs.selected)::int,
         case when max(qs.quotes) > 0 then round(max(qs.selected)::numeric / max(qs.quotes), 4) end
  from act a
  left join cap on cap.partner_id = a.partner_id
  left join jobs j on j.partner_id = a.partner_id and j.line = a.line
  left join qs on qs.line = a.line
  group by a.line;
$$;

-- AE 퍼널 현황 (서비스라인·스테이지·소스)
create or replace view v_ae_funnel with (security_invoker = true) as
select service_line::text as service_line, source, stage::text as stage, count(*)::int as n
from ae_leads group by 1,2,3;

revoke execute on function record_charge(bigint,int,text) from anon;
