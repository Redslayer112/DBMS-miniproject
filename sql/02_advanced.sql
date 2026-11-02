-- Food Waste Redistribution Platform
-- Phase 3: advanced DBMS features (function, triggers, stored procedure, views).
-- Run after docs/schema.sql. The application sets @app_user_id per connection so
-- the audit trigger can record who caused each status change.

USE food_redistribution_platform;

DROP FUNCTION IF EXISTS fn_haversine_km;
DROP TRIGGER IF EXISTS trg_donations_before_update;
DROP TRIGGER IF EXISTS trg_donations_after_update;
DROP TRIGGER IF EXISTS trg_donation_requests_before_update;
DROP PROCEDURE IF EXISTS sp_accept_donation_request;

DELIMITER //

-- ---------------------------------------------------------------------------
-- Great-circle distance in km between two coordinates (used by matching).
-- ---------------------------------------------------------------------------
CREATE FUNCTION fn_haversine_km(lat1 DECIMAL(9,6), lon1 DECIMAL(9,6),
                                lat2 DECIMAL(9,6), lon2 DECIMAL(9,6))
RETURNS DECIMAL(10,3)
DETERMINISTIC NO SQL
BEGIN
    RETURN 6371 * 2 * ASIN(SQRT(
        POWER(SIN(RADIANS(lat2 - lat1) / 2), 2) +
        COS(RADIANS(lat1)) * COS(RADIANS(lat2)) *
        POWER(SIN(RADIANS(lon2 - lon1) / 2), 2)));
END//

-- ---------------------------------------------------------------------------
-- TRIGGER 1: donation lifecycle guard.
-- Legal transitions:
--   AVAILABLE       -> ACCEPTED | EXPIRED | CANCELLED
--   ACCEPTED        -> PICKUP_ASSIGNED | CANCELLED
--   PICKUP_ASSIGNED -> PICKED_UP | CANCELLED
--   PICKED_UP       -> DELIVERED
--   DELIVERED       -> COMPLETED
-- plus the state preconditions that CHECK constraints cannot express.
-- ---------------------------------------------------------------------------
CREATE TRIGGER trg_donations_before_update
BEFORE UPDATE ON donations
FOR EACH ROW
BEGIN
    DECLARE v_msg VARCHAR(255);

    IF NEW.status <> OLD.status THEN
        IF NOT (
            (OLD.status = 'AVAILABLE'       AND NEW.status IN ('ACCEPTED', 'EXPIRED', 'CANCELLED')) OR
            (OLD.status = 'ACCEPTED'        AND NEW.status IN ('PICKUP_ASSIGNED', 'CANCELLED')) OR
            (OLD.status = 'PICKUP_ASSIGNED' AND NEW.status IN ('PICKED_UP', 'CANCELLED')) OR
            (OLD.status = 'PICKED_UP'       AND NEW.status = 'DELIVERED') OR
            (OLD.status = 'DELIVERED'       AND NEW.status = 'COMPLETED')
        ) THEN
            SET v_msg = CONCAT('Illegal donation transition ', OLD.status, ' -> ', NEW.status);
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
        END IF;

        IF NEW.status = 'ACCEPTED' THEN
            IF NEW.recipient_ngo_id IS NULL THEN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ACCEPTED requires a recipient NGO';
            END IF;
            IF (SELECT expires_at FROM food_batches WHERE batch_id = NEW.batch_id) <= NOW() THEN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cannot accept an expired food batch';
            END IF;
            IF NEW.accepted_at IS NULL THEN
                SET NEW.accepted_at = NOW();
            END IF;
        END IF;

        IF NEW.status = 'PICKUP_ASSIGNED'
           AND NOT EXISTS (SELECT 1 FROM pickups WHERE donation_id = NEW.donation_id) THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'PICKUP_ASSIGNED requires a pickup row';
        END IF;

        IF NEW.status = 'PICKED_UP'
           AND NOT EXISTS (SELECT 1 FROM pickups
                           WHERE donation_id = NEW.donation_id AND status = 'PICKED_UP') THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'PICKED_UP requires the pickup to be marked picked up';
        END IF;

        IF NEW.status = 'DELIVERED'
           AND NOT EXISTS (SELECT 1 FROM deliveries dl JOIN pickups p ON p.pickup_id = dl.pickup_id
                           WHERE p.donation_id = NEW.donation_id
                             AND dl.status IN ('DELIVERED', 'CONFIRMED')) THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DELIVERED requires a delivered delivery row';
        END IF;

        IF NEW.status = 'COMPLETED'
           AND NOT EXISTS (SELECT 1 FROM deliveries dl JOIN pickups p ON p.pickup_id = dl.pickup_id
                           WHERE p.donation_id = NEW.donation_id AND dl.status = 'CONFIRMED') THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'COMPLETED requires a confirmed delivery';
        END IF;
    END IF;
