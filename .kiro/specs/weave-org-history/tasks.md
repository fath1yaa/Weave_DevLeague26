# Implementation Plan: Weave Org History

## Overview

This plan breaks the Weave application into parallelisable tasks aligned with the 4-member team allocation. The foundation (database schema, shared utilities, project structure) is established first, then each member's feature area is built concurrently, followed by integration and wiring.

## Tasks

- [ ] 1. Foundation: Database schema and shared utilities
  - [ ] 1.1 Create MySQL database schema
    - Create `database/schema.sql` with all table definitions: `roles`, `people`, `events`, `role_assignments`, `flagged_records`
    - Include indexes, foreign keys, ENUM types, and DEFAULT values as specified in the design
    - Create `database/seed.sql` with sample data for development (5-10 roles, 8-12 people, 15-20 events, sample assignments)
    - _Requirements: 7.4, 7.5_

  - [ ] 1.2 Create PHP database connection and shared utilities
    - Create `api/includes/db.php` with PDO connection to MySQL (localhost XAMPP defaults)
    - Create `api/includes/helpers.php` with shared utility functions (JSON response helper, date validation, input sanitisation)
    - _Requirements: 7.3, 7.4_

  - [ ] 1.3 Set up project directory structure and landing page
    - Create directory structure: `assets/css/`, `assets/js/`, `assets/img/`, `api/`, `api/includes/`, `pages/`, `database/`, `database/migrations/`
    - Create `index.html` as dashboard/landing page with navigation links to all feature pages
    - Create `assets/css/main.css` with global styles (layout, nav, typography, responsive grid)
    - Create `assets/js/app.js` with main application bootstrap (navigation helpers, shared event bus)
    - _Requirements: 7.2, 7.5_

  - [ ] 1.4 Create README.md with project documentation
    - Write project overview, feature descriptions, XAMPP setup instructions
    - Document task allocation for 4 team members
    - Include database setup steps (import schema.sql)
    - _Requirements: 7.1_

- [ ] 2. CSV Upload and Data Ingestion (Member 1)
  - [ ] 2.1 Implement CSV parser and validator
    - Create `api/includes/csv-parser.php` with functions to parse CSV content, validate headers against expected schemas (roles.csv, people.csv, events.csv)
    - Create `api/includes/validator.php` with row-level validation (required field checks, date format validation, type checking)
    - Implement header validation: accept file only if all required columns are present
    - _Requirements: 1.3, 1.4_

  - [ ]* 2.2 Write property tests for CSV parsing
    - **Property 1: CSV parsing preserves all valid records**
    - **Property 2: Header validation correctness**
    - **Property 3: Partial ingestion with correct flagging**
    - **Validates: Requirements 1.2, 1.3, 1.4, 1.6**

  - [ ] 2.3 Implement CSV upload API endpoint
    - Create `api/upload.php` handling multipart form POST with file fields `roles_csv`, `people_csv`, `events_csv`
    - Implement file type and size validation (CSV only, max 10MB)
    - Call csv-parser to parse each uploaded file, store valid records in MySQL via PDO
    - Flag invalid rows into `flagged_records` table with issue type and description
    - Return JSON summary with imported and flagged counts
    - _Requirements: 1.1, 1.2, 1.6_

  - [ ] 2.4 Implement cross-file record matching
    - Add logic to `api/upload.php` (or `csv-parser.php`) to match records across files using shared IDs
    - Verify person role_id references exist in roles data
    - Verify event entity_ids exist in corresponding entity tables
    - Flag unmatched references
    - _Requirements: 1.5_

  - [ ]* 2.5 Write property test for cross-file reference integrity
    - **Property 4: Cross-file reference integrity**
    - **Validates: Requirements 1.5**

  - [ ] 2.6 Create CSV upload frontend page
    - Create `pages/upload.html` with file upload form (drag-and-drop + file picker for 3 CSV files)
    - Create `assets/js/csv-upload.js` with AJAX upload logic, progress indication, and summary display
    - Display upload results: records imported count, records flagged count
    - Show toast notifications for validation errors
    - _Requirements: 1.1, 1.6_

