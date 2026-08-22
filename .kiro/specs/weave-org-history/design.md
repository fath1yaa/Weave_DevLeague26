# Design Document

## Introduction

This document describes the architecture and design for the Weave application - a full-stack web application that reconstructs and visualises organisational change over time. Weave is built with HTML/CSS/JavaScript on the frontend, PHP for backend logic, and MySQL (via XAMPP) for data storage. The system ingests structured CSV data describing roles, people, and organisational events, then presents connected historical views through an animated timeline slider and org chart visualisation.

## Architecture Overview

Weave follows a traditional three-tier web architecture optimised for a hackathon team of 4 working concurrently:

```
┌──────────────────────────────────────────────────────┐
│                   Frontend (Browser)                   │
│  HTML/CSS/JS - Timeline, Org Chart, Data Quality UI   │
└──────────────────────┬───────────────────────────────┘
                       │ AJAX/Fetch (JSON)
┌──────────────────────▼───────────────────────────────┐
│                   Backend (PHP)                        │
│  API Endpoints - CSV Parser - Query Engine            │
└──────────────────────┬───────────────────────────────┘
                       │ PDO/MySQLi
┌──────────────────────▼───────────────────────────────┐
│                   Database (MySQL)                     │
│  Roles - People - Events - Assignments - Flags        │
└──────────────────────────────────────────────────────┘
```

## Directory Structure

```
weave/
├── index.html                    # Landing page / dashboard
├── README.md                     # Project overview and task allocation
├── assets/
│   ├── css/
│   │   ├── main.css              # Global styles
│   │   ├── timeline.css          # Timeline slider styles
│   │   ├── orgchart.css          # Org chart styles
│   │   └── dataquality.css       # Data quality page styles
│   ├── js/
│   │   ├── app.js                # Main application bootstrap
│   │   ├── csv-upload.js         # File upload handling
│   │   ├── timeline-slider.js    # Animated timeline control
│   │   ├── orgchart.js           # Org chart rendering (tree layout)
│   │   ├── role-history.js       # Role history view logic
│   │   ├── person-journey.js     # Person journey view logic
│   │   ├── connection-view.js    # Connected views logic
│   │   └── data-quality.js       # Data quality page logic
│   └── img/                      # Icons and images
├── api/
│   ├── upload.php                # CSV upload endpoint
│   ├── roles.php                 # Role queries (search, history)
│   ├── people.php                # Person queries (search, journey)
│   ├── orgchart.php              # Org chart state at date
│   ├── connections.php           # Connected view queries
│   ├── dataquality.php           # Flagged records CRUD
│   └── includes/
│       ├── db.php                # Database connection
│       ├── csv-parser.php        # CSV parsing and validation
│       ├── validator.php         # Record validation logic
│       └── helpers.php           # Shared utility functions
├── pages/
│   ├── upload.html               # CSV upload page
│   ├── role-history.html         # Role history view page
│   ├── person-journey.html       # Person journey view page
│   ├── orgchart.html             # Org chart + timeline page
│   └── data-quality.html         # Data quality management page
└── database/
    ├── schema.sql                # Table definitions
    ├── seed.sql                  # Sample data for development
    └── migrations/               # Schema version changes
```

## Components

### 1. CSV Ingestion Module

Responsible for parsing uploaded CSV files, validating structure and content, storing valid records, and flagging problematic rows.

**Key responsibilities:**
- Accept file uploads via multipart form POST
- Validate CSV headers against expected schemas
- Parse rows, type-check values, and detect missing required fields
- Insert valid records into MySQL tables
- Flag invalid rows with issue descriptions
- Cross-reference records across files using shared IDs
- Return import summary (imported count, flagged count)

### 2. Temporal Query Engine

The backend logic that reconstructs organisational state at any point in time.

**Key responsibilities:**
- Given a date, compute which roles existed, who occupied them, and reporting lines
- Build the org tree structure for a specific date
- Compute role history (sequence of changes for a role)
- Compute person journey (sequence of transitions for a person)
- Detect temporal correlations between structural and personal changes

### 3. Timeline Slider Component

A JavaScript UI control for navigating time.

