// 로컬 화면 확인용 미리보기 (NEXT_PUBLIC_PREVIEW=1 일 때만, localhost 전용 · 운영 빌드에는 안 쓰임)
// Supabase 대신 /api/preview-fixtures 의 읽기 전용 사본으로 응답한다. 저장 · 변경은 아무것도 하지 않는다
let fx: Record<string, any[]> | null = null; let loading: Promise<any> | null = null;
const load = () => (fx ? Promise.resolve(fx) : (loading ||= fetch('/api/preview-fixtures').then((r) => r.json()).then((j) => (fx = j))));

class Q {
  private f: ((r: any) => boolean)[] = []; private ord: [string, boolean][] = []; private rng: [number, number] | null = null; private one = false; private lim = 0;
  constructor(private t: string, private write = false) {}
  select() { return this; } insert() { this.write = true; return this; } update() { this.write = true; return this; } delete() { this.write = true; return this; } upsert() { this.write = true; return this; }
  eq(k: string, v: any) { this.f.push((r) => String(r[k]) === String(v)); return this; }
  neq(k: string, v: any) { this.f.push((r) => String(r[k]) !== String(v)); return this; }
  in(k: string, vs: any[]) { const s = new Set(vs.map(String)); this.f.push((r) => s.has(String(r[k]))); return this; }
  gte(k: string, v: any) { this.f.push((r) => r[k] != null && r[k] >= v); return this; }
  lte(k: string, v: any) { this.f.push((r) => r[k] != null && r[k] <= v); return this; }
  not(k: string, op: string, v: string) { if (op === 'in') { const s = new Set(v.replace(/[()"]/g, '').split(',')); this.f.push((r) => !s.has(String(r[k]))); } return this; }
  order(k: string, o?: { ascending?: boolean }) { this.ord.push([k, o?.ascending !== false]); return this; }
  range(a: number, b: number) { this.rng = [a, b]; return this; } limit(n: number) { this.lim = n; return this; }
  maybeSingle() { this.one = true; return this; } single() { this.one = true; return this; }
  async run() {
    if (this.write) return { data: null, error: null };
    const F = await load(); const alias: Record<string, string> = { ae_leads: 'v_ae_board', am_care: 'v_care_board', am_partners: 'v_am_board', src_partners: 'v_am_board', booking_cases: 'v_booking_board' };
    const all = F[this.t] || F[alias[this.t]] || []; let rows = all.filter((r: any) => this.f.every((fn) => fn(r)));
    for (const [k, asc] of [...this.ord].reverse()) rows = [...rows].sort((x: any, y: any) => (x[k] == null ? 1 : y[k] == null ? -1 : x[k] > y[k] ? 1 : x[k] < y[k] ? -1 : 0) * (asc ? 1 : -1));
    if (this.rng) rows = rows.slice(this.rng[0], this.rng[1] + 1); if (this.lim) rows = rows.slice(0, this.lim);
    return { data: this.one ? rows[0] ?? null : rows, error: null, count: rows.length };
  }
  then(res: any, rej?: any) { return this.run().then(res, rej); }
}
const chan: any = { on() { return chan; }, subscribe(cb?: any) { cb && setTimeout(() => cb('SUBSCRIBED'), 0); return chan; }, track: async () => {}, presenceState: () => ({}) };
export const previewClient: any = {
  from: (t: string) => new Q(t),
  rpc: async (n: string) => ({ data: n === 'perf_ae' || n === 'perf_am' ? [] : null, error: null }),
  channel: () => chan, removeChannel: () => {},
  auth: { signOut: async () => ({}), updateUser: async () => ({ error: null }) },
};
