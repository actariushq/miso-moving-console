'use client';
import { createContext, useContext } from 'react';
type Staff = { id: string; login_id: string; name: string | null; role: string; active: boolean };
const Ctx = createContext<{ me: Staff; staff: Staff[] }>({ me: null as any, staff: [] });
export function StaffProvider({ me, staff, children }: { me: Staff; staff: Staff[]; children: React.ReactNode }) {
  return <Ctx.Provider value={{ me, staff }}>{children}</Ctx.Provider>;
}
export const useStaff = () => useContext(Ctx);
export const useStaffName = () => { const { staff } = useStaff(); return (id?: string | null) => (id ? staff.find((s) => s.id === id)?.name || staff.find((s) => s.id === id)?.login_id || '—' : '시스템'); };
