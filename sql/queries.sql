-- Food Waste Redistribution Platform: documented demo queries.
-- Run against the seeded database:
--   docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -t' < sql/queries.sql
-- Concepts are tagged in [brackets].

USE food_redistribution_platform;

-- Q1 [SELECT, WHERE, ORDER BY] Live donations, most urgent first.
SELECT donation_id, food_name, quantity_kg, business_name, minutes_to_expiry
  FROM available_donations
 ORDER BY minutes_to_expiry;

-- Q2 [INNER JOIN x5] Full provenance of every donation.
SELECT d.donation_id, d.status, fi.name AS food, fc.name AS category,
       b.batch_no, b.quantity_kg, r.business_name, l.city
  FROM donations d
  JOIN food_batches b     ON b.batch_id = d.batch_id
  JOIN food_items fi      ON fi.food_item_id = b.food_item_id
  JOIN food_categories fc ON fc.category_id = fi.category_id
  JOIN restaurants r      ON r.restaurant_id = fi.restaurant_id
  JOIN locations l        ON l.location_id = r.location_id
 ORDER BY d.donation_id;

-- Q3 [LEFT JOIN, IS NULL] Food items that have never been donated.
SELECT fi.food_item_id, fi.name, r.business_name
  FROM food_items fi
  JOIN restaurants r ON r.restaurant_id = fi.restaurant_id
  LEFT JOIN food_batches b ON b.food_item_id = fi.food_item_id
  LEFT JOIN donations d    ON d.batch_id = b.batch_id
 GROUP BY fi.food_item_id, fi.name, r.business_name
HAVING COUNT(d.donation_id) = 0;

-- Q4 [GROUP BY, COUNT] Donations per lifecycle status.
SELECT status, COUNT(*) AS donations
  FROM donations
 GROUP BY status
 ORDER BY donations DESC;

-- Q5 [GROUP BY, SUM, HAVING] Restaurants that have redistributed over 40 kg.
SELECT r.business_name, SUM(b.quantity_kg) AS kg_redistributed
  FROM donations d
  JOIN food_batches b ON b.batch_id = d.batch_id
  JOIN food_items fi  ON fi.food_item_id = b.food_item_id
  JOIN restaurants r  ON r.restaurant_id = fi.restaurant_id
 WHERE d.status = 'COMPLETED'
 GROUP BY r.business_name
HAVING SUM(b.quantity_kg) > 40
 ORDER BY kg_redistributed DESC;

-- Q6 [AVG, MIN, MAX] Batch size statistics per category.
SELECT fc.name AS category, COUNT(*) AS batches,
       ROUND(AVG(b.quantity_kg), 2) AS avg_kg, MIN(b.quantity_kg) AS min_kg, MAX(b.quantity_kg) AS max_kg
  FROM food_batches b
  JOIN food_items fi      ON fi.food_item_id = b.food_item_id
  JOIN food_categories fc ON fc.category_id = fi.category_id
 GROUP BY fc.name;

-- Q7 [M:N junction, GROUP_CONCAT] Categories each NGO accepts.
SELECT n.organization_name, GROUP_CONCAT(fc.name ORDER BY fc.name SEPARATOR ', ') AS accepts
  FROM ngos n
  JOIN ngo_food_categories nfc ON nfc.ngo_id = n.ngo_id
  JOIN food_categories fc      ON fc.category_id = nfc.category_id
 GROUP BY n.organization_name;

-- Q8 [scalar subquery] Donations larger than the average batch.
SELECT d.donation_id, b.quantity_kg
  FROM donations d JOIN food_batches b ON b.batch_id = d.batch_id
 WHERE b.quantity_kg > (SELECT AVG(quantity_kg) FROM food_batches);

-- Q9 [IN subquery] NGOs that have never had a request accepted.
SELECT ngo_id, organization_name
  FROM ngos
 WHERE ngo_id NOT IN (SELECT ngo_id FROM donation_requests WHERE status = 'ACCEPTED');

-- Q10 [correlated subquery, EXISTS] Available donations no NGO has requested yet.
SELECT d.donation_id
  FROM donations d
 WHERE d.status = 'AVAILABLE'
   AND NOT EXISTS (SELECT 1 FROM donation_requests dr WHERE dr.donation_id = d.donation_id);

-- Q11 [correlated subquery in SELECT] Pending request count per available donation.
SELECT d.donation_id,
       (SELECT COUNT(*) FROM donation_requests dr
         WHERE dr.donation_id = d.donation_id AND dr.status = 'PENDING') AS pending_requests
  FROM donations d
 WHERE d.status = 'AVAILABLE';

-- Q12 [CASE] Expiry urgency band for live donations.
SELECT donation_id, food_name, minutes_to_expiry,
       CASE WHEN minutes_to_expiry < 300  THEN 'CRITICAL'
            WHEN minutes_to_expiry < 720  THEN 'HIGH'
            WHEN minutes_to_expiry < 1440 THEN 'MEDIUM'
            ELSE 'LOW' END AS urgency
  FROM available_donations;

-- Q13 [date/time, TIMESTAMPDIFF] Average pickup and delivery durations (minutes).
SELECT ROUND(AVG(pickup_minutes)) AS avg_pickup_min,
       ROUND(AVG(delivery_minutes)) AS avg_delivery_min,
       ROUND(AVG(end_to_end_minutes)) AS avg_end_to_end_min
  FROM donation_delivery_summary;

-- Q14 [DATE(), GROUP BY date] Kilograms redistributed per day.
SELECT DATE(dl.confirmed_at) AS day, SUM(b.quantity_kg) AS kg
  FROM deliveries dl
  JOIN pickups p      ON p.pickup_id = dl.pickup_id
  JOIN donations d    ON d.donation_id = p.donation_id
  JOIN food_batches b ON b.batch_id = d.batch_id
 WHERE dl.status = 'CONFIRMED'
 GROUP BY DATE(dl.confirmed_at)
 ORDER BY day;

