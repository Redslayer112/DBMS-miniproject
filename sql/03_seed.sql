-- Food Waste Redistribution Platform
-- Seed data (DML). All timestamps are relative to NOW() so the demo stays fresh.
-- Every account's password is: Password@123  (only the bcrypt hash is stored).
-- Rows are inserted directly in their final state; the lifecycle triggers fire on
-- UPDATE, so live changes made through the app are what populate audit_logs.

USE food_redistribution_platform;

SET @pw = '$2b$10$BjKIM0rEVeCLJouZTV4daOWD2R9zTK.hUsI9kEzRBuC8OdMwkDo7y';

INSERT INTO users (user_id, full_name, email, password_hash, phone, role) VALUES
 (1,  'Asha Admin',        'admin@frp.test',        @pw, '+91-9000000001', 'ADMIN'),
 (2,  'Ravi Kumar',        'spicegarden@frp.test',  @pw, '+91-9000000002', 'RESTAURANT'),
 (3,  'Meera Iyer',        'breadbasket@frp.test',  @pw, '+91-9000000003', 'RESTAURANT'),
 (4,  'Arjun Rao',         'greenbowl@frp.test',    @pw, '+91-9000000004', 'RESTAURANT'),
 (5,  'Lakshmi Nair',      'udupihouse@frp.test',   @pw, '+91-9000000005', 'RESTAURANT'),
 (6,  'Fatima Sheikh',     'annapurna@frp.test',    @pw, '+91-9000000006', 'NGO'),
 (7,  'Joseph Dsouza',     'hopeshelter@frp.test',  @pw, '+91-9000000007', 'NGO'),
 (8,  'Priya Menon',       'feedindia@frp.test',    @pw, '+91-9000000008', 'NGO'),
 (9,  'Kiran Gowda',       'smallsteps@frp.test',   @pw, '+91-9000000009', 'NGO'),
 (10, 'Vikram Singh',      'vikram@frp.test',       @pw, '+91-9000000010', 'VOLUNTEER'),
 (11, 'Sneha Patil',       'sneha@frp.test',        @pw, '+91-9000000011', 'VOLUNTEER'),
 (12, 'Rahul Verma',       'rahul@frp.test',        @pw, '+91-9000000012', 'VOLUNTEER'),
 (13, 'Divya Reddy',       'divya@frp.test',        @pw, '+91-9000000013', 'VOLUNTEER');

-- Bengaluru addresses (restaurants 1-4, NGOs 5-8).
INSERT INTO locations (location_id, address_line1, address_line2, city, state, postal_code, latitude, longitude) VALUES
 (1, '12 MG Road',            NULL,          'Bengaluru', 'Karnataka', '560001', 12.975400, 77.606800),
 (2, '45 100 Feet Road',      'Indiranagar', 'Bengaluru', 'Karnataka', '560038', 12.971900, 77.641200),
 (3, '8 Koramangala 5th Blk', NULL,          'Bengaluru', 'Karnataka', '560095', 12.935200, 77.624500),
 (4, '21 DVG Road',           'Basavanagudi','Bengaluru', 'Karnataka', '560004', 12.942000, 77.573800),
 (5, '3 Shivajinagar Main',   NULL,          'Bengaluru', 'Karnataka', '560051', 12.985700, 77.605000),
 (6, '77 HAL 2nd Stage',      NULL,          'Bengaluru', 'Karnataka', '560008', 12.961000, 77.648900),
 (7, '19 BTM 2nd Stage',      NULL,          'Bengaluru', 'Karnataka', '560076', 12.916600, 77.610100),
 (8, '5 Yelahanka New Town',  NULL,          'Bengaluru', 'Karnataka', '560064', 13.100700, 77.596300);

INSERT INTO restaurants (restaurant_id, user_id, location_id, business_name, contact_name) VALUES
 (1, 2, 1, 'Spice Garden',  'Ravi Kumar'),
 (2, 3, 2, 'Bread Basket',  'Meera Iyer'),
 (3, 4, 3, 'Green Bowl',    'Arjun Rao'),
 (4, 5, 4, 'Udupi House',   'Lakshmi Nair');

-- NGO 4 has a deliberately small capacity to demonstrate the capacity check.
INSERT INTO ngos (ngo_id, user_id, location_id, organization_name, capacity_kg, is_available) VALUES
 (1, 6, 5, 'Annapurna Food Bank',  150.00, TRUE),
 (2, 7, 6, 'Hope Shelter',          80.00, TRUE),
 (3, 8, 7, 'Feed India Trust',     200.00, TRUE),
 (4, 9, 8, 'Small Steps Orphanage', 20.00, TRUE);

