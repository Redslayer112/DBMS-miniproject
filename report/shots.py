import os, re, subprocess, pexpect
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(HERE, "screenshots")
COLS, ROWS = 220, 2000
PS1 = "redslayer112@localhost:~/DBMS/mini-proj$ "
SRN = "PES2UG24CS579"
MAIN = re.compile(r"\r\n\x07?" + SRN + r"@\w+ \[[^\]]*\]> ")
CONT = re.compile(r"    -> ")
SH = re.compile(re.escape(PS1))
MONGO = re.compile(r"food_redistribution_platform> ")
ANSI = re.compile(r"\x07|\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07]*\x07|\x1b[=>]")
ROOTPW = dict(l.strip().split("=", 1) for l in open(os.path.join(ROOT, ".env")) if "=" in l)["MYSQL_ROOT_PASSWORD"]


def apply_cr(line):
    out, col = [], 0
    for ch in line:
        if ch == "\r":
            col = 0
        elif col < len(out):
            out[col] = ch
            col += 1
        else:
            out.append(ch)
            col += 1
    return "".join(out)


def clean(s):
    return "\n".join(apply_cr(l).rstrip().expandtabs(8) for l in ANSI.sub("", s).split("\n"))


def stmts(path):
    out, cur = [], []
    for l in open(path):
        l = re.sub(r"\s+-- .*$", "", l.rstrip())
        if not l.strip() or l.lstrip().startswith("--"):
            continue
        cur.append(l)
        if l.endswith(";"):
            out.append(cur)
            cur = []
    return out


def send(c, lines, prompt=(MAIN, CONT)):
    buf = c.after
    for ln in lines:
        c.sendline(ln)
        c.expect(list(prompt))
        buf += c.before + c.after
    return clean(buf)


FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"