**Key responsibilities:**
- Determine date range from imported data
- Allow manual date selection (drag/click)
- Provide play/pause animation mode
- Configurable animation speed
- Emit date-change events for other components to react to

### 4. Org Chart Renderer

Renders the hierarchical org structure as a tree/graph at a given point in time.

**Key responsibilities:**
- Receive org state data (nodes with roles, people, reporting lines)
- Render as a hierarchical tree using HTML/CSS or Canvas
- Animate transitions when date changes (nodes appearing, disappearing, moving)
- Display node details (role title, occupant, reporting line)
- Handle click events for navigation to detail views

### 5. Role History View

Displays the complete evolution of a selected role.

**Key responsibilities:**
- Provide search by role title or ID
- Display chronological timeline of changes
- Show detail for each change (old value, new value, effective date)
- List all persons who occupied the role, ordered by assignment date
- Link to person journey views

### 6. Person Journey View

Displays a person's career path through the organisation.

**Key responsibilities:**
- Provide search by person name or ID
- Display current role and department prominently
- Display chronological timeline of transitions
- Show detail for each transition (old state, new state, effective date)
- Link to role history views

### 7. Connection View

Links role history and person journey, highlighting correlations.

**Key responsibilities:**
- Generate navigation links between related entities
- Detect temporal correlations between structural and personal events
- Preserve temporal context during navigation
- Visually indicate correlated events

### 8. Data Quality Page

Interface for reviewing and resolving data issues.

**Key responsibilities:**
- List all flagged records, categorised by issue type
- Display original data and issue description for selected records
- Provide inline editing for field resolution
- Re-validate on submission and update database
- Calculate and display data quality score

## Interfaces

### API Endpoints

#### POST /api/upload.php

Handles CSV file upload and ingestion.

**Request:** `multipart/form-data` with file fields `roles_csv`, `people_csv`, `events_csv`

**Response:**
```json
{
  "success": true,
  "summary": {
    "roles_imported": 45,
    "people_imported": 120,
    "events_imported": 200,
    "flagged": 12
  }
}
```

#### GET /api/roles.php?action=search&q={query}

Search roles by title or ID.

**Response:**
```json
{
  "results": [
    { "role_id": "R001", "title": "Engineering Manager", "department": "Engineering" }
  ]
}
```

#### GET /api/roles.php?action=history&role_id={id}

Get full history for a role.

**Response:**
```json
{
  "role_id": "R001",
  "current_title": "Engineering Manager",
  "history": [
    {
      "event_type": "title_change",
      "previous_value": "Tech Lead",
      "new_value": "Engineering Manager",
      "effective_date": "2023-06-01",
      "description": "Role redesignation"
    }
  ],
  "occupants": [
    { "person_id": "P005", "name": "Jane Smith", "start_date": "2023-06-01", "end_date": null }
  ]
}
```

#### GET /api/people.php?action=search&q={query}

Search people by name or ID.

**Response:**
```json
{
  "results": [
    { "person_id": "P005", "name": "Jane Smith", "current_role": "Engineering Manager" }
  ]
}
```

#### GET /api/people.php?action=journey&person_id={id}

Get full journey for a person.

**Response:**
```json
{
  "person_id": "P005",
  "name": "Jane Smith",
  "current_role": "Engineering Manager",
  "current_department": "Engineering",
  "journey": [
    {
      "event_type": "promotion",
      "previous_role": "Tech Lead",
      "new_role": "Engineering Manager",
      "effective_date": "2023-06-01"
    }
  ]
}
```

#### GET /api/orgchart.php?date={YYYY-MM-DD}

Get org structure at a specific date.

**Response:**
```json
{
  "date": "2023-06-01",
  "date_range": { "min": "2020-01-01", "max": "2024-01-01" },
  "nodes": [
    {
      "role_id": "R001",
      "title": "Engineering Manager",
      "occupant": "Jane Smith",
      "person_id": "P005",
      "reports_to": "R000",
      "department": "Engineering"
    }
  ]
}
```

#### GET /api/connections.php?type=role&id={role_id}

Get connected entities for a role.

