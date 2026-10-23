-- 리스트 업데이트 v2 (2026-10-23): 수동 업로드(칸이 적은 CSV)를 올려도 기존 리드 값이 지워지지 않게
-- · 파일에 없는(null) 값은 기존 값 유지: 이름·우선순위·등급·점수·지역 티어·지역
-- · insight 는 기존 값 위에 파일에 있는 값만 덮어쓴다(jsonb_strip_nulls)
-- · p_full = true(파트너 확보 리스트 전체)일 때만 list_version 을 바꾸고 '이번 리스트에 없는 리드'를 센다
--   수동 업로드는 list_version 을 새로 넣는 리드에만 붙인다
-- 담당·팔로우업·메모·이력은 그대로. INSERT … ON CONFLICT 금지(등록 트리거 이력 중복)
create or replace function import_ae_list(p_rows jsonb, p_version text, p_full boolean default true)
returns jsonb language plpgsql as $$
declare n_upd int; n_ins int; n_missing int; v_sig jsonb;
begin
  if auth.uid() is not null and current_staff_role() is null then raise exception '권한 없음'; end if;
  if coalesce(trim(p_version), '') = '' then raise exception '리스트 버전이 필요합니다'; end if;
  drop table if exists _v;
  create temp table _v on commit drop as
    select distinct on (partner_id) * from jsonb_to_recordset(p_rows)
      as x(partner_id bigint, name text, region text, priority_rank int, grade text, score int, region_tier text, insight jsonb, signals jsonb)
    where partner_id is not null order by partner_id;
  update ae_leads l set
    name = coalesce(nullif(trim(v.name), ''), l.name),
    priority_rank = coalesce(v.priority_rank, l.priority_rank), grade = coalesce(v.grade, l.grade), score = coalesce(v.score, l.score),
    region_tier = coalesce(v.region_tier, l.region_tier),
    insight = coalesce(l.insight, '{}'::jsonb) || coalesce(jsonb_strip_nulls(v.insight), '{}'::jsonb),
    list_version = case when p_full then p_version else l.list_version end,
    region = case when v.region is not null and (l.list_version is not null or l.region is null) then v.region else l.region end
  from _v v where l.partner_id = v.partner_id and l.service_line = 'miso_visit';
  get diagnostics n_upd = row_count;
  insert into ae_leads (partner_id, name, region, service_line, source, priority_rank, grade, score, region_tier, insight, list_version)
  select v.partner_id, trim(v.name), v.region, 'miso_visit', 'cross_sell', v.priority_rank, v.grade, v.score, v.region_tier, jsonb_strip_nulls(v.insight), p_version
  from _v v where coalesce(trim(v.name), '') <> ''
    and not exists (select 1 from ae_leads l where l.partner_id = v.partner_id and l.service_line = 'miso_visit');
  get diagnostics n_ins = row_count;
  if p_full then
    select count(*) into n_missing from ae_leads l where l.service_line = 'miso_visit' and l.list_version is not null and l.list_version <> p_version
      and l.stage not in ('WON','LOST');
  end if;
  select jsonb_agg(jsonb_build_object('partner_id', partner_id) || signals) into v_sig from _v where signals is not null;
  return jsonb_build_object('updated', n_upd, 'inserted', n_ins, 'not_in_list', n_missing,
    'skipped_no_name', (select count(*) from _v v where coalesce(trim(v.name), '') = ''
      and not exists (select 1 from ae_leads l where l.partner_id = v.partner_id and l.service_line = 'miso_visit')),
    'signals', case when v_sig is null then null else apply_ae_signals(v_sig, 'list:' || p_version) end);
end $$;

drop function if exists import_ae_list(jsonb, text);
revoke execute on function import_ae_list(jsonb, text, boolean) from anon;
