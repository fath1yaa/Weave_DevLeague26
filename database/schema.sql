-- Weave Application Database Schema
-- MySQL database for organisational history reconstruction
-- Run this script to create all required tables

CREATE DATABASE IF NOT EXISTS weave_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE weave_db;

-- ============================================================
-- Core entity tables
-- ============================================================

-- Roles table: stores organisational roles with temporal validity
CREATE TABLE roles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    role_id VARCHAR(50) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    department VARCHAR(255),
    reports_to VARCHAR(50),
    effective_from DATE NOT NULL,
    effective_to DATE DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- People table: stores individuals in the organisation
CREATE TABLE people (
    id INT AUTO_INCREMENT PRIMARY KEY,
    person_id VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Events table: stores all organisational change events
CREATE TABLE events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_id VARCHAR(50) UNIQUE NOT NULL,
    event_type ENUM('title_change', 'reporting_change', 'promotion', 'transfer', 'department_change', 'hire', 'departure', 'restructure') NOT NULL,
    entity_type ENUM('role', 'person') NOT NULL,
    entity_id VARCHAR(50) NOT NULL,
    previous_value TEXT,
    new_value TEXT,
    effective_date DATE NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_entity (entity_type, entity_id),
    INDEX idx_date (effective_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Assignment junction table (who held which role when)
-- ============================================================

CREATE TABLE role_assignments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    person_id VARCHAR(50) NOT NULL,
    role_id VARCHAR(50) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_person (person_id),
    INDEX idx_role (role_id),
    INDEX idx_dates (start_date, end_date),
    FOREIGN KEY (person_id) REFERENCES people(person_id),
    FOREIGN KEY (role_id) REFERENCES roles(role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Data quality tracking
-- ============================================================

CREATE TABLE flagged_records (
    id INT AUTO_INCREMENT PRIMARY KEY,
    source_file VARCHAR(50) NOT NULL,
    row_number INT NOT NULL,
    issue_type ENUM('missing_field', 'unmatched_reference', 'date_conflict', 'duplicate') NOT NULL,
    issue_description TEXT NOT NULL,
    original_data JSON NOT NULL,
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_issue_type (issue_type),
    INDEX idx_resolved (resolved)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
