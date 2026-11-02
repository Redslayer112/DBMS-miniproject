# Food Waste Redistribution Platform

DBMS Level 3 mini-project. Restaurants list surplus food. NGOs request it. A restaurant
accepts one NGO, a volunteer picks the food up and delivers it, and the NGO confirms
receipt. The database enforces every step of that lifecycle.

- **MySQL 8**: 14-table 3NF schema with 3 triggers, 1 stored procedure, 1 stored function and 6 views
- **MongoDB 7** (the second paradigm): semi-structured operational notes per donation
- **Next.js 16**: API route handlers (raw SQL through `mysql2`) and four role dashboards

The design (ER diagram, mapping, DDL) is in `Food_Waste_Redistribution_Platform_Report.pdf`,
with the diagram source in `docs/er-diagram.drawio`.

## Run it

Requires Docker and Node 20+.

```bash
cp .env.example .env              # then set real passwords and a random JWT_SECRET
docker compose up -d --wait       # MySQL :3307 + Mongo :27018; schema, advanced SQL and seed load automatically
npm install
npm run build && npm start        # or: npm run dev
```

Open http://localhost:3000. Every seeded account uses the password **`Password@123`**:

| Role | Email |
|---|---|
| Admin | admin@frp.test |
| Restaurant | spicegarden@frp.test, breadbasket@frp.test, greenbowl@frp.test, udupihouse@frp.test |
| NGO | annapurna@frp.test, hopeshelter@frp.test, feedindia@frp.test, smallsteps@frp.test |
| Volunteer | vikram@frp.test, sneha@frp.test, rahul@frp.test, divya@frp.test |

To reset to a clean seed: `docker compose down -v && docker compose up -d --wait`.

## Tests

```bash
npm run test:db     # 13 checks: CHECK/UNIQUE/FK, trigger, procedure, rollback, concurrent accepts
npm run test:e2e    # 23 checks: full workflow over HTTP for all 4 roles, plus authorization (app must be running)
```

## Layout

```
docs/schema.sql        DDL: 14 tables, constraints, indexes (as printed in the report)
sql/02_advanced.sql    fn_haversine_km, 3 triggers, sp_accept_donation_request, 6 views
sql/03_seed.sql        DML seed: donations in every lifecycle state
sql/queries.sql        27 documented queries (joins, GROUP BY/HAVING, subqueries, CASE, window, matching)
sql/ddl_demo.sql       ALTER / INDEX / TRUNCATE / DROP on a scratch table
mongo/init.js          donation_operational_notes: $jsonSchema validator, 2 indexes, sample docs
lib/db.ts              MySQL pool, tx() helper (sets @app_user_id for the audit trigger), Mongo client
lib/auth.ts            bcrypt, JWT in an httpOnly cookie, route() wrapper with server-side role checks
lib/matching.ts        explainable NGO matching (one SQL query)
app/api/**             REST endpoints
app/{restaurant,ngo,volunteer,admin}   role dashboards
tests/                 db.test.mjs, e2e.test.mjs
```

Run any SQL file against the container:

```bash
docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -t' < sql/queries.sql
```

## Advanced DBMS features

| Feature | Where | What it does |
|---|---|---|
| Transactions | `lib/db.ts` `tx()`, all workflow routes | Batch + donation insert, claim, pickup, delivery and confirm are each atomic |
| Stored procedure | `sp_accept_donation_request` | Runs `SELECT … FOR UPDATE` on the request, donation and NGO. Then checks owner, AVAILABLE status, expiry, NGO availability, category and remaining capacity. Accepts one request, rejects the rest, and rolls back everything on any error |
| Triggers | `trg_donations_before_update` | Allows only the legal lifecycle transitions, using `SIGNAL 45000` with preconditions such as recipient set, batch unexpired, pickup present and delivery confirmed |
| | `trg_donations_after_update` | Writes one `audit_logs` row per status change, with the acting user |
| | `trg_donation_requests_before_update` | A request leaves PENDING only once, and can be ACCEPTED only for the donation's recipient |
| Views | 6 views | Available donations, remaining NGO capacity, restaurant/NGO impact, delivery timings, system KPIs. Derived values are never stored |
| Indexes | `docs/schema.sql` | 12 indexes, each backing a real query (see report §3.3). Check with `EXPLAIN` (Q26) |
| Stored function | `fn_haversine_km` | Distance used by the matching score |

**Matching score (/100):** category fit 30, capacity fit 25 (full marks at 2× headroom),
expiry urgency 25 (rises to full marks as expiry approaches, over 48 h), proximity 20 (zero at 50 km).
Ties are broken by distance, then free capacity, then NGO id. It is computed per request and never stored.

**Why MongoDB for notes:** each note's `metadata` has a different shape depending on who writes it
(container counts and temperature for pickups, servings for deliveries, storage rules for handling).
In a relational design that would mean sparse columns or an EAV table. MySQL remains the source of truth for who may
read or write notes on a donation. MongoDB holds only `donationId`/`authorUserId` references, never
copies of relational rows. The admin dashboard runs a `$group` aggregation over the notes.

## Demo script (viva)

1. **Restaurant** (spicegarden). Open donation #1 to see three pending requests with match scores.
   - Accept *Small Steps*: the procedure rejects it because the NGO lacks capacity.
   - Accept *Annapurna*: it succeeds, and the other requests flip to REJECTED.
2. **Restaurant** (udupihouse). Accept the request on donation #17: rejected because the batch has expired.
3. **Volunteer** (vikram). Claim the donation, mark it picked up, add a note (stored in MongoDB), then mark it delivered.
4. **NGO** (annapurna). Click *Confirm receipt*: the donation becomes COMPLETED.
5. **Admin**. The audit log shows each transition and its actor. KPIs and charts update from the views,
   and the notes aggregation comes from MongoDB. *Run expiry sweep* expires donation #17.
6. **SQL**. Run `sql/queries.sql`. Then try an illegal update by hand:
   `UPDATE donations SET status='COMPLETED' WHERE donation_id=3;` → `Illegal donation transition`.
