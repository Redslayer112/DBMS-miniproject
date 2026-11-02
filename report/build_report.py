import copy, os, re, subprocess, sys
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt, Inches, RGBColor
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "PES2UG24CS579_DBMS_Report_Venkata_Srivaibhav_Nukaraju.docx")
SCRATCH = sys.argv[1] if len(sys.argv) > 1 else "/tmp"
FONT = "Quicksand Medium"
TITLE = "Food Waste Redistribution Platform"
TEAMMATE = ("Vaishnavi Goyal", "PES2UG24CS571")
GUIDE = "Nivedita Kasturi"
SS = os.path.join(HERE, "screenshots")
FIG = os.path.join(HERE, "figures")
UI = os.path.join(ROOT, "docs", "screenshots")
W = qn("w:t")

# ---------------------------------------------------------------- content
ABSTRACT = [
    "Restaurants discard edible surplus food every day, while NGOs that feed people rarely hear about it in time. "
    "The Food Waste Redistribution Platform connects restaurants, NGOs and volunteers through one database. "
    "A restaurant lists a surplus batch as a donation. "
    "The database ranks the eligible NGOs and accepts exactly one request in a single transaction. "
    "It then tracks pickup and delivery until the NGO confirms receipt.",
    "MySQL 8 holds 14 tables in third normal form with 19 foreign keys, 16 UNIQUE and 8 CHECK constraints. "
    "A stored procedure, three triggers, a stored function and six views enforce the donation lifecycle and compute every statistic. "
    "MongoDB keeps semi-structured handling notes for each donation. "
    "A Next.js application gives four roles their own dashboards and checks the role of every request on the server. "
    "A database test suite passes 13 checks and an end-to-end API test passes 23 checks.",
]

CH = []  # (chapter title, [(subsection title, [blocks])])


def dictionary():
    sql = open(os.path.join(ROOT, "docs", "schema.sql")).read()
    rows = [("Table", "Column", "Type", "Null", "Key / constraint")]
    for name, body in re.findall(r"CREATE TABLE (\w+) \((.*?)\n\) ENGINE", sql, re.S):
        pk = set(re.findall(r"(\w+) BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY", body))
        m = re.search(r"PRIMARY KEY \(([^)]*)\)", body.replace("AUTO_INCREMENT PRIMARY KEY", ""))
        if m:
            pk |= {c.strip() for c in m.group(1).split(",")}
        fks = dict((c, f"{t}.{r}" + (", ON DELETE SET NULL" if d == "SET NULL" else ""))
                   for c, t, r, d in re.findall(r"FOREIGN KEY \((\w+)\) REFERENCES (\w+) \((\w+)\)\s+ON DELETE (SET NULL|RESTRICT)", body))
        uq = [c.split(", ") for c in re.findall(r"UNIQUE \(([^)]*)\)", body)]
        chk = re.findall(r"CHECK \((\w+)", body)
        for l in body.split("\n"):
            l = l.strip().rstrip(",")
            m = re.match(r"(\w+) ((?:BIGINT UNSIGNED|VARCHAR\(\d+\)|DECIMAL\(\d+, \d+\)|DATETIME|BOOLEAN|ENUM\()[^ ]*)", l)
            if not m or l.startswith(("CONSTRAINT", "PRIMARY", "INDEX")):
                continue
            col, typ = m.group(1), m.group(2)
            if typ.startswith("ENUM("):
                m = re.search(col + r" ENUM\((.*?)\)([^\n]*)", body, re.S)
                typ = "ENUM(" + re.sub(r"\s+", " ", m.group(1).replace("'", "")).strip() + ")"
                l = col + " " + m.group(2)
            keys = (["PK"] if col in pk else []) + ([f"FK to {fks[col]}"] if col in fks else [])
            keys += ["UNIQUE" if len(u) == 1 else "UNIQUE (" + ", ".join(u) + ")" for u in uq if col in u]
            keys += ["CHECK"] if col in chk else []
            if "DEFAULT" in l:
                keys.append("default " + l.split("DEFAULT ", 1)[1].split(" ON UPDATE")[0].rstrip(","))
            rows.append((name, col, re.sub(r"\s+", " ", typ), "No" if "NOT NULL" in l or col in pk else "Yes", "; ".join(keys)))
    return rows


DICTIONARY = dictionary()


def chapter(title, *subs):
    CH.append((title, list(subs)))


P = lambda t: ("p", t)
T = lambda label, rows: ("t", label, rows)
S = lambda f, label: ("s", f, label)
F = lambda f, label: ("f", f, label)

chapter("1. INTRODUCTION",
    ("1.1 BACKGROUND", [
        P("Restaurants, hotels and caterers produce surplus cooked food every day. Most of it stays safe to eat for only a few hours. "
          "NGOs, shelters and orphanages need this food but rarely learn about it before it spoils. "
          "Volunteers can carry it, yet nobody assigns them a pickup."),
        P("The platform moves this coordination into a database. Restaurants list surplus batches, NGOs request them and volunteers carry them. "
          "The database decides which NGO is eligible, accepts one request atomically and records every status change."),
    ]),
    ("1.2 OBJECTIVES", [
        T("Objectives and the database features that meet them", [
            ("Objective", "Database feature"),
            ("Store every party and address once", "Normalised schema of 14 tables with primary, foreign and unique keys"),
            ("Reject invalid data when it is written", "CHECK constraints, ENUM columns, NOT NULL and RESTRICT foreign keys"),
            ("Accept exactly one NGO per donation, also under concurrent clicks", "Stored procedure with SELECT ... FOR UPDATE row locks"),
            ("Allow only legal status changes and keep a history", "BEFORE and AFTER UPDATE triggers that write audit_logs"),
            ("Rank eligible NGOs in a way a user can check", "Matching query with a Haversine distance function"),
            ("Report impact without stored totals", "Six views computed from live rows"),
            ("Keep free-form handling notes per donation", "MongoDB collection with a $jsonSchema validator"),
        ]),
    ]),
    ("1.3 SCOPE", [
        P("The system has four roles: restaurant, NGO, volunteer and admin. "
          "It covers registration, listing, matching, request review, pickup, delivery, confirmation and analytics. "
          "Payments, live GPS tracking, ratings and notifications are outside the scope. "
          "Expiry is a manual admin action, so no scheduler runs in the background."),
    ]),
    ("1.4 TECHNOLOGY STACK", [
        T("Technology stack", [
            ("Layer", "Technology", "Use in the project"),
            ("Relational database", "MySQL 8.0, InnoDB, utf8mb4", "All structured data, constraints, triggers, procedure, views"),
            ("Document database", "MongoDB 7", "Operational notes with a varying metadata shape"),
            ("Application", "Next.js 16, React 19, TypeScript", "Route handlers for the API and the four dashboards"),
            ("Database access", "mysql2, MongoDB Node.js driver", "Parameterised SQL written by hand, no ORM"),
            ("Security", "bcryptjs, jose (JWT), zod", "Password hashing, sessions, input validation"),
            ("Runtime", "Docker Compose", "Runs MySQL and MongoDB with the SQL files loaded on start"),
        ]),
    ]),
    ("1.5 DATABASE CHOICE AND JUSTIFICATION", [
        P("Donations, requests, pickups and deliveries are related records with strict rules between them. "
          "A relational database enforces such rules with keys, constraints, transactions and triggers, so MySQL holds this data. "
          "Operational notes differ in shape for each author and need no joins or cross-record rules. "
          "A document store keeps each note whole without sparse columns, so MongoDB holds the notes. "
          "No feature searches by similarity, so a vector database adds nothing to this problem."),
    ]),
)

