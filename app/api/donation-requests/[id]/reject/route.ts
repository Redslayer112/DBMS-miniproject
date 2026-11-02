import { route, id, HttpError } from '@/lib/auth';
import { q } from '@/lib/db';

export const POST = route(['RESTAURANT'], async ({ user, params }) => {
  const r: any = await q(
    `UPDATE donation_requests dr
       JOIN donations d    ON d.donation_id = dr.donation_id
       JOIN food_batches b ON b.batch_id = d.batch_id
       JOIN food_items fi  ON fi.food_item_id = b.food_item_id
       JOIN restaurants r  ON r.restaurant_id = fi.restaurant_id
        SET dr.status = 'REJECTED'
      WHERE dr.request_id = ? AND r.user_id = ? AND dr.status = 'PENDING'`, [id(params.id), user.uid]);
  if (!r.affectedRows) throw new HttpError(409, 'No pending request of yours with that id');
});
