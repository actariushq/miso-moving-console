'use client';
import { useCallback, useEffect, useState } from 'react';
export function useLoad<T>(fn: () => Promise<T>, deps: any[] = []) {
  const [data, setData] = useState<T | null>(null); const [err, setErr] = useState('');
  const reload = useCallback(async () => { try { setErr(''); setData(await fn()); } catch (e: any) { setErr(e.message || String(e)); } }, deps);
  useEffect(() => { reload(); }, [reload]);
  return { data, err, reload };
}
