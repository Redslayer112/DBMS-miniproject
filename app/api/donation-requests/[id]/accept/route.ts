import { route, id } from '@/lib/auth';
import { pool } from '@/lib/db';

// All acceptance logic (locking, eligibility, capacity, reject-others) lives in the
// stored procedure so it is atomic and identical whether called from here or SQL.
export const POST = route(['RESTAURANT'], async ({ user, params }) => {
  const c = await pool.getConnection();
  try {
    await c.query('CALL sp_accept_donation_request(?, ?)', [id(params.id), user.uid]);
  } finally {
    await c.query('SET @app_user_id = NULL').catch(() => {}); // procedure sets it
    c.release();
  }
});