END//

-- ---------------------------------------------------------------------------
-- TRIGGER 2: audit every donation status change. AFTER, so a rejected update
-- never leaves an audit row behind.
-- ---------------------------------------------------------------------------
CREATE TRIGGER trg_donations_after_update
AFTER UPDATE ON donations
FOR EACH ROW
BEGIN
    IF NEW.status <> OLD.status THEN
        INSERT INTO audit_logs (actor_user_id, entity_type, entity_id, action, old_status, new_status)
        VALUES (@app_user_id, 'DONATION', NEW.donation_id, 'STATUS_CHANGE', OLD.status, NEW.status);
    END IF;
END//

-- ---------------------------------------------------------------------------
-- TRIGGER 3: a request may only leave PENDING, and may only become ACCEPTED
-- when its donation is ACCEPTED for exactly this NGO.
-- ---------------------------------------------------------------------------
CREATE TRIGGER trg_donation_requests_before_update
BEFORE UPDATE ON donation_requests
FOR EACH ROW
BEGIN
    IF NEW.status <> OLD.status THEN
        IF OLD.status <> 'PENDING' THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only PENDING requests can change status';
        END IF;
        IF NEW.status = 'ACCEPTED' AND NOT EXISTS (
            SELECT 1 FROM donations
            WHERE donation_id = NEW.donation_id
              AND status = 'ACCEPTED' AND recipient_ngo_id = NEW.ngo_id) THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Request can be ACCEPTED only for the donation recipient';
        END IF;
        IF NEW.reviewed_at IS NULL AND NEW.status IN ('ACCEPTED', 'REJECTED') THEN
            SET NEW.reviewed_at = NOW();
        END IF;
    END IF;
END//

-- ---------------------------------------------------------------------------
-- STORED PROCEDURE: atomic acceptance of one NGO request by the restaurant
-- that owns the donation. Either every step commits or none does.
-- ---------------------------------------------------------------------------
CREATE PROCEDURE sp_accept_donation_request(
    IN p_request_id BIGINT UNSIGNED,
    IN p_restaurant_user_id BIGINT UNSIGNED)
