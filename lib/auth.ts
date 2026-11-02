import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

export type Role = 'RESTAURANT' | 'NGO' | 'VOLUNTEER' | 'ADMIN';
export type Session = { uid: number; role: Role; name: string };

const key = () => new TextEncoder().encode(process.env.JWT_SECRET);
const COOKIE = 'session';

export const hashPassword = (pw: string) => bcrypt.hash(pw, 10);
export const checkPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

export async function startSession(s: Session) {
  const jwt = await new SignJWT(s).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('8h').sign(key());
  (await cookies()).set(COOKIE, jwt, {
    httpOnly: true, sameSite: 'lax', path: '/', maxAge: 8 * 3600,
    secure: process.env.NODE_ENV === 'production',
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

export async function getSession(): Promise<Session | null> {
  const jwt = (await cookies()).get(COOKIE)?.value;
  if (!jwt) return null;
  try {
    const { payload } = await jwtVerify(jwt, key());
    return payload as unknown as Session;
  } catch {
    return null;
  }
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// Authorization is enforced here, server-side, on every API call.
async function requireUser(roles: Role[]): Promise<Session> {
  const s = await getSession();
  if (!s) throw new HttpError(401, 'Not logged in');
  if (roles.length && !roles.includes(s.role)) throw new HttpError(403, 'Forbidden for role ' + s.role);
  return s;
}

type Ctx = { req: Request; user: Session; params: Record<string, string> };

// Wraps a route handler: auth + role check, then maps DB/validation errors to HTTP.
// roles = [] means any logged-in user; null means public.
export function route(roles: Role[] | null, fn: (ctx: Ctx) => Promise<unknown>) {
  return async (req: Request, ctx: { params: Promise<Record<string, string>> }) => {
    try {
      const user = roles ? await requireUser(roles) : (null as unknown as Session);
      const params = (await ctx?.params) ?? {};
      return Response.json((await fn({ req, user, params })) ?? { ok: true });
    } catch (e: any) {
      if (typeof e?.status === 'number') return Response.json({ error: e.message }, { status: e.status });
      if (e instanceof z.ZodError) {
        const i = e.issues[0];
        return Response.json({ error: `${i.path.join('.') || 'body'}: ${i.message}` }, { status: 400 });
      }
      // Business rules raised by triggers / the stored procedure.
      if (e?.sqlState === '45000') return Response.json({ error: e.sqlMessage }, { status: 409 });
      if (e?.code === 'ER_DUP_ENTRY') return Response.json({ error: 'Duplicate: ' + e.sqlMessage }, { status: 409 });
      if (e?.code === 'ER_CHECK_CONSTRAINT_VIOLATED' || e?.code === 'ER_NO_REFERENCED_ROW_2')
        return Response.json({ error: e.sqlMessage }, { status: 400 });
      console.error(e);
      return Response.json({ error: 'Internal error' }, { status: 500 });
    }
  };
}

export async function body<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  return schema.parse(await req.json().catch(() => ({})));
}

export const id = (v: string | undefined) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'Invalid id');
  return n;
};

// Page-level guard for server components.
export async function guardPage(role: Role): Promise<Session> {
  const s = await getSession();
  if (!s) redirect('/login');
  if (s.role !== role) redirect('/' + s.role.toLowerCase());
  return s;
}
