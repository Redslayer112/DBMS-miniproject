import { route, id, HttpError } from '@/lib/auth';
import { tx, profileId } from '@/lib/db';

// [id] = pickup_id. Delivery -> DELIVERED, donation -> DELIVERED (awaits NGO confirmation).
export const POST = route(['VOLUNTEER'], async ({ user, params }) => {
  const pid = id(params.id);
  const vid = await profileId(user.uid, 'VOLUNTEER');
  await tx(user.uid, async (c) => {
    const [r]: any = await c.query(
      `UPDATE deliveries dl JOIN pickups p ON p.pickup_id = dl.pickup_id
          SET dl.status = 'DELIVERED', dl.delivered_at = NOW()
        WHERE dl.pickup_id = ? AND p.volunteer_id = ? AND dl.status = 'IN_TRANSIT'`, [pid, vid]);
    if (!r.affectedRows) throw new HttpError(409, 'No in-transit delivery of yours with that pickup id');
    await c.query(
      "UPDATE donations SET status = 'DELIVERED' WHERE donation_id = (SELECT donation_id FROM pickups WHERE pickup_id = ?)", [pid]);
  });
});