BEGIN
    DECLARE v_donation_id BIGINT UNSIGNED;
    DECLARE v_ngo_id BIGINT UNSIGNED;
    DECLARE v_req_status VARCHAR(20);
    DECLARE v_don_status VARCHAR(20);
    DECLARE v_expires_at DATETIME;
    DECLARE v_quantity DECIMAL(10,2);
    DECLARE v_category_id BIGINT UNSIGNED;
    DECLARE v_owner_user_id BIGINT UNSIGNED;
    DECLARE v_ngo_available BOOLEAN;
    DECLARE v_capacity DECIMAL(10,2);
    DECLARE v_load DECIMAL(10,2);

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    -- 1. lock the request
    SELECT donation_id, ngo_id, status
      INTO v_donation_id, v_ngo_id, v_req_status
      FROM donation_requests WHERE request_id = p_request_id
       FOR UPDATE;
    IF v_donation_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Request not found';
    END IF;
    IF v_req_status <> 'PENDING' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Request is not PENDING';
    END IF;

    -- 2. lock the donation (serialises competing accepts on the same donation)
    SELECT d.status, b.expires_at, b.quantity_kg, fi.category_id, r.user_id
      INTO v_don_status, v_expires_at, v_quantity, v_category_id, v_owner_user_id
      FROM donations d
      JOIN food_batches b ON b.batch_id = d.batch_id
      JOIN food_items fi  ON fi.food_item_id = b.food_item_id
      JOIN restaurants r  ON r.restaurant_id = fi.restaurant_id
     WHERE d.donation_id = v_donation_id
       FOR UPDATE;

    IF v_owner_user_id <> p_restaurant_user_id THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only the owning restaurant can accept this request';
    END IF;
    IF v_don_status <> 'AVAILABLE' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Donation is no longer AVAILABLE';
    END IF;
    IF v_expires_at <= NOW() THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Food batch has expired';
    END IF;

    -- 3. lock the NGO (serialises capacity use across donations)
    SELECT is_available, capacity_kg INTO v_ngo_available, v_capacity
      FROM ngos WHERE ngo_id = v_ngo_id
       FOR UPDATE;
    IF NOT v_ngo_available THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'NGO is not available';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM ngo_food_categories
                   WHERE ngo_id = v_ngo_id AND category_id = v_category_id) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'NGO does not accept this food category';
    END IF;

    -- remaining capacity = capacity - food already committed but not yet completed
    SELECT COALESCE(SUM(b.quantity_kg), 0) INTO v_load
      FROM donations d JOIN food_batches b ON b.batch_id = d.batch_id
     WHERE d.recipient_ngo_id = v_ngo_id
       AND d.status IN ('ACCEPTED', 'PICKUP_ASSIGNED', 'PICKED_UP', 'DELIVERED');
    IF v_capacity - v_load < v_quantity THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'NGO has insufficient remaining capacity';
    END IF;

    -- 4. write: donation first (request trigger checks it), then requests
    SET @app_user_id = p_restaurant_user_id;

    UPDATE donations
       SET recipient_ngo_id = v_ngo_id, status = 'ACCEPTED', accepted_at = NOW()
     WHERE donation_id = v_donation_id;

    UPDATE donation_requests
       SET status = 'ACCEPTED', reviewed_at = NOW()
     WHERE request_id = p_request_id;

    UPDATE donation_requests
       SET status = 'REJECTED', reviewed_at = NOW()
     WHERE donation_id = v_donation_id AND request_id <> p_request_id AND status = 'PENDING';

    COMMIT;
END//

DELIMITER ;

-- ---------------------------------------------------------------------------
-- VIEWS. Every derived figure is computed here, never stored.
-- ---------------------------------------------------------------------------

-- Donations an NGO can still request, with everything needed to display them.
CREATE OR REPLACE VIEW available_donations AS
SELECT d.donation_id, d.created_at, b.batch_id, b.batch_no, b.quantity_kg,
       b.prepared_at, b.expires_at,
       TIMESTAMPDIFF(MINUTE, NOW(), b.expires_at) AS minutes_to_expiry,
       fi.food_item_id, fi.name AS food_name, fi.is_vegetarian,
       fc.category_id, fc.name AS category_name,
       r.restaurant_id, r.business_name, l.city, l.latitude, l.longitude
  FROM donations d
  JOIN food_batches b    ON b.batch_id = d.batch_id
  JOIN food_items fi     ON fi.food_item_id = b.food_item_id
  JOIN food_categories fc ON fc.category_id = fi.category_id
  JOIN restaurants r     ON r.restaurant_id = fi.restaurant_id
  JOIN locations l       ON l.location_id = r.location_id
 WHERE d.status = 'AVAILABLE' AND b.expires_at > NOW();

-- NGO capacity minus food committed to it but not yet completed.
CREATE OR REPLACE VIEW ngo_active_capacity AS
SELECT n.ngo_id, n.organization_name, n.capacity_kg, n.is_available,
       COALESCE(SUM(b.quantity_kg), 0) AS committed_kg,
       n.capacity_kg - COALESCE(SUM(b.quantity_kg), 0) AS remaining_kg
  FROM ngos n
  LEFT JOIN donations d
         ON d.recipient_ngo_id = n.ngo_id
        AND d.status IN ('ACCEPTED', 'PICKUP_ASSIGNED', 'PICKED_UP', 'DELIVERED')
  LEFT JOIN food_batches b ON b.batch_id = d.batch_id
 GROUP BY n.ngo_id, n.organization_name, n.capacity_kg, n.is_available;

