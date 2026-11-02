import { z } from 'zod';
import { route, body, hashPassword, startSession } from '@/lib/auth';
import { tx } from '@/lib/db';

const base = {
  full_name: z.string().trim().min(2).max(120),
  email: z.email().max(255).toLowerCase(),
  password: z.string().min(8).max(72),
  phone: z.string().trim().max(25).optional().transform((v) => v || null),
};
const location = z.object({
  address_line1: z.string().trim().min(1).max(180),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().min(1).max(100),
  postal_code: z.string().trim().min(3).max(20),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
});
// ADMIN cannot self-register.
const Schema = z.discriminatedUnion('role', [
  z.object({ ...base, role: z.literal('RESTAURANT'), business_name: z.string().trim().min(2).max(160), location }),
  z.object({
    ...base, role: z.literal('NGO'), organization_name: z.string().trim().min(2).max(160),
    capacity_kg: z.coerce.number().positive().max(100000),
    category_ids: z.array(z.number().int().positive()).min(1), location,
  }),
  z.object({ ...base, role: z.literal('VOLUNTEER'), vehicle_type: z.string().trim().max(60).optional() }),
]);

export const POST = route(null, async ({ req }) => {
  const b = await body(req, Schema);
  const hash = await hashPassword(b.password);
  const uid = await tx(null, async (c) => {
    const [u]: any = await c.query(
      'INSERT INTO users (full_name, email, password_hash, phone, role) VALUES (?, ?, ?, ?, ?)',
      [b.full_name, b.email, hash, b.phone, b.role]);
    const uid = u.insertId as number;
    if (b.role === 'VOLUNTEER') {
      await c.query('INSERT INTO volunteers (user_id, vehicle_type) VALUES (?, ?)', [uid, b.vehicle_type || null]);
      return uid;
    }
    const l = b.location;
    const [loc]: any = await c.query(
      `INSERT INTO locations (address_line1, city, state, postal_code, latitude, longitude)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [l.address_line1, l.city, l.state, l.postal_code, l.latitude, l.longitude]);
    if (b.role === 'RESTAURANT') {
      await c.query('INSERT INTO restaurants (user_id, location_id, business_name, contact_name) VALUES (?, ?, ?, ?)',
        [uid, loc.insertId, b.business_name, b.full_name]);
    } else {
      const [n]: any = await c.query(
        'INSERT INTO ngos (user_id, location_id, organization_name, capacity_kg) VALUES (?, ?, ?, ?)',
        [uid, loc.insertId, b.organization_name, b.capacity_kg]);
      await c.query('INSERT INTO ngo_food_categories (ngo_id, category_id) VALUES ?',
        [b.category_ids.map((cid) => [n.insertId, cid])]);
    }
    return uid;
  });
  await startSession({ uid, role: b.role, name: b.full_name });
  return { role: b.role };
});