-- Q15 [window-free ranking via ORDER BY + LIMIT] Top 3 volunteers by completed pickups.
SELECT u.full_name, COUNT(*) AS completed
  FROM pickups p
  JOIN volunteers v ON v.volunteer_id = p.volunteer_id
  JOIN users u      ON u.user_id = v.user_id
  JOIN donations d  ON d.donation_id = p.donation_id
 WHERE d.status = 'COMPLETED'
 GROUP BY u.full_name
 ORDER BY completed DESC
 LIMIT 3;

-- Q16 [window function] Each restaurant's share of total completed kg.
SELECT business_name, kg_redistributed,
       ROUND(100 * kg_redistributed / SUM(kg_redistributed) OVER (), 1) AS pct_of_total
  FROM restaurant_impact_summary
 ORDER BY kg_redistributed DESC;

-- Q17 [VIEW] Restaurant impact dashboard.
SELECT * FROM restaurant_impact_summary;

-- Q18 [VIEW] NGO impact dashboard.
SELECT * FROM ngo_impact_summary;

-- Q19 [VIEW, derived not stored] Remaining NGO capacity.
SELECT * FROM ngo_active_capacity ORDER BY remaining_kg DESC;

-- Q20 [VIEW] System-wide KPIs.
SELECT * FROM system_analytics_summary;

-- Q21 [stored function] Distance from each NGO to each restaurant (km).
SELECT r.business_name, n.organization_name,
       fn_haversine_km(rl.latitude, rl.longitude, nl.latitude, nl.longitude) AS km
  FROM restaurants r JOIN locations rl ON rl.location_id = r.location_id
  CROSS JOIN ngos n  JOIN locations nl ON nl.location_id = n.location_id
 ORDER BY r.business_name, km;

-- Q22 [MATCHING ENGINE: CTE, multi-join, CASE, ORDER BY tie-breaks]
-- Eligible NGOs for one donation, scored out of 100 and explainable:
--   category 30 | capacity fit 25 | expiry urgency 25 | proximity 20.
-- The app (lib/matching.ts) runs this same query; scores are never stored.
SET @donation_id = 1;
WITH d AS (
    SELECT ad.*, TIMESTAMPDIFF(MINUTE, NOW(), ad.expires_at) / 60 AS hours_left
      FROM available_donations ad WHERE ad.donation_id = @donation_id
), c AS (
    SELECT d.donation_id, n.ngo_id, n.organization_name, cap.remaining_kg, d.quantity_kg,
           fn_haversine_km(d.latitude, d.longitude, nl.latitude, nl.longitude) AS distance_km,
           d.hours_left
      FROM d
      JOIN ngo_food_categories nfc ON nfc.category_id = d.category_id
      JOIN ngos n                  ON n.ngo_id = nfc.ngo_id AND n.is_available
      JOIN locations nl            ON nl.location_id = n.location_id
      JOIN ngo_active_capacity cap ON cap.ngo_id = n.ngo_id
     WHERE cap.remaining_kg >= d.quantity_kg
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
 ORDER BY total_score DESC, distance_km ASC, remaining_kg DESC, ngo_id ASC;

-- Q23 [UPDATE, DML] Expire stale AVAILABLE donations (manual; no scheduler by design).
-- The lifecycle trigger audits each change.
-- UPDATE donations d JOIN food_batches b ON b.batch_id = d.batch_id
--    SET d.status = 'EXPIRED'
--  WHERE d.status = 'AVAILABLE' AND b.expires_at <= NOW();

-- Q24 [audit trail] Chronological history for one donation.
SELECT a.created_at, a.old_status, a.new_status, u.full_name AS actor
  FROM audit_logs a LEFT JOIN users u ON u.user_id = a.actor_user_id
 WHERE a.entity_type = 'DONATION' AND a.entity_id = 1
 ORDER BY a.created_at;

-- Q25 [UNION] Everyone who touched donation 10: restaurant, NGO, volunteer.
SELECT 'RESTAURANT' AS role, r.business_name AS name
  FROM donations d JOIN food_batches b ON b.batch_id = d.batch_id
  JOIN food_items fi ON fi.food_item_id = b.food_item_id
  JOIN restaurants r ON r.restaurant_id = fi.restaurant_id
 WHERE d.donation_id = 10
UNION
SELECT 'NGO', n.organization_name FROM donations d JOIN ngos n ON n.ngo_id = d.recipient_ngo_id
 WHERE d.donation_id = 10
UNION
SELECT 'VOLUNTEER', u.full_name FROM pickups p JOIN volunteers v ON v.volunteer_id = p.volunteer_id
  JOIN users u ON u.user_id = v.user_id WHERE p.donation_id = 10;

-- Q26 [EXPLAIN] Index use for the "available, newest first" listing.
EXPLAIN SELECT donation_id FROM donations WHERE status = 'AVAILABLE' ORDER BY created_at DESC;

-- Q27 [TRANSACTION, explicit] Volunteer claims donation 6 atomically.
-- (Commented: mutates state. The app runs exactly this in POST /api/pickups/{id}/claim.)
-- START TRANSACTION;
--   SELECT status FROM donations WHERE donation_id = 6 FOR UPDATE;   -- must be ACCEPTED
--   INSERT INTO pickups (donation_id, volunteer_id) VALUES (6, 1);   -- UNIQUE blocks double claim
--   UPDATE donations SET status = 'PICKUP_ASSIGNED' WHERE donation_id = 6;
-- COMMIT;
