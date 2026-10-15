-- 화면 확인용 테스트 데이터 (음수 ID = 테스트). 운영 동기화 전까지만 사용.
-- 지우기: 파일 맨 아래 주석의 delete 문을 대시보드에서 실행
begin;
insert into src_partners(partner_id,name,service_types,region,first_charged_at,balance,instant_quote_on,rating,review_count) values
 (-101,'[테스트] 다온이사','{miso_visit}','강서구',now(),180000,false,null,0),
 (-102,'[테스트] 청솔이사','{miso_visit}','노원구',now()-interval '3 day',250000,false,4.8,6),
 (-103,'[테스트] 나래익스프레스','{miso_visit}','송파구',now()-interval '9 day',410000,true,4.9,12),
 (-104,'[테스트] 가온물류','{miso_visit,visit_quote}','마포구',now()-interval '16 day',220000,true,4.6,3),
 (-105,'[테스트] 푸른별이사','{miso_visit}','강동구',now()-interval '24 day',340000,true,4.8,10),
 (-201,'[테스트] 믿음이사 송파','{miso_visit,visit_quote}','송파구',now()-interval '200 day',520000,true,4.8,132),
 (-202,'[테스트] 한결이사','{miso_visit,visit_quote}','강남구',now()-interval '150 day',310000,true,4.7,88),
 (-203,'[테스트] 새길이사','{miso_visit}','중랑구',now()-interval '90 day',280000,true,4.7,40);
insert into am_partners(partner_id,track,stage,next_action_at,next_action_note) values
 (-101,'new','N0',now()+interval '1 hour','W0 웰컴콜'),
 (-102,'new','N1',now()+interval '1 day','세팅 안내 — 리뷰 이관 확인'),
 (-103,'new','N3',now()-interval '2 hour','D1 첫 참여 리뷰'),
 (-104,'new','N3',now(),'미성사 피드백'),
 (-105,'new','N4',now()+interval '2 day','첫 이사 전 체크콜'),
 (-201,'active','A4',now()+interval '3 day','주간 투입 점검'),
 (-202,'active','A3',now(),'주간 투입 점검'),
 (-203,'active','A1',now()+interval '1 day','캐파 인터뷰');
insert into partner_capacity(partner_id,teams,trucks,crew_regular,crew_daily,jobs_per_team_day,working_days_month,miso_target_month,other_platforms) values
 (-201,6,'{"1t":1,"2.5t":3,"5t":4,"5t+":1}',14,8,1,22,55,'[{"name":"타사 A","monthly_revenue":9000000,"monthly_spend":600000}]'),
 (-202,4,'{"1t":0,"2.5t":2,"5t":3,"5t+":0}',9,6,1,22,35,'[]');
insert into partner_monthly_kpi values (-201,date_trunc('month',now())::date,58,52,61),(-202,date_trunc('month',now())::date,64,38,21),(-203,date_trunc('month',now())::date,28,17,3);
insert into src_orders(order_id,service_type,customer_label,region,pyeong,move_date,requested_at,visit_at,planner_name,video_released_at) values
 (-901,'miso_visit','김**','강서구 화곡동',24,current_date+18,now()-interval '3 day',now()-interval '2 hour','이정우',now()-interval '1 hour'),
 (-902,'miso_visit','이**','송파구 가락동',34,current_date+9,now()-interval '4 day',now()-interval '1 day','이정우',now()-interval '1 day'),
 (-903,'miso_visit','최**','서초구 방배동',41,current_date+6,now()-interval '5 day',now()-interval '2 day','최민석',now()-interval '2 day'),
 (-904,'miso_visit','장**','성북구 길음동',30,current_date+11,now()-interval '7 day',now()-interval '4 day','최민석',now()-interval '4 day');
insert into src_quotes(quote_id,order_id,partner_id,amount,submitted_at,rank_score) values
 (-9021,-902,-201,1570000,now()-interval '20 hour',4.9),(-9022,-902,-202,1330000,now()-interval '19 hour',4.75),(-9023,-902,-105,1510000,now()-interval '18 hour',4.6),
 (-9024,-902,-103,1270000,now()-interval '17 hour',4.6),(-9025,-902,-104,1630000,now()-interval '16 hour',4.35),(-9026,-902,-203,1390000,now()-interval '15 hour',4.0),
 (-9031,-903,-201,1910000,now()-interval '40 hour',4.9),(-9032,-903,-202,1620000,now()-interval '39 hour',4.7),(-9033,-903,-104,1750000,now()-interval '38 hour',4.5),
 (-9041,-904,-202,1120000,now()-interval '90 hour',4.7),(-9042,-904,-203,1450000,now()-interval '89 hour',4.6);
insert into booking_cases(order_id,stage,d0,hesitation_tags,next_call_at) values
 (-901,'B0',current_date,'{}',null),
 (-902,'B1',current_date-1,'{}',null),
 (-903,'B2',current_date-2,'{가족 상의,견적 편차 큼}',now()+interval '3 hour'),
 (-904,'B3',current_date-4,'{날짜 미정}',now());
commit;
select 'am' k, count(*) from v_am_board union all select 'booking', count(*) from v_booking_board;

-- 지우기 (테스트 끝나면):
-- begin; delete from activity_events where subject_id < 0; delete from booking_cases where order_id < 0; delete from src_quotes where quote_id < 0;
-- delete from src_orders where order_id < 0; delete from partner_monthly_kpi where partner_id < 0; delete from partner_capacity where partner_id < 0;
-- delete from am_partners where partner_id < 0; delete from src_partners where partner_id < 0; commit;
