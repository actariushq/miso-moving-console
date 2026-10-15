'use client';
// 팔로우업 날짜 고르기 (KST) — AE · AM · 예약콜 작업창 공용. 기본값은 '오늘'(지금부터 2시간 뒤, 저녁 8시 이후면 내일 오전 10시)
import { ymd, kstDow, toLocalInput } from '@/lib/ui';

const DOW = ['월', '화', '수', '목', '금', '토', '일'];
export const dayStr = (n: number) => ymd(new Date(Date.parse(ymd(new Date()) + 'T12:00:00+09:00') + n * 864e5));
const daysFromToday = (date: string) => Math.round((Date.parse(date) - Date.parse(ymd(new Date()))) / 864e5);
const relDay = (n: number) => (n === 0 ? '오늘' : n === 1 ? '내일' : n === 2 ? '모레' : n < 0 ? `${-n}일 지남` : `${n}일 뒤`);

export function fuLabel(v: string) {
  if (!v) return ''; const [d, t] = v.split('T'); const n = daysFromToday(d);
  return `${+d.slice(5, 7)}/${+d.slice(8, 10)} (${DOW[kstDow(new Date(d + 'T12:00:00+09:00'))]}) ${t} · ${relDay(n)}`;
}
const inHours = (h: number) => { const x = new Date(Date.now() + h * 3600e3); x.setMinutes(Math.ceil(x.getMinutes() / 10) * 10, 0, 0); return toLocalInput(x); };
// 오늘 안에서 잡을 수 있으면 오늘(2시간 뒤), 늦은 시간이면 내일 오전
export function defaultFollowup() { const v = inHours(2); return v.slice(0, 10) === ymd(new Date()) && v.slice(11) <= '20:00' ? v : `${dayStr(1)}T10:00`; }

export function FollowupPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [d, t] = value ? value.split('T') : ['', '10:00'];
  const nextMon = 7 - kstDow(new Date());
  const today = (hm: string) => () => `${dayStr(0)}T${hm}`;
  const quick: [string, () => string][] = [['오늘 2시간 뒤', () => inHours(2)], ['오늘 오후 5시', today('17:00')], ['내일 오전', () => `${dayStr(1)}T10:00`], ['내일 오후', () => `${dayStr(1)}T14:00`],
    ['3일 뒤', () => `${dayStr(3)}T${t || '10:00'}`], ['다음 주 월', () => `${dayStr(nextMon)}T10:00`], ['1주 뒤', () => `${dayStr(7)}T${t || '10:00'}`]];
  const nowHm = toLocalInput(new Date()).slice(11);
  return (<div className="fu">
    <div className="fu-row">
      <input type="date" value={d} min={ymd(new Date())} onChange={(e) => onChange(e.target.value ? `${e.target.value}T${t || '10:00'}` : '')} aria-label="팔로우업 날짜" />
      <input type="time" value={t} step={600} onChange={(e) => d && onChange(`${d}T${e.target.value || '10:00'}`)} aria-label="팔로우업 시간" />
      {value && <b className="fu-l">{fuLabel(value)}</b>}
    </div>
    <div className="chips">{quick.filter(([l, f]) => !(l === '오늘 오후 5시' && nowHm >= '16:30')).map(([l, f]) => { const v = f(); return <button type="button" key={l} aria-pressed={value === v} onClick={() => onChange(v)}>{l}</button>; })}</div>
  </div>);
}
