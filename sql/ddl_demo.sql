-- Food Waste Redistribution Platform: DDL demo (ALTER / DROP / TRUNCATE / INDEX).
-- Destructive statements live here, never in the production schema.
-- Uses a scratch table only; safe to run against the real database.

USE food_redistribution_platform;

CREATE TABLE demo_drop_points (
    point_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(80) NOT NULL
) ENGINE=InnoDB;

-- ALTER: add column, add constraint, add FK, rename column, modify type.
ALTER TABLE demo_drop_points ADD COLUMN location_id BIGINT UNSIGNED NULL;
ALTER TABLE demo_drop_points ADD CONSTRAINT uq_demo_name UNIQUE (name);
ALTER TABLE demo_drop_points
    ADD CONSTRAINT fk_demo_location FOREIGN KEY (location_id) REFERENCES locations (location_id);
ALTER TABLE demo_drop_points RENAME COLUMN name TO point_name;
ALTER TABLE demo_drop_points MODIFY point_name VARCHAR(120) NOT NULL;

-- INDEX create / drop.
CREATE INDEX idx_demo_name_prefix ON demo_drop_points (point_name(20));
SHOW INDEX FROM demo_drop_points;
DROP INDEX idx_demo_name_prefix ON demo_drop_points;

INSERT INTO demo_drop_points (point_name, location_id) VALUES ('Shivajinagar hub', 5);
TRUNCATE TABLE demo_drop_points;

-- Constraint demos (each should FAIL; uncomment one at a time):
-- INSERT INTO food_batches (food_item_id, batch_no, quantity_kg, prepared_at, expires_at)
--      VALUES (1, 'X', -5, NOW(), NOW() + INTERVAL 1 HOUR);           -- CHECK quantity_kg > 0
-- INSERT INTO food_batches (food_item_id, batch_no, quantity_kg, prepared_at, expires_at)
--      VALUES (1, 'B-01', 5, NOW(), NOW() + INTERVAL 1 HOUR);         -- UNIQUE (food_item_id, batch_no)
-- INSERT INTO donations (batch_id) VALUES (1);                         -- UNIQUE batch_id (1 donation/batch)
-- DELETE FROM restaurants WHERE restaurant_id = 1;                     -- FK RESTRICT

DROP TABLE demo_drop_points;
