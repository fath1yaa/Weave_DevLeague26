-- Weave Application Seed Data
-- Sample data for development and testing
-- Run after schema.sql to populate tables with realistic organisational data

USE weave_db;

-- ============================================================
-- Roles (10 roles across Engineering, Marketing, Finance, Operations)
-- ============================================================

INSERT INTO roles (role_id, title, department, reports_to, effective_from, effective_to) VALUES
('R001', 'Chief Executive Officer', 'Executive', NULL, '2020-01-01', NULL),
('R002', 'VP Engineering', 'Engineering', 'R001', '2020-01-01', NULL),
('R003', 'VP Marketing', 'Marketing', 'R001', '2020-01-01', NULL),
('R004', 'VP Finance', 'Finance', 'R001', '2020-01-01', NULL),
('R005', 'VP Operations', 'Operations', 'R001', '2020-03-15', NULL),
('R006', 'Engineering Manager', 'Engineering', 'R002', '2020-01-01', NULL),
('R007', 'Senior Software Engineer', 'Engineering', 'R006', '2020-02-01', NULL),
('R008', 'Marketing Manager', 'Marketing', 'R003', '2020-01-01', '2023-06-30'),
('R009', 'Digital Marketing Lead', 'Marketing', 'R003', '2023-07-01', NULL),
('R010', 'Financial Analyst', 'Finance', 'R004', '2020-06-01', NULL);

-- ============================================================
-- People (12 individuals)
-- ============================================================

INSERT INTO people (person_id, name) VALUES
('P001', 'Sarah Chen'),
('P002', 'David Kumar'),
('P003', 'Emily Watson'),
('P004', 'James Rodriguez'),
('P005', 'Lisa Park'),
('P006', 'Michael Thompson'),
('P007', 'Anna Kowalski'),
('P008', 'Robert Nguyen'),
('P009', 'Jessica Liu'),
('P010', 'Thomas Anderson'),
('P011', 'Maria Garcia'),
('P012', 'Kevin O''Brien');

-- ============================================================
-- Role Assignments (who held which role when)
-- ============================================================

INSERT INTO role_assignments (person_id, role_id, start_date, end_date) VALUES
('P001', 'R001', '2020-01-01', NULL),
('P002', 'R002', '2020-01-01', NULL),
('P003', 'R003', '2020-01-01', NULL),
('P004', 'R004', '2020-01-01', NULL),
('P005', 'R005', '2020-03-15', NULL),
('P006', 'R006', '2020-01-01', '2022-12-31'),
('P007', 'R006', '2023-01-01', NULL),
('P008', 'R007', '2020-02-01', '2022-06-30'),
('P009', 'R007', '2022-07-01', NULL),
('P010', 'R008', '2020-01-01', '2023-06-30'),
('P010', 'R009', '2023-07-01', NULL),
('P011', 'R010', '2020-06-01', '2023-03-31'),
('P012', 'R010', '2023-04-01', NULL);

-- ============================================================
-- Events (20 organisational change events)
-- ============================================================

INSERT INTO events (event_id, event_type, entity_type, entity_id, previous_value, new_value, effective_date, description) VALUES
('E001', 'hire', 'person', 'P001', NULL, 'Chief Executive Officer', '2020-01-01', 'Sarah Chen appointed as CEO'),
('E002', 'hire', 'person', 'P002', NULL, 'VP Engineering', '2020-01-01', 'David Kumar joins as VP Engineering'),
('E003', 'hire', 'person', 'P003', NULL, 'VP Marketing', '2020-01-01', 'Emily Watson joins as VP Marketing'),
('E004', 'hire', 'person', 'P005', NULL, 'VP Operations', '2020-03-15', 'Lisa Park hired as VP Operations'),
('E005', 'hire', 'person', 'P006', NULL, 'Engineering Manager', '2020-01-01', 'Michael Thompson joins as Engineering Manager'),
('E006', 'hire', 'person', 'P008', NULL, 'Senior Software Engineer', '2020-02-01', 'Robert Nguyen hired as Senior Software Engineer'),
('E007', 'promotion', 'person', 'P007', 'Software Engineer', 'Engineering Manager', '2023-01-01', 'Anna Kowalski promoted to Engineering Manager'),
('E008', 'departure', 'person', 'P006', 'Engineering Manager', NULL, '2022-12-31', 'Michael Thompson departs the Engineering Manager role'),
('E009', 'title_change', 'role', 'R008', 'Marketing Manager', 'Digital Marketing Lead', '2023-07-01', 'Marketing Manager role redesignated to Digital Marketing Lead'),
('E010', 'department_change', 'person', 'P010', 'Marketing', 'Marketing', '2023-07-01', 'Thomas Anderson continues under restructured marketing team'),
('E011', 'restructure', 'role', 'R003', NULL, 'Digital-first marketing strategy', '2023-07-01', 'Marketing department restructured around digital channels'),
('E012', 'reporting_change', 'role', 'R009', 'R008', 'R003', '2023-07-01', 'Digital Marketing Lead now reports directly to VP Marketing'),
('E013', 'hire', 'person', 'P009', NULL, 'Senior Software Engineer', '2022-07-01', 'Jessica Liu joins as Senior Software Engineer'),
('E014', 'departure', 'person', 'P008', 'Senior Software Engineer', NULL, '2022-06-30', 'Robert Nguyen departs the organisation'),
('E015', 'hire', 'person', 'P011', NULL, 'Financial Analyst', '2020-06-01', 'Maria Garcia hired as Financial Analyst'),
('E016', 'departure', 'person', 'P011', 'Financial Analyst', NULL, '2023-03-31', 'Maria Garcia departs the organisation'),
('E017', 'hire', 'person', 'P012', NULL, 'Financial Analyst', '2023-04-01', 'Kevin O''Brien hired as Financial Analyst'),
('E018', 'promotion', 'person', 'P009', 'Junior Engineer', 'Senior Software Engineer', '2022-07-01', 'Jessica Liu promoted upon joining'),
('E019', 'reporting_change', 'role', 'R006', 'R002', 'R002', '2021-06-01', 'Engineering Manager reporting line confirmed after reorg'),
('E020', 'hire', 'person', 'P004', NULL, 'VP Finance', '2020-01-01', 'James Rodriguez appointed as VP Finance');

-- ============================================================
-- Flagged Records (sample data quality issues for testing)
-- ============================================================

INSERT INTO flagged_records (source_file, row_number, issue_type, issue_description, original_data, resolved, resolved_at) VALUES
('people.csv', 15, 'missing_field', 'Missing required field: role_id', '{"person_id": "P099", "name": "John Doe", "role_id": ""}', FALSE, NULL),
('events.csv', 8, 'unmatched_reference', 'entity_id P200 not found in people table', '{"event_id": "E100", "event_type": "promotion", "entity_type": "person", "entity_id": "P200", "effective_date": "2023-01-15"}', FALSE, NULL),
('roles.csv', 22, 'date_conflict', 'effective_from date is after effective_to date', '{"role_id": "R050", "title": "Temp Role", "effective_from": "2023-12-01", "effective_to": "2023-01-01"}', FALSE, NULL),
('people.csv', 3, 'duplicate', 'Duplicate person_id found: P001', '{"person_id": "P001", "name": "Sarah Chen (duplicate)", "role_id": "R001"}', TRUE, '2024-01-15 10:30:00');
