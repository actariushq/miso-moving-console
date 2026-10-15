export default function Kpis({ items }: { items: { l: string; v: any; s?: string; c?: string }[] }) {
  return <div className="kpis" style={{ gridTemplateColumns: `repeat(${items.length},minmax(0,1fr))` }}>
    {items.map((k) => <div className="kpi" key={k.l}><span className="l">{k.l}</span><span className={`v ${k.c || ''}`}>{k.v}</span><span className="s">{k.s || ' '}</span></div>)}</div>;
}
export function Head({ title, sub }: { title: string; sub: string }) {
  return <div className="head"><div><h1>{title}</h1><p>{sub}</p></div></div>;
}
export function Seg({ opts, value, onChange }: { opts: [string, string][]; value: string; onChange: (v: string) => void }) {
  return <div className="seg" role="group">{opts.map(([k, l]) => <button key={k} aria-pressed={value === k} onClick={() => onChange(k)}>{l}</button>)}</div>;
}
