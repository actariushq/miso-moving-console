#!/bin/zsh
# 바탕화면 'AE 리스트 갱신.app' → 이 스크립트 → node scripts/refresh_ae_20261023-1310.mjs
# 알림으로 시작·끝·실패를 알려 준다. 로그: ~/miso-data/data/ae_refresh/refresh.log. VPN(리대시)이 꺼져 있으면 바로 멈춘다
set -u
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
ROOT="$HOME/miso-moving-console"; LOG="$HOME/miso-data/data/ae_refresh/refresh.log"; LOCK="/tmp/ae_refresh.lock"
mkdir -p "$(dirname "$LOG")"
note() { osascript -e "display notification \"$1\" with title \"AE 리스트 갱신\"" >/dev/null 2>&1; echo "$(date '+%F %T') $1" >> "$LOG"; }
if ! mkdir "$LOCK" 2>/dev/null; then
  if [ $(( $(date +%s) - $(stat -f %m "$LOCK") )) -lt 1200 ]; then note "이미 갱신 중이에요"; exit 0; fi
  rm -rf "$LOCK"; mkdir "$LOCK"
fi
trap 'rm -rf "$LOCK"' EXIT
if ! curl -s -m 8 -o /dev/null https://redash.getmiso.com; then note "리대시에 연결이 안 돼요 · AWS VPN을 켜고 다시 눌러 주세요"; exit 1; fi
note "갱신 시작 · 약 2~3분 걸려요"
cd "$ROOT" || exit 1
if node scripts/refresh_ae_20261023-1310.mjs "$@" >> "$LOG" 2>&1; then
  note "$(grep '완료 {' "$LOG" | tail -1 | sed 's/.*완료 /끝났어요 /')"
else
  note "실패했어요 · 로그: ~/miso-data/data/ae_refresh/refresh.log"; exit 1
fi