**Response:**
```json
{
  "entity_type": "role",
  "entity_id": "R001",
  "connected_persons": [
    { "person_id": "P005", "name": "Jane Smith", "period": "2023-06-01 to present" }
  ],
  "correlations": [
    {
      "event": "Department restructure",
      "date": "2023-06-01",
      "related_person_event": { "person_id": "P005", "event": "promotion" }
    }
  ]
}
```

#### GET /api/dataquality.php?action=list

List flagged records.

**Response:**
```json
{
  "quality_score": 94.5,
  "flagged_records": [
    {
      "flag_id": 1,
      "source_file": "people.csv",
      "row_number": 15,
      "issue_type": "missing_field",
      "issue_description": "Missing required field: role_id",
      "original_data": { "person_id": "P099", "name": "John Doe", "role_id": "" }
    }
  ],
  "categories": {
    "missing_field": 5,
    "unmatched_reference": 3,
    "date_conflict": 2,
    "duplicate": 2
  }
}
```

#### PUT /api/dataquality.php?action=resolve&flag_id={id}

Submit a resolution for a flagged record.

**Request:**
```json
{
  "resolved_data": { "person_id": "P099", "name": "John Doe", "role_id": "R015" }
}
```

**Response:**
```json
{
  "success": true,
  "validation_passed": true,
  "message": "Record validated and stored successfully"
}
```

## Data Models

### MySQL Schema

```sql
-- Core entity tables
CREATE TABLE roles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    role_id VARCHAR(50) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    department VARCHAR(255),
    reports_to VARCHAR(50),
    effective_from DATE NOT NULL,
    effective_to DATE DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE people (
    id INT AUTO_INCREMENT PRIMARY KEY,
    person_id VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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
);

-- Assignment junction table (who held which role when)
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
);

-- Data quality tracking
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
);
```

### CSV File Schemas

**roles.csv:**
| Column | Type | Required | Description |
|--------|------|----------|-------------|
| role_id | string | yes | Unique role identifier |
| title | string | yes | Role title |
| department | string | yes | Department name |
| reports_to | string | no | Parent role_id |
| effective_from | date | yes | When this role record became active |
| effective_to | date | no | When this role record ended (null = current) |

**people.csv:**
| Column | Type | Required | Description |
|--------|------|----------|-------------|
| person_id | string | yes | Unique person identifier |
| name | string | yes | Person's full name |
| role_id | string | yes | Assigned role ID |
| start_date | date | yes | Assignment start date |
| end_date | date | no | Assignment end date (null = current) |

**events.csv:**
| Column | Type | Required | Description |
|--------|------|----------|-------------|
| event_id | string | yes | Unique event identifier |
| event_type | string | yes | Type of change |
| entity_type | string | yes | 'role' or 'person' |
| entity_id | string | yes | ID of affected entity |
| previous_value | string | no | Value before change |
| new_value | string | no | Value after change |
| effective_date | date | yes | When the change took effect |
| description | string | no | Human-readable description |

## Error Handling

### CSV Upload Errors

| Error Condition | Response | User Impact |
|----------------|----------|-------------|
| No file selected | 400 - "No file uploaded" | Toast notification |
| Invalid file type | 400 - "Only CSV files accepted" | Toast notification |
| Missing required headers | 400 - "Missing columns: [list]" | Upload rejected with details |
| Empty file | 400 - "File contains no data rows" | Toast notification |
| File too large (>10MB) | 400 - "File exceeds size limit" | Toast notification |
| Row with missing required field | Row flagged, processing continues | Flagged record on Data Quality page |
| Unmatched cross-file reference | Row flagged, processing continues | Flagged record on Data Quality page |
| Database connection failure | 500 - "Database unavailable" | Error page with retry option |

### Query Errors

| Error Condition | Response | User Impact |
|----------------|----------|-------------|
| Entity not found | 404 - "Role/Person not found" | Empty state with search suggestion |
| Invalid date format | 400 - "Invalid date format" | Input validation feedback |
| Date outside data range | 200 - Empty org chart | Message: "No data for selected date" |
| Database timeout | 500 - "Request timeout" | Retry prompt |

