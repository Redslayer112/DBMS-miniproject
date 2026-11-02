import { route } from '@/lib/auth';
import { q, profileId } from '@/lib/db';
import { matches } from '@/lib/matching';

// Donations this NGO is eligible for, best match first.
export const GET = route(['NGO'], async ({ user }) => {
  const ngo = await profileId(user.uid, 'NGO');
  const [list, mine] = await Promise.all([
    matches({ ngoId: ngo }),
    q('SELECT donation_id FROM donation_requests WHERE ngo_id = ?', [ngo]),
  ]);
  const requested = new Set(mine.map((r) => r.donation_id));
  return list.map((m) => ({ ...m, requested: requested.has(m.donation_id) }));
});
