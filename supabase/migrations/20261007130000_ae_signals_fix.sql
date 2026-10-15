-- 리대시 신호 반영 보정 (2026-10-07, ~/miso-data/sql/ae_lead_signals.sql 결과 확인 후)
-- · 충전 판단은 충전 이력(last_charge_at, payment_public_credit_transactions)만 쓴다.
--   리스트의 '크레딧잔액'(partner.credit)은 갱신이 멈춘 옛 값이라 실제 지갑 잔액과 비교하면 수백 명을 잘못 E8로 보낸다 → 크레딧 비교 규칙 삭제
-- · 신호 시각은 KST 'YYYY-MM-DD HH:MM' 문자열 → +09 로 해석
-- · partner_name(대표자 실명일 수 있음)·found 는 저장하지 않는다

create or replace function kst_ts(s text) returns timestamptz language sql immutable as $$
  select case when s is null or trim(s) = '' then null
              when s ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$' then (replace(s, ' ', 'T') || case when length(s) = 16 then ':00' else '' end || '+09:00')::timestamptz
              else s::timestamptz end
$$;

create or replace function apply_ae_signals(p_rows jsonb, p_source text default 'redash')
returns jsonb language plpgsql as $$
declare r jsonb; l record; n_upd int := 0; n_won int := 0; n_e8 int := 0; v_charge timestamptz;
begin
  if auth.uid() is not null and current_staff_role() is null then raise exception '권한 없음'; end if;
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    for l in select * from ae_leads where partner_id = (r->>'partner_id')::bigint and service_line = 'miso_visit' loop
      update ae_leads set signals = coalesce(signals, '{}'::jsonb) || (r - 'partner_id' - 'partner_name' - 'found'), signals_at = now() where id = l.id;
      n_upd := n_upd + 1;
      continue when l.stage = 'WON';
      -- 미소방문 자가 견적 1건+ → WON (+AM 이관). 이탈(LOST)이었어도 실제 제출이면 WON
      if coalesce(nullif(r->>'mv_self_quotes', '')::numeric, 0) > 0 then
        perform ae_mark_won(l.id, '리대시: 미소방문 견적 ' || (r->>'mv_self_quotes')::numeric::int || '건 자가 제출 확인', 'sync:' || p_source,
          coalesce(kst_ts(r->>'mv_first_self_quote_at'), now()));
        n_won := n_won + 1; continue;
      end if;
      -- 리드 등록 이후 충전 → E8 첫견적제출 (앞으로만)
      v_charge := kst_ts(r->>'last_charge_at');
      if v_charge is not null and v_charge > l.created_at and (l.stage = 'LOST' or ae_stage_rank(l.stage::text) < ae_stage_rank('E8')) then
        perform move_stage('lead', l.id, 'E8', '리대시: 리드 등록 이후 충전 확인(' || to_char(v_charge at time zone 'Asia/Seoul', 'MM/DD HH24:MI') || ') → 첫 견적 유도', 'sync:' || p_source);
        update ae_leads set charged_at = coalesce(charged_at, v_charge),
          next_action_at = coalesce(next_action_at, now() + interval '1 day'), next_action_note = coalesce(next_action_note, '첫 견적 독려') where id = l.id;
        n_e8 := n_e8 + 1;
      end if;
    end loop;
  end loop;
  return jsonb_build_object('updated', n_upd, 'won', n_won, 'to_e8', n_e8);
end $$;

revoke execute on function apply_ae_signals(jsonb, text) from anon;
