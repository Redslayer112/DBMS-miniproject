import { z } from 'zod';
import { route, body, id } from '@/lib/auth';
import { tx, assertDonationOwner } from '@/lib/db';

const Schema = z.object({ reason: z.string().trim().min(3).max(255) });

// The lifecycle trigger rejects cancelling once food is picked up.
export const POST = route(['RESTAURANT'], async ({ req, user, params }) => {
  const did = id(params.id);
  const b = await body(req, Schema);
  await assertDonationOwner(did, user.uid);
  await tx(user.uid, async (c) => {
    await c.query("UPDATE donations SET status = 'CANCELLED', cancel_reason = ? WHERE donation_id = ?", [b.reason, did]);
    await c.query("UPDATE donation_requests SET status = 'REJECTED' WHERE donation_id = ? AND status = 'PENDING'", [did]);
  });
});
