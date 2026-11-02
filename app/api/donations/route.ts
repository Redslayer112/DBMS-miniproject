import { z } from 'zod';
import { route, body, HttpError } from '@/lib/auth';
import { q, tx, profileId } from '@/lib/db';

const SELECT = `
SELECT d.donation_id, d.recipient_ngo_id, d.status, d.created_at, d.accepted_at, d.cancel_reason,
       b.batch_no, b.quantity_kg, b.expires_at, fi.name AS food_name, fc.name AS category_name,
       r.business_name, n.organization_name AS recipient,
       (SELECT COUNT(*) FROM donation_requests dr
         WHERE dr.donation_id = d.donation_id AND dr.status = 'PENDING') AS pending_requests,
       dl.delivery_id, dl.status AS delivery_status
  FROM donations d
  JOIN food_batches b     ON b.batch_id = d.batch_id
  JOIN food_items fi      ON fi.food_item_id = b.food_item_id
  JOIN food_categories fc ON fc.category_id = fi.category_id
  JOIN restaurants r      ON r.restaurant_id = fi.restaurant_id
  LEFT JOIN ngos n        ON n.ngo_id = d.recipient_ngo_id
  LEFT JOIN pickups p     ON p.donation_id = d.donation_id
  LEFT JOIN deliveries dl ON dl.pickup_id = p.pickup_id`;

// Role-scoped donation list.
export const GET = route(['RESTAURANT', 'NGO', 'ADMIN'], async ({ user }) => {
  if (user.role === 'RESTAURANT')
    return q(`${SELECT} WHERE r.user_id = ? ORDER BY d.created_at DESC`, [user.uid]);
  if (user.role === 'NGO') {
    // donations this NGO requested or received, with its own request status
    const ngo = await profileId(user.uid, 'NGO');
    return q(`${SELECT.replace('SELECT d.donation_id', 'SELECT my.request_id, my.status AS my_request_status, d.donation_id')}
       LEFT JOIN donation_requests my ON my.donation_id = d.donation_id AND my.ngo_id = ?
       WHERE my.request_id IS NOT NULL OR d.recipient_ngo_id = ?
       ORDER BY d.created_at DESC`, [ngo, ngo]);
  }
  return q(`${SELECT} ORDER BY d.created_at DESC`);
});

const Schema = z.object({
  food_item_id: z.number().int().positive(),
  batch_no: z.string().trim().min(1).max(40),
  quantity_kg: z.number().positive().max(10000),
  prepared_at: z.coerce.date(),
  expires_at: z.coerce.date(),
  packaging_note: z.string().trim().max(255).optional().transform((v) => v || null),
}).refine((b) => b.expires_at > b.prepared_at, { message: 'expires_at must be after prepared_at', path: ['expires_at'] })
  .refine((b) => b.expires_at > new Date(), { message: 'batch is already expired', path: ['expires_at'] });

// Creates the food batch and its donation in one transaction.
export const POST = route(['RESTAURANT'], async ({ req, user }) => {
  const b = await body(req, Schema);
  const rid = await profileId(user.uid, 'RESTAURANT');
  return tx(user.uid, async (c) => {
    const [own]: any = await c.query('SELECT 1 FROM food_items WHERE food_item_id = ? AND restaurant_id = ?', [b.food_item_id, rid]);
    if (!own.length) throw new HttpError(404, 'Food item not found');
    const [bt]: any = await c.query(
      `INSERT INTO food_batches (food_item_id, batch_no, quantity_kg, prepared_at, expires_at, packaging_note)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [b.food_item_id, b.batch_no, b.quantity_kg, b.prepared_at, b.expires_at, b.packaging_note]);
    const [d]: any = await c.query('INSERT INTO donations (batch_id) VALUES (?)', [bt.insertId]);
    return { donation_id: d.insertId };
  });
});
