'use client';
import { useState } from 'react';
import { Shell, Table, Tiles, Notes, Status, useData, act, when } from '@/components/ui';

const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const score = (m: any) => m ? `${m.total_score} (cat ${m.category_score} · cap ${m.capacity_score} · urg ${m.urgency_score} · dist ${m.proximity_score})` : 'not eligible now';

export default function Dash({ name }: { name: string }) {
  const [stats, reloadStats] = useData<any>('analytics');
  const [items, reloadItems] = useData<any[]>('food-items');
  const [cats] = useData<any[]>('categories');
  const [donations, reloadDonations] = useData<any[]>('donations');
  const [sel, setSel] = useState<number | null>(null);
  const reload = () => { reloadDonations(); reloadStats(); };

  return (
    <Shell title="Restaurant dashboard" name={name}>
      <section>
        <h2>Impact</h2>
        <Tiles items={[['Donations', stats?.total_donations], ['Completed', stats?.completed_donations],
          ['Kg redistributed', stats?.kg_redistributed], ['Success rate %', stats?.success_rate_pct ?? '—'],
          ['Expired / cancelled', stats?.lost_donations]]} />
      </section>

      <div className="grid2">
        <section>
          <h2>Donate a surplus batch</h2>
          <form className="stack" onSubmit={(e) => {
            e.preventDefault();
            const f: any = Object.fromEntries(new FormData(e.currentTarget));
            const form = e.currentTarget;
            act('donations', () => { form.reset(); reload(); }, {
              food_item_id: Number(f.food_item_id), batch_no: f.batch_no, quantity_kg: Number(f.quantity_kg),
              prepared_at: new Date(f.prepared_at).toISOString(), expires_at: new Date(f.expires_at).toISOString(),
              packaging_note: f.packaging_note,
            }, 'Donation listed');
          }}>
            <label>Food item<select name="food_item_id" required>
              {items?.map((i) => <option key={i.food_item_id} value={i.food_item_id}>{i.name} ({i.category_name})</option>)}
            </select></label>
            <label>Batch no.<input name="batch_no" required placeholder="B-02" /></label>
            <label>Quantity (kg)<input name="quantity_kg" type="number" min="0.1" step="0.1" required /></label>
            <label>Prepared at<input name="prepared_at" type="datetime-local" required defaultValue={local(new Date())} /></label>
            <label>Expires at<input name="expires_at" type="datetime-local" required defaultValue={local(new Date(Date.now() + 8 * 3600e3))} /></label>
            <label>Packaging note<input name="packaging_note" /></label>
            <button>List donation</button>
          </form>
        </section>
        <section>
          <h2>Menu items</h2>
          <Table rows={items} cols={[['Name', (i) => i.name], ['Category', (i) => i.category_name], ['Veg', (i) => (i.is_vegetarian ? 'Yes' : 'No')]]} />
          <form className="row" style={{ marginTop: 12 }} onSubmit={(e) => {
            e.preventDefault();
            const f: any = Object.fromEntries(new FormData(e.currentTarget));
            const form = e.currentTarget;
            act('food-items', () => { form.reset(); reloadItems(); },
              { name: f.name, category_id: Number(f.category_id), is_vegetarian: f.veg === 'on' }, 'Item added');
          }}>
            <label>Name<input name="name" required minLength={2} /></label>
            <label>Category<select name="category_id">{cats?.map((c) => <option key={c.category_id} value={c.category_id}>{c.name}</option>)}</select></label>
            <label style={{ display: 'flex', gap: 4 }}><input type="checkbox" name="veg" defaultChecked />Veg</label>
            <button>Add item</button>
          </form>
        </section>
      </div>

      <section>
        <h2>My donations</h2>
        <Table rows={donations} cols={[
          ['#', (d) => d.donation_id], ['Food', (d) => `${d.food_name} · ${d.batch_no}`], ['Kg', (d) => d.quantity_kg],
          ['Expires', (d) => when(d.expires_at)], ['Status', (d) => <Status s={d.status} />],
          ['Recipient', (d) => d.recipient ?? '—'], ['Pending req.', (d) => d.pending_requests],
          ['', (d) => <button className="ghost" onClick={() => setSel(d.donation_id)}>Open</button>],
        ]} />
      </section>

      {sel && <DonationPanel key={sel} id={sel} donation={donations?.find((d) => d.donation_id === sel)} onChange={reload} />}
    </Shell>
  );
}

function DonationPanel({ id, donation, onChange }: { id: number; donation: any; onChange: () => void }) {
  const [reqs, reloadReqs] = useData<any[]>(`donations/${id}/requests`);
  const [ranked, reloadRanked] = useData<any[]>(`donations/${id}/matches`);
  const refresh = () => { reloadReqs(); reloadRanked(); onChange(); };
  const cancellable = ['AVAILABLE', 'ACCEPTED', 'PICKUP_ASSIGNED'].includes(donation?.status);
  return (
    <section>
      <h2>Donation #{id} · {donation?.food_name} <Status s={donation?.status ?? ''} /></h2>
      <h3 style={{ fontSize: 14 }}>NGO requests</h3>
      <Table rows={reqs} empty="No requests yet." cols={[
        ['NGO', (r) => r.organization_name], ['Status', (r) => <Status s={r.status} />],
        ['Requested', (r) => when(r.requested_at)], ['Match score /100', (r) => score(r.match)],
        ['', (r) => r.status === 'PENDING' && <span style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => act(`donation-requests/${r.request_id}/accept`, refresh, undefined, 'Accepted (stored procedure)')}>Accept</button>
          <button className="danger" onClick={() => act(`donation-requests/${r.request_id}/reject`, refresh, undefined, 'Rejected')}>Reject</button>
        </span>],
      ]} />
      <h3 style={{ fontSize: 14 }}>Eligible NGOs right now (matching engine)</h3>
      <Table rows={ranked} empty="No eligible NGOs (donation not available, or none fit)." cols={[
        ['NGO', (m) => m.organization_name], ['Total', (m) => <b>{m.total_score}</b>], ['Category', (m) => m.category_score],
        ['Capacity', (m) => m.capacity_score], ['Urgency', (m) => m.urgency_score], ['Proximity', (m) => m.proximity_score],
        ['Km', (m) => m.distance_km], ['Free kg', (m) => m.remaining_kg],
      ]} />
      {cancellable && (
        <form className="row" style={{ marginTop: 12 }} onSubmit={(e) => {
          e.preventDefault();
          act(`donations/${id}/cancel`, refresh, { reason: new FormData(e.currentTarget).get('reason') }, 'Cancelled');
        }}>
          <label>Cancel reason<input name="reason" required minLength={3} /></label>
          <button className="danger">Cancel donation</button>
        </form>
      )}
      <Notes donationId={id} canWrite />
    </section>
  );
}
