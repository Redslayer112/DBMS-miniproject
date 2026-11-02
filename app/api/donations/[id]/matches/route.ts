import { route, id } from '@/lib/auth';
import { assertDonationOwner } from '@/lib/db';
import { matches } from '@/lib/matching';

// Ranked, explainable list of eligible NGOs for a donation.
export const GET = route(['RESTAURANT', 'ADMIN'], async ({ user, params }) => {
  const did = id(params.id);
  if (user.role === 'RESTAURANT') await assertDonationOwner(did, user.uid);
  return matches({ donationId: did });
});
