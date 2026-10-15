-- 콜 기록 풍부하게 + 단계 경유 기록 + 실시간 반영 (2026-10-07)
-- (1) activity_events 에 다룬 콜 포인트 · 우려 사항 · 통화 상대 칸
-- (2) log_call: 위 3개 인자 추가. 리드가 첫 연결 콜에서 관심있음 이상으로 가면 E2 연결을 거친 이력을 먼저 남긴다
--     (activity_events.stage_at 은 원래 단계 그대로 — 콜 당시 단계 기록은 유지)
-- (3) Realtime: 다른 담당자의 콜 기록 · 단계 변경을 작업창에 바로 반영 (RLS 그대로 적용)
alter table activity_events
  add column if not exists call_points text[],
  add column if not exists concerns text[],
  add column if not exists counterpart text;

drop function if exists log_call(subject_kind, bigint, module_kind, text, connect_kind, result_kind, text, text, text, timestamptz, text, text, character, text[], text, text[], uuid, text, text);
create function log_call(
  p_subject subject_kind, p_id bigint, p_module module_kind, p_purpose text,
  p_connect connect_kind, p_result result_kind default null,
  p_reason_code text default null, p_reason_detail text default null,
  p_memo text default null, p_next_at timestamptz default null, p_close_reason text default null,
  p_touch_key text default null, p_state char(1) default null, p_voc text[] default null, p_rx text default null,
  p_hesitation text[] default null, p_call_group uuid default gen_random_uuid(),
  p_next_note text default null, p_stage_to text default null,
  p_points text[] default null, p_concerns text[] default null, p_counterpart text default null)
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
  -- 리드가 첫 연결 콜로 연결(E2)을 넘어 바로 앞 단계로 가면, 연결 단계를 거친 기록을 먼저 남긴다 (퍼널 '연결' 수가 빠지지 않게)
  if is_lead and p_connect = 'connected' and v_stage in ('E0','E1') and v_after <> 'LOST' and ae_stage_rank(v_after) > ae_stage_rank('E2') then
    perform move_stage(p_subject, p_id, 'E2', '콜 연결 (경유)', v_rule);
    v_stage := 'E2';
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
  else update booking_cases set next_call_at = v_next where order_id = p_id; end if;
  return v_id;
end $$;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'activity_events') then
      alter publication supabase_realtime add table public.activity_events; end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'ae_leads') then
      alter publication supabase_realtime add table public.ae_leads; end if;
  end if;
end $$;
