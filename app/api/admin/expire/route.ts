import { route } from '@/lib/auth';
import { tx } from '@/lib/db';

// Manual expiry sweep (no scheduler by design). The trigger audits each row.
export const POST = route(['ADMIN'], async ({ user }) =>
  tx(user.uid, async (c) => {
    const [r]: any = await c.query(
      `UPDATE donations d JOIN food_batches b ON b.batch_id = d.batch_id
          SET d.status = 'EXPIRED'
        WHERE d.status = 'AVAILABLE' AND b.expires_at <= NOW()`);
    return { expired: r.affectedRows };
  }));
