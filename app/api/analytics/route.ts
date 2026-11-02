import { route } from '@/lib/auth';
import { q, notes, profileId } from '@/lib/db';

// All figures come from views/aggregations; nothing is stored.
export const GET = route([], async ({ user }) => {
  switch (user.role) {
    case 'RESTAURANT':
      return (await q('SELECT * FROM restaurant_impact_summary WHERE user_id = ?', [user.uid]))[0];
    case 'NGO':
      return (await q(
        `SELECT i.*, c.capacity_kg, c.committed_kg, c.remaining_kg
           FROM ngo_impact_summary i JOIN ngo_active_capacity c ON c.ngo_id = i.ngo_id
          WHERE i.user_id = ?`, [user.uid]))[0];
    case 'VOLUNTEER':
      return (await q(
        `SELECT COUNT(*) AS pickups, SUM(d.status = 'COMPLETED') AS completed,
                COALESCE(SUM(CASE WHEN d.status = 'COMPLETED' THEN b.quantity_kg END), 0) AS kg_moved
           FROM pickups p JOIN donations d ON d.donation_id = p.donation_id
           JOIN food_batches b ON b.batch_id = d.batch_id
          WHERE p.volunteer_id = ?`, [await profileId(user.uid, 'VOLUNTEER')]))[0];
    case 'ADMIN': {
      const [[system], restaurants, daily, statuses, noteStats] = await Promise.all([
        q('SELECT * FROM system_analytics_summary'),
        q('SELECT business_name, kg_redistributed, success_rate_pct FROM restaurant_impact_summary ORDER BY kg_redistributed DESC'),
        q(`SELECT DATE(dl.confirmed_at) AS day, SUM(b.quantity_kg) AS kg
             FROM deliveries dl JOIN pickups p ON p.pickup_id = dl.pickup_id
             JOIN donations d ON d.donation_id = p.donation_id JOIN food_batches b ON b.batch_id = d.batch_id
            WHERE dl.status = 'CONFIRMED' AND dl.confirmed_at >= NOW() - INTERVAL 14 DAY
            GROUP BY DATE(dl.confirmed_at) ORDER BY day`),
        q('SELECT status, COUNT(*) AS n FROM donations GROUP BY status ORDER BY n DESC'),
        // MongoDB aggregation pipeline: notes and handling flags per event type.
        notes().aggregate([
          { $group: { _id: '$eventType', notes: { $sum: 1 },
                      flagged: { $sum: { $cond: [{ $eq: ['$metadata.handlingFlag', true] }, 1, 0] } } } },
          { $sort: { _id: 1 } },
        ]).toArray(),
      ]);
      return { system, restaurants, daily, statuses, noteStats };
    }
  }
});