### Data Quality Resolution Errors

| Error Condition | Response | User Impact |
|----------------|----------|-------------|
| Resolution still invalid | 200 - validation_passed: false | Show remaining validation errors |
| Referenced entity doesn't exist | 200 - validation_passed: false | Suggest valid entity IDs |
| Date conflict with existing records | 200 - validation_passed: false | Show conflicting records |

## Key Algorithms

### Temporal State Reconstruction

To render the org chart at a specific date:

```php
// Pseudocode for org state at date
function getOrgStateAtDate($date) {
    // 1. Get all roles active on this date
    $roles = query("SELECT * FROM roles 
                    WHERE effective_from <= ? 
                    AND (effective_to IS NULL OR effective_to >= ?)", 
                   [$date, $date]);
    
    // 2. Get current assignments for each role on this date
    $assignments = query("SELECT ra.*, p.name 
                         FROM role_assignments ra 
                         JOIN people p ON ra.person_id = p.person_id
                         WHERE ra.start_date <= ? 
                         AND (ra.end_date IS NULL OR ra.end_date >= ?)",
                        [$date, $date]);
    
    // 3. Build tree structure from reports_to relationships
    $tree = buildHierarchy($roles, $assignments);
    
    return $tree;
}
```

### Cross-File Record Matching

```php
// Match records across CSV files using shared IDs
function matchRecords($roles, $people, $events) {
    $unmatched = [];
    
    // Verify each person's role_id exists in roles
    foreach ($people as $person) {
        if (!isset($roles[$person['role_id']])) {
            $unmatched[] = flagRecord($person, 'unmatched_reference', 
                "role_id '{$person['role_id']}' not found in roles");
        }
    }
    
    // Verify each event's entity_id exists in roles or people
    foreach ($events as $event) {
        $table = $event['entity_type'] === 'role' ? $roles : $people;
        $key = $event['entity_id'];
        if (!isset($table[$key])) {
            $unmatched[] = flagRecord($event, 'unmatched_reference',
                "entity_id '{$key}' not found in {$event['entity_type']}s");
        }
    }
    
    return $unmatched;
}
```

### Temporal Correlation Detection

```php
// Detect when structural changes and person movements overlap
function detectCorrelations($roleId, $timeWindow = 30) {
    // Get structural events for this role
    $roleEvents = query("SELECT * FROM events 
                        WHERE entity_type = 'role' AND entity_id = ?", [$roleId]);
    
    // For each role event, find person events within the time window
    $correlations = [];
    foreach ($roleEvents as $re) {
        $personEvents = query("SELECT e.*, p.name FROM events e
                             JOIN people p ON e.entity_id = p.person_id
                             WHERE e.entity_type = 'person'
                             AND e.entity_id IN (
                                 SELECT person_id FROM role_assignments WHERE role_id = ?
                             )
                             AND ABS(DATEDIFF(e.effective_date, ?)) <= ?",
                            [$roleId, $re['effective_date'], $timeWindow]);
        
        if (!empty($personEvents)) {
            $correlations[] = [
                'role_event' => $re,
                'person_events' => $personEvents
            ];
        }
    }
    
    return $correlations;
}
```

### Data Quality Score Calculation

```php
function calculateQualityScore() {
    $totalRecords = query("SELECT 
        (SELECT COUNT(*) FROM roles) + 
        (SELECT COUNT(*) FROM people) + 
        (SELECT COUNT(*) FROM events) as total")[0]['total'];
    
    $flaggedCount = query("SELECT COUNT(*) as cnt FROM flagged_records 
                          WHERE resolved = FALSE")[0]['cnt'];
    
    if ($totalRecords == 0) return 100.0;
    
    return round((($totalRecords - $flaggedCount) / $totalRecords) * 100, 1);
}
```

## Team Task Allocation

