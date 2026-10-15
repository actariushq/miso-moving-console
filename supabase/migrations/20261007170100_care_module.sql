-- AM 관리 대상(파트너 케어) 2/2 (2026-10-07)
-- 단계 [제안]: C0 미컨택 → C1 시도중 → C2 연결 → C3 원인 파악 → C4 개선 액션 → C5 회복 확인 중 → WON 회복 / LOST 관리 종료
-- 리스트(관리구분 · 판정 근거 · 권장 액션 · 참여/계약 지표)는 import_care_list 로 — 기존 파트너는 지표만 갱신(단계 · 담당 · 팔로우업 유지), 새 파트너만 추가
-- 리스트 형식이 바뀌어도 되게 지표는 원래 칸 이름 그대로 metrics(jsonb)에 둔다

create table am_care (
  id bigint generated always as identity primary key,
  partner_id bigint not null unique,
  name text,
  region text,
  segment text,                                  -- 관리구분 (예: 9월 참여 후 10월 미참여)
  priority smallint not null default 4 check (priority between 1 and 4),  -- P1~P3, 4 = 정상/관찰
  reason text,                                   -- 판정 근거
  action text,                                   -- 권장 AM 액션
  metrics jsonb,                                 -- 참여 · 계약 지표 (원래 칸 이름 그대로)
  list_version text,
  stage care_stage not null default 'C0',
  stage_entered_at timestamptz not null default now(),
  owner_id uuid references staff(id),
  next_action_at timestamptz,
  next_action_note text,
  tags text[] not null default '{}',
  manual_priority smallint check (manual_priority between 1 and 4),
  lost_reason text,
  recovered_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index on am_care(stage);
create index on am_care(next_action_at) where next_action_at is not null;
alter table am_care enable row level security;
create policy care_rw on am_care for all using (current_staff_role() is not null) with check (current_staff_role() is not null);
create trigger trg_care_stage before insert or update on am_care for each row execute function log_stage_change();

create or replace function care_stage_rank(s text) returns int language sql immutable as $$
  select array_position(array['C0','C1','C2','C3','C4','C5','WON'], s)
$$;

CREATE OR REPLACE FUNCTION public.log_stage_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_subject subject_kind; v_id bigint; v_mod module_kind;
begin
  if tg_table_name = 'am_partners' then
    v_subject := 'partner'; v_id := new.partner_id;
    v_mod := case when new.track = 'active' then 'am_active'::module_kind else 'am_new'::module_kind end;
  elsif tg_table_name = 'ae_leads' then v_subject := 'lead'; v_id := new.id; v_mod := 'ae';
  elsif tg_table_name = 'am_care' then v_subject := 'care'; v_id := new.id; v_mod := 'am_care';
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
end $function$;

CREATE OR REPLACE FUNCTION public.move_stage(p_subject subject_kind, p_id bigint, p_to text, p_reason text, p_auto_rule text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
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
  elsif p_subject::text = 'care' then
    update am_care set stage = p_to::care_stage, recovered_at = case when p_to = 'WON' then coalesce(recovered_at, now()) else recovered_at end where id = p_id;
  else
    update booking_cases set stage = p_to::booking_stage where order_id = p_id;
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.assign_owner(p_subject text, p_ids bigint[], p_owner uuid)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
declare n int;
begin
  if p_subject = 'partner' then update am_partners set owner_id = p_owner where partner_id = any(p_ids);
  elsif p_subject = 'lead' then update ae_leads set owner_id = p_owner where id = any(p_ids);
  elsif p_subject = 'care' then update am_care set owner_id = p_owner where id = any(p_ids);
  else update booking_cases set owner_id = p_owner where order_id = any(p_ids); end if;
  get diagnostics n = row_count; return n;
end $function$;

CREATE OR REPLACE FUNCTION public.log_call(p_subject subject_kind, p_id bigint, p_module module_kind, p_purpose text, p_connect connect_kind, p_result result_kind DEFAULT NULL::result_kind, p_reason_code text DEFAULT NULL::text, p_reason_detail text DEFAULT NULL::text, p_memo text DEFAULT NULL::text, p_next_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_close_reason text DEFAULT NULL::text, p_touch_key text DEFAULT NULL::text, p_state character DEFAULT NULL::bpchar, p_voc text[] DEFAULT NULL::text[], p_rx text DEFAULT NULL::text, p_hesitation text[] DEFAULT NULL::text[], p_call_group uuid DEFAULT gen_random_uuid(), p_next_note text DEFAULT NULL::text, p_stage_to text DEFAULT NULL::text, p_points text[] DEFAULT NULL::text[], p_concerns text[] DEFAULT NULL::text[], p_counterpart text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
AS $function$
declare
  v_stage text; v_after text; v_attempt int; v_rule text; v_next timestamptz := p_next_at;
  a record; v_id bigint; v_close text := p_close_reason; is_lead boolean := p_subject::text = 'lead'; is_care boolean := p_subject::text = 'care';
  v_note text := nullif(trim(coalesce(p_next_note, '')), '');
begin
  if p_subject = 'partner' then select stage::text into v_stage from am_partners where partner_id = p_id;
  elsif is_lead then select stage::text into v_stage from ae_leads where id = p_id;
  elsif is_care then select stage::text into v_stage from am_care where id = p_id;
  else select stage::text into v_stage from booking_cases where order_id = p_id; end if;
  select coalesce(max(attempt_no),0)+1 into v_attempt from activity_events
   where subject = p_subject and subject_id = p_id and event_type = 'call';
  v_after := v_stage;

  if p_connect = 'absent' then
    select * into a from next_attempt_after_absence(p_subject, p_id, p_module);
    if v_next is null then v_next := a.next_at; v_rule := a.rule; else v_rule := '수동 조정'; end if;
    if a.auto_close then
      v_close := coalesce(v_close, '부재 '||a.absent_total||'회 — 자동 처리');
      v_after := case when is_lead or is_care then 'LOST' when p_module = 'booking' then 'BX_LOST' when p_module = 'am_new' then 'N_RISK' else 'A_RISK' end;
    elsif p_module = 'booking' then v_after := 'B3';
    elsif is_lead and v_stage = 'E0' then v_after := 'E1';
    elsif is_care and v_stage = 'C0' then v_after := 'C1';
    end if;
  elsif p_connect in ('dead','refuse') then
    v_after := case when is_lead or is_care then 'LOST' when p_module = 'booking' then 'BX_LOST' when p_module = 'am_new' then 'N_CHURN' else 'A_RISK' end;
    if p_connect = 'refuse' then insert into dnc_list values (p_subject, p_id, '수신 거부') on conflict do nothing; end if;
    v_rule := 'connect:'||p_connect;
    v_close := coalesce(v_close, case p_connect when 'dead' then '결번' else '수신 거부' end);
  elsif p_connect = 'connected' then
    if p_result = 'fail' then
      v_close := coalesce(v_close, '실패: '||coalesce(p_reason_code,''));
      v_after := case when is_lead or is_care then 'LOST' when p_module = 'booking' then 'BX_LOST' when p_module = 'am_new' then 'N_CHURN' else 'A_RISK' end;
    elsif p_module = 'booking' and p_result in ('hold','go') then v_after := 'B2';
      if p_result = 'go' and v_next is null then v_next := now() + interval '3 hours'; v_rule := 'go→확정 확인 +3h'; end if;
    -- 리드: 처음 연결되면 보류 = E2 연결, 진행 = E3 관심있음. 그 뒤 단계는 담당자가 고른다
    elsif is_lead and v_stage in ('E0','E1') then v_after := case when p_result = 'go' then 'E3' else 'E2' end;
    elsif is_lead and v_stage = 'E2' and p_result = 'go' then v_after := 'E3';
    -- 관리 대상: 처음 연결되면 재통화 = C2 연결, 협조적(원인 파악됨) = C3 원인 파악
    elsif is_care and v_stage in ('C0','C1') then v_after := case when p_result = 'go' then 'C3' else 'C2' end;
    elsif is_care and v_stage = 'C2' and p_result = 'go' then v_after := 'C3';
    end if;
  elsif p_connect = 'etc' and is_lead and v_stage = 'E0' then v_after := 'E1';
  elsif p_connect = 'etc' and is_care and v_stage = 'C0' then v_after := 'C1';
  end if;

  -- 통화 후 단계 지정(리드만). 이탈로 닫히는 콜은 무시. WON은 첫 견적 확인, LOST는 실패 결과로만
  if (is_lead or is_care) and p_stage_to is not null and v_after <> 'LOST' then
    if p_stage_to in ('WON','LOST') then raise exception '완료·이탈은 콜 결과/첫 견적 확인으로만 이동합니다'; end if;
    if p_stage_to is distinct from v_after then v_after := p_stage_to; v_rule := coalesce(v_rule||' · ', '')||'담당자 지정'; end if;
  end if;
  if v_next is null and v_close is null then raise exception '팔로업 일시 또는 종료 사유가 필요합니다'; end if;

  insert into activity_events(subject, subject_id, module, event_type, call_group, attempt_no, purpose, touch_key,
    connect, result, reason_code, reason_detail, state_code, voc_tags, rx_code, hesitation_tags, memo,
    stage_at, stage_after, next_action_at, next_action, close_reason, auto_rule, actor_id, call_points, concerns, counterpart)
  values (p_subject, p_id, p_module, 'call', p_call_group, v_attempt, p_purpose, p_touch_key,
    p_connect, p_result, p_reason_code, p_reason_detail, p_state, p_voc, p_rx, p_hesitation, p_memo,
    v_stage, v_after, v_next, v_note, v_close, v_rule, auth.uid(), p_points, p_concerns, nullif(trim(coalesce(p_counterpart, '')), ''))
  returning id into v_id;

  if p_subject = 'order' and v_after = 'BX_LOST' then
    update booking_cases set lost_reason = case
      when p_connect <> 'connected' then 'unreachable'::lost_reason
      when p_reason_code in ('other_company','price','cancel_postpone','self_solved') then p_reason_code::lost_reason
      else 'etc'::lost_reason end
    where order_id = p_id;
  end if;
  if is_lead and v_after = 'LOST' then update ae_leads set lost_reason = coalesce(p_reason_code, p_connect::text) where id = p_id; end if;
  if is_care and v_after = 'LOST' then update am_care set lost_reason = coalesce(p_reason_code, p_connect::text) where id = p_id; end if;
  -- 리드가 첫 연결 콜로 연결(E2)을 넘어 바로 앞 단계로 가면, 연결 단계를 거친 기록을 먼저 남긴다 (퍼널 '연결' 수가 빠지지 않게)
  if is_lead and p_connect = 'connected' and v_stage in ('E0','E1') and v_after <> 'LOST' and ae_stage_rank(v_after) > ae_stage_rank('E2') then
    perform move_stage(p_subject, p_id, 'E2', '콜 연결 (경유)', v_rule);
    v_stage := 'E2';
  end if;
  if is_care and p_connect = 'connected' and v_stage in ('C0','C1') and v_after <> 'LOST' and care_stage_rank(v_after) > care_stage_rank('C2') then
    perform move_stage(p_subject, p_id, 'C2', '콜 연결 (경유)', v_rule);
    v_stage := 'C2';
  end if;
  if v_after is distinct from v_stage then
    perform move_stage(p_subject, p_id, v_after,
      case when v_rule like '%담당자 지정%' and p_connect = 'connected' and p_result is distinct from 'fail' then '콜 후 담당자 지정' else '콜 결과 반영: '||p_connect||coalesce('/'||p_result,'')||coalesce(' · '||p_reason_code,'') end, v_rule);
  end if;
  if p_subject = 'partner' then
    update am_partners set next_action_at = v_next, next_action_note = coalesce(v_note, next_action_note) where partner_id = p_id;
  elsif is_lead then
    update ae_leads set next_action_at = case when v_after = 'LOST' then null else v_next end,
      next_action_note = case when v_after = 'LOST' or v_next is null then null else v_note end where id = p_id;
  elsif is_care then
    update am_care set next_action_at = case when v_after = 'LOST' then null else v_next end,
      next_action_note = case when v_after = 'LOST' or v_next is null then null else v_note end where id = p_id;
  else update booking_cases set next_call_at = v_next where order_id = p_id; end if;
  return v_id;
end $function$;

-- 콜 없이 팔로우업 변경 (관리 대상)
create or replace function set_care_followup(p_id bigint, p_at timestamptz, p_note text default null)
returns void language plpgsql as $$
declare v_old timestamptz; v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if current_staff_role() is null then raise exception '권한 없음'; end if;
  if p_at is null then raise exception '팔로우업 일시가 필요합니다'; end if;
  select next_action_at into v_old from am_care where id = p_id;
  update am_care set next_action_at = p_at, next_action_note = v_note where id = p_id;
  insert into activity_events(subject, subject_id, module, event_type, field, old_value, new_value, next_action_at, next_action, memo, actor_id)
  values ('care', p_id, 'am_care', 'field', 'next_action_at', v_old::text, p_at::text, p_at, v_note, v_note, auth.uid());
end $$;

-- 리스트 가져오기: p_rows [{partner_id, name, segment, priority, reason, action, metrics}]
create or replace function import_care_list(p_rows jsonb, p_version text)
returns jsonb language plpgsql as $$
declare n_upd int; n_ins int; n_missing int;
begin
  if auth.uid() is not null and current_staff_role() is null then raise exception '권한 없음'; end if;
  if coalesce(trim(p_version), '') = '' then raise exception '리스트 버전이 필요합니다'; end if;
  drop table if exists _c;
  create temp table _c on commit drop as
    select distinct on (partner_id) * from jsonb_to_recordset(p_rows)
      as x(partner_id bigint, name text, segment text, priority int, reason text, action text, metrics jsonb)
    where partner_id is not null order by partner_id;
  update am_care c set name = coalesce(nullif(v.name, ''), c.name), segment = v.segment, priority = coalesce(v.priority, 4), reason = v.reason, action = v.action,
    metrics = v.metrics, list_version = p_version
  from _c v where c.partner_id = v.partner_id;
  get diagnostics n_upd = row_count;
  insert into am_care (partner_id, name, segment, priority, reason, action, metrics, list_version)
  select v.partner_id, nullif(v.name, ''), v.segment, coalesce(v.priority, 4), v.reason, v.action, v.metrics, p_version
  from _c v where not exists (select 1 from am_care c where c.partner_id = v.partner_id);
  get diagnostics n_ins = row_count;
  select count(*) into n_missing from am_care c where c.list_version <> p_version and c.stage not in ('WON','LOST');
  return jsonb_build_object('updated', n_upd, 'inserted', n_ins, 'not_in_list', n_missing);
end $$;

revoke execute on function set_care_followup(bigint, timestamptz, text) from anon;
revoke execute on function import_care_list(jsonb, text) from anon;

create view v_care_board with (security_invoker = true) as
select c.*,
  lc.created_at as last_call_at, lc.connect::text as last_connect, lc.result::text as last_result, lc.reason_code as last_reason, lc.memo as last_memo,
  (select count(*) from activity_events e where e.subject::text='care' and e.subject_id=c.id and e.event_type='call')::int as call_count,
  (select a.track::text from am_partners a where a.partner_id = c.partner_id) as am_track
from am_care c
left join lateral (select created_at, connect, result, reason_code, memo from activity_events e
  where e.subject::text='care' and e.subject_id=c.id and e.event_type='call' order by created_at desc limit 1) lc on true;

create or replace view v_today with (security_invoker = true) as
 SELECT 'partner'::text AS subject,
    a.partner_id AS subject_id,
        CASE
            WHEN a.track = 'active'::am_track THEN 'am_active'::text
            ELSE 'am_new'::text
        END AS module,
    a.stage::text AS stage,
    sp.name AS title,
    sp.region,
    a.owner_id,
    a.next_action_at AS followup_at,
    a.next_action_note AS note,
    ( SELECT max(e.created_at) AS max
           FROM activity_events e
          WHERE e.subject = 'partner'::subject_kind AND e.subject_id = a.partner_id AND e.event_type = 'call'::event_kind) AS last_call_at
   FROM am_partners a
     JOIN src_partners sp ON sp.partner_id = a.partner_id
  WHERE a.stage <> 'N_CHURN'::am_stage
UNION ALL
 SELECT 'order'::text AS subject,
    b.order_id AS subject_id,
    'booking'::text AS module,
    b.stage::text AS stage,
    (COALESCE(o.customer_label, '고객'::text) || ' · '::text) || COALESCE(o.region, ''::text) AS title,
    o.region,
    b.owner_id,
    b.next_call_at AS followup_at,
    NULL::text AS note,
    ( SELECT max(e.created_at) AS max
           FROM activity_events e
          WHERE e.subject = 'order'::subject_kind AND e.subject_id = b.order_id AND e.event_type = 'call'::event_kind) AS last_call_at
   FROM booking_cases b
     JOIN src_orders o ON o.order_id = b.order_id
  WHERE b.stage = ANY (ARRAY['B0'::booking_stage, 'B1'::booking_stage, 'B2'::booking_stage, 'B3'::booking_stage])
UNION ALL
 SELECT 'lead'::text AS subject,
    l.id AS subject_id,
    'ae'::text AS module,
    l.stage::text AS stage,
    l.name ||
        CASE l.service_line
            WHEN 'miso_visit'::service_line THEN ' · 미소방문'::text
            ELSE ' · RFQ'::text
        END AS title,
    l.region,
    l.owner_id,
    l.next_action_at AS followup_at,
    l.next_action_note AS note,
    ( SELECT max(e.created_at) AS max
           FROM activity_events e
          WHERE e.subject::text = 'lead'::text AND e.subject_id = l.id AND e.event_type = 'call'::event_kind) AS last_call_at
   FROM ae_leads l
  WHERE (l.stage <> ALL (ARRAY['WON'::ae_stage, 'LOST'::ae_stage])) AND (l.stage <> 'E0'::ae_stage OR l.next_action_at IS NOT NULL)
UNION ALL
 SELECT 'care'::text AS subject, c.id AS subject_id, 'am_care'::text AS module, c.stage::text AS stage,
    coalesce(c.name, '파트너 ' || c.partner_id) || ' · 관리' AS title, c.region, c.owner_id, c.next_action_at AS followup_at, c.next_action_note AS note,
    ( SELECT max(e.created_at) FROM activity_events e WHERE e.subject::text = 'care' AND e.subject_id = c.id AND e.event_type = 'call') AS last_call_at
   FROM am_care c
  WHERE c.stage::text <> ALL (ARRAY['WON','LOST']) AND (c.stage::text <> 'C0' OR c.next_action_at IS NOT NULL);

insert into reason_dict(module,result,code,label,sort) values
 ('am_care','hold','callback','지금 통화 곤란 — 재통화',1),('am_care','hold','thinking','생각해 보기로',2),('am_care','hold','busy','바쁜 시기 — 나중에',3),
 ('am_care','fail','no_will','재참여 의사 없음',1),('am_care','fail','closed','폐업 · 업종 변경',2),('am_care','fail','other_platform','타 플랫폼으로 이동',3),
 ('am_care','fail','complaint_dnc','불만 — 전화 금지 요청',4),('am_care','fail','etc','기타',9);

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'am_care') then
    alter publication supabase_realtime add table public.am_care; end if;
end $$;