chapter("2. PROBLEM DEFINITION",
    ("2.1 PROBLEM STATEMENT", [
        P("Surplus food has a short, fixed life. A donation helps only if a suitable NGO receives it before the batch expires. "
          "Coordination by phone and chat groups fails in the ways that the next table lists."),
        T("Coordination failures and the database rule that prevents each one", [
            ("Failure", "Rule enforced by the database"),
            ("Two NGOs both believe they received the same food", "One request per donation becomes ACCEPTED; the others become REJECTED in the same transaction"),
            ("An NGO accepts more food than it can store", "Acceptance compares the batch with capacity minus food already committed to that NGO"),
            ("An NGO receives a category it cannot handle, such as dairy", "The NGO must list the category in ngo_food_categories"),
            ("Expired food is still collected", "The procedure and the trigger reject a batch past expires_at"),
            ("Nobody knows who changed a status, or when", "A trigger writes an audit row with the actor for every status change"),
        ]),
        P("The goal is a system where these rules live in the database itself. The application calls the database but is never the only guard."),
    ]),
    ("2.2 USERS AND FUNCTIONS", [
        T("Functions per role", [
            ("Role", "Functions"),
            ("Restaurant", "Register, add menu items, list a surplus batch, review ranked requests, accept or reject, cancel, add handling notes, view impact"),
            ("NGO", "Register with capacity and accepted categories, view matched donations, request or withdraw, confirm receipt, add delivery notes"),
            ("Volunteer", "View accepted donations without a pickup, claim a pickup, mark it picked up and delivered, add pickup notes"),
            ("Admin", "View users, deliveries, the audit log and system analytics, run the expiry sweep"),
        ]),
    ]),
    ("2.3 DONATION LIFECYCLE", [
        T("Legal donation status transitions", [
            ("Current status", "Allowed next status"),
            ("AVAILABLE", "ACCEPTED, EXPIRED, CANCELLED"),
            ("ACCEPTED", "PICKUP_ASSIGNED, CANCELLED"),
            ("PICKUP_ASSIGNED", "PICKED_UP, CANCELLED"),
            ("PICKED_UP", "DELIVERED"),
            ("DELIVERED", "COMPLETED"),
            ("COMPLETED, EXPIRED, CANCELLED", "None. These states are final"),
        ]),
        P("A request has a separate lifecycle. It starts as PENDING and changes once, to ACCEPTED, REJECTED or WITHDRAWN."),
    ]),
)

chapter("3. ER MODEL",
    ("3.1 ENTITY TYPES", [
        P("The conceptual model uses Chen notation. It has 12 entity types and 17 binary relationship types. "
          "FOOD_BATCH is the only weak entity. A batch number such as B-01 identifies a batch only inside its food item. "
          "The identifying relationship HAS_BATCH gives FOOD_BATCH the full key FOOD_ITEM + batch_no."),
        T("Entity types", [
            ("Entity", "Type", "Key", "Descriptive attributes"),
            ("USER", "Strong", "user_id", "full_name, email, password_hash, phone, role, is_active, created_at, updated_at"),
            ("LOCATION", "Strong", "location_id", "address_line1, address_line2, city, state, postal_code, latitude, longitude"),
            ("RESTAURANT", "Strong", "restaurant_id", "business_name, contact_name, created_at, updated_at"),
            ("NGO", "Strong", "ngo_id", "organization_name, capacity_kg, is_available, created_at, updated_at"),
            ("VOLUNTEER", "Strong", "volunteer_id", "availability_status, vehicle_type, created_at, updated_at"),
            ("FOOD_CATEGORY", "Strong", "category_id", "name, description"),
            ("FOOD_ITEM", "Strong", "food_item_id", "name, is_vegetarian, description"),
            ("FOOD_BATCH", "Weak", "batch_no (partial)", "quantity_kg, prepared_at, expires_at, packaging_note"),
            ("DONATION", "Strong", "donation_id", "status, created_at, accepted_at, cancel_reason"),
            ("PICKUP", "Strong", "pickup_id", "status, assigned_at, picked_up_at"),
            ("DELIVERY", "Strong", "delivery_id", "status, delivered_at, confirmed_at"),
            ("AUDIT_LOG", "Strong", "audit_id", "entity_type, entity_id, action, old_status, new_status, created_at"),
        ]),
    ]),
    ("3.2 RELATIONSHIP TYPES", [
        T("Relationship types", [
            ("Relationship", "Between", "Ratio", "Total participation"),
            ("HAS", "USER - RESTAURANT", "1:1", "RESTAURANT"),
            ("HAS", "USER - NGO", "1:1", "NGO"),
            ("HAS", "USER - VOLUNTEER", "1:1", "VOLUNTEER"),
            ("CREATES", "USER - AUDIT_LOG", "1:N", "AUDIT_LOG"),
            ("LOCATED_AT", "RESTAURANT - LOCATION", "1:1", "RESTAURANT"),
            ("LOCATED_AT", "NGO - LOCATION", "1:1", "NGO"),
            ("OFFERS", "RESTAURANT - FOOD_ITEM", "1:N", "FOOD_ITEM"),
            ("CLASSIFIES", "FOOD_CATEGORY - FOOD_ITEM", "1:N", "FOOD_ITEM"),
            ("HAS_BATCH (identifying)", "FOOD_ITEM - FOOD_BATCH", "1:N", "FOOD_BATCH"),
            ("CREATES", "FOOD_BATCH - DONATION", "1:0..1", "DONATION"),
            ("ACCEPTS", "NGO - FOOD_CATEGORY", "M:N", "None"),
            ("REQUESTS", "NGO - DONATION", "M:N", "None"),
            ("RECEIVED_BY", "DONATION - NGO", "N:0..1", "None"),
            ("HAS", "DONATION - PICKUP", "1:0..1", "PICKUP"),
            ("ASSIGNED_TO", "VOLUNTEER - PICKUP", "1:N", "PICKUP"),
            ("RESULTS_IN", "PICKUP - DELIVERY", "1:0..1", "DELIVERY"),
            ("CONFIRMS", "USER - DELIVERY", "1:N", "None"),
        ]),
        P("REQUESTS carries its own attributes: status, requested_at and reviewed_at. "
          "ACCEPTS and REQUESTS are the only many-to-many relationships."),
    ]),
    ("3.3 ER DIAGRAM", [
        F("er.png", "ER diagram in Chen notation"),
    ]),
)