INSERT INTO volunteers (volunteer_id, user_id, availability_status, vehicle_type) VALUES
 (1, 10, 'AVAILABLE',   'Bike'),
 (2, 11, 'AVAILABLE',   'Car'),
 (3, 12, 'AVAILABLE',   'Van'),
 (4, 13, 'UNAVAILABLE', 'Bike');

INSERT INTO food_categories (category_id, name, description) VALUES
 (1, 'Cooked Meals',        'Ready-to-eat hot or chilled meals'),
 (2, 'Bakery',              'Bread, buns and baked goods'),
 (3, 'Fruits & Vegetables', 'Fresh or cut produce'),
 (4, 'Dairy',               'Milk, curd, paneer and similar'),
 (5, 'Packaged Food',       'Sealed, long shelf-life items');

INSERT INTO ngo_food_categories (ngo_id, category_id) VALUES
 (1, 1), (1, 2), (1, 3),
 (2, 1), (2, 2), (2, 4), (2, 5),
 (3, 1), (3, 2), (3, 3), (3, 4), (3, 5),
 (4, 1), (4, 3);

INSERT INTO food_items (food_item_id, restaurant_id, category_id, name, is_vegetarian, description) VALUES
 (1,  1, 1, 'Veg Biryani',      TRUE,  'Basmati rice with mixed vegetables'),
 (2,  1, 1, 'Chicken Curry',    FALSE, 'Medium-spice gravy'),
 (3,  1, 2, 'Garlic Naan',      TRUE,  NULL),
 (4,  2, 2, 'Croissants',       TRUE,  'Butter croissants'),
 (5,  2, 2, 'Sourdough Loaf',   TRUE,  NULL),
 (6,  2, 4, 'Fresh Paneer',     TRUE,  NULL),
 (7,  3, 1, 'Dal Tadka',        TRUE,  'Yellow lentils'),
 (8,  3, 3, 'Mixed Fruit Bowl', TRUE,  'Cut seasonal fruit'),
 (9,  3, 5, 'Granola Packs',    TRUE,  'Sealed 200 g packs'),
 (10, 4, 1, 'Idli Sambar',      TRUE,  NULL),
 (11, 4, 4, 'Curd',             TRUE,  'Set curd in tubs'),
 (12, 4, 3, 'Vegetable Salad',  TRUE,  NULL);

-- Weak entity: batch_no only identifies a batch within its food item.
INSERT INTO food_batches (batch_id, food_item_id, batch_no, quantity_kg, prepared_at, expires_at, packaging_note) VALUES
 -- live, AVAILABLE
 (1,  1,  'B-01', 25.00, NOW() - INTERVAL 2 HOUR,  NOW() + INTERVAL 10 HOUR, 'Sealed foil trays'),
 (2,  4,  'B-01', 12.00, NOW() - INTERVAL 3 HOUR,  NOW() + INTERVAL 20 HOUR, 'Paper bags'),
 (3,  7,  'B-01', 30.00, NOW() - INTERVAL 1 HOUR,  NOW() + INTERVAL 6 HOUR,  'Steel containers'),
 (4,  10, 'B-01', 18.00, NOW() - INTERVAL 1 HOUR,  NOW() + INTERVAL 4 HOUR,  NULL),
 (5,  8,  'B-01',  8.00, NOW() - INTERVAL 2 HOUR,  NOW() + INTERVAL 30 HOUR, 'Chilled boxes'),
 -- in logistics
 (6,  2,  'B-01', 20.00, NOW() - INTERVAL 4 HOUR,  NOW() + INTERVAL 8 HOUR,  'Insulated tubs'),
 (7,  5,  'B-01', 10.00, NOW() - INTERVAL 5 HOUR,  NOW() + INTERVAL 24 HOUR, NULL),
 (8,  11, 'B-01', 15.00, NOW() - INTERVAL 3 HOUR,  NOW() + INTERVAL 12 HOUR, 'Keep cold'),
 (9,  12, 'B-01', 10.00, NOW() - INTERVAL 4 HOUR,  NOW() + INTERVAL 10 HOUR, NULL),
 -- history (completed)
 (10, 1,  'B-00', 30.00, NOW() - INTERVAL 73 HOUR, NOW() - INTERVAL 60 HOUR, NULL),
 (11, 4,  'B-00', 15.00, NOW() - INTERVAL 49 HOUR, NOW() - INTERVAL 30 HOUR, NULL),
 (12, 7,  'B-00', 40.00, NOW() - INTERVAL 50 HOUR, NOW() - INTERVAL 40 HOUR, NULL),
 (13, 10, 'B-00', 20.00, NOW() - INTERVAL 25 HOUR, NOW() - INTERVAL 15 HOUR, NULL),
 (14, 9,  'B-01', 50.00, NOW() - INTERVAL 6 DAY,   NOW() + INTERVAL 30 DAY,  'Sealed cartons'),
 -- lost
 (15, 3,  'B-00',  6.00, NOW() - INTERVAL 48 HOUR, NOW() - INTERVAL 24 HOUR, NULL),
 (16, 6,  'B-00',  5.00, NOW() - INTERVAL 24 HOUR, NOW() - INTERVAL 12 HOUR, NULL),
 -- still AVAILABLE but already past expiry (no scheduler): accept must fail
 (17, 12, 'B-02',  5.00, NOW() - INTERVAL 10 HOUR, NOW() - INTERVAL 1 HOUR,  NULL);

