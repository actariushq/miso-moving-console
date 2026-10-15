-- AE 단계 개편 2/2 (2026-10-07)
-- E0 미컨택 → E1 시도중 → E2 연결 → E3 관심있음 → E4 서류 → E5 프로필작업 → E6 리뷰작업 → E7 충전대기 → E8 첫견적제출
-- → WON(첫 견적 제출 확인 = AE 완료, AM 신규 정착 이관) / LOST(이탈)
-- · 충전 기록 = E8 이동(첫 견적 유도). AM 이관은 충전이 아니라 WON 시점으로 옮김
-- · 콜 저장 때 팔로우업 할 일(next_action_note)·통화 후 단계를 함께 저장
-- · 리대시 신호 동기화(apply_ae_signals)와 리스트 업데이트(import_ae_list) — 기존 리드는 단계·지표만 최신화, 새 파트너만 추가
-- · 콜 우선순위용 담당자 라벨(tags)·수동 우선순위(manual_priority)

alter table ae_leads
  add column if not exists first_quote_at timestamptz,                  -- 첫 견적 제출(WON) 시점
  add column if not exists signals jsonb,                               -- 리대시 최신 신호 (미소방문 자가 견적·충전·크레딧·리뷰 등, 전화번호 없음)
  add column if not exists signals_at timestamptz,
  add column if not exists tags text[] not null default '{}',           -- 담당자가 붙이는 라벨
  add column if not exists manual_priority smallint check (manual_priority between 1 and 4); -- 콜 우선순위 수동 지정 (비우면 자동)

create or replace function ae_stage_rank(s text) returns int language sql immutable as $$
  select array_position(array['E0','E1','E2','E3','E4','E5','E6','E7','E8','WON'], s)
$$;

-- ───────── log_call: 리드 단계 규칙 개편 + 팔로우업 할 일 + 통화 후 단계 지정 ─────────
drop function if exists log_call(subject_kind, bigint, module_kind, text, connect_kind, result_kind, text, text, text, timestamptz, text, text, character, text[], text, text[], uuid);
create function log_call(
  p_subject subject_kind, p_id bigint, p_module module_kind, p_purpose text,
  p_connect connect_kind, p_result result_kind default null,
  p_reason_code text default null, p_reason_detail text default null,
  p_memo text default null, p_next_at timestamptz default null, p_close_reason text default null,
  p_touch_key text default null, p_state char(1) default null, p_voc text[] default null, p_rx text default null,
  p_hesitation text[] default null, p_call_group uuid default gen_random_uuid(),
  p_next_note text default null, p_stage_to text default null)
