import { route } from '@/lib/auth';
import { q } from '@/lib/db';

export const GET = route(['ADMIN'], async () => {
  const [users, audit, deliveries] = await Promise.all([
    q(`SELECT u.user_id, u.full_name, u.email, u.role, u.is_active, u.created_at,
              COALESCE(r.business_name, n.organization_name, v.vehicle_type) AS profile
         FROM users u
         LEFT JOIN restaurants r ON r.user_id = u.user_id
         LEFT JOIN ngos n        ON n.user_id = u.user_id
         LEFT JOIN volunteers v  ON v.user_id = u.user_id
        ORDER BY u.role, u.user_id`),
    q(`SELECT a.audit_id, a.created_at, a.entity_type, a.entity_id, a.old_status, a.new_status, u.full_name AS actor
         FROM audit_logs a LEFT JOIN users u ON u.user_id = a.actor_user_id
        ORDER BY a.audit_id DESC LIMIT 100`),
    q('SELECT * FROM donation_delivery_summary ORDER BY donation_id DESC'),
  ]);
  return { users, audit, deliveries };
});