chapter("4. ER TO RELATIONAL MAPPING",
    ("4.1 STEPS OF ALGORITHM FOR CHOSEN PROBLEM", [
        P("The seven-step ER-to-relational mapping algorithm converts the conceptual model into 14 relations."),
        T("Mapping steps applied to this model", [
            ("Step", "Rule", "Result in this schema"),
            ("1. Strong entities", "Each strong entity becomes a relation; its key becomes the primary key",
             "users, locations, restaurants, ngos, volunteers, food_categories, food_items, donations, pickups, deliveries, audit_logs"),
            ("2. Weak entities", "The owner key becomes a foreign key; with the partial key it identifies the row",
             "food_batches with UNIQUE (food_item_id, batch_no); a surrogate batch_id is the physical key"),
            ("3. Binary 1:1", "Foreign key on the total-participation side, declared UNIQUE",
             "restaurants.user_id, restaurants.location_id, ngos.user_id, ngos.location_id, volunteers.user_id, donations.batch_id, pickups.donation_id, deliveries.pickup_id"),
            ("4. Binary 1:N", "Foreign key on the N side",
             "food_items.restaurant_id, food_items.category_id, food_batches.food_item_id, donations.recipient_ngo_id, pickups.volunteer_id, deliveries.confirmed_by_user_id, audit_logs.actor_user_id"),
            ("5. Binary M:N", "New relation keyed by both foreign keys",
             "ngo_food_categories (ngo_id, category_id); donation_requests with UNIQUE (donation_id, ngo_id)"),
            ("6. Multivalued attributes", "New relation per attribute", "None. Accepted categories are the M:N relationship ACCEPTS"),
            ("7. N-ary relationships", "New relation keyed by all participants", "None. All 17 relationships are binary"),
        ]),
        P("donations stores no accepted request id. The accepted NGO is donations.recipient_ngo_id, "
          "so donation_requests depends on donations and no reverse dependency exists."),
    ]),
    ("4.2 COMPLETE DIAGRAM OF RELATIONAL MAPPING", [
        P("Underlined columns are primary keys and italic columns are foreign keys. Each arrow points from a foreign key to the primary key it references."),
        F("relational.png", "Relational schema with all 19 foreign keys"),
    ]),
    ("4.3 REFERENTIAL ACTIONS AND NORMAL FORM", [
        P("All 19 foreign keys use ON UPDATE RESTRICT. Deletes are RESTRICT, with two exceptions. "
          "deliveries.confirmed_by_user_id and audit_logs.actor_user_id use SET NULL, so delivery and audit history outlive a deleted account."),
        P("Every non-key attribute depends on the whole key and on nothing else. Addresses exist once, in locations. "
          "Quantity, expiry and category exist once, in food_batches and food_items, and never in donations. "
          "Remaining capacity, totals and match scores come from views and queries. The schema is therefore in third normal form."),
    ]),
    ("4.4 DATA DICTIONARY", [
        P("The data dictionary lists every column of the 14 tables, as declared in the DDL of chapter 5."),
        T("Data dictionary", DICTIONARY),
    ]),
)

chapter("5. DDL STATEMENTS",
    ("5.1 DATABASE CREATION", [
        P("All statements run in the MySQL 8.0 command-line client inside the Docker container. "
          "The prompt shows the SRN, the MySQL user and the current database."),
        S("ddl_00_database", "Client login, prompt and database creation"),
    ]),
    ("5.2 TABLE CREATION", [
        P("The tables are created in foreign-key order, so every referenced table already exists. Every table uses InnoDB and utf8mb4."),
        *[S(f"ddl_{t}", f"CREATE TABLE {t}") for t in (
            "users", "locations", "restaurants", "ngos", "volunteers", "food_categories", "food_items",
            "food_batches", "donations", "ngo_food_categories", "donation_requests", "pickups", "deliveries", "audit_logs")],
    ]),
    ("5.3 CONSTRAINTS AND INDEXES", [
        S("ddl_zz_summary", "Tables and constraint counts from information_schema"),
        T("Constraint summary", [
            ("Constraint", "Count", "Examples"),
            ("PRIMARY KEY", "14", "One per table; ngo_food_categories has a composite key"),
            ("FOREIGN KEY", "19", "All with explicit ON DELETE and ON UPDATE actions"),
            ("UNIQUE", "16", "email, phone, business_name, (food_item_id, batch_no), (donation_id, ngo_id)"),
            ("CHECK", "8", "quantity_kg > 0, capacity_kg > 0, expires_at > prepared_at, latitude and longitude bounds"),
            ("ENUM columns", "6", "role, availability_status and the four status columns"),
        ]),
        T("Secondary indexes and the query each one serves", [
            ("Index", "Table", "Query served"),
            ("idx_food_items_restaurant_category", "food_items", "A restaurant's menu filtered by category"),
            ("idx_food_items_category_id", "food_items", "Items of one category; foreign key support"),
            ("idx_food_batches_expires_at", "food_batches", "Batches close to expiry; the expiry sweep"),
            ("idx_donations_status_created_at", "donations", "AVAILABLE donations, newest first"),
            ("idx_donations_recipient_ngo_status", "donations", "An NGO's donations by status; committed capacity"),
            ("idx_ngo_food_categories_category_ngo", "ngo_food_categories", "NGOs that accept a category, used by matching"),
            ("idx_donation_requests_donation_status", "donation_requests", "Pending requests for one donation"),
            ("idx_donation_requests_ngo_status", "donation_requests", "One NGO's request history"),
            ("idx_pickups_volunteer_status", "pickups", "A volunteer's active pickups"),
            ("idx_deliveries_status_delivered_at", "deliveries", "Delivery throughput analytics"),
            ("idx_deliveries_confirmed_by_user_id", "deliveries", "Foreign key support for SET NULL"),
            ("idx_audit_logs_actor_user_id", "audit_logs", "Foreign key support for SET NULL"),
            ("idx_audit_logs_entity_created_at", "audit_logs", "History of one record in time order"),
        ]),
    ]),
)

