-- AE 온보딩: enum 값 추가 (별도 실행 — 같은 트랜잭션에서 새 값을 쓸 수 없음)
alter type subject_kind add value if not exists 'lead';
alter type module_kind add value if not exists 'ae';