returns bigint language plpgsql as $$
declare
  v_stage text; v_after text; v_attempt int; v_rule text; v_next timestamptz := p_next_at;
  a record; v_id bigint; v_close text := p_close_reason; is_lead boolean := p_subject::text = 'lead';
  v_note text := nullif(trim(coalesce(p_next_note, '')), '');
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
      v_after := case when is_lead then 'LOST' when p_module = 'booking' then 'BX_LOST' when p_module = 'am_new' then 'N_RISK' else 'A_RISK' end;
    elsif p_module = 'booking' then v_after := 'B3';
    elsif is_lead and v_stage = 'E0' then v_after := 'E1';
    end if;
  elsif p_connect in ('dead','refuse') then
    v_after := case when is_lead then 'LOST' when p_module = 'booking' then 'BX_LOST' when p_module = 'am_new' then 'N_CHURN' else 'A_RISK' end;
    if p_connect = 'refuse' then insert into dnc_list values (p_subject, p_id, '수신 거부') on conflict do nothing; end if;
    v_rule := 'connect:'||p_connect;
    v_close := coalesce(v_close, case p_connect when 'dead' then '결번' else '수신 거부' end);
  elsif p_connect = 'connected' then
    if p_result = 'fail' then
      v_close := coalesce(v_close, '실패: '||coalesce(p_reason_code,''));
      v_after := case when is_lead then 'LOST' when p_module = 'booking' then 'BX_LOST' when p_module = 'am_new' then 'N_CHURN' else 'A_RISK' end;
    elsif p_module = 'booking' and p_result in ('hold','go') then v_after := 'B2';
      if p_result = 'go' and v_next is null then v_next := now() + interval '3 hours'; v_rule := 'go→확정 확인 +3h'; end if;
    -- 리드: 처음 연결되면 보류 = E2 연결, 진행 = E3 관심있음. 그 뒤 단계는 담당자가 고른다
    elsif is_lead and v_stage in ('E0','E1') then v_after := case when p_result = 'go' then 'E3' else 'E2' end;
    elsif is_lead and v_stage = 'E2' and p_result = 'go' then v_after := 'E3';
    end if;
  elsif p_connect = 'etc' and is_lead and v_stage = 'E0' then v_after := 'E1';
  end if;

  -- 통화 후 단계 지정(리드만). 이탈로 닫히는 콜은 무시. WON은 첫 견적 확인, LOST는 실패 결과로만
  if is_lead and p_stage_to is not null and v_after <> 'LOST' then
    if p_stage_to in ('WON','LOST') then raise exception '완료·이탈은 콜 결과/첫 견적 확인으로만 이동합니다'; end if;
    if p_stage_to is distinct from v_after then v_after := p_stage_to; v_rule := coalesce(v_rule||' · ', '')||'담당자 지정'; end if;
  end if;
  if v_next is null and v_close is null then raise exception '팔로업 일시 또는 종료 사유가 필요합니다'; end if;

  insert into activity_events(subject, subject_id, module, event_type, call_group, attempt_no, purpose, touch_key,
    connect, result, reason_code, reason_detail, state_code, voc_tags, rx_code, hesitation_tags, memo,
    stage_at, stage_after, next_action_at, next_action, close_reason, auto_rule, actor_id)
  values (p_subject, p_id, p_module, 'call', p_call_group, v_attempt, p_purpose, p_touch_key,
    p_connect, p_result, p_reason_code, p_reason_detail, p_state, p_voc, p_rx, p_hesitation, p_memo,
    v_stage, v_after, v_next, v_note, v_close, v_rule, auth.uid())
  returning id into v_id;

  if p_subject = 'order' and v_after = 'BX_LOST' then
    update booking_cases set lost_reason = case
      when p_connect <> 'connected' then 'unreachable'::lost_reason
      when p_reason_code in ('other_company','price','cancel_postpone','self_solved') then p_reason_code::lost_reason
      else 'etc'::lost_reason end
    where order_id = p_id;
  end if;
  if is_lead and v_after = 'LOST' then update ae_leads set lost_reason = coalesce(p_reason_code, p_connect::text) where id = p_id; end if;
  if v_after is distinct from v_stage then
    perform move_stage(p_subject, p_id, v_after,
      case when v_rule like '%담당자 지정%' and p_connect = 'connected' and p_result is distinct from 'fail' then '콜 후 담당자 지정' else '콜 결과 반영: '||p_connect||coalesce('/'||p_result,'')||coalesce(' · '||p_reason_code,'') end, v_rule);
  end if;
  if p_subject = 'partner' then
    update am_partners set next_action_at = v_next, next_action_note = coalesce(v_note, next_action_note) where partner_id = p_id;
  elsif is_lead then
    update ae_leads set next_action_at = case when v_after = 'LOST' then null else v_next end,
      next_action_note = case when v_after = 'LOST' or v_next is null then null else v_note end where id = p_id;
  else update booking_cases set next_call_at = v_next where order_id = p_id; end if;
  return v_id;
end $$;

