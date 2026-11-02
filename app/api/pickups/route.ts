import { route } from '@/lib/auth';
import { q, profileId } from '@/lib/db';

const ROUTE = `
SELECT d.donation_id, d.status, fi.name AS food_name, b.quantity_kg, b.expires_at,
       r.business_name, CONCAT(rl.address_line1, ', ', rl.city) AS pickup_address,
       n.organization_name, CONCAT(nl.address_line1, ', ', nl.city) AS drop_address,
       fn_haversine_km(rl.latitude, rl.longitude, nl.latitude, nl.longitude) AS distance_km`;
const FROM = `
  FROM donations d
  JOIN food_batches b ON b.batch_id = d.batch_id
  JOIN food_items fi  ON fi.food_item_id = b.food_item_id
  JOIN restaurants r  ON r.restaurant_id = fi.restaurant_id
  JOIN locations rl   ON rl.location_id = r.location_id
  JOIN ngos n         ON n.ngo_id = d.recipient_ngo_id
  JOIN locations nl   ON nl.location_id = n.location_id`;

export const GET = route(['VOLUNTEER'], async ({ user }) => {
  const vid = await profileId(user.uid, 'VOLUNTEER');
  const [available, mine, [me]] = await Promise.all([
    q(`${ROUTE} ${FROM}
        WHERE d.status = 'ACCEPTED'
          AND NOT EXISTS (SELECT 1 FROM pickups p WHERE p.donation_id = d.donation_id)
        ORDER BY b.expires_at`),
    q(`${ROUTE}, p.pickup_id, p.status AS pickup_status, p.assigned_at, p.picked_up_at,
              dl.status AS delivery_status, dl.delivered_at
        ${FROM}
        JOIN pickups p ON p.donation_id = d.donation_id
        LEFT JOIN deliveries dl ON dl.pickup_id = p.pickup_id
        WHERE p.volunteer_id = ?
        ORDER BY p.assigned_at DESC`, [vid]),
    q('SELECT availability_status, vehicle_type FROM volunteers WHERE volunteer_id = ?', [vid]),
  ]);
  return { me, available, mine };
});