chapter("6. DML STATEMENTS",
    ("6.1 SEED DATA DESIGN", [
        P("The seed data uses timestamps relative to NOW(), so the demo always has live and expired batches. "
          "Every password is a bcrypt hash and no plaintext password exists in the database. "
          "The 17 donations cover all eight lifecycle states. Two pending requests exist only to fail: one on an expired batch, one above an NGO's capacity."),
        T("Rows inserted per table", [
            ("Table", "Rows"), ("users", "13"), ("locations", "8"), ("restaurants", "4"), ("ngos", "4"), ("volunteers", "4"),
            ("food_categories", "5"), ("ngo_food_categories", "14"), ("food_items", "12"), ("food_batches", "17"),
            ("donations", "17"), ("donation_requests", "18"), ("pickups", "8"), ("deliveries", "7"),
        ]),
    ]),
    ("6.2 INSERT STATEMENTS AND INSERTED ROWS", [
        *[S(f"dml_{t}", f"INSERT INTO {t} and its rows") for t in (
            "users", "locations", "restaurants", "ngos", "volunteers", "food_categories", "ngo_food_categories",
            "food_items", "food_batches", "donations", "donation_requests", "pickups", "deliveries")],
    ]),
)

chapter("7. QUERIES",
    ("7.1 SIMPLE QUERY WITH GROUP BY, AGGREGATE", [
        P("The first query counts donations per status. The second keeps only restaurants with more than 40 kg completed, using HAVING. "
          "The third reports batch size statistics per category with AVG, MIN and MAX."),
        S("q_groupby", "GROUP BY, HAVING and aggregate functions"),
    ]),
    ("7.2 UPDATE OPERATION", [
        P("An NGO raises its capacity from 150 kg to 180 kg, and a volunteer becomes available again. "
          "Each SELECT before and after shows the changed row."),
        S("q_update", "UPDATE on ngos and volunteers"),
    ]),
    ("7.3 DELETE OPERATION", [
        P("Hope Shelter stops accepting packaged food, so its row in ngo_food_categories is deleted. "
          "Deleting a restaurant that still owns food items fails with error 1451, because the foreign key uses ON DELETE RESTRICT."),
        S("q_delete", "DELETE and a delete blocked by a foreign key"),
    ]),
    ("7.4 CORRELATED QUERY", [
        P("The inner query runs once per outer row. The first query counts the pending requests of each available donation. "
          "The second uses NOT EXISTS to find available donations that no NGO has requested."),
        S("q_correlated", "Correlated subqueries with COUNT and NOT EXISTS"),
    ]),
    ("7.5 NESTED QUERY", [
        P("The first query compares each donation with the average batch size from a scalar subquery. "
          "The second uses NOT IN to list NGOs that have never had a request rejected."),
        S("q_nested", "Nested subqueries with a scalar value and NOT IN"),
    ]),
    ("7.6 MULTI-TABLE JOIN", [
        P("Five inner joins and one left join give the full provenance of every donation. The left join keeps donations that have no recipient yet."),
        S("q_join", "Donation provenance across six tables"),
    ]),
    ("7.7 MATCHING QUERY", [
        P("The matching query ranks the NGOs that may receive a donation. A common table expression keeps only eligible NGOs: "
          "available, accepting the category and with enough remaining capacity. Each score component is visible, so a user can check the ranking."),
        T("Matching score components", [
            ("Component", "Maximum", "Formula"),
            ("Category fit", "30", "Always 30, because category acceptance is an eligibility condition"),
            ("Capacity fit", "25", "25 x min(1, remaining kg / (2 x batch kg))"),
            ("Expiry urgency", "25", "25 x max(0, 1 - hours left / 48)"),
            ("Proximity", "20", "20 x max(0, 1 - distance km / 50), with Haversine distance"),
        ]),
        P("Ties go to the higher total, then the shorter distance, then the larger remaining capacity, then the lower NGO id. No score is stored."),
        S("q_matching", "Ranked eligible NGOs for donation 1"),
    ]),
)

