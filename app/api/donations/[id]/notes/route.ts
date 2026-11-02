import { z } from 'zod';
import { route, body, id, HttpError, type Session } from '@/lib/auth';
import { q, notes } from '@/lib/db';

// MySQL decides who may see a donation; MongoDB stores the free-form notes.
async function assertParticipant(did: number, user: Session) {
  if (user.role === 'ADMIN') return;
  const [p] = await q(
    `SELECT r.user_id AS restaurant_uid, n.user_id AS ngo_uid, v.user_id AS volunteer_uid
       FROM donations d
       JOIN food_batches b ON b.batch_id = d.batch_id
       JOIN food_items fi  ON fi.food_item_id = b.food_item_id
       JOIN restaurants r  ON r.restaurant_id = fi.restaurant_id
       LEFT JOIN ngos n       ON n.ngo_id = d.recipient_ngo_id
       LEFT JOIN pickups p    ON p.donation_id = d.donation_id
       LEFT JOIN volunteers v ON v.volunteer_id = p.volunteer_id
      WHERE d.donation_id = ?`, [did]);
  if (!p || ![p.restaurant_uid, p.ngo_uid, p.volunteer_uid].includes(user.uid))
    throw new HttpError(403, 'Not a participant in this donation');
}

export const GET = route([], async ({ user, params }) => {
  const did = id(params.id);
  await assertParticipant(did, user);
  return notes().find({ donationId: did }, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray();
});

const EVENT = { RESTAURANT: 'HANDLING_NOTE', VOLUNTEER: 'PICKUP_NOTE', NGO: 'DELIVERY_NOTE' } as const;
const Schema = z.object({
  note: z.string().trim().min(1).max(1000),
  // shape varies by event type, e.g. { containerCount: 2, temperatureObserved: "COLD", handlingFlag: true }
  metadata: z.record(z.string().max(40), z.union([z.string().max(100), z.number(), z.boolean()])).default({}),
});

export const POST = route(['RESTAURANT', 'VOLUNTEER', 'NGO'], async ({ req, user, params }) => {
  const did = id(params.id);
  await assertParticipant(did, user);
  const b = await body(req, Schema);
  await notes().insertOne({
    donationId: did, eventType: EVENT[user.role as keyof typeof EVENT],
    authorUserId: user.uid, createdAt: new Date(), note: b.note, metadata: b.metadata,
  });
});