-- ───────── WON 처리 (첫 견적 제출 확인) + AM 이관 — 수동 확인·리대시 동기화 공용 ─────────
create or replace function ae_mark_won(p_lead bigint, p_reason text, p_rule text default null, p_at timestamptz default now())
returns text language plpgsql security definer set search_path = public as $$
declare l record; v_pid bigint;
begin
  -- 화면에서는 콘솔 계정만, 동기화(postgres, auth.uid() 없음)는 허용. anon 실행 권한은 아래에서 회수
  if auth.uid() is not null and current_staff_role() is null then raise exception '권한 없음'; end if;
  select * into l from ae_leads where id = p_lead;
  if l is null then raise exception '리드를 찾을 수 없습니다'; end if;
  if l.stage = 'WON' then return 'already'; end if;
  update ae_leads set first_quote_at = coalesce(first_quote_at, p_at), next_action_at = null, next_action_note = null where id = p_lead;
  insert into activity_events(subject, subject_id, module, event_type, field, new_value, memo, auto_rule, actor_id)
  values ('lead', p_lead, 'ae', 'field', 'first_quote', p_at::text, p_reason, p_rule, auth.uid());
  perform move_stage('lead', p_lead, 'WON', p_reason, p_rule);
  v_pid := l.partner_id;
  if v_pid is null then return 'won_no_partner_id'; end if;
  insert into src_partners(partner_id, name, region, service_types, first_charged_at, balance)
  values (v_pid, l.name, l.region, array[l.service_line::text], l.charged_at, (select coalesce(sum(amount),0) from charges where lead_id = p_lead))
  on conflict (partner_id) do update set first_charged_at = coalesce(src_partners.first_charged_at, excluded.first_charged_at),
    service_types = (select array_agg(distinct x) from unnest(src_partners.service_types || array[l.service_line::text]) x);
  if not exists (select 1 from am_partners where partner_id = v_pid) then
    perform set_config('app.auto_rule', 'ae_won→am_new', true);
    insert into am_partners(partner_id, next_action_at, next_action_note) values (v_pid, now() + interval '1 day', 'W0 웰컴콜 (AE 완료 · 첫 견적 제출)');
    return 'handed_to_am';
  end if;
  return 'won';
end $$;

create or replace function record_first_quote(p_lead bigint, p_memo text default null)
returns text language plpgsql as $$
begin
  if current_staff_role() is null then raise exception '권한 없음'; end if;
  return ae_mark_won(p_lead, coalesce(nullif(trim(p_memo), ''), '첫 견적 제출 확인'), null, now());
end $$;

-- ───────── 충전 기록: E8 첫견적제출로 이동 (AM 이관은 WON 시점) ─────────
create or replace function record_charge(p_lead bigint, p_amount int, p_memo text default null)
returns text language plpgsql security definer set search_path = public as $$
declare l record;
begin
  if current_staff_role() is null then raise exception '권한 없음'; end if;
  select * into l from ae_leads where id = p_lead;
  if l is null then raise exception '리드를 찾을 수 없습니다'; end if;
  if p_amount is null or p_amount <= 0 then raise exception '충전 금액을 입력하세요'; end if;
  insert into charges(lead_id, partner_id, service_line, amount) values (p_lead, l.partner_id, l.service_line, p_amount);
  update ae_leads set charged_at = coalesce(charged_at, now()) where id = p_lead;
  insert into activity_events(subject, subject_id, module, event_type, field, new_value, memo, actor_id)
  values ('lead', p_lead, 'ae', 'field', 'charge', p_amount::text, coalesce(p_memo, '충전 ' || p_amount || '원'), auth.uid());
  if l.stage::text not in ('E8','WON') then perform move_stage('lead', p_lead, 'E8', '충전 ' || p_amount || '원 확인 → 첫 견적 유도'); end if;
  if l.stage::text <> 'WON' and l.next_action_at is null then
    update ae_leads set next_action_at = now() + interval '1 day', next_action_note = '첫 견적 독려' where id = p_lead;
  end if;
  return case when l.stage::text = 'WON' then 'charged_after_won' else 'charged' end;
end $$;

