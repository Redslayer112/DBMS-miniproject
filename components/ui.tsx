'use client';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

export async function api<T = any>(path: string, method = 'GET', data?: unknown): Promise<T> {
  const res = await fetch('/api/' + path, {
    method, headers: data ? { 'content-type': 'application/json' } : undefined,
    body: data ? JSON.stringify(data) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401) location.href = '/login';
  if (!res.ok) throw new Error(json.error || res.statusText);
  return json;
}

export function useData<T = any>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const reload = useCallback(() => {
    if (path) api<T>(path).then(setData).catch((e) => flash(e.message, true));
  }, [path]);
  useEffect(reload, [reload]);
  return [data, reload] as const;
}

// Tiny global toast.
let setMsg: (m: { text: string; err: boolean } | null) => void = () => {};
export function flash(text: string, err = false) { setMsg({ text, err }); }
function Flash() {
  const [m, set] = useState<{ text: string; err: boolean } | null>(null);
  setMsg = set;
  useEffect(() => { if (m) { const t = setTimeout(() => set(null), 4000); return () => clearTimeout(t); } }, [m]);
  return m ? <div className={'flash ' + (m.err ? 'err' : 'ok')} role="status">{m.text}</div> : null;
}

// Runs an API action, shows the result, then refreshes.
export function act(path: string, after: () => void, data?: unknown, ok = 'Done') {
  return api(path, 'POST', data).then(() => { flash(ok); after(); }).catch((e) => flash(e.message, true));
}

export function Shell({ title, name, children }: { title: string; name: string; children: ReactNode }) {
  return (
    <>
      <header>
        <h1>{title}</h1>
        <span className="muted">{name}</span>
        <button className="ghost" onClick={() => api('auth/logout', 'POST').then(() => (location.href = '/login'))}>Log out</button>
      </header>
      <main>{children}</main>
      <Flash />
    </>
  );
}

export const when = (v: string | null) => (v ? new Date(v).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '—');

type Col = [string, (r: any) => ReactNode];
export function Table({ rows, cols, empty = 'Nothing here yet.' }: { rows: any[] | null | undefined; cols: Col[]; empty?: string }) {
  if (!rows) return <p className="muted">Loading…</p>;
  if (!rows.length) return <p className="muted">{empty}</p>;
  return (
    <div className="scroll">
      <table>
        <thead><tr>{cols.map(([h]) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{cols.map(([h, f]) => <td key={h}>{f(r)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export function Tiles({ items }: { items: [string, ReactNode][] }) {
  return <div className="tiles">{items.map(([k, v]) => <div className="tile" key={k}><b>{v ?? 0}</b><span>{k}</span></div>)}</div>;
}

// Single-series horizontal bar chart: one hue, value labels, hover title.
export function Bars({ data, unit = '' }: { data: { label: string; value: number }[]; unit?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (!data.length) return <p className="muted">No data.</p>;
  return (
    <div className="bars">
      {data.map((d) => (
        <div className="bar" key={d.label} title={`${d.label}: ${d.value}${unit}`}>
          <span>{d.label}</span>
          <div className="track">
            <div className="fill" style={{ width: `${(85 * d.value) / max}%` }} />
            <span className="muted">{d.value}{unit}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export const Status = ({ s }: { s: string }) => <span className="badge">{s}</span>;

// MongoDB operational notes for one donation.
export function Notes({ donationId, canWrite }: { donationId: number; canWrite: boolean }) {
  const [list, reload] = useData<any[]>(`donations/${donationId}/notes`);
  const [note, setNote] = useState('');
  const [flag, setFlag] = useState(false);
  return (
    <div>
      <h3 style={{ fontSize: 14 }}>Operational notes · donation #{donationId} <span className="muted">(MongoDB)</span></h3>
      <Table rows={list} empty="No notes." cols={[
        ['When', (n) => when(n.createdAt)], ['Type', (n) => n.eventType], ['Note', (n) => n.note],
        ['Metadata', (n) => <code>{JSON.stringify(n.metadata)}</code>],
      ]} />
      {canWrite && (
        <form className="row" style={{ marginTop: 8 }} onSubmit={(e) => {
          e.preventDefault();
          act(`donations/${donationId}/notes`, () => { setNote(''); reload(); }, { note, metadata: { handlingFlag: flag } }, 'Note added');
        }}>
          <input required placeholder="Add a note" value={note} onChange={(e) => setNote(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
          <label style={{ display: 'flex', gap: 4 }}><input type="checkbox" checked={flag} onChange={(e) => setFlag(e.target.checked)} />handling issue</label>
          <button>Add</button>
        </form>
      )}
    </div>
  );
}
