import { z } from 'zod';
import { route, body } from '@/lib/auth';
import { q, tx, profileId } from '@/lib/db';

export const GET = route(['NGO'], async ({ user }) => {
  const ngo = await profileId(user.uid, 'NGO');
  const [profile] = await q('SELECT * FROM ngo_active_capacity WHERE ngo_id = ?', [ngo]);
  const cats = await q('SELECT category_id FROM ngo_food_categories WHERE ngo_id = ?', [ngo]);
  return { ...profile, category_ids: cats.map((c) => c.category_id) };
});

const Schema = z.object({
  capacity_kg: z.number().positive().max(100000),
  is_available: z.boolean(),
  category_ids: z.array(z.number().int().positive()).min(1),
});

export const PATCH = route(['NGO'], async ({ req, user }) => {
  const b = await body(req, Schema);
  const ngo = await profileId(user.uid, 'NGO');
  await tx(user.uid, async (c) => {
    await c.query('UPDATE ngos SET capacity_kg = ?, is_available = ? WHERE ngo_id = ?', [b.capacity_kg, b.is_available, ngo]);
    await c.query('DELETE FROM ngo_food_categories WHERE ngo_id = ?', [ngo]);
    await c.query('INSERT INTO ngo_food_categories (ngo_id, category_id) VALUES ?', [b.category_ids.map((cid) => [ngo, cid])]);
  });
});
