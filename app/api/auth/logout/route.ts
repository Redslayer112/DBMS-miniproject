import { route, endSession } from '@/lib/auth';

export const POST = route(null, async () => { await endSession(); });
