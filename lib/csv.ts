// CSV 내려받기 (엑셀에서 한글이 안 깨지게 BOM 포함)
export function downloadCsv(name: string, head: string[], rows: any[][]) {
  const cell = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const text = '﻿' + [head.map(cell).join(','), ...rows.map((r) => r.map(cell).join(','))].join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
