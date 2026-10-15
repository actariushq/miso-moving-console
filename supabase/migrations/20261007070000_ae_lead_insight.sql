-- AE 리드 우선순위·분석 지표 (2026-10-07)
-- 미소방문 미제출 파트너 확보 리스트(miso-data/output/미소방문_파트너확보리스트_*.xlsx)를 AE 리드로 가져오기 위한 칸.
-- 기존 칸·단계·담당은 그대로 두고 새 칸만 더한다. 가져오기는 scripts/import_ae_targets_20261007-0710.mjs

alter table ae_leads
  add column if not exists priority_rank int,                                   -- 리스트 우선순위 (1이 가장 먼저)
  add column if not exists grade text check (grade in ('A','B','C','D')),      -- 전환 가능성 등급 (백테스트 검증 점수)
  add column if not exists score int,
  add column if not exists region_tier text check (region_tier in ('1','2','3')), -- 1 인천·부천 커버 · 2 인접 · 3 기타
  add column if not exists insight jsonb,                                        -- 추천 근거·견적 이력·리뷰·대형 이사 경험 등 (전화번호 없음)
  add column if not exists list_version text;                                    -- 가져온 리스트 버전 (예: 20261007-0656)

create index if not exists ae_leads_priority on ae_leads(priority_rank) where priority_rank is not null;

-- v_ae_board 는 l.* 로 만들어져 새 칸을 반영하려면 다시 만들어야 한다 (정의는 20261001080100 과 동일)
drop view if exists v_ae_board;
create view v_ae_board with (security_invoker = true) as
select l.*,
  lc.created_at as last_call_at, lc.connect::text as last_connect, lc.result::text as last_result, lc.reason_code as last_reason,
  (select count(*) from activity_events e where e.subject::text='lead' and e.subject_id=l.id and e.event_type='call')::int as call_count,
  (select coalesce(sum(amount),0) from charges c where c.lead_id = l.id)::int as charged_amount
from ae_leads l
left join lateral (select created_at, connect, result, reason_code from activity_events e
  where e.subject::text='lead' and e.subject_id=l.id and e.event_type='call' order by created_at desc limit 1) lc on true;