INSERT INTO donations (donation_id, batch_id, recipient_ngo_id, status, created_at, accepted_at, cancel_reason) VALUES
 (1,  1,  NULL, 'AVAILABLE',       NOW() - INTERVAL 110 MINUTE, NULL, NULL),
 (2,  2,  NULL, 'AVAILABLE',       NOW() - INTERVAL 170 MINUTE, NULL, NULL),
 (3,  3,  NULL, 'AVAILABLE',       NOW() - INTERVAL 50 MINUTE,  NULL, NULL),
 (4,  4,  NULL, 'AVAILABLE',       NOW() - INTERVAL 40 MINUTE,  NULL, NULL),
 (5,  5,  NULL, 'AVAILABLE',       NOW() - INTERVAL 100 MINUTE, NULL, NULL),
 (6,  6,  3,    'ACCEPTED',        NOW() - INTERVAL 230 MINUTE, NOW() - INTERVAL 200 MINUTE, NULL),
 (7,  7,  2,    'PICKUP_ASSIGNED', NOW() - INTERVAL 290 MINUTE, NOW() - INTERVAL 260 MINUTE, NULL),
 (8,  8,  3,    'PICKED_UP',       NOW() - INTERVAL 170 MINUTE, NOW() - INTERVAL 150 MINUTE, NULL),
 (9,  9,  1,    'DELIVERED',       NOW() - INTERVAL 230 MINUTE, NOW() - INTERVAL 210 MINUTE, NULL),
 (10, 10, 1,    'COMPLETED',       NOW() - INTERVAL 72 HOUR,    NOW() - INTERVAL 71 HOUR,    NULL),
 (11, 11, 2,    'COMPLETED',       NOW() - INTERVAL 48 HOUR,    NOW() - INTERVAL 47 HOUR,    NULL),
 (12, 12, 3,    'COMPLETED',       NOW() - INTERVAL 49 HOUR,    NOW() - INTERVAL 48 HOUR,    NULL),
 (13, 13, 4,    'COMPLETED',       NOW() - INTERVAL 24 HOUR,    NOW() - INTERVAL 23 HOUR,    NULL),
 (14, 14, 3,    'COMPLETED',       NOW() - INTERVAL 5 DAY,      NOW() - INTERVAL 119 HOUR,   NULL),
 (15, 15, NULL, 'EXPIRED',         NOW() - INTERVAL 47 HOUR,    NULL, NULL),
 (16, 16, NULL, 'CANCELLED',       NOW() - INTERVAL 23 HOUR,    NULL, 'Failed restaurant quality check'),
 (17, 17, NULL, 'AVAILABLE',       NOW() - INTERVAL 9 HOUR,     NULL, NULL);

