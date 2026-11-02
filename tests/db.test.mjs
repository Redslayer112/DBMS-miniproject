// Database-level tests: constraints, trigger, stored procedure, concurrency.
// Self-contained: creates its own batches/donations, so it can be re-run.
// Run: npm run test:db   (needs `docker compose up`)
import mysql from 'mysql2/promise';
import assert from 'node:assert/strict';

const cfg = {
  host: process.env.MYSQL_HOST, port: +process.env.MYSQL_PORT, database: process.env.MYSQL_DATABASE,
  user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, timezone: 'Z',
};
const db = await mysql.createConnection(cfg);
const tag = 'T' + Date.now().toString(36);
let pass = 0;

async function rejects(sql, params, pattern, name) {
  await assert.rejects(db.query(sql, params), (e) => pattern.test(e.sqlMessage ?? e.message), name);
  console.log('  ok  ', name); pass++;
}
async function donation(itemId, kg, hoursToExpiry, n) {
  const [b] = await db.query(
    'INSERT INTO food_batches (food_item_id, batch_no, quantity_kg, prepared_at, expires_at) VALUES (?, ?, ?, NOW() - INTERVAL 10 HOUR, NOW() + INTERVAL ? HOUR)',
    [itemId, `${tag}-${n}`, kg, hoursToExpiry]);
  const [d] = await db.query('INSERT INTO donations (batch_id) VALUES (?)', [b.insertId]);
  return d.insertId;
}
const request = async (did, ngo) => (await db.query('INSERT INTO donation_requests (donation_id, ngo_id) VALUES (?, ?)', [did, ngo]))[0].insertId;

console.log('constraints');
await rejects('INSERT INTO food_batches (food_item_id, batch_no, quantity_kg, prepared_at, expires_at) VALUES (1, ?, -1, NOW(), NOW() + INTERVAL 1 HOUR)',
  [tag + 'neg'], /chk_food_batches_quantity_kg/, 'CHECK quantity_kg > 0');
await rejects('INSERT INTO food_batches (food_item_id, batch_no, quantity_kg, prepared_at, expires_at) VALUES (1, ?, 1, NOW(), NOW() - INTERVAL 1 HOUR)',
  [tag + 'exp'], /chk_food_batches_expiry_after_preparation/, 'CHECK expires_at > prepared_at');
await rejects("INSERT INTO food_batches (food_item_id, batch_no, quantity_kg, prepared_at, expires_at) VALUES (1, 'B-01', 1, NOW(), NOW() + INTERVAL 1 HOUR)",
  [], /Duplicate/, 'UNIQUE (food_item_id, batch_no): weak-entity key');
await rejects('INSERT INTO donations (batch_id) VALUES (1)', [], /Duplicate/, 'UNIQUE batch_id: one donation per batch');
await rejects('DELETE FROM restaurants WHERE restaurant_id = 1', [], /foreign key/i, 'FK ON DELETE RESTRICT');

console.log('trigger');
const d1 = await donation(1, 5, 5, 1);
await rejects("UPDATE donations SET status = 'COMPLETED' WHERE donation_id = ?", [d1], /Illegal donation transition/, 'illegal transition AVAILABLE -> COMPLETED');
await rejects("UPDATE donations SET status = 'ACCEPTED' WHERE donation_id = ?", [d1], /recipient NGO/, 'ACCEPTED without recipient');
await rejects("UPDATE donations SET status = 'PICKUP_ASSIGNED' WHERE donation_id = ?", [d1], /Illegal/, 'skip ahead to PICKUP_ASSIGNED');

console.log('stored procedure');
const dExp = await donation(1, 5, -1, 2);
const rExp = await request(dExp, 1);
await rejects('CALL sp_accept_donation_request(?, 2)', [rExp], /expired/, 'reject accepting an expired batch');
const dBig = await donation(1, 25, 5, 3);
const rBig = await request(dBig, 4); // NGO 4 capacity 20 kg
await rejects('CALL sp_accept_donation_request(?, 2)', [rBig], /insufficient remaining capacity/, 'reject over-capacity NGO');
await rejects('CALL sp_accept_donation_request(?, 3)', [rBig], /owning restaurant/, 'reject non-owner restaurant');
const [[st]] = await db.query('SELECT status FROM donation_requests WHERE request_id = ?', [rBig]);
assert.equal(st.status, 'PENDING'); console.log('  ok   failed call rolled back (request still PENDING)'); pass++;

console.log('concurrency');
const dRace = await donation(1, 5, 5, 4);
const [ra, rb] = [await request(dRace, 1), await request(dRace, 3)];
const [c1, c2] = [await mysql.createConnection(cfg), await mysql.createConnection(cfg)];
const results = await Promise.allSettled([
  c1.query('CALL sp_accept_donation_request(?, 2)', [ra]),
  c2.query('CALL sp_accept_donation_request(?, 2)', [rb]),
]);
assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1, 'exactly one accept wins');
const [reqs] = await db.query('SELECT status FROM donation_requests WHERE donation_id = ? ORDER BY status', [dRace]);
assert.deepEqual(reqs.map((r) => r.status), ['ACCEPTED', 'REJECTED']);
const [[aud]] = await db.query("SELECT COUNT(*) n FROM audit_logs WHERE entity_type = 'DONATION' AND entity_id = ? AND new_status = 'ACCEPTED'", [dRace]);
assert.equal(aud.n, 1);
console.log('  ok   two parallel accepts: one wins, other request rejected, one audit row'); pass++;
await Promise.all([c1.end(), c2.end()]);

console.log(`\n${pass} checks passed`);
await db.end();
