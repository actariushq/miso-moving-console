-- (1) 리대시 신호 변화 감지 — 전날 동기화 값과 비교해 '오늘 생긴 신호'를 남긴다
-- (2) 건의 보드 (이전 miso-console 컨셉 계승: 접수 → 검토 중 → 작업 진행중 → 반영 완료 → 조치 완료 / 보류 · 반려)
-- (3) 관리자(lead) 지정: mv2 손재혁 (2026-10-07 사용자 지정) — 계정관리 탭 사용

-- ───────── (1) 신호 변화 ─────────
alter table ae_leads
  add column if not exists signal_change text,            -- 마지막 변화 요약 (예: '사업자 서류 승인 · 미소방문 요청 2건 새로 봄')
  add column if not exists signal_change_at timestamptz;

-- 이전 신호(o)와 새 신호(n)를 비교해 사람이 읽는 변화 목록을 만든다. 처음 동기화(o 없음)는 변화 없음
create or replace function ae_signal_diff(o jsonb, n jsonb) returns text[] language plpgsql immutable as $$
declare out text[] := '{}'; d numeric;
begin
  if o is null or n is null then return out; end if;
  if (n->>'doc_business_status') is distinct from (o->>'doc_business_status') and (n->>'doc_business_status') in ('submitted','verified') then
    out := out || case n->>'doc_business_status' when 'verified' then '사업자 서류 승인' else '사업자 서류 제출' end; end if;
  if (n->>'doc_idcard_status') is distinct from (o->>'doc_idcard_status') and (n->>'doc_idcard_status') in ('submitted','verified') then
    out := out || case n->>'doc_idcard_status' when 'verified' then '신분증 승인' else '신분증 제출' end; end if;
  if coalesce((n->>'mv_registered')::boolean, false) and not coalesce((o->>'mv_registered')::boolean, false) then out := out || '미소방문 서비스 등록'::text; end if;
  if (n->>'mv_onboarding_status') is distinct from (o->>'mv_onboarding_status') and (n->>'mv_onboarding_status') is not null then
    out := out || ('미소방문 상태 ' || coalesce(o->>'mv_onboarding_status', '없음') || '→' || (n->>'mv_onboarding_status')); end if;
  d := coalesce(nullif(n->>'mv_received_90d','')::numeric, 0) - coalesce(nullif(o->>'mv_received_90d','')::numeric, 0);
  if d > 0 or ((n->>'mv_last_seen_at') is distinct from (o->>'mv_last_seen_at') and (n->>'mv_last_seen_at') is not null and d >= 0) then
    out := out || ('미소방문 요청 ' || case when d > 0 then d::int || '건 ' else '' end || '새로 봄'); end if;
  d := coalesce(nullif(n->>'mv_skipped_90d','')::numeric, 0) - coalesce(nullif(o->>'mv_skipped_90d','')::numeric, 0);
  if d > 0 then out := out || ('요청 건너뜀 +' || d::int); end if;
  if (n->>'last_charge_at') is distinct from (o->>'last_charge_at') and (n->>'last_charge_at') is not null then out := out || '충전'::text; end if;
  if coalesce((n->>'has_profile_photo')::boolean, false) and not coalesce((o->>'has_profile_photo')::boolean, false) then out := out || '프로필 사진 등록'::text; end if;
  if coalesce(nullif(n->>'description_len','')::numeric, 0) >= 100 and coalesce(nullif(o->>'description_len','')::numeric, 0) < 100 then out := out || '소개문 작성'::text; end if;
  d := coalesce(nullif(n->>'real_reviews','')::numeric, 0) - coalesce(nullif(o->>'real_reviews','')::numeric, 0);
  if d > 0 then out := out || ('실고객 리뷰 +' || d::int); end if;
  return out;
end $$;

create or replace function apply_ae_signals(p_rows jsonb, p_source text default 'redash')
returns jsonb language plpgsql as $$
declare r jsonb; l record; n_upd int := 0; n_won int := 0; n_e8 int := 0; n_chg int := 0; v_charge timestamptz; v_new jsonb; v_diff text[];
begin
  if auth.uid() is not null and current_staff_role() is null then raise exception '권한 없음'; end if;
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    for l in select * from ae_leads where partner_id = (r->>'partner_id')::bigint and service_line = 'miso_visit' loop
      v_new := coalesce(l.signals, '{}'::jsonb) || (r - 'partner_id' - 'partner_name' - 'found');
      v_diff := ae_signal_diff(l.signals, v_new);
      update ae_leads set signals = v_new, signals_at = now(),
        signal_change = case when cardinality(v_diff) > 0 then array_to_string(v_diff, ' · ') else signal_change end,
        signal_change_at = case when cardinality(v_diff) > 0 then now() else signal_change_at end
      where id = l.id;
      n_upd := n_upd + 1;
      if cardinality(v_diff) > 0 then
        n_chg := n_chg + 1;
        insert into activity_events(subject, subject_id, module, event_type, field, new_value, memo, auto_rule)
        values ('lead', l.id, 'ae', 'field', 'signal', array_to_string(v_diff, ' · '), '리대시 신호 변화', 'sync:' || p_source);
      end if;
      continue when l.stage = 'WON';
      if coalesce(nullif(r->>'mv_self_quotes', '')::numeric, 0) > 0 then
        perform ae_mark_won(l.id, '리대시: 미소방문 견적 ' || (r->>'mv_self_quotes')::numeric::int || '건 자가 제출 확인', 'sync:' || p_source,
          coalesce(kst_ts(r->>'mv_first_self_quote_at'), now()));
        n_won := n_won + 1; continue;
      end if;
      v_charge := kst_ts(r->>'last_charge_at');
      if v_charge is not null and v_charge > l.created_at and (l.stage = 'LOST' or ae_stage_rank(l.stage::text) < ae_stage_rank('E8')) then
        perform move_stage('lead', l.id, 'E8', '리대시: 리드 등록 이후 충전 확인(' || to_char(v_charge at time zone 'Asia/Seoul', 'MM/DD HH24:MI') || ') → 첫 견적 유도', 'sync:' || p_source);
        update ae_leads set charged_at = coalesce(charged_at, v_charge),
          next_action_at = coalesce(next_action_at, now() + interval '1 day'), next_action_note = coalesce(next_action_note, '첫 견적 독려') where id = l.id;
        n_e8 := n_e8 + 1;
      end if;
    end loop;
  end loop;
  return jsonb_build_object('updated', n_upd, 'changed', n_chg, 'won', n_won, 'to_e8', n_e8);