def render(text, name, per_page=50):
    fs, pad = 15, 16
    font, bold = ImageFont.truetype(FONT, fs), ImageFont.truetype(BOLD, fs)
    lh = fs + 5
    lines = text.split("\n")
    while lines and not lines[-1].strip():
        lines.pop()
    while lines and not lines[0].strip():
        lines.pop(0)
    n = max(1, -(-len(lines) // per_page))
    per = -(-len(lines) // n)
    pages = [lines[i:i + per] for i in range(0, len(lines), per)]
    for i, page in enumerate(pages, 1):
        w = max(760, int(max(font.getlength(l) for l in page)) + 2 * pad)
        img = Image.new("RGB", (w, pad * 2 + lh * len(page)), "#1c1c1c")
        d = ImageDraw.Draw(img)
        for y, l in enumerate(page):
            ok = re.match(r"^(Query OK|Database changed|\d+ rows? in set|Empty set|Records:|\s*ok\s|\d+ checks passed)", l)
            err = l.startswith("ERROR") or "MongoServerError" in l
            col = "#ff6b6b" if err else "#8ae234" if ok else "#d0d0d0"
            d.text((pad, pad + y * lh), l, font=bold if ok or err else font, fill=col)
        img.save(os.path.join(OUT, name + (".png" if n == 1 else f"_p{i}.png")))
    print(name, n)


def shell():
    env = dict(os.environ, PS1=PS1, TERM="dumb")
    c = pexpect.spawn("/bin/bash", ["--norc", "--noprofile", "-i"], encoding="utf-8", timeout=180,
                      dimensions=(ROWS, COLS), env=env, cwd=ROOT)
    c.setwinsize(ROWS, COLS)
    c.expect_exact(PS1)
    return c


os.makedirs(OUT, exist_ok=True)
for f in os.listdir(OUT):
    os.remove(os.path.join(OUT, f))

c = shell()
c.sendline("docker compose exec mysql mysql -u root -p")
c.expect("Enter password: ")
boot = PS1 + c.before + c.after
c.sendline(ROOTPW)
c.expect(r"mysql> ")
boot += c.before + c.after
c.sendline("prompt " + SRN + "@\\u [\\d]>\\_")
c.expect(MAIN)
boot += c.before + c.after
render(clean(boot) + "\n" + send(c, [
    "DROP DATABASE IF EXISTS food_redistribution_platform;",
    "CREATE DATABASE food_redistribution_platform CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;",
    "USE food_redistribution_platform;"]), "ddl_00_database")

tables = [s for s in stmts(os.path.join(ROOT, "docs/schema.sql")) if s[0].startswith("CREATE TABLE")]
for s in tables:
    render(send(c, s), "ddl_" + s[0].split()[2])
render(send(c, [
    "SHOW TABLES;",
    "SELECT constraint_type, COUNT(*) AS total FROM information_schema.table_constraints",
    "WHERE table_schema = DATABASE() GROUP BY constraint_type;"]), "ddl_zz_summary")

seed = stmts(os.path.join(ROOT, "sql/03_seed.sql"))
pw = [s for s in seed if s[0].startswith("SET @pw")][0]
for s in seed:
    if not s[0].startswith("INSERT"):
        continue
    t = s[0].split()[2]
    pre = pw if t == "users" else []
    sel = {"users": "SELECT user_id, full_name, email, password_hash, phone, role, is_active FROM users;"}.get(
        t, f"SELECT * FROM {t};")
    render(send(c, pre + s + [sel]), "dml_" + t)

render(send(c, ["source /docker-entrypoint-initdb.d/02_advanced.sql"]), "adv_00_source")
render(send(c, [
    "SELECT routine_name, routine_type FROM information_schema.routines WHERE routine_schema = DATABASE();",
    "SELECT trigger_name, action_timing, event_manipulation, event_object_table",
    "FROM information_schema.triggers WHERE trigger_schema = DATABASE();",
    "SELECT table_name AS view_name FROM information_schema.views WHERE table_schema = DATABASE();"]), "adv_01_objects")

QUERIES = {
    "q_groupby": """
SELECT status, COUNT(*) AS donations FROM donations GROUP BY status ORDER BY donations DESC;
SELECT r.business_name, COUNT(*) AS completed, SUM(b.quantity_kg) AS kg_redistributed
FROM donations d
JOIN food_batches b ON b.batch_id = d.batch_id
JOIN food_items fi ON fi.food_item_id = b.food_item_id
JOIN restaurants r ON r.restaurant_id = fi.restaurant_id
WHERE d.status = 'COMPLETED'
GROUP BY r.business_name
HAVING SUM(b.quantity_kg) > 40
ORDER BY kg_redistributed DESC;
SELECT fc.name AS category, COUNT(*) AS batches, ROUND(AVG(b.quantity_kg), 2) AS avg_kg,
MIN(b.quantity_kg) AS min_kg, MAX(b.quantity_kg) AS max_kg
FROM food_batches b
JOIN food_items fi ON fi.food_item_id = b.food_item_id
JOIN food_categories fc ON fc.category_id = fi.category_id
GROUP BY fc.name;""",
    "q_update": """
SELECT ngo_id, organization_name, capacity_kg FROM ngos WHERE ngo_id = 1;
UPDATE ngos SET capacity_kg = 180.00 WHERE ngo_id = 1;
SELECT ngo_id, organization_name, capacity_kg FROM ngos WHERE ngo_id = 1;
UPDATE volunteers SET availability_status = 'AVAILABLE' WHERE volunteer_id = 4;
SELECT volunteer_id, availability_status, vehicle_type FROM volunteers;""",
    "q_delete": """
SELECT * FROM ngo_food_categories WHERE ngo_id = 2;
DELETE FROM ngo_food_categories WHERE ngo_id = 2 AND category_id = 5;
SELECT * FROM ngo_food_categories WHERE ngo_id = 2;
DELETE FROM restaurants WHERE restaurant_id = 1;""",
    "q_correlated": """
SELECT d.donation_id,
(SELECT COUNT(*) FROM donation_requests dr
WHERE dr.donation_id = d.donation_id AND dr.status = 'PENDING') AS pending_requests
FROM donations d
WHERE d.status = 'AVAILABLE';
SELECT d.donation_id, d.status
FROM donations d
WHERE d.status = 'AVAILABLE'
AND NOT EXISTS (SELECT 1 FROM donation_requests dr WHERE dr.donation_id = d.donation_id);""",
    "q_nested": """
SELECT d.donation_id, b.quantity_kg
FROM donations d JOIN food_batches b ON b.batch_id = d.batch_id
WHERE b.quantity_kg > (SELECT AVG(quantity_kg) FROM food_batches);
SELECT ngo_id, organization_name
FROM ngos
WHERE ngo_id NOT IN (SELECT ngo_id FROM donation_requests WHERE status = 'REJECTED');""",
    "q_join": """
SELECT d.donation_id, d.status, fi.name AS food, fc.name AS category, b.quantity_kg, r.business_name, n.organization_name AS recipient
FROM donations d
JOIN food_batches b ON b.batch_id = d.batch_id
JOIN food_items fi ON fi.food_item_id = b.food_item_id
JOIN food_categories fc ON fc.category_id = fi.category_id
JOIN restaurants r ON r.restaurant_id = fi.restaurant_id
LEFT JOIN ngos n ON n.ngo_id = d.recipient_ngo_id
ORDER BY d.donation_id;""",
    "q_matching": """
SET @donation_id = 1;
WITH c AS (
SELECT ad.donation_id, n.ngo_id, n.organization_name, cap.remaining_kg, ad.quantity_kg,
fn_haversine_km(ad.latitude, ad.longitude, nl.latitude, nl.longitude) AS distance_km,
TIMESTAMPDIFF(MINUTE, NOW(), ad.expires_at) / 60 AS hours_left
FROM available_donations ad
JOIN ngo_food_categories nfc ON nfc.category_id = ad.category_id
JOIN ngos n ON n.ngo_id = nfc.ngo_id AND n.is_available
JOIN locations nl ON nl.location_id = n.location_id
JOIN ngo_active_capacity cap ON cap.ngo_id = n.ngo_id
WHERE ad.donation_id = @donation_id AND cap.remaining_kg >= ad.quantity_kg
)
SELECT ngo_id, organization_name, distance_km, remaining_kg,
30 AS category_score,
ROUND(25 * LEAST(1, remaining_kg / (2 * quantity_kg)), 1) AS capacity_score,
ROUND(25 * GREATEST(0, 1 - hours_left / 48), 1) AS urgency_score,
ROUND(20 * GREATEST(0, 1 - distance_km / 50), 1) AS proximity_score,
ROUND(30 + 25 * LEAST(1, remaining_kg / (2 * quantity_kg))
+ 25 * GREATEST(0, 1 - hours_left / 48)
+ 20 * GREATEST(0, 1 - distance_km / 50), 1) AS total_score
FROM c
ORDER BY total_score DESC, distance_km ASC, remaining_kg DESC, ngo_id ASC;""",
    "p_function": """
SELECT r.business_name, n.organization_name,
fn_haversine_km(rl.latitude, rl.longitude, nl.latitude, nl.longitude) AS km
FROM restaurants r JOIN locations rl ON rl.location_id = r.location_id
CROSS JOIN ngos n JOIN locations nl ON nl.location_id = n.location_id
WHERE r.restaurant_id = 1
ORDER BY km;""",
    "p_fail": """
SELECT request_id, donation_id, ngo_id, status FROM donation_requests WHERE status = 'PENDING';
CALL sp_accept_donation_request(6, 5);
CALL sp_accept_donation_request(3, 2);
CALL sp_accept_donation_request(1, 3);
SELECT request_id, status FROM donation_requests WHERE request_id IN (1, 3, 6);""",
    "p_success": """
CALL sp_accept_donation_request(1, 2);
SELECT request_id, ngo_id, status, reviewed_at FROM donation_requests WHERE donation_id = 1;
SELECT donation_id, recipient_ngo_id, status, accepted_at FROM donations WHERE donation_id = 1;
SELECT * FROM ngo_active_capacity;""",
    "t_guard": """
UPDATE donations SET status = 'COMPLETED' WHERE donation_id = 3;
UPDATE donations SET status = 'ACCEPTED' WHERE donation_id = 3;
UPDATE donations SET status = 'PICKED_UP' WHERE donation_id = 1;
UPDATE donation_requests SET status = 'PENDING' WHERE request_id = 2;""",
    "t_audit": """
SET @app_user_id = 1;
UPDATE donations d JOIN food_batches b ON b.batch_id = d.batch_id
SET d.status = 'EXPIRED'
WHERE d.status = 'AVAILABLE' AND b.expires_at <= NOW();
SELECT a.audit_id, a.entity_type, a.entity_id, a.old_status, a.new_status, u.full_name AS actor, a.created_at
FROM audit_logs a LEFT JOIN users u ON u.user_id = a.actor_user_id
ORDER BY a.audit_id;""",
    "v_views": """
SELECT donation_id, food_name, category_name, quantity_kg, business_name, minutes_to_expiry
FROM available_donations ORDER BY minutes_to_expiry;
SELECT * FROM restaurant_impact_summary;
SELECT * FROM system_analytics_summary\\G""",
    "x_rollback": """
SELECT donation_id, status FROM donations WHERE donation_id = 1;
START TRANSACTION;
INSERT INTO pickups (donation_id, volunteer_id) VALUES (1, 1);
UPDATE donations SET status = 'PICKUP_ASSIGNED' WHERE donation_id = 1;
SELECT donation_id, status FROM donations WHERE donation_id = 1;
ROLLBACK;
SELECT donation_id, status FROM donations WHERE donation_id = 1;
SELECT COUNT(*) AS pickups_for_donation_1 FROM pickups WHERE donation_id = 1;""",
    "x_commit": """
START TRANSACTION;
INSERT INTO pickups (donation_id, volunteer_id) VALUES (1, 1);
UPDATE donations SET status = 'PICKUP_ASSIGNED' WHERE donation_id = 1;
COMMIT;
SELECT p.pickup_id, p.donation_id, p.volunteer_id, p.status AS pickup_status, d.status AS donation_status
FROM pickups p JOIN donations d ON d.donation_id = p.donation_id WHERE p.donation_id = 1;
INSERT INTO pickups (donation_id, volunteer_id) VALUES (1, 2);""",
}
for name, sql in QUERIES.items():
    render(send(c, [l for l in sql.strip().split("\n")]), name)
c.sendline("exit")
c.expect(SH)

def mongosh(cmds):
    # mongosh without a tty prints each prompt but does not echo input; put each command back after its prompt
    out = subprocess.run(["docker", "compose", "exec", "-T", "mongo", "mongosh", "--quiet", "food_redistribution_platform"],
                         input="\n".join(cmds) + "\n", capture_output=True, text=True, cwd=ROOT).stdout
    parts = out.split("food_redistribution_platform> ")
    text = parts[0]
    for cmd, part in zip(cmds, parts[1:]):
        text += "food_redistribution_platform> " + cmd + "\n" + part
    return clean(text + "food_redistribution_platform> ")


MCMD = "docker compose exec mongo mongosh --quiet food_redistribution_platform"
render(PS1 + MCMD + "\n" + mongosh([
    "show collections",
    "db.donation_operational_notes.getIndexes().map(i => i.key)",
    "db.donation_operational_notes.find({ donationId: 10 }, { _id: 0 })",
]), "m_find")
render(PS1 + MCMD + "\n" + mongosh([
    "db.donation_operational_notes.aggregate([{ $group: { _id: '$eventType', notes: { $sum: 1 }, "
    "flagged: { $sum: { $cond: [{ $eq: ['$metadata.handlingFlag', true] }, 1, 0] } } } }, { $sort: { _id: 1 } }])",
    "db.donation_operational_notes.insertOne({ donationId: 1, eventType: 'RANDOM', authorUserId: 2, "
    "createdAt: new Date(), note: 'bad type' })",
]), "m_aggregate")

c.sendline("npm run -s test:db")
c.expect(SH)
render(clean(PS1 + c.before + c.after), "test_db")
c.sendline("npm run -s test:e2e")
c.expect(SH)
render(clean(PS1 + c.before + c.after), "test_e2e")
c.sendline("exit")