chapter("8. STORED PROCEDURES, FUNCTIONS AND TRIGGERS",
    ("8.1 STORED PROCEDURES OR FUNCTIONS", [
        P("One script creates the function, the three triggers, the procedure and the six views. The client runs it with the source command."),
        S("adv_00_source", "Creating the routines, triggers and views"),
        S("adv_01_objects", "Routines, triggers and views in information_schema"),
        P("fn_haversine_km returns the great-circle distance in kilometres between two coordinates. The matching query uses it for proximity."),
        S("p_function", "fn_haversine_km from Spice Garden to every NGO"),
        P("sp_accept_donation_request (request id, restaurant user id) accepts one NGO request. "
          "It runs every step inside one transaction and locks the rows it reads. "
          "Any failed check raises SQLSTATE 45000, and the exit handler rolls back and passes the error on."),
        T("Steps of sp_accept_donation_request", [
            ("Step", "Check or action", "Error on failure"),
            ("1", "Lock the request row with SELECT ... FOR UPDATE", "Request not found; Request is not PENDING"),
            ("2", "Lock the donation, batch, item and restaurant rows", "None"),
            ("3", "Compare the owning restaurant with the caller", "Only the owning restaurant can accept this request"),
            ("4", "Check that the donation is AVAILABLE", "Donation is no longer AVAILABLE"),
            ("5", "Check that expires_at is later than NOW()", "Food batch has expired"),
            ("6", "Lock the NGO row and check that it is available", "NGO is not available"),
            ("7", "Check that the NGO accepts the category", "NGO does not accept this food category"),
            ("8", "Check capacity minus committed kg against the batch", "NGO has insufficient remaining capacity"),
            ("9", "Set the recipient, ACCEPTED and accepted_at", "Checked again by the trigger"),
            ("10", "Accept the request and reject the other pending requests, then COMMIT", "None"),
        ]),
        P("The three failed calls below leave every request PENDING, which shows the rollback."),
        S("p_fail", "Procedure rejects an expired batch, low capacity and a wrong owner"),
        S("p_success", "Procedure accepts request 1 and rejects the competing requests"),
    ]),
    ("8.2 TRIGGERS", [
        T("Triggers", [
            ("Trigger", "Timing and event", "Rule"),
            ("trg_donations_before_update", "BEFORE UPDATE on donations",
             "Allows only legal transitions. ACCEPTED needs a recipient and an unexpired batch. PICKUP_ASSIGNED, PICKED_UP, DELIVERED and COMPLETED each need the matching pickup or delivery row"),
            ("trg_donations_after_update", "AFTER UPDATE on donations",
             "Writes one audit_logs row per status change. The actor comes from the session variable @app_user_id"),
            ("trg_donation_requests_before_update", "BEFORE UPDATE on donation_requests",
             "A request leaves PENDING only once and becomes ACCEPTED only for the donation recipient. Sets reviewed_at"),
        ]),
        P("The audit trigger runs AFTER the update, so a rejected update never leaves an audit row behind."),
        S("t_guard", "Trigger rejects illegal donation and request transitions"),
        S("t_audit", "Expiry sweep and the audit rows written by the trigger"),
    ]),
    ("8.3 VIEWS", [
        T("Views", [
            ("View", "Result"),
            ("available_donations", "AVAILABLE, unexpired donations with food, category, restaurant and coordinates"),
            ("ngo_active_capacity", "capacity_kg minus the kg of donations still in progress for each NGO"),
            ("restaurant_impact_summary", "Donations, completed, lost, kg redistributed and success rate per restaurant"),
            ("ngo_impact_summary", "Requests, donations received, completed and kg received per NGO"),
            ("donation_delivery_summary", "Pickup, delivery and end-to-end time in minutes per donation"),
            ("system_analytics_summary", "One row of system figures for the admin dashboard"),
        ]),
        S("v_views", "Querying three of the views"),
    ]),
    ("8.4 TRANSACTIONS AND CONCURRENCY", [
        P("A volunteer claim inserts a pickup and moves the donation to PICKUP_ASSIGNED. Both writes form one transaction. "
          "After ROLLBACK, neither write remains. After COMMIT, both remain, and UNIQUE (donation_id) blocks a second claim."),
        S("x_rollback", "Claim transaction rolled back"),
        S("x_commit", "Claim transaction committed and a second claim rejected"),
        P("The database test suite opens two connections and calls the procedure for two different requests at the same moment. "
          "Exactly one call succeeds. The row lock on the donation makes the second call see ACCEPTED and fail."),
        S("test_db", "Database test suite with the concurrent acceptance test"),
    ]),
    ("8.5 MONGODB OPERATIONAL NOTES", [
        P("A pickup note records containers and temperature, and a delivery note records servings. "
          "MySQL decides who may read or write the notes of a donation. MongoDB holds only references to MySQL ids, never copies of rows."),
        T("Collection donation_operational_notes", [
            ("Field", "Type", "Meaning"),
            ("donationId", "int", "Reference to donations.donation_id in MySQL"),
            ("eventType", "enum", "HANDLING_NOTE, PICKUP_NOTE or DELIVERY_NOTE"),
            ("authorUserId", "int", "Reference to users.user_id in MySQL"),
            ("createdAt", "date", "Time of the note"),
            ("note", "string, at most 1000 characters", "Free text"),
            ("metadata", "object", "Shape depends on eventType"),
        ]),
        P("The index { donationId: 1, createdAt: -1 } serves the notes of one donation. "
          "The index { eventType: 1, createdAt: -1 } serves analytics by type. The aggregation pipeline groups notes by type and counts handling flags. "
          "The validator rejects a document with an unknown eventType."),
        S("m_find", "Collection, indexes and the notes of donation 10"),
        S("m_aggregate", "Aggregation pipeline and a document rejected by the validator"),
    ]),
)