end $$;
revoke execute on function apply_ae_signals(jsonb, text) from anon;

drop view if exists v_ae_board;
create view v_ae_board with (security_invoker = true) as
select l.*,
  lc.created_at as last_call_at, lc.connect::text as last_connect, lc.result::text as last_result, lc.reason_code as last_reason, lc.memo as last_memo,
  (select count(*) from activity_events e where e.subject::text='lead' and e.subject_id=l.id and e.event_type='call')::int as call_count,
  (select coalesce(sum(amount),0) from charges c where c.lead_id = l.id)::int as charged_amount
from ae_leads l
left join lateral (select created_at, connect, result, reason_code, memo from activity_events e
  where e.subject::text='lead' and e.subject_id=l.id and e.event_type='call' order by created_at desc limit 1) lc on true;

-- ───────── (2) 건의 보드 ─────────
create table if not exists suggestions (
  id bigint generated always as identity primary key,
  author_id uuid not null default auth.uid() references staff(id),
  purpose text not null default '기능 제안' check (purpose in ('기능 제안','버그 신고','프로세스 개선','기타')),
  area text,                                   -- 관련 화면 (AE · AM · 예약콜 · 공통 …)
  title text not null check (length(trim(title)) > 0),
  body text,
  status text not null default '접수' check (status in ('접수','검토 중','작업 진행중','반영 완료','조치 완료','보류','반려')),
  votes uuid[] not null default '{}',
  released_in text,                            -- 반영된 업데이트 버전 (lib/changelog.ts)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists suggestion_logs (   -- 진행 기록 · 댓글 (상태 변경 포함)
  id bigint generated always as identity primary key,
  suggestion_id bigint not null references suggestions(id) on delete cascade,
  actor_id uuid not null default auth.uid() references staff(id),
  status_to text,
  body text,
  created_at timestamptz not null default now()
);
create index if not exists suggestion_logs_sid on suggestion_logs(suggestion_id, created_at);
alter table suggestions enable row level security;
alter table suggestion_logs enable row level security;
create policy sug_read on suggestions for select using (current_staff_role() is not null);
create policy sug_insert on suggestions for insert with check (current_staff_role() is not null and author_id = auth.uid());
-- 내용 수정은 작성자, 상태는 관리자(lead) — 상태 변경은 RPC set_suggestion_status 로만
create policy sug_update on suggestions for update using (author_id = auth.uid() or current_staff_role() = 'lead') with check (author_id = auth.uid() or current_staff_role() = 'lead');
create policy sug_delete on suggestions for delete using (current_staff_role() = 'lead' or (author_id = auth.uid() and status = '접수'));
create policy sugl_read on suggestion_logs for select using (current_staff_role() is not null);
create policy sugl_insert on suggestion_logs for insert with check (current_staff_role() is not null and actor_id = auth.uid());
create policy sugl_update on suggestion_logs for update using (actor_id = auth.uid() or current_staff_role() = 'lead');
create policy sugl_delete on suggestion_logs for delete using (actor_id = auth.uid() or current_staff_role() = 'lead');

create or replace function suggestions_guard() returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status and current_staff_role() is distinct from 'lead' then raise exception '상태 변경은 관리자만 할 수 있어요'; end if;
  if (new.title, new.body, new.purpose, new.area) is distinct from (old.title, old.body, old.purpose, old.area) then new.updated_at := now(); end if;
  return new;
end $$;
create trigger trg_suggestions_guard before update on suggestions for each row execute function suggestions_guard();

-- 공감 토글 (누구나) — votes 칸만 바꾼다
create or replace function toggle_suggestion_vote(p_id bigint) returns int
language plpgsql security definer set search_path = public as $$
declare v uuid[];
begin
  if current_staff_role() is null then raise exception '권한 없음'; end if;
  select votes into v from suggestions where id = p_id for update;
  if v is null then raise exception '건의를 찾을 수 없습니다'; end if;
  v := case when auth.uid() = any(v) then array_remove(v, auth.uid()) else v || auth.uid() end;
  update suggestions set votes = v where id = p_id;
  return cardinality(v);
end $$;

-- 상태 변경 (관리자) + 진행 기록
create or replace function set_suggestion_status(p_id bigint, p_status text, p_note text default null, p_release text default null)
returns void language plpgsql as $$
begin
  if current_staff_role() is distinct from 'lead' then raise exception '상태 변경은 관리자만 할 수 있어요'; end if;
  update suggestions set status = p_status, updated_at = now(), released_in = coalesce(nullif(trim(p_release), ''), released_in) where id = p_id;
  insert into suggestion_logs(suggestion_id, status_to, body) values (p_id, p_status, nullif(trim(coalesce(p_note, '')), ''));
end $$;
revoke execute on function toggle_suggestion_vote(bigint) from anon;
revoke execute on function set_suggestion_status(bigint, text, text, text) from anon;

-- ───────── (3) 관리자 지정 ─────────
update staff set role = 'lead' where login_id = 'mv2';
