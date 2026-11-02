import { route } from '@/lib/auth';
import { q } from '@/lib/db';

export const GET = route(null, () => q('SELECT category_id, name FROM food_categories ORDER BY name'));