chapter("9. FRONT END DEVELOPMENT",
    ("9.1 ARCHITECTURE", [
        P("The browser talks only to Next.js route handlers. Each handler checks the session and the role, validates the input and runs parameterised SQL. "
          "Workflow steps run as explicit transactions. Before each transaction the handler sets @app_user_id, so the audit trigger records the real actor."),
        F("architecture.png", "Application architecture"),
    ]),
    ("9.2 SECURITY", [
        P("Passwords are stored as bcrypt hashes with cost 10. A login issues a JWT signed with HS256 in an httpOnly cookie that expires after 8 hours. "
          "Every API route checks the role on the server; hiding a button is never the only guard. "
          "zod validates every request body, and all SQL uses placeholders. Database credentials and the JWT secret come from a .env file that git ignores."),
    ]),
    ("9.3 API ENDPOINTS", [
        T("Main API endpoints", [
            ("Endpoint", "Role", "Database work"),
            ("POST /api/auth/register", "Public", "One transaction: user, location, profile and categories"),
            ("POST /api/auth/login", "Public", "bcrypt comparison, then a JWT cookie"),
            ("POST /api/donations", "Restaurant", "One transaction: food batch and donation"),
            ("GET /api/donations/{id}/matches", "Restaurant, Admin", "Matching query"),
            ("POST /api/donations/{id}/requests", "NGO", "Eligibility check, then INSERT"),
            ("POST /api/donation-requests/{id}/accept", "Restaurant", "CALL sp_accept_donation_request"),
            ("POST /api/donations/{id}/cancel", "Restaurant", "Cancel the donation and reject its pending requests"),
            ("POST /api/pickups/{id}/claim", "Volunteer", "Insert a pickup and set PICKUP_ASSIGNED"),
            ("POST /api/pickups/{id}/mark-picked-up", "Volunteer", "Update pickup and donation, open a delivery"),
            ("POST /api/pickups/{id}/mark-delivered", "Volunteer", "Set the delivery and donation to DELIVERED"),
            ("POST /api/deliveries/{id}/confirm", "Recipient NGO", "Confirm the delivery and complete the donation"),
            ("GET, POST /api/donations/{id}/notes", "Participants", "MongoDB find and insertOne"),
            ("GET /api/analytics", "Any role", "Role-specific views and the MongoDB aggregation"),
            ("POST /api/admin/expire", "Admin", "Expiry UPDATE, audited by the trigger"),
        ]),
    ]),
    ("9.4 USER INTERFACE", [
        P("Each role has one dashboard. The screenshots come from a headless browser session on the seed data."),
        S("ui:login", "Login page with the demo accounts"),
        S("ui:restaurant", "Restaurant dashboard with ranked requests for donation 1"),
        S("ui:ngo", "NGO dashboard with matched donations and deliveries"),
        S("ui:volunteer", "Volunteer dashboard with open and own pickups"),
        S("ui:admin", "Admin dashboard with analytics, audit log and users"),
    ]),
    ("9.5 TESTING", [
        T("Test results", [
            ("Suite", "Checks", "Coverage", "Result"),
            ("Database (tests/db.test.mjs)", "13", "Constraints, trigger, procedure, rollback, concurrent acceptance", "All passed"),
            ("End to end (tests/e2e.test.mjs)", "23", "Authentication, role checks, full lifecycle over HTTP, notes, analytics", "All passed"),
        ]),
        S("test_e2e", "End-to-end API test over the full donation lifecycle"),
    ]),
)

chapter("10. CONCLUSION AND FUTURE ENHANCEMENTS",
    ("10.1 CONCLUSION", [
        P("The platform keeps every redistribution rule inside the database. "
          "The stored procedure accepts exactly one NGO per donation, also when two restaurants act at the same moment. "
          "Triggers block illegal status changes and log each change with its actor. "
          "Views compute every statistic from live rows, so no total goes stale. "
          "MongoDB holds the notes whose shape varies, while MySQL controls who may read them."),
    ]),
    ("10.2 FUTURE ENHANCEMENTS", [
        T("Future enhancements", [
            ("Enhancement", "Database work"),
            ("Automatic expiry", "A MySQL event runs the expiry UPDATE every 15 minutes, still audited by the trigger"),
            ("Partial acceptance of a batch", "A new relation splits one donation into quantities for several NGOs"),
            ("Volunteer routing", "A location for each volunteer, and pickups ranked with fn_haversine_km"),
            ("Notifications", "An outbox table filled by a trigger and read by a background worker"),
            ("Trend reports", "Monthly summary tables refreshed from the existing views"),
        ]),
    ]),
)

REFERENCES = [
    "R. Elmasri and S. B. Navathe, Fundamentals of Database Systems, 7th ed. Pearson, 2016. Chapter 9: Relational Database Design by ER-to-Relational Mapping.",
    "Oracle, MySQL 8.0 Reference Manual. https://dev.mysql.com/doc/refman/8.0/en/",
    "MongoDB, Inc., MongoDB Manual: Schema Validation. https://www.mongodb.com/docs/manual/core/schema-validation/",
    "Vercel, Next.js Documentation: Route Handlers. https://nextjs.org/docs/app/api-reference/file-conventions/route",
]
APPENDIX = [
    ("Term", "Meaning"),
    ("3NF", "Third normal form: no non-key attribute depends on another non-key attribute"),
    ("API", "Application programming interface"),
    ("bcrypt", "Slow, salted password hashing function"),
    ("CTE", "Common table expression, the WITH clause of SQL"),
    ("DDL", "Data definition language: CREATE, ALTER, DROP"),
    ("DML", "Data manipulation language: INSERT, UPDATE, DELETE, SELECT"),
    ("ER", "Entity-relationship"),
    ("FK", "Foreign key"),
    ("Haversine", "Formula for the great-circle distance between two coordinates"),
    ("InnoDB", "MySQL storage engine with transactions, row locks and foreign keys"),
    ("JWT", "JSON Web Token, a signed session token"),
    ("NGO", "Non-governmental organisation"),
    ("PK", "Primary key"),
    ("SQLSTATE 45000", "User-defined error state raised with SIGNAL"),
]

# ---------------------------------------------------------------- template
REPL = {
    "TITLE": TITLE.upper(),
    "T. Lohith Srinivas": "Venkata Srivaibhav Nukaraju",
    "fghdfjjkshjdhs": TEAMMATE[0],
    "Dr. Shilpa S": GUIDE,
    "Disasters data Management System": TITLE,
    "Disasters Data Management System ": TITLE + " ",
    ". Shilpa S, Assistant Professor ": GUIDE + ", Assistant Professor ",
}


def grid(tbl, ws):
    t = tbl._tbl
    for g, w in zip(t.tblGrid.findall(qn("w:gridCol")), ws):
        g.set(qn("w:w"), str(int(w * 1440)))
    for row in tbl.rows:
        for c, w in zip(row.cells, ws):
            c.width = Inches(w)


def widths(tb, rows, total=6.8):
    tb.autofit = False
    lens = [max(min(len(r[i]), 60) for r in rows) + 4 for i in range(len(rows[0]))]
    ws = [max(0.75, total * l / sum(lens)) for l in lens]
    ws = [w * total / sum(ws) for w in ws]
    for row in tb.rows:
        for c, w in zip(row.cells, ws):
            c.width = Inches(w)