-- ───────── 팔로우업만 다시 잡기 (콜 없이 미루기·할 일 수정) ─────────
create or replace function set_lead_followup(p_id bigint, p_at timestamptz, p_note text default null)
returns void language plpgsql as $$
declare v_old timestamptz; v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if current_staff_role() is null then raise exception '권한 없음'; end if;
  if p_at is null then raise exception '팔로우업 일시가 필요합니다'; end if;
  select next_action_at into v_old from ae_leads where id = p_id;
  update ae_leads set next_action_at = p_at, next_action_note = v_note where id = p_id;
  insert into activity_events(subject, subject_id, module, event_type, field, old_value, new_value, next_action_at, next_action, memo, actor_id)
  values ('lead', p_id, 'ae', 'field', 'next_action_at', v_old::text, p_at::text, p_at, v_note, v_note, auth.uid());
end $$;

-- ───────── 리대시 신호 반영 — 확실한 사실만 단계를 움직인다 (앞으로만, 되돌리지 않음) ─────────
-- p_rows: [{partner_id, mv_self_quotes, mv_first_self_quote_at, last_charge_at, credit_balance, mv_registered, ...}]
--  · 미소방문 자가 견적 1건+ → WON (+AM 이관). 이탈(LOST)이었어도 실제 제출이면 WON
--  · 리드 등록 이후 충전 → E8 (충전 이력이 없으면 크레딧이 리스트 시점보다 늘었을 때)
--  · 그 밖의 신호(서비스 등록·리뷰 등)는 signals에 저장만 하고 화면 라벨로 보여 준다
create or replace function apply_ae_signals(p_rows jsonb, p_source text default 'redash')
returns jsonb language plpgsql as $$
declare r jsonb; l record; n_upd int := 0; n_won int := 0; n_e8 int := 0; v_charged boolean;
begin
  if auth.uid() is not null and current_staff_role() is null then raise exception '권한 없음'; end if;
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    for l in select * from ae_leads where partner_id = (r->>'partner_id')::bigint and service_line = 'miso_visit' loop
      update ae_leads set signals = coalesce(signals, '{}'::jsonb) || (r - 'partner_id'), signals_at = now() where id = l.id;
      n_upd := n_upd + 1;
      continue when l.stage = 'WON';
      if coalesce((r->>'mv_self_quotes')::numeric, 0) > 0 then
        perform ae_mark_won(l.id, '리대시: 미소방문 견적 ' || (r->>'mv_self_quotes')::numeric::int || '건 자가 제출 확인', 'sync:' || p_source,
          coalesce((r->>'mv_first_self_quote_at')::timestamptz, now()));
        n_won := n_won + 1; continue;
      end if;
      v_charged := case when r ? 'last_charge_at' then (r->>'last_charge_at') is not null and (r->>'last_charge_at')::timestamptz > l.created_at
                        when (l.insight->>'credit') is not null and (r->>'credit_balance') is not null
                          then (r->>'credit_balance')::numeric > (l.insight->>'credit')::numeric
                        else false end;
      if v_charged and (l.stage = 'LOST' or ae_stage_rank(l.stage::text) < ae_stage_rank('E8')) then
        perform move_stage('lead', l.id, 'E8', '리대시: 리드 등록 이후 충전 확인 → 첫 견적 유도', 'sync:' || p_source);
        update ae_leads set charged_at = coalesce(charged_at, (r->>'last_charge_at')::timestamptz, now()),
          next_action_at = coalesce(next_action_at, now() + interval '1 day'), next_action_note = coalesce(next_action_note, '첫 견적 독려') where id = l.id;
        n_e8 := n_e8 + 1;
      end if;
    end loop;
  end loop;
  return jsonb_build_object('updated', n_upd, 'won', n_won, 'to_e8', n_e8);
end $$;

