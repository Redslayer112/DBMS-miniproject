import { route } from '@/lib/auth';

export const GET = route([], async ({ user }) => user);