- [ ] 3. Checkpoint - Foundation and upload complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Timeline Slider and Org Chart (Member 2)
  - [ ] 4.1 Implement org chart temporal query API
    - Create `api/orgchart.php` with `?date=YYYY-MM-DD` parameter
    - Implement `getOrgStateAtDate()` function: query active roles and current assignments for the given date
    - Build hierarchical tree from `reports_to` relationships
    - Return JSON with date, date_range (min/max from data), and nodes array
    - _Requirements: 5.1, 5.2_

  - [ ]* 4.2 Write property test for org chart temporal correctness
    - **Property 9: Org chart temporal correctness**
    - **Validates: Requirements 5.1, 5.2**

  - [ ] 4.3 Create timeline slider component
    - Create `assets/js/timeline-slider.js` with date range determination from API, manual drag/click selection
    - Implement play/pause animation mode with configurable speed (slow, medium, fast)
    - Emit custom `datechange` events for other components to listen to
    - Create `assets/css/timeline.css` with slider styling (track, thumb, date labels, play button)
    - _Requirements: 5.1, 5.3_

  - [ ] 4.4 Create org chart renderer
    - Create `assets/js/orgchart.js` with hierarchical tree rendering using HTML/CSS (flexbox-based tree layout)
    - Display node details: role title, occupant name (or "Vacant"), reporting line
    - Animate transitions when date changes (CSS transitions for nodes appearing, disappearing, repositioning)
    - Handle click events on nodes: navigate to Role_History_View or Person_Journey_View
    - Create `assets/css/orgchart.css` with tree node styling, connectors, and animation keyframes
    - _Requirements: 5.2, 5.4, 5.5, 5.6_

  - [ ]* 4.5 Write property test for org chart node information
    - **Property 10: Org chart node information completeness**
    - **Validates: Requirements 5.5**

  - [ ] 4.6 Create org chart page wiring timeline and chart
    - Create `pages/orgchart.html` integrating timeline slider and org chart components
    - Wire `datechange` event from slider to fetch org state and re-render chart
    - Implement initial load (latest date or earliest date with data)
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [ ] 5. Role History and Person Journey Views (Member 3)
  - [ ] 5.1 Implement role search and history API
    - Create `api/roles.php` with `?action=search&q={query}` for search by title or role_id
    - Implement `?action=history&role_id={id}` returning chronological timeline of changes (title changes, reporting-line shifts, redesignations)
    - Include occupants list ordered by assignment date
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ] 5.2 Implement person search and journey API
    - Create `api/people.php` with `?action=search&q={query}` for search by name or person_id
    - Implement `?action=journey&person_id={id}` returning chronological timeline of transitions (promotions, transfers, department changes)
    - Include current role and department in response
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ]* 5.3 Write property tests for timeline ordering and event detail
    - **Property 5: Event timeline chronological ordering**
    - **Property 6: Event detail completeness**
    - **Validates: Requirements 2.2, 2.3, 2.4, 2.5, 3.2, 3.3, 3.4**

  - [ ] 5.4 Create role history frontend view
    - Create `pages/role-history.html` with search bar and timeline display area
    - Create `assets/js/role-history.js` with search autocomplete, fetch role history from API, render chronological timeline of changes
    - Display each change with previous value, new value, and effective date
    - Display list of occupants with links to person journey
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ] 5.5 Create person journey frontend view
    - Create `pages/person-journey.html` with search bar and timeline display area
    - Create `assets/js/person-journey.js` with search autocomplete, fetch person journey from API, render chronological timeline
    - Display current role and department at the top
    - Display each transition with previous state, new state, and effective date
    - Display links to role history for each role held
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ] 5.6 Implement connections API and view
    - Create `api/connections.php` with `?type=role&id={id}` and `?type=person&id={id}` endpoints
    - Implement temporal correlation detection (events sharing same time window)
    - Create `assets/js/connection-view.js` with navigation links between role history and person journey
    - Preserve temporal context during navigation (pass date as URL param)
    - Visually indicate correlated events (highlight, badge, or connecting line)
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [ ]* 5.7 Write property tests for connections
    - **Property 7: Connection links completeness**
    - **Property 8: Temporal correlation detection**
    - **Validates: Requirements 4.1, 4.2, 4.3**

- [ ] 6. Checkpoint - Core views complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Data Quality Management (Member 4)
  - [ ] 7.1 Implement data quality API
    - Create `api/dataquality.php` with `?action=list` returning flagged records grouped by category with quality score
    - Implement `?action=resolve&flag_id={id}` accepting PUT with resolved_data JSON
    - Implement re-validation logic: check resolved data against all constraints, update DB if valid, keep flagged if not
    - Calculate quality score as ((total_records - unresolved_flags) / total_records) * 100
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [ ]* 7.2 Write property tests for data quality
    - **Property 11: Flagged record categorisation correctness**
    - **Property 12: Resolution re-validation**
    - **Property 13: Data quality score accuracy**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.5, 6.6**

  - [ ] 7.3 Create data quality frontend page
    - Create `pages/data-quality.html` with flagged records list, category filters, and resolution form
    - Create `assets/js/data-quality.js` with fetch flagged records, display categorised list, inline editing for resolution
    - Display data quality score as percentage with visual indicator (progress bar or gauge)
    - Show original data and issue description when a record is selected
    - Handle resolution submission and display re-validation results
    - Create `assets/css/dataquality.css` with styling for record cards, category tabs, and resolution form
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

- [ ] 8. Integration and final wiring
  - [ ] 8.1 Wire navigation and cross-page links
    - Update `index.html` dashboard with feature cards linking to all pages
    - Ensure org chart node clicks navigate to role-history or person-journey pages with correct IDs
    - Ensure connection view links pass temporal context between views
    - Add consistent navigation bar across all pages
    - _Requirements: 4.4, 5.6_

  - [ ] 8.2 End-to-end integration testing
    - Write integration test script (PHP or JS) that: uploads sample CSVs, verifies records stored, queries org chart at specific date, queries role history and person journey, verifies connection links, verifies data quality page lists flagged records
    - Verify all API endpoints return correct JSON structure
    - _Requirements: 1.2, 2.2, 3.2, 5.2, 6.1_

- [ ] 9. Final checkpoint - All features integrated
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Team members can work in parallel: Member 1 on task group 2, Member 2 on task group 4, Member 3 on task group 5, Member 4 on task group 7 (all after group 1 foundation is complete)
- The foundation tasks (group 1) should be split: Member 4 handles 1.1 and 1.2 (database), any member handles 1.3 and 1.4

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.3", "1.4"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2.1", "4.1", "5.1", "5.2", "7.1"] },
    { "id": 3, "tasks": ["2.2", "2.3", "4.2", "4.3", "5.3", "5.4", "5.5", "7.2"] },
    { "id": 4, "tasks": ["2.4", "2.6", "4.4", "5.6", "7.3"] },
    { "id": 5, "tasks": ["2.5", "4.5", "4.6", "5.7"] },
    { "id": 6, "tasks": ["8.1"] },
    { "id": 7, "tasks": ["8.2"] }
  ]
}
```