-- ───────── 리스트 업데이트: 기존 리드는 지표 갱신 + 단계 최신화(신호), 새 파트너만 추가 ─────────
-- p_rows: [{partner_id, name, region, priority_rank, grade, score, region_tier, insight, signals?}]
-- 담당·팔로우업·메모·이력은 건드리지 않는다. INSERT … ON CONFLICT 금지(등록 트리거 이력 중복)
create or replace function import_ae_list(p_rows jsonb, p_version text)
returns jsonb language plpgsql as $$
declare n_upd int; n_ins int; n_missing int; v_sig jsonb;
begin
  if auth.uid() is not null and current_staff_role() is null then raise exception '권한 없음'; end if;
  if coalesce(trim(p_version), '') = '' then raise exception '리스트 버전이 필요합니다'; end if;
  drop table if exists _v;
  create temp table _v on commit drop as
    select distinct on (partner_id) * from jsonb_to_recordset(p_rows)
      as x(partner_id bigint, name text, region text, priority_rank int, grade text, score int, region_tier text, insight jsonb, signals jsonb)
    where partner_id is not null and coalesce(trim(name), '') <> '' order by partner_id;
  update ae_leads l set name = v.name, priority_rank = v.priority_rank, grade = v.grade, score = v.score,
    region_tier = v.region_tier, insight = v.insight, list_version = p_version,
    region = case when l.list_version is not null then v.region else l.region end
  from _v v where l.partner_id = v.partner_id and l.service_line = 'miso_visit';
  get diagnostics n_upd = row_count;
  insert into ae_leads (partner_id, name, region, service_line, source, priority_rank, grade, score, region_tier, insight, list_version)
  select v.partner_id, v.name, v.region, 'miso_visit', 'cross_sell', v.priority_rank, v.grade, v.score, v.region_tier, v.insight, p_version
  from _v v where not exists (select 1 from ae_leads l where l.partner_id = v.partner_id and l.service_line = 'miso_visit');
  get diagnostics n_ins = row_count;
  select count(*) into n_missing from ae_leads l where l.service_line = 'miso_visit' and l.list_version is not null and l.list_version <> p_version
    and l.stage not in ('WON','LOST');
  select jsonb_agg(jsonb_build_object('partner_id', partner_id) || signals) into v_sig from _v where signals is not null;
  return jsonb_build_object('updated', n_upd, 'inserted', n_ins, 'not_in_list', n_missing,
    'signals', case when v_sig is null then null else apply_ae_signals(v_sig, 'list:' || p_version) end);
end $$;

revoke execute on function ae_mark_won(bigint, text, text, timestamptz) from anon;
revoke execute on function record_first_quote(bigint, text) from anon;
revoke execute on function record_charge(bigint, int, text) from anon;
revoke execute on function set_lead_followup(bigint, timestamptz, text) from anon;
revoke execute on function apply_ae_signals(jsonb, text) from anon;
revoke execute on function import_ae_list(jsonb, text) from anon;

-- ───────── 뷰 ─────────
drop view if exists v_ae_board;
create view v_ae_board with (security_invoker = true) as
select l.*,
  lc.created_at as last_call_at, lc.connect::text as last_connect, lc.result::text as last_result, lc.reason_code as last_reason, lc.memo as last_memo,
  (select count(*) from activity_events e where e.subject::text='lead' and e.subject_id=l.id and e.event_type='call')::int as call_count,
  (select coalesce(sum(amount),0) from charges c where c.lead_id = l.id)::int as charged_amount
from ae_leads l
left join lateral (select created_at, connect, result, reason_code, memo from activity_events e
  where e.subject::text='lead' and e.subject_id=l.id and e.event_type='call' order by created_at desc limit 1) lc on true;

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
where l.stage not in ('WON','LOST') and (l.stage <> 'E0' or l.next_action_at is not null);

create index if not exists ae_leads_next_action on ae_leads(next_action_at) where next_action_at is not null;

insert into reason_dict(module,result,code,label,sort) values
 ('ae','hold','docs_waiting','서류 보내기로 함',5),('ae','hold','profile_pending','프로필·리뷰 작업 예정',6),('ae','hold','charge_later','충전 나중에',7)
on conflict do nothing;
