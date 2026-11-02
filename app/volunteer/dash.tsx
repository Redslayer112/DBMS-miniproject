'use client';
import { useState } from 'react';
import { Shell, Table, Tiles, Notes, Status, useData, act, when } from '@/components/ui';

export default function Dash({ name }: { name: string }) {
  const [stats, reloadStats] = useData<any>('analytics');
  const [data, reloadData] = useData<any>('pickups');
  const [sel, setSel] = useState<number | null>(null);
  const reload = () => { reloadStats(); reloadData(); };
  const route = (p: any) => `${p.business_name} (${p.pickup_address}) → ${p.organization_name} (${p.drop_address})`;

  return (
    <Shell title="Volunteer dashboard" name={name}>
      <section>
        <h2>My activity</h2>
        <Tiles items={[['Pickups', stats?.pickups], ['Completed', stats?.completed], ['Kg moved', stats?.kg_moved],
          ['Status', data?.me?.availability_status], ['Vehicle', data?.me?.vehicle_type ?? '—']]} />
      </section>
      <section>
        <h2>Pickups waiting for a volunteer</h2>
        <Table rows={data?.available} empty="No accepted donations need a pickup." cols={[
          ['#', (p) => p.donation_id], ['Food', (p) => p.food_name], ['Kg', (p) => p.quantity_kg],
          ['Route', route], ['Km', (p) => p.distance_km], ['Expires', (p) => when(p.expires_at)],
          ['', (p) => <button onClick={() => act(`pickups/${p.donation_id}/claim`, reload, undefined, 'Pickup claimed')}>Claim</button>],
        ]} />
      </section>
      <section>
        <h2>My pickups</h2>
        <Table rows={data?.mine} cols={[
          ['#', (p) => p.donation_id], ['Food', (p) => p.food_name], ['Kg', (p) => p.quantity_kg], ['Route', route],
          ['Donation', (p) => <Status s={p.status} />], ['Assigned', (p) => when(p.assigned_at)],
          ['Picked up', (p) => when(p.picked_up_at)], ['Delivered', (p) => when(p.delivered_at)],
          ['', (p) => <span style={{ display: 'flex', gap: 6 }}>
            {p.pickup_status === 'ASSIGNED' && <button onClick={() => act(`pickups/${p.pickup_id}/mark-picked-up`, reload, undefined, 'Marked picked up')}>Picked up</button>}
            {p.delivery_status === 'IN_TRANSIT' && <button onClick={() => act(`pickups/${p.pickup_id}/mark-delivered`, reload, undefined, 'Marked delivered')}>Delivered</button>}
            <button className="ghost" onClick={() => setSel(p.donation_id)}>Notes</button>
          </span>],
        ]} />
        {sel && <Notes key={sel} donationId={sel} canWrite />}
      </section>
    </Shell>
  );
}
