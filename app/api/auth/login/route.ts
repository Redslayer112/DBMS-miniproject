import { z } from 'zod';
import { route, body, checkPassword, startSession, HttpError } from '@/lib/auth';
import { q } from '@/lib/db';

const Schema = z.object({ email: z.string().trim().toLowerCase(), password: z.string() });

export const POST = route(null, async ({ req }) => {
  const b = await body(req, Schema);
  const [u] = await q('SELECT user_id, full_name, password_hash, role, is_active FROM users WHERE email = ?', [b.email]);
  if (!u || !(await checkPassword(b.password, u.password_hash))) throw new HttpError(401, 'Invalid email or password');
  if (!u.is_active) throw new HttpError(403, 'Account disabled');
  await startSession({ uid: u.user_id, role: u.role, name: u.full_name });
  return { role: u.role };
});
