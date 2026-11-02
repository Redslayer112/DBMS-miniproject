import { z } from 'zod';
import { route, body } from '@/lib/auth';
import { q, profileId } from '@/lib/db';

export const GET = route(['RESTAURANT'], async ({ user }) =>
  q(`SELECT fi.food_item_id, fi.name, fi.is_vegetarian, fi.description, fc.name AS category_name
       FROM food_items fi
       JOIN food_categories fc ON fc.category_id = fi.category_id
      WHERE fi.restaurant_id = ?
      ORDER BY fi.name`, [await profileId(user.uid, 'RESTAURANT')]));

const Schema = z.object({
  name: z.string().trim().min(2).max(140),
  category_id: z.number().int().positive(),
  is_vegetarian: z.boolean(),
  description: z.string().trim().max(255).optional().transform((v) => v || null),
});

export const POST = route(['RESTAURANT'], async ({ req, user }) => {
  const b = await body(req, Schema);
  const rid = await profileId(user.uid, 'RESTAURANT');
  const r: any = await q(
    'INSERT INTO food_items (restaurant_id, category_id, name, is_vegetarian, description) VALUES (?, ?, ?, ?, ?)',
    [rid, b.category_id, b.name, b.is_vegetarian, b.description]);
  return { food_item_id: r.insertId };
});