INSERT INTO donation_requests (donation_id, ngo_id, status, requested_at, reviewed_at) VALUES
 -- open requests the restaurants can act on
 (1, 1, 'PENDING',  NOW() - INTERVAL 90 MINUTE,  NULL),
 (1, 3, 'PENDING',  NOW() - INTERVAL 80 MINUTE,  NULL),
 (1, 4, 'PENDING',  NOW() - INTERVAL 70 MINUTE,  NULL),   -- 25 kg > NGO 4's 20 kg: must fail
 (2, 2, 'PENDING',  NOW() - INTERVAL 60 MINUTE,  NULL),
 (4, 4, 'PENDING',  NOW() - INTERVAL 20 MINUTE,  NULL),
 (17, 1, 'PENDING', NOW() - INTERVAL 8 HOUR,     NULL),   -- batch expired: must fail
 -- decided history
 (6, 3, 'ACCEPTED', NOW() - INTERVAL 220 MINUTE, NOW() - INTERVAL 200 MINUTE),
 (6, 1, 'REJECTED', NOW() - INTERVAL 215 MINUTE, NOW() - INTERVAL 200 MINUTE),
 (7, 2, 'ACCEPTED', NOW() - INTERVAL 280 MINUTE, NOW() - INTERVAL 260 MINUTE),
 (8, 3, 'ACCEPTED', NOW() - INTERVAL 160 MINUTE, NOW() - INTERVAL 150 MINUTE),
 (9, 1, 'ACCEPTED', NOW() - INTERVAL 220 MINUTE, NOW() - INTERVAL 210 MINUTE),
 (10, 1, 'ACCEPTED', NOW() - INTERVAL 4310 MINUTE, NOW() - INTERVAL 71 HOUR),
 (10, 3, 'REJECTED', NOW() - INTERVAL 4300 MINUTE, NOW() - INTERVAL 71 HOUR),
 (11, 2, 'ACCEPTED', NOW() - INTERVAL 2870 MINUTE, NOW() - INTERVAL 47 HOUR),
 (12, 3, 'ACCEPTED', NOW() - INTERVAL 2930 MINUTE, NOW() - INTERVAL 48 HOUR),
 (13, 4, 'ACCEPTED', NOW() - INTERVAL 1430 MINUTE, NOW() - INTERVAL 23 HOUR),
 (14, 3, 'ACCEPTED', NOW() - INTERVAL 7190 MINUTE, NOW() - INTERVAL 119 HOUR),
 (14, 2, 'WITHDRAWN', NOW() - INTERVAL 7195 MINUTE, NULL);

INSERT INTO pickups (pickup_id, donation_id, volunteer_id, status, assigned_at, picked_up_at) VALUES
 (1, 7,  1, 'ASSIGNED',  NOW() - INTERVAL 240 MINUTE, NULL),
 (2, 8,  2, 'PICKED_UP', NOW() - INTERVAL 140 MINUTE, NOW() - INTERVAL 110 MINUTE),
 (3, 9,  3, 'PICKED_UP', NOW() - INTERVAL 200 MINUTE, NOW() - INTERVAL 170 MINUTE),
 (4, 10, 1, 'PICKED_UP', NOW() - INTERVAL 70 HOUR,    NOW() - INTERVAL 4170 MINUTE),
 (5, 11, 2, 'PICKED_UP', NOW() - INTERVAL 46 HOUR,    NOW() - INTERVAL 2740 MINUTE),
 (6, 12, 1, 'PICKED_UP', NOW() - INTERVAL 47 HOUR,    NOW() - INTERVAL 2780 MINUTE),
 (7, 13, 3, 'PICKED_UP', NOW() - INTERVAL 22 HOUR,    NOW() - INTERVAL 1290 MINUTE),
 (8, 14, 2, 'PICKED_UP', NOW() - INTERVAL 118 HOUR,   NOW() - INTERVAL 7040 MINUTE);

INSERT INTO deliveries (delivery_id, pickup_id, status, delivered_at, confirmed_at, confirmed_by_user_id) VALUES
 (1, 2, 'IN_TRANSIT', NULL, NULL, NULL),
 (2, 3, 'DELIVERED',  NOW() - INTERVAL 140 MINUTE, NULL, NULL),
 (3, 4, 'CONFIRMED',  NOW() - INTERVAL 4130 MINUTE, NOW() - INTERVAL 4110 MINUTE, 6),
 (4, 5, 'CONFIRMED',  NOW() - INTERVAL 2700 MINUTE, NOW() - INTERVAL 2690 MINUTE, 7),
 (5, 6, 'CONFIRMED',  NOW() - INTERVAL 2720 MINUTE, NOW() - INTERVAL 2700 MINUTE, 8),
 (6, 7, 'CONFIRMED',  NOW() - INTERVAL 1250 MINUTE, NOW() - INTERVAL 1230 MINUTE, 9),
 (7, 8, 'CONFIRMED',  NOW() - INTERVAL 6990 MINUTE, NOW() - INTERVAL 6980 MINUTE, 8);