CREATE OR REPLACE VIEW restaurant_impact_summary AS
SELECT r.restaurant_id, r.user_id, r.business_name,
       COUNT(d.donation_id) AS total_donations,
       SUM(d.status = 'COMPLETED') AS completed_donations,
       SUM(d.status IN ('EXPIRED', 'CANCELLED')) AS lost_donations,
       COALESCE(SUM(CASE WHEN d.status = 'COMPLETED' THEN b.quantity_kg END), 0) AS kg_redistributed,
       ROUND(100 * SUM(d.status = 'COMPLETED') / NULLIF(COUNT(d.donation_id), 0), 1) AS success_rate_pct
  FROM restaurants r
  LEFT JOIN food_items fi  ON fi.restaurant_id = r.restaurant_id
  LEFT JOIN food_batches b ON b.food_item_id = fi.food_item_id
  LEFT JOIN donations d    ON d.batch_id = b.batch_id
 GROUP BY r.restaurant_id, r.user_id, r.business_name;

CREATE OR REPLACE VIEW ngo_impact_summary AS
SELECT n.ngo_id, n.user_id, n.organization_name,
       (SELECT COUNT(*) FROM donation_requests dr WHERE dr.ngo_id = n.ngo_id) AS requests_made,
       COUNT(d.donation_id) AS donations_received,
       SUM(d.status = 'COMPLETED') AS donations_completed,
       COALESCE(SUM(CASE WHEN d.status = 'COMPLETED' THEN b.quantity_kg END), 0) AS kg_received
  FROM ngos n
  LEFT JOIN donations d    ON d.recipient_ngo_id = n.ngo_id
  LEFT JOIN food_batches b ON b.batch_id = d.batch_id
 GROUP BY n.ngo_id, n.user_id, n.organization_name;

-- One row per donation that reached logistics, with timing in minutes.
CREATE OR REPLACE VIEW donation_delivery_summary AS
SELECT d.donation_id, d.status, r.business_name, n.organization_name,
       u.full_name AS volunteer_name, b.quantity_kg,
       d.created_at, d.accepted_at, p.assigned_at, p.picked_up_at,
       dl.delivered_at, dl.confirmed_at,
       TIMESTAMPDIFF(MINUTE, p.assigned_at, p.picked_up_at) AS pickup_minutes,
       TIMESTAMPDIFF(MINUTE, p.picked_up_at, dl.delivered_at) AS delivery_minutes,
       TIMESTAMPDIFF(MINUTE, d.created_at, dl.confirmed_at) AS end_to_end_minutes
  FROM donations d
  JOIN food_batches b  ON b.batch_id = d.batch_id
  JOIN food_items fi   ON fi.food_item_id = b.food_item_id
  JOIN restaurants r   ON r.restaurant_id = fi.restaurant_id
  JOIN pickups p       ON p.donation_id = d.donation_id
  JOIN volunteers v    ON v.volunteer_id = p.volunteer_id
  JOIN users u         ON u.user_id = v.user_id
  LEFT JOIN ngos n     ON n.ngo_id = d.recipient_ngo_id
  LEFT JOIN deliveries dl ON dl.pickup_id = p.pickup_id;

-- Single-row system dashboard.
CREATE OR REPLACE VIEW system_analytics_summary AS
SELECT
    (SELECT COUNT(*) FROM users WHERE is_active) AS active_users,
    (SELECT COUNT(*) FROM restaurants) AS restaurants,
    (SELECT COUNT(*) FROM ngos) AS ngos,
    (SELECT COUNT(*) FROM volunteers) AS volunteers,
    COUNT(*) AS total_donations,
    SUM(d.status = 'AVAILABLE') AS available_donations,
    SUM(d.status IN ('ACCEPTED', 'PICKUP_ASSIGNED', 'PICKED_UP', 'DELIVERED')) AS in_progress_donations,
    SUM(d.status = 'COMPLETED') AS completed_donations,
    SUM(d.status IN ('EXPIRED', 'CANCELLED')) AS lost_donations,
    COALESCE(SUM(CASE WHEN d.status = 'COMPLETED' THEN b.quantity_kg END), 0) AS kg_redistributed,
    ROUND(100 * SUM(d.status = 'COMPLETED')
          / NULLIF(SUM(d.status IN ('COMPLETED', 'EXPIRED', 'CANCELLED')), 0), 1) AS success_rate_pct,
    (SELECT ROUND(AVG(end_to_end_minutes)) FROM donation_delivery_summary
      WHERE end_to_end_minutes IS NOT NULL) AS avg_end_to_end_minutes
  FROM donations d
  JOIN food_batches b ON b.batch_id = d.batch_id;
