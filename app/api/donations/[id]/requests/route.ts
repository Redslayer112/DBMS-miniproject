import { route, id, HttpError } from '@/lib/auth';
import { q, profileId, assertDonationOwner } from '@/lib/db';
import { matches } from '@/lib/matching';

// Restaurant: all requests for its donation, annotated with the live match score.
export const GET = route(['RESTAURANT', 'ADMIN'], async ({ user, params }) => {
  const did = id(params.id);
  if (user.role === 'RESTAURANT') await assertDonationOwner(did, user.uid);
  const [reqs, ranked] = await Promise.all([
    q(`SELECT dr.request_id, dr.ngo_id, n.organization_name, dr.status, dr.requested_at, dr.reviewed_at
         FROM donation_requests dr JOIN ngos n ON n.ngo_id = dr.ngo_id
        WHERE dr.donation_id = ? ORDER BY dr.requested_at`, [did]),
    matches({ donationId: did }),
  ]);
  return reqs.map((r) => ({ ...r, match: ranked.find((m) => m.ngo_id === r.ngo_id) ?? null }));
});

// NGO: request a donation. Only eligible NGOs (per the matching rules) may request.
export const POST = route(['NGO'], async ({ user, params }) => {
  const did = id(params.id);
  const ngo = await profileId(user.uid, 'NGO');
  if (!(await matches({ donationId: did, ngoId: ngo })).length)
    throw new HttpError(409, 'Not eligible: donation unavailable/expired, category not accepted, or capacity too low');
  const r: any = await q('INSERT INTO donation_requests (donation_id, ngo_id) VALUES (?, ?)', [did, ngo]);
  return { request_id: r.insertId };
});
