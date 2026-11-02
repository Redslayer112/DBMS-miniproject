import { route, id, HttpError } from '@/lib/auth';
import { tx, profileId } from '@/lib/db';

// Only the recipient NGO can confirm; confirmation completes the donation.
export const POST = route(['NGO'], async ({ user, params }) => {
  const did = id(params.id);
  const ngo = await profileId(user.uid, 'NGO');
  await tx(user.uid, async (c) => {
    const [r]: any = await c.query(
      `UPDATE deliveries dl
         JOIN pickups p   ON p.pickup_id = dl.pickup_id
         JOIN donations d ON d.donation_id = p.donation_id
          SET dl.status = 'CONFIRMED', dl.confirmed_at = NOW(), dl.confirmed_by_user_id = ?
        WHERE dl.delivery_id = ? AND d.recipient_ngo_id = ? AND dl.status = 'DELIVERED'`, [user.uid, did, ngo]);
    if (!r.affectedRows) throw new HttpError(409, 'No delivered shipment addressed to you with that id');
    await c.query(
      `UPDATE donations SET status = 'COMPLETED'
        WHERE donation_id = (SELECT p.donation_id FROM deliveries dl JOIN pickups p ON p.pickup_id = dl.pickup_id
                              WHERE dl.delivery_id = ?)`, [did]);
  });
});
