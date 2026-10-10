export const pad2 = (n: number) => String(n).padStart(2, '0');
export const toInputDate = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const today = () => toInputDate(new Date());
export const monthStart = () => {
  const n = new Date();
  return toInputDate(new Date(n.getFullYear(), n.getMonth(), 1));
};

/** 'yyyy-mm-dd' (from <input type="date">) -> local Date. endOfDay makes the "To" date inclusive. */
export function parseLocal(v: string, endOfDay = false): Date {
  const [y, m, d] = v.split('-').map(Number);
  return endOfDay ? new Date(y, m - 1, d, 23, 59, 59, 999) : new Date(y, m - 1, d);
}

export type PresetKey = 'today' | 'yesterday' | 'week' | 'month' | 'lastMonth' | 'year';

export function presetRange(key: PresetKey): { from: string; to: string } {
  const n = new Date();
  const y = n.getFullYear(), m = n.getMonth(), d = n.getDate();
  switch (key) {
    case 'today': return { from: toInputDate(n), to: toInputDate(n) };
    case 'yesterday': { const t = new Date(y, m, d - 1); return { from: toInputDate(t), to: toInputDate(t) }; }
    case 'week': { const dow = (n.getDay() + 6) % 7; return { from: toInputDate(new Date(y, m, d - dow)), to: toInputDate(n) }; }
    case 'month': return { from: toInputDate(new Date(y, m, 1)), to: toInputDate(n) };
    case 'lastMonth': return { from: toInputDate(new Date(y, m - 1, 1)), to: toInputDate(new Date(y, m, 0)) };
    case 'year': return { from: toInputDate(new Date(y, 0, 1)), to: toInputDate(n) };
  }
}

/** yyyy-mm-dd for Excel cells */
export const fmtDate = (d?: Date | string | null) => (d ? toInputDate(new Date(d)) : '');
export const fmtLong = (d?: Date | string | null) =>
  d ? new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '';
export const shortDate = (d?: Date | string | null) =>
  d ? new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short' }) : '';

export function errMsg(err: any, fallback = 'Could not load the report.'): string {
  try {
    if (err?.response) {
      const j = JSON.parse(err.response);
      return j.message || j.detail || j.title || fallback;
    }
  } catch { /* keep fallback */ }
  return fallback;
}

export const sum = <T>(rows: T[] | null | undefined, pick: (r: T) => number | undefined): number =>
  (rows ?? []).reduce((s, r) => s + (pick(r) || 0), 0);

/** [{Metric, Value}] rows for the Summary sheet in Excel */
export const kv = (o: Record<string, unknown>) => Object.entries(o).map(([Metric, Value]) => ({ Metric, Value }));
