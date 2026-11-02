import { route, id, HttpError } from '@/lib/auth';
import { tx, profileId } from '@/lib/db';

// [id] = pickup_id. Pickup -> PICKED_UP, donation -> PICKED_UP, delivery opened IN_TRANSIT.
export const POST = route(['VOLUNTEER'], async ({ user, params }) => {
  const pid = id(params.id);
  const vid = await profileId(user.uid, 'VOLUNTEER');
  await tx(user.uid, async (c) => {
    const [r]: any = await c.query(
      "UPDATE pickups SET status = 'PICKED_UP', picked_up_at = NOW() WHERE pickup_id = ? AND volunteer_id = ? AND status = 'ASSIGNED'",
      [pid, vid]);
    if (!r.affectedRows) throw new HttpError(409, 'No assigned pickup of yours with that id');
    await c.query(
      "UPDATE donations SET status = 'PICKED_UP' WHERE donation_id = (SELECT donation_id FROM pickups WHERE pickup_id = ?)", [pid]);
    await c.query('INSERT INTO deliveries (pickup_id) VALUES (?)', [pid]);
  });
});
