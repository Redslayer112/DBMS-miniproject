'use client';
import { Shell, Table, Tiles, Bars, Status, useData, act, when } from '@/components/ui';

export default function Dash({ name }: { name: string }) {
  const [a, reloadA] = useData<any>('analytics');
  const [d, reloadD] = useData<any>('admin');
  const reload = () => { reloadA(); reloadD(); };
  const s = a?.system;
  return (
    <Shell title="Admin dashboard" name={name}>
      <section>
        <h2>System overview</h2>
        <Tiles items={[['Active users', s?.active_users], ['Donations', s?.total_donations], ['Available', s?.available_donations],
          ['In progress', s?.in_progress_donations], ['Completed', s?.completed_donations], ['Kg redistributed', s?.kg_redistributed],
          ['Success rate %', s?.success_rate_pct ?? '—'], ['Avg end-to-end (min)', s?.avg_end_to_end_minutes ?? '—']]} />
        <p style={{ marginBottom: 0 }}>
          <button className="ghost" onClick={() => act('admin/expire', reload, undefined, 'Expiry sweep done')}>Run expiry sweep</button>
          <span className="muted"> marks AVAILABLE donations past their expiry as EXPIRED</span>
        </p>
      </section>
      <div className="grid2">
        <section><h2>Kg redistributed by restaurant</h2>
          <Bars unit=" kg" data={(a?.restaurants ?? []).map((r: any) => ({ label: r.business_name, value: Number(r.kg_redistributed) }))} /></section>
        <section><h2>Donations by status</h2>
          <Bars data={(a?.statuses ?? []).map((r: any) => ({ label: r.status, value: r.n }))} /></section>
        <section><h2>Kg confirmed per day (last 14 days)</h2>
          <Bars unit=" kg" data={(a?.daily ?? []).map((r: any) => ({ label: new Date(r.day).toLocaleDateString(), value: Number(r.kg) }))} /></section>
        <section><h2>Operational notes by event type <span className="muted">(MongoDB aggregation)</span></h2>
          <Table rows={a?.noteStats} cols={[['Event type', (n) => n._id], ['Notes', (n) => n.notes], ['Handling flags', (n) => n.flagged]]} /></section>
      </div>
      <section>
        <h2>Deliveries</h2>
        <Table rows={d?.deliveries} cols={[
          ['#', (r) => r.donation_id], ['Status', (r) => <Status s={r.status} />], ['Restaurant', (r) => r.business_name],
          ['NGO', (r) => r.organization_name], ['Volunteer', (r) => r.volunteer_name], ['Kg', (r) => r.quantity_kg],
          ['Pickup min', (r) => r.pickup_minutes ?? '—'], ['Delivery min', (r) => r.delivery_minutes ?? '—'],
          ['End-to-end min', (r) => r.end_to_end_minutes ?? '—'],
        ]} />
      </section>
      <section>
        <h2>Audit log <span className="muted">(written by trigger)</span></h2>
        <Table rows={d?.audit} empty="No status changes yet." cols={[
          ['When', (r) => when(r.created_at)], ['Entity', (r) => `${r.entity_type} #${r.entity_id}`],
          ['Change', (r) => `${r.old_status} → ${r.new_status}`], ['Actor', (r) => r.actor ?? 'system'],
        ]} />
      </section>
      <section>
        <h2>Users</h2>
        <Table rows={d?.users} cols={[['#', (u) => u.user_id], ['Name', (u) => u.full_name], ['Email', (u) => u.email],
          ['Role', (u) => u.role], ['Profile', (u) => u.profile ?? '—'], ['Active', (u) => (u.is_active ? 'Yes' : 'No')],
          ['Joined', (u) => when(u.created_at)]]} />
      </section>
    </Shell>
  );
}
