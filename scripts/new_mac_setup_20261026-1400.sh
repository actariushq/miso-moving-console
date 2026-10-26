#!/bin/zsh
# 새 맥에서 파트너 콘솔 작업 이어 가기 — 한 번만 실행
# 사용: zsh new_mac_setup_20261026-1400.sh [꾸러미.zip 경로]
# 1) 저장소 받기(~/miso-moving-console, ~/miso-data)  2) 비밀 파일 꾸러미 풀기(.env·리대시 키·메모리)
# 3) npm install · openpyxl  4) 바탕화면 'AE 리스트 갱신.app' 다시 만들기  5) 로그인이 필요한 것 안내
# 비밀 값은 이 파일에 없다. 꾸러미는 옛 맥 바탕화면 '콘솔-이어하기-꾸러미-20261026.zip'
set -e
BUNDLE="${1:-$HOME/Desktop/콘솔-이어하기-꾸러미-20261026.zip}"
say() { print -P "%F{cyan}▸ $1%f"; }

say "저장소 받기"
[ -d ~/miso-moving-console/.git ] || git clone https://github.com/actariushq/miso-moving-console ~/miso-moving-console
[ -d ~/miso-data/.git ] || git clone https://github.com/actariushq/miso-data ~/miso-data

if [ -f "$BUNDLE" ]; then
  say "꾸러미 풀기 (있는 파일은 덮어쓰지 않음)"
  unzip -n -q "$BUNDLE" -d ~
  chmod 700 ~/.config/miso-redash; chmod 600 ~/.config/miso-redash/env
else
  say "꾸러미가 없어요: $BUNDLE — .env·리대시 키는 나중에 넣어 주세요"
fi

say "패키지 설치"
cd ~/miso-moving-console && npm install --no-audit --no-fund
python3 -c 'import openpyxl' 2>/dev/null || python3 -m pip install --user openpyxl

say "바탕화면 'AE 리스트 갱신' 앱"
chmod +x ~/miso-moving-console/scripts/refresh_ae_app_20261023-1310.sh
[ -d ~/Desktop/"AE 리스트 갱신.app" ] || osacompile -o ~/Desktop/"AE 리스트 갱신.app" \
  -e 'do shell script "nohup $HOME/miso-moving-console/scripts/refresh_ae_app_20261023-1310.sh > /dev/null 2>&1 &"' \
  -e 'display notification "리대시에서 최신 리스트를 가져오는 중이에요. 끝나면 알려 드릴게요." with title "AE 리스트 갱신"'

say "남은 로그인 (브라우저가 열려요)"
echo "  cd ~/miso-moving-console"
echo "  npx supabase login && npx supabase link --project-ref ibenzoidvrekjhewoswp"
echo "  npx vercel login && npx vercel link --yes --project miso-moving-console"
echo "  gh auth login   # 깃허브 푸시용"
echo "  AWS VPN 클라이언트 설치·접속 (리대시는 VPN 안에서만)"
echo "확인: npx supabase db query --linked \"select count(*) from ae_leads\"  /  python3 ~/.config/miso-redash/rd.py --help"
