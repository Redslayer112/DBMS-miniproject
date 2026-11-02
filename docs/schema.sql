-- Food Waste Redistribution Platform
-- Phase 2A: MySQL 8.0.16+ relational schema
-- Execute this file in MySQL Workbench. All tables use InnoDB and utf8mb4.

CREATE DATABASE IF NOT EXISTS food_redistribution_platform
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE food_redistribution_platform;

-- Authentication identity shared by all application roles.
CREATE TABLE users (
    user_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(120) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    phone VARCHAR(25) NULL,
    role ENUM('RESTAURANT', 'NGO', 'VOLUNTEER', 'ADMIN') NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_users_email UNIQUE (email),
    CONSTRAINT uq_users_phone UNIQUE (phone),
    CONSTRAINT chk_users_is_active CHECK (is_active IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Restaurant and NGO addresses are stored once and referenced by their profiles.
CREATE TABLE locations (
    location_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    address_line1 VARCHAR(180) NOT NULL,
    address_line2 VARCHAR(180) NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    postal_code VARCHAR(20) NOT NULL,
    latitude DECIMAL(9, 6) NOT NULL,
    longitude DECIMAL(9, 6) NOT NULL,
    CONSTRAINT chk_locations_latitude CHECK (latitude BETWEEN -90.000000 AND 90.000000),
    CONSTRAINT chk_locations_longitude CHECK (longitude BETWEEN -180.000000 AND 180.000000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE restaurants (
    restaurant_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    location_id BIGINT UNSIGNED NOT NULL,
    business_name VARCHAR(160) NOT NULL,
    contact_name VARCHAR(120) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_restaurants_user UNIQUE (user_id),
    CONSTRAINT uq_restaurants_location UNIQUE (location_id),
    CONSTRAINT uq_restaurants_business_name UNIQUE (business_name),
    CONSTRAINT fk_restaurants_user
        FOREIGN KEY (user_id) REFERENCES users (user_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_restaurants_location
        FOREIGN KEY (location_id) REFERENCES locations (location_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ngos (
    ngo_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    location_id BIGINT UNSIGNED NOT NULL,
    organization_name VARCHAR(160) NOT NULL,
    capacity_kg DECIMAL(10, 2) NOT NULL,
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_ngos_user UNIQUE (user_id),
    CONSTRAINT uq_ngos_location UNIQUE (location_id),
    CONSTRAINT uq_ngos_organization_name UNIQUE (organization_name),
    CONSTRAINT chk_ngos_capacity_kg CHECK (capacity_kg > 0),
    CONSTRAINT chk_ngos_is_available CHECK (is_available IN (0, 1)),
    CONSTRAINT fk_ngos_user
        FOREIGN KEY (user_id) REFERENCES users (user_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_ngos_location
        FOREIGN KEY (location_id) REFERENCES locations (location_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE volunteers (
    volunteer_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    availability_status ENUM('AVAILABLE', 'UNAVAILABLE') NOT NULL DEFAULT 'AVAILABLE',
    vehicle_type VARCHAR(60) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_volunteers_user UNIQUE (user_id),
    CONSTRAINT fk_volunteers_user
        FOREIGN KEY (user_id) REFERENCES users (user_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE food_categories (
    category_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(80) NOT NULL,
    description VARCHAR(255) NULL,
    CONSTRAINT uq_food_categories_name UNIQUE (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE food_items (
    food_item_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    restaurant_id BIGINT UNSIGNED NOT NULL,
    category_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(140) NOT NULL,
    is_vegetarian BOOLEAN NOT NULL DEFAULT TRUE,
    description VARCHAR(255) NULL,
    CONSTRAINT uq_food_items_restaurant_name UNIQUE (restaurant_id, name),
    CONSTRAINT chk_food_items_is_vegetarian CHECK (is_vegetarian IN (0, 1)),
    CONSTRAINT fk_food_items_restaurant
        FOREIGN KEY (restaurant_id) REFERENCES restaurants (restaurant_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_food_items_category
        FOREIGN KEY (category_id) REFERENCES food_categories (category_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    INDEX idx_food_items_restaurant_category (restaurant_id, category_id),
    INDEX idx_food_items_category_id (category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE food_batches (
    batch_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    food_item_id BIGINT UNSIGNED NOT NULL,
    batch_no VARCHAR(40) NOT NULL,
    quantity_kg DECIMAL(10, 2) NOT NULL,
    prepared_at DATETIME NOT NULL,
    expires_at DATETIME NOT NULL,
    packaging_note VARCHAR(255) NULL,
    -- FOOD_BATCH is conceptually weak: batch_no is unique only within its FOOD_ITEM.
    CONSTRAINT uq_food_batches_food_item_batch_no UNIQUE (food_item_id, batch_no),
    CONSTRAINT chk_food_batches_quantity_kg CHECK (quantity_kg > 0),
    CONSTRAINT chk_food_batches_expiry_after_preparation CHECK (expires_at > prepared_at),
    CONSTRAINT fk_food_batches_food_item
        FOREIGN KEY (food_item_id) REFERENCES food_items (food_item_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    INDEX idx_food_batches_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A batch has at most one donation. The final recipient NGO is stored directly
-- here, avoiding a circular dependency with donation_requests.
CREATE TABLE donations (
    donation_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    batch_id BIGINT UNSIGNED NOT NULL,
    recipient_ngo_id BIGINT UNSIGNED NULL,
    status ENUM(
        'AVAILABLE', 'ACCEPTED', 'PICKUP_ASSIGNED', 'PICKED_UP',
        'DELIVERED', 'COMPLETED', 'EXPIRED', 'CANCELLED'
    ) NOT NULL DEFAULT 'AVAILABLE',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    accepted_at DATETIME NULL,
    cancel_reason VARCHAR(255) NULL,
    CONSTRAINT uq_donations_batch UNIQUE (batch_id),
    CONSTRAINT fk_donations_batch
        FOREIGN KEY (batch_id) REFERENCES food_batches (batch_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_donations_recipient_ngo
        FOREIGN KEY (recipient_ngo_id) REFERENCES ngos (ngo_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    INDEX idx_donations_status_created_at (status, created_at),
    INDEX idx_donations_recipient_ngo_status (recipient_ngo_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Junction table for the categories each NGO can receive.
CREATE TABLE ngo_food_categories (
    ngo_id BIGINT UNSIGNED NOT NULL,
    category_id BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (ngo_id, category_id),
    CONSTRAINT fk_ngo_food_categories_ngo
        FOREIGN KEY (ngo_id) REFERENCES ngos (ngo_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_ngo_food_categories_category
        FOREIGN KEY (category_id) REFERENCES food_categories (category_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    INDEX idx_ngo_food_categories_category_ngo (category_id, ngo_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- This table keeps every NGO request, including rejected and withdrawn requests.
CREATE TABLE donation_requests (
    request_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    donation_id BIGINT UNSIGNED NOT NULL,
    ngo_id BIGINT UNSIGNED NOT NULL,
    status ENUM('PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN') NOT NULL DEFAULT 'PENDING',
    requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at DATETIME NULL,
    CONSTRAINT uq_donation_requests_donation_ngo UNIQUE (donation_id, ngo_id),
    CONSTRAINT fk_donation_requests_donation
        FOREIGN KEY (donation_id) REFERENCES donations (donation_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_donation_requests_ngo
        FOREIGN KEY (ngo_id) REFERENCES ngos (ngo_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    INDEX idx_donation_requests_donation_status (donation_id, status),
    INDEX idx_donation_requests_ngo_status (ngo_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE pickups (
    pickup_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    donation_id BIGINT UNSIGNED NOT NULL,
    volunteer_id BIGINT UNSIGNED NOT NULL,
    status ENUM('ASSIGNED', 'PICKED_UP') NOT NULL DEFAULT 'ASSIGNED',
    assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    picked_up_at DATETIME NULL,
    CONSTRAINT uq_pickups_donation UNIQUE (donation_id),
    CONSTRAINT fk_pickups_donation
        FOREIGN KEY (donation_id) REFERENCES donations (donation_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_pickups_volunteer
        FOREIGN KEY (volunteer_id) REFERENCES volunteers (volunteer_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    INDEX idx_pickups_volunteer_status (volunteer_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE deliveries (
    delivery_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    pickup_id BIGINT UNSIGNED NOT NULL,
    status ENUM('IN_TRANSIT', 'DELIVERED', 'CONFIRMED') NOT NULL DEFAULT 'IN_TRANSIT',
    delivered_at DATETIME NULL,
    confirmed_at DATETIME NULL,
    confirmed_by_user_id BIGINT UNSIGNED NULL,
    CONSTRAINT uq_deliveries_pickup UNIQUE (pickup_id),
    CONSTRAINT fk_deliveries_pickup
        FOREIGN KEY (pickup_id) REFERENCES pickups (pickup_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_deliveries_confirmed_by_user
        FOREIGN KEY (confirmed_by_user_id) REFERENCES users (user_id)
        ON DELETE SET NULL ON UPDATE RESTRICT,
    INDEX idx_deliveries_status_delivered_at (status, delivered_at),
    INDEX idx_deliveries_confirmed_by_user_id (confirmed_by_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Audit rows survive independently of an actor account; deleting that account
-- therefore sets actor_user_id to NULL rather than deleting audit history.
CREATE TABLE audit_logs (
    audit_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    actor_user_id BIGINT UNSIGNED NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id BIGINT UNSIGNED NOT NULL,
    action VARCHAR(80) NOT NULL,
    old_status VARCHAR(30) NULL,
    new_status VARCHAR(30) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_audit_logs_actor_user
        FOREIGN KEY (actor_user_id) REFERENCES users (user_id)
        ON DELETE SET NULL ON UPDATE RESTRICT,
    INDEX idx_audit_logs_actor_user_id (actor_user_id),
    INDEX idx_audit_logs_entity_created_at (entity_type, entity_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