def build(pages):
    doc = Document(os.path.join(HERE, "template.docx"))
    body = doc.element.body
    for el in list(body.iter(W)):
        t = el.text or ""
        if t in REPL:
            el.text = REPL[t]
        elif t == "Dr" and el.getparent().getnext() is not None and "Shilpa" in "".join(el.getparent().getnext().itertext()):
            el.text = ""
        elif "Dr. Shilpa S, Department" in t:
            el.text = t.replace("Dr. Shilpa S", GUIDE)
    for el in body.iter(W):
        if el.text and "UE23CS351A" in el.text:
            el.text = el.text.replace("UE23CS351A", "UE24CSS351A")
    srn = [el for el in body.iter(W) if el.text == "PES2UG19CS203"]
    for i, el in enumerate(srn):
        el.text = TEAMMATE[1] if i == 1 else "PES2UG24CS579"
    for t in (doc.tables[2], doc.tables[4]):
        for ci, txt in ((0, TEAMMATE[0]), (1, TEAMMATE[1]), (2, "<Signature>")):
            if ci >= len(t.rows[0].cells):
                continue
            cell = t.rows[0].cells[ci]
            first = next(q for q in cell.paragraphs if q.text.strip())
            p = copy.deepcopy(first._p)
            first._p.addnext(p)
            for r in p.iter(W):
                r.text = ""
            p.findall(".//" + W)[0].text = txt
    grid(doc.tables[0], (3.0, 2.0))
    grid(doc.tables[2], (3.0, 2.0))
    grid(doc.tables[4], (3.0, 1.8, 1.4))

    kids = list(body.iterchildren())
    text = lambda el: "".join(x.text or "" for x in el.iter(W))
    abstract = next(k for k in kids if text(k).strip() == "ABSTRACT")
    anchor = abstract
    for a in ABSTRACT:
        p = OxmlElement("w:p")
        anchor.addnext(p)
        anchor = p
        r = OxmlElement("w:r")
        t = OxmlElement("w:t")
        t.text = a
        r.append(t)
        p.append(r)
        ppr = OxmlElement("w:pPr")
        jc = OxmlElement("w:jc")
        jc.set(qn("w:val"), "both")
        sp = OxmlElement("w:spacing")
        sp.set(qn("w:after"), "160")
        sp.set(qn("w:line"), "320")
        sp.set(qn("w:lineRule"), "auto")
        ppr.extend([sp, jc])
        p.insert(0, ppr)
    def empty(k):
        return (k.tag == qn("w:p") and not text(k).strip() and k.find(".//" + qn("w:drawing")) is None
                and k.find(".//" + qn("w:sectPr")) is None and k.find(".//" + qn("w:br")) is None)
    kids = list(body.iterchildren())
    a, b = kids.index(abstract), next(i for i, k in enumerate(kids) if text(k).startswith("NOTE:"))
    for k in kids[a:b]:
        if empty(k):
            body.remove(k)
        elif k.tag == qn("w:p") and text(k).strip() in ("TABLE OF CONTENTS", "LIST OF TABLES", "LIST OF FIGURES"):
            ppr = k.find(qn("w:pPr"))
            if ppr is None:
                ppr = OxmlElement("w:pPr")
                k.insert(0, ppr)
            before = [c for c in ppr if c.tag in (qn("w:pStyle"), qn("w:keepNext"), qn("w:keepLines"))]
            ppr.insert(len(before), OxmlElement("w:pageBreakBefore"))
    kids = list(body.iterchildren())
    cert = next(i for i, k in enumerate(kids) if text(k).startswith("In partial fulfilment"))
    names = max(i for i in range(cert) if kids[i].tag == qn("w:tbl"))
    sig = next(i for i in range(cert, len(kids)) if kids[i].tag == qn("w:tbl"))
    for k in [k for k in kids[names + 1:sig] if empty(k)][:-1]:
        body.remove(k)
    kids = list(body.iterchildren())
    note = next(k for k in kids if text(k).startswith("NOTE:"))
    i = kids.index(note)
    for k in kids[i:]:
        if k.tag != qn("w:sectPr"):
            body.remove(k)

    st = doc.styles
    st.element.append(copy.deepcopy(Document().styles["Table Grid"].element))
    for name, size in (("Heading 1", 16), ("Heading 2", 13), ("Heading 3", 11)):
        s = st[name]
        s.font.size, s.font.bold = Pt(size), True
        s.paragraph_format.space_before, s.paragraph_format.space_after = Pt(12 if size > 11 else 8), Pt(6)
        s.paragraph_format.keep_with_next = True

    toc, lot, lof = doc.tables[5], doc.tables[6], doc.tables[7]
    nt = nf = ns = 0
    tables, figures = [], []

    def h(txt, level):
        p = doc.add_heading(txt, level)
        if level == 1:
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p.paragraph_format.page_break_before = True
        return p

    def para(txt):
        p = doc.add_paragraph(txt)
        p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        p.paragraph_format.space_after = Pt(8)
        p.paragraph_format.line_spacing = 1.15

    def picture(path):
        w, ht = Image.open(path).size
        width = min(6.4, w / 130, 8.4 * w / ht)
        doc.add_picture(path, width=Inches(width))
        doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER

    for title, subs in CH:
        h(title, 1)
        for sub, blocks in subs:
            h(sub, 2)
            for b in blocks:
                if b[0] == "p":
                    para(b[1])
                elif b[0] == "t":
                    nt += 1
                    label = f"Table {nt}: {b[1]}"
                    tables.append(label)
                    h(label, 3)
                    rows = b[2]
                    tb = doc.add_table(rows=len(rows), cols=len(rows[0]))
                    tb.style = st["Table Grid"]
                    for ri, row in enumerate(rows):
                        for ci, val in enumerate(row):
                            c = tb.cell(ri, ci)
                            c.text = val
                            for r in c.paragraphs[0].runs:
                                r.font.size = Pt(9.5)
                                r.font.bold = ri == 0
                    widths(tb, rows)
                    doc.add_paragraph().paragraph_format.space_after = Pt(2)
                else:
                    kind, name, label = b
                    if name.startswith("ui:"):
                        files = [os.path.join(UI, name[3:] + ".png")]
                    elif kind == "f":
                        files = [os.path.join(FIG, name)]
                    else:
                        one = os.path.join(SS, name + ".png")
                        files = [one] if os.path.exists(one) else sorted(
                            os.path.join(SS, f) for f in os.listdir(SS) if re.fullmatch(name + r"_p\d+\.png", f))
                    for k, f in enumerate(files, 1):
                        part = f", part {k} of {len(files)}" if len(files) > 1 else ""
                        if kind == "f":
                            nf += 1
                            full = f"Figure {nf}: {label}{part}"
                        else:
                            ns += 1
                            full = f"Screenshot {ns}: {label}{part}"
                        figures.append(full)
                        h(full, 3)
                        picture(f)

    h("REFERENCES", 1)
    for n, r in enumerate(REFERENCES, 1):
        para(f"[{n}] {r}")
    para("GitHub Link: https://github.com/Redslayer112/DBMS-miniproject")
    h("APPENDIX A: DEFINITIONS, ACRONYMS AND ABBREVIATIONS", 1)
    tb = doc.add_table(rows=len(APPENDIX), cols=2)
    tb.style = st["Table Grid"]
    for ri, (a, b) in enumerate(APPENDIX):
        for ci, v in enumerate((a, b)):
            c = tb.cell(ri, ci)
            c.text = v
            for r in c.paragraphs[0].runs:
                r.font.size, r.font.bold = Pt(9.5), ri == 0
    widths(tb, APPENDIX)

    def set_cell(cell, val):
        ts = list(cell._tc.iter(W))
        if ts:
            ts[0].text = val
            for t in ts[1:]:
                t.text = ""
        else:
            cell.paragraphs[0].add_run(val)

    heads = [t for t, _ in CH] + ["REFERENCES", "APPENDIX A: DEFINITIONS, ACRONYMS AND ABBREVIATIONS"]
    rows = toc.rows
    toc._tbl.remove(rows[-1]._tr)
    ch9 = toc.rows[9]._tr
    ch10 = copy.deepcopy(ch9)
    ch9.addnext(ch10)
    set_cell(toc.rows[10].cells[1], "CONCLUSION AND FUTURE ENHANCEMENTS")
    for row, hd in zip(toc.rows[1:], heads):
        set_cell(row.cells[-1], str(pages.get(hd, "")))
    for tbl, items in ((lot, tables), (lof, figures)):
        proto = copy.deepcopy(tbl.rows[1]._tr)
        for r in tbl.rows[1:]:
            tbl._tbl.remove(r._tr)
        for it in items:
            tr = copy.deepcopy(proto)
            tbl._tbl.append(tr)
            cells = tbl.rows[-1].cells
            num, lab = it.split(": ", 1)
            for c, v in zip(cells, (num, lab, str(pages.get(it, "")))):
                set_cell(c, v)
        grid(tbl, (1.55, 4.45, 0.8))
        for tr in tbl._tbl.tr_lst:
            tr.get_or_add_trPr().append(OxmlElement("w:cantSplit"))

    for other in doc.sections[:-1]:
        other.footer.is_linked_to_previous = False
    sec = doc.sections[-1]
    sec.footer.is_linked_to_previous = False
    sec.different_first_page_header_footer = True
    sec.first_page_footer.is_linked_to_previous = False
    sec.first_page_header.is_linked_to_previous = False
    fp = sec.footer.paragraphs[0]
    fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    for kind, txt in (("begin", None), (None, " PAGE "), ("end", None)):
        r = fp.add_run()
        if kind:
            fc = OxmlElement("w:fldChar")
            fc.set(qn("w:fldCharType"), kind)
            r._r.append(fc)
        else:
            it = OxmlElement("w:instrText")
            it.set(qn("xml:space"), "preserve")
            it.text = txt
            r._r.append(it)
    sec.footer_distance = Inches(0.4)

    root_parts = [doc.element, doc.styles.element] + [s.footer._element for s in doc.sections] + [s.header._element for s in doc.sections]
    for part in root_parts:
        for b in list(part.iter(qn("w:pBdr"))):
            b.getparent().remove(b)
        for rpr in part.iter(qn("w:rPr")):
            for c in rpr.findall(qn("w:rFonts")):
                rpr.remove(c)
            f = OxmlElement("w:rFonts")
            for a in ("ascii", "hAnsi", "cs", "eastAsia"):
                f.set(qn("w:" + a), FONT)
            rpr.insert(0, f)
            for c in rpr.findall(qn("w:color")):
                rpr.remove(c)
            col = OxmlElement("w:color")
            col.set(qn("w:val"), "000000")
            rpr.append(col)
    for r in doc.element.iter(qn("w:r")):
        if r.find(qn("w:rPr")) is None:
            rpr = OxmlElement("w:rPr")
            f = OxmlElement("w:rFonts")
            for a in ("ascii", "hAnsi", "cs", "eastAsia"):
                f.set(qn("w:" + a), FONT)
            col = OxmlElement("w:color")
            col.set(qn("w:val"), "000000")
            rpr.extend([f, col])
            r.insert(0, rpr)
    for s in ("Normal", "Heading 1", "Heading 2", "Heading 3", "Title"):
        s = st[s]
        s.font.name = FONT
        s.element.get_or_add_rPr().rFonts.set(qn("w:eastAsia"), FONT)
        s.font.color.rgb = RGBColor(0, 0, 0)
    doc.save(OUT)
    return heads + tables + figures


def find_pages(labels):
    pdf_dir = SCRATCH
    subprocess.run(["soffice", "--headless", "--convert-to", "pdf", "--outdir", pdf_dir, OUT],
                   check=True, capture_output=True)
    pdf = os.path.join(pdf_dir, os.path.basename(OUT)[:-5] + ".pdf")
    n = int(re.search(r"Pages:\s+(\d+)", subprocess.run(["pdfinfo", pdf], capture_output=True, text=True).stdout).group(1))
    norm = lambda s: re.sub(r"\s+", " ", s).strip()
    texts = [norm(subprocess.run(["pdftotext", "-f", str(i), "-l", str(i), "-layout", pdf, "-"],
                                 capture_output=True, text=True).stdout) for i in range(1, n + 1)]
    start = next(i for i, t in enumerate(texts) if t.startswith("1. INTRODUCTION"))
    pages = {}
    for lab in labels:
        key = norm(lab)[:60]
        for i in range(start, n):
            if key in texts[i]:
                pages[lab] = i + 1
                break
    missing = [l for l in labels if l not in pages]
    print(n, "pages; missing:", missing)
    return pages


labels = build({})
pages = find_pages(labels)
build(pages)
print("wrote", OUT)
