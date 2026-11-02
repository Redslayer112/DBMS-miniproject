import mysql, { type PoolConnection } from 'mysql2/promise';
import { MongoClient } from 'mongodb';

const g = globalThis as unknown as { pool?: mysql.Pool; mongo?: MongoClient };

// Credentials come only from environment variables (.env).
export const pool = (g.pool ??= mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT),
  database: process.env.MYSQL_DATABASE,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  connectionLimit: 10,
  timezone: 'Z', // server runs in UTC
  decimalNumbers: true,
}));

// Plain parameterised query. SQL stays visible at the call site.
export async function q<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = await pool.query(sql, params);
  return rows as T[];
}

// Explicit transaction. @app_user_id is read by the audit trigger.
export async function tx<T>(userId: number | null, fn: (c: PoolConnection) => Promise<T>): Promise<T> {
  const c = await pool.getConnection();
  try {
    await c.query('SET @app_user_id = ?', [userId]);
    await c.beginTransaction();
    const out = await fn(c);
    await c.commit();
    return out;
  } catch (e) {
    await c.rollback();
    throw e;
  } finally {
    await c.query('SET @app_user_id = NULL').catch(() => {});
    c.release();
  }
}

export function notes() {
  g.mongo ??= new MongoClient(process.env.MONGODB_URI!);
  return g.mongo.db(process.env.MONGODB_DATABASE).collection('donation_operational_notes');
}

const PROFILE = {
  RESTAURANT: 'SELECT restaurant_id AS id FROM restaurants WHERE user_id = ?',
  NGO: 'SELECT ngo_id AS id FROM ngos WHERE user_id = ?',
  VOLUNTEER: 'SELECT volunteer_id AS id FROM volunteers WHERE user_id = ?',
} as const;

// restaurant_id / ngo_id / volunteer_id for a logged-in user.
export async function profileId(uid: number, role: keyof typeof PROFILE): Promise<number> {
  const [r] = await q<{ id: number }>(PROFILE[role], [uid]);
  return r.id;
}

// 404 unless the donation belongs to this restaurant user.
export async function assertDonationOwner(donationId: number, uid: number) {
  const r = await q(
    `SELECT 1 FROM donations d
       JOIN food_batches b ON b.batch_id = d.batch_id
       JOIN food_items fi  ON fi.food_item_id = b.food_item_id
       JOIN restaurants r  ON r.restaurant_id = fi.restaurant_id
      WHERE d.donation_id = ? AND r.user_id = ?`, [donationId, uid]);
  if (!r.length) throw Object.assign(new Error('Donation not found'), { status: 404 });
}
