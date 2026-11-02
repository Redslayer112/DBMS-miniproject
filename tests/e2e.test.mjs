// End-to-end workflow through the HTTP API, all four roles.
// Run with the app up: npm run test:e2e   (BASE_URL defaults to http://localhost:3000)
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
let pass = 0;
const ok = (name) => { console.log('  ok  ', name); pass++; };

async function login(email) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'Password@123' }),
  });
  assert.equal(r.status, 200, `login ${email}`);
  const cookie = r.headers.get('set-cookie').split(';')[0];
  return async (path, method = 'GET', body) => {
    const res = await fetch(`${BASE}/api/${path}`, {
      method, headers: { cookie, ...(body && { 'content-type': 'application/json' }) },
      body: body && JSON.stringify(body),
    });
    return { status: res.status, data: await res.json() };
  };
}
const must = async (p) => { const r = await p; assert.ok(r.status === 200, JSON.stringify(r)); return r.data; };

console.log('auth');
assert.equal((await fetch(`${BASE}/api/donations`)).status, 401); ok('no session -> 401');
const bad = await fetch(`${BASE}/api/auth/login`, { method: 'POST', body: JSON.stringify({ email: 'admin@frp.test', password: 'nope' }) });
assert.equal(bad.status, 401); ok('wrong password -> 401');
const [rest, ngo, vol, admin] = await Promise.all(
  ['spicegarden@frp.test', 'annapurna@frp.test', 'vikram@frp.test', 'admin@frp.test'].map(login));
ok('four roles log in');
assert.equal((await ngo('donations', 'POST', {})).status, 403); ok('NGO cannot create donations -> 403');
assert.equal((await vol('admin')).status, 403); ok('volunteer cannot read admin -> 403');
assert.equal((await rest('donations', 'POST', { food_item_id: 1, batch_no: 'x', quantity_kg: -3,
  prepared_at: new Date().toISOString(), expires_at: new Date(Date.now() + 3600e3).toISOString() })).status, 400);
ok('validation: negative quantity -> 400');

console.log('workflow');
const now = Date.now();
const { donation_id: did } = await must(rest('donations', 'POST', {
  food_item_id: 1, batch_no: 'E2E-' + now.toString(36), quantity_kg: 7.5,
  prepared_at: new Date(now - 3600e3).toISOString(), expires_at: new Date(now + 6 * 3600e3).toISOString(),
}));
ok(`restaurant lists donation #${did} (batch + donation in one transaction)`);

const avail = await must(ngo('ngos/me/available-donations'));
const m = avail.find((x) => x.donation_id === did);
assert.ok(m && m.total_score > 0 && m.category_score === 30); ok(`NGO sees it matched, score ${m.total_score}/100`);
const ranked = await must(rest(`donations/${did}/matches`));
assert.ok(ranked.length >= 1 && ranked.every((r, i) => i === 0 || ranked[i - 1].total_score >= r.total_score)); ok('matches ranked by score');

await must(ngo(`donations/${did}/requests`, 'POST'));
assert.equal((await ngo(`donations/${did}/requests`, 'POST')).status, 409); ok('NGO requests; duplicate request -> 409');

const [req] = await must(rest(`donations/${did}/requests`));
assert.equal((await ngo(`donation-requests/${req.request_id}/accept`, 'POST')).status, 403); ok('NGO cannot accept -> 403');
await must(rest(`donation-requests/${req.request_id}/accept`, 'POST')); ok('restaurant accepts (stored procedure)');

await must(vol(`pickups/${did}/claim`, 'POST'));
assert.equal((await vol(`pickups/${did}/claim`, 'POST')).status, 409); ok('volunteer claims; double claim -> 409');
const { mine } = await must(vol('pickups'));
const pk = mine.find((p) => p.donation_id === did);
await must(vol(`pickups/${pk.pickup_id}/mark-picked-up`, 'POST')); ok('picked up');
await must(vol(`donations/${did}/notes`, 'POST', { note: 'E2E: packaging fine', metadata: { containerCount: 2, handlingFlag: false } }));
ok('volunteer adds MongoDB note');
await must(vol(`pickups/${pk.pickup_id}/mark-delivered`, 'POST')); ok('delivered');

const list = await must(ngo('donations'));
const mineNgo = list.find((d) => d.donation_id === did);
assert.equal(mineNgo.delivery_status, 'DELIVERED');
const otherNgo = await login('feedindia@frp.test');
assert.equal((await otherNgo(`deliveries/${mineNgo.delivery_id}/confirm`, 'POST')).status, 409); ok('non-recipient NGO cannot confirm');
await must(ngo(`deliveries/${mineNgo.delivery_id}/confirm`, 'POST')); ok('recipient NGO confirms');

const final = (await must(rest('donations'))).find((d) => d.donation_id === did);
assert.equal(final.status, 'COMPLETED'); ok('donation COMPLETED');

const { audit } = await must(admin('admin'));
const trail = audit.filter((a) => a.entity_id === did).map((a) => a.new_status).reverse();
assert.deepEqual(trail, ['ACCEPTED', 'PICKUP_ASSIGNED', 'PICKED_UP', 'DELIVERED', 'COMPLETED']); ok('audit trail: 5 transitions by trigger');
const notes = await must(admin(`donations/${did}/notes`));
assert.equal(notes[0].eventType, 'PICKUP_NOTE'); ok('admin reads MongoDB note');
assert.equal((await otherNgo(`donations/${did}/notes`)).status, 403); ok('non-participant cannot read notes');
const a = await must(admin('analytics'));
assert.ok(a.system.completed_donations >= 6 && a.noteStats.length); ok('admin analytics (views + Mongo aggregation)');

console.log(`\n${pass} checks passed`);
