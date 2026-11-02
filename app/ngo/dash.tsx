'use client';
import { useState } from 'react';
import { Shell, Table, Tiles, Notes, Status, useData, act, flash, api, when } from '@/components/ui';

export default function Dash({ name }: { name: string }) {
  const [stats, reloadStats] = useData<any>('analytics');
  const [me, reloadMe] = useData<any>('ngos/me');
  const [cats] = useData<any[]>('categories');
  const [avail, reloadAvail] = useData<any[]>('ngos/me/available-donations');
  const [mine, reloadMine] = useData<any[]>('donations');
  const [sel, setSel] = useState<number | null>(null);
  const reload = () => { reloadStats(); reloadMe(); reloadAvail(); reloadMine(); };

  return (
    <Shell title="NGO dashboard" name={name}>
      <section>
        <h2>Impact</h2>
        <Tiles items={[['Requests made', stats?.requests_made], ['Donations received', stats?.donations_received],
          ['Completed', stats?.donations_completed], ['Kg received', stats?.kg_received],
          ['Free capacity (kg)', `${stats?.remaining_kg ?? '…'} / ${stats?.capacity_kg ?? '…'}`]]} />
      </section>

      <section>
        <h2>Available donations matched to you</h2>
        <p className="muted" style={{ marginTop: 0 }}>Only donations you are eligible for (category, capacity, not expired). Score /100 = category 30 + capacity 25 + urgency 25 + proximity 20.</p>
        <Table rows={avail} empty="No eligible donations right now." cols={[
          ['#', (m) => m.donation_id], ['Food', (m) => m.food_name], ['Category', (m) => m.category_name],
          ['Kg', (m) => m.quantity_kg], ['From', (m) => m.business_name], ['Km', (m) => m.distance_km],
          ['Expires', (m) => when(m.expires_at)], ['Score', (m) => <b>{m.total_score}</b>],
          ['', (m) => <button disabled={m.requested} onClick={() => act(`donations/${m.donation_id}/requests`, reload, undefined, 'Requested')}>
            {m.requested ? 'Requested' : 'Request'}</button>],
        ]} />
      </section>

      <section>
        <h2>My requests & deliveries</h2>
        <Table rows={mine} cols={[
          ['#', (d) => d.donation_id], ['Food', (d) => d.food_name], ['Kg', (d) => d.quantity_kg], ['From', (d) => d.business_name],
          ['My request', (d) => d.my_request_status ? <Status s={d.my_request_status} /> : '—'],
          ['Donation', (d) => <Status s={d.status} />], ['Delivery', (d) => d.delivery_status ?? '—'],
          ['', (d) => <span style={{ display: 'flex', gap: 6 }}>
            {d.my_request_status === 'PENDING' &&
              <button className="danger" onClick={() => act(`donation-requests/${d.request_id}/withdraw`, reload, undefined, 'Withdrawn')}>Withdraw</button>}
            {d.delivery_status === 'DELIVERED' && d.recipient_ngo_id === me?.ngo_id &&
              <button onClick={() => act(`deliveries/${d.delivery_id}/confirm`, reload, undefined, 'Delivery confirmed, donation completed')}>Confirm receipt</button>}
            {d.recipient_ngo_id === me?.ngo_id && <button className="ghost" onClick={() => setSel(d.donation_id)}>Notes</button>}
          </span>],
        ]} />
        {sel && <Notes key={sel} donationId={sel} canWrite />}
      </section>

      {me && cats && (
        <section>
          <h2>Profile & capacity</h2>
          <form className="stack" onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            api('ngos/me', 'PATCH', {
              capacity_kg: Number(fd.get('capacity_kg')), is_available: fd.get('is_available') === 'on',
              category_ids: fd.getAll('category_ids').map(Number),
            }).then(() => { flash('Profile saved'); reload(); }).catch((x) => flash(x.message, true));
          }}>
            <label>Capacity (kg)<input name="capacity_kg" type="number" min="1" step="0.01" defaultValue={me.capacity_kg} required /></label>
            <label style={{ display: 'flex', gap: 6 }}><input type="checkbox" name="is_available" defaultChecked={!!me.is_available} />Accepting donations</label>
            <fieldset><legend className="muted">Accepted categories</legend>
              {cats.map((c) => <label key={c.category_id} style={{ display: 'flex', gap: 6 }}>
                <input type="checkbox" name="category_ids" value={c.category_id} defaultChecked={me.category_ids.includes(c.category_id)} />{c.name}</label>)}
            </fieldset>
            <button>Save</button>
          </form>
        </section>
      )}
    </Shell>
  );
}
