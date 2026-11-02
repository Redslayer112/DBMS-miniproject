import { route, id, HttpError } from '@/lib/auth';
import { tx, profileId } from '@/lib/db';

// [id] = donation_id. UNIQUE(pickups.donation_id) makes a double claim impossible;
// the lifecycle trigger rejects claiming anything that is not ACCEPTED.
export const POST = route(['VOLUNTEER'], async ({ user, params }) => {
  const did = id(params.id);
  const vid = await profileId(user.uid, 'VOLUNTEER');
  return tx(user.uid, async (c) => {
    const [[v]]: any = await c.query('SELECT availability_status FROM volunteers WHERE volunteer_id = ?', [vid]);
    if (v.availability_status !== 'AVAILABLE') throw new HttpError(409, 'You are marked UNAVAILABLE');
    const [p]: any = await c.query('INSERT INTO pickups (donation_id, volunteer_id) VALUES (?, ?)', [did, vid]);
    await c.query("UPDATE donations SET status = 'PICKUP_ASSIGNED' WHERE donation_id = ?", [did]);
    return { pickup_id: p.insertId };
  });
});
