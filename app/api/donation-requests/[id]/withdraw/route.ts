import { route, id, HttpError } from '@/lib/auth';
import { q, profileId } from '@/lib/db';

export const POST = route(['NGO'], async ({ user, params }) => {
  const r: any = await q(
    "UPDATE donation_requests SET status = 'WITHDRAWN' WHERE request_id = ? AND ngo_id = ? AND status = 'PENDING'",
    [id(params.id), await profileId(user.uid, 'NGO')]);
  if (!r.affectedRows) throw new HttpError(409, 'No pending request of yours with that id');
});