| Member | Responsibility | Key Files |
|--------|---------------|-----------|
| Member 1 | CSV Upload & Data Ingestion | `api/upload.php`, `api/includes/csv-parser.php`, `api/includes/validator.php`, `pages/upload.html`, `assets/js/csv-upload.js` |
| Member 2 | Timeline Slider & Org Chart | `api/orgchart.php`, `pages/orgchart.html`, `assets/js/timeline-slider.js`, `assets/js/orgchart.js`, `assets/css/timeline.css`, `assets/css/orgchart.css` |
| Member 3 | Role History & Person Journey Views | `api/roles.php`, `api/people.php`, `api/connections.php`, `pages/role-history.html`, `pages/person-journey.html`, `assets/js/role-history.js`, `assets/js/person-journey.js`, `assets/js/connection-view.js` |
| Member 4 | Data Quality & Database | `database/schema.sql`, `api/dataquality.php`, `api/includes/db.php`, `pages/data-quality.html`, `assets/js/data-quality.js`, `assets/css/dataquality.css` |

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system - essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: CSV parsing preserves all valid records

*For any* valid CSV file with N rows that all pass validation, the CSV_Ingestion_Module SHALL store exactly N records in the database, each with field values identical to the source row.

**Validates: Requirements 1.2**

### Property 2: Header validation correctness

*For any* CSV file, the CSV_Ingestion_Module SHALL accept the file if and only if it contains all required column headers for its file type (roles.csv, people.csv, or events.csv).

**Validates: Requirements 1.3**

### Property 3: Partial ingestion with correct flagging

*For any* CSV file containing a mix of valid and invalid rows, the count of imported records plus the count of flagged records SHALL equal the total number of data rows in the file, with each row classified correctly.

**Validates: Requirements 1.4, 1.6**

### Property 4: Cross-file reference integrity

*For any* set of uploaded CSV files, every person record referencing a role_id that does not exist in the roles data SHALL be flagged as an unmatched reference, and every person record referencing a valid role_id SHALL be linked correctly.

**Validates: Requirements 1.5**

### Property 5: Event timeline chronological ordering

*For any* entity (role or person) with multiple events, the timeline view SHALL display those events sorted in ascending order by effective_date.

**Validates: Requirements 2.2, 2.5, 3.2**

### Property 6: Event detail completeness

*For any* change event (title change, reporting-line change, role transition, or department change), the view SHALL display the previous value, the new value, and the effective date of the change.

**Validates: Requirements 2.3, 2.4, 3.3, 3.4**

### Property 7: Connection links completeness

*For any* role with N distinct occupants, the Connection_View SHALL render exactly N links to person journey views. Symmetrically, for any person who has held M distinct roles, the Connection_View SHALL render exactly M links to role history views.

**Validates: Requirements 4.1, 4.2**

### Property 8: Temporal correlation detection

*For any* pair of events where one is a structural change to a role and the other is a person movement involving that same role, and both events share the same effective_date (within a defined window), the Connection_View SHALL identify and indicate the correlation.

**Validates: Requirements 4.3**

### Property 9: Org chart temporal correctness

*For any* date within the imported data range, the Org_Chart_View SHALL render exactly those roles whose effective_from <= date AND (effective_to IS NULL OR effective_to >= date), with occupants whose assignment start_date <= date AND (end_date IS NULL OR end_date >= date).

**Validates: Requirements 5.1, 5.2**

### Property 10: Org chart node information completeness

*For any* node rendered in the Org_Chart_View, the node SHALL display the role title, the current occupant's name (or "Vacant" if unoccupied), and the reporting line (parent role).

**Validates: Requirements 5.5**

### Property 11: Flagged record categorisation correctness

*For any* record flagged during CSV import, it SHALL appear in the Data_Quality_Page list under exactly one issue category matching its actual issue type (missing_field, unmatched_reference, date_conflict, or duplicate).

**Validates: Requirements 6.1, 6.2, 6.3**

### Property 12: Resolution re-validation

*For any* flagged record with a proposed resolution, the system SHALL re-validate the resolved data against all constraints, and update the database if and only if validation passes. If validation fails, the record SHALL remain flagged.

**Validates: Requirements 6.5**

### Property 13: Data quality score accuracy

*For any* dataset with T total records in the database and F unresolved flagged records, the data quality score SHALL equal ((T - F) / T) * 100, rounded to one decimal place.

**Validates: Requirements 6.6**
