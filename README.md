# Weave - Organisational History Visualisation

Weave is a web application that reconstructs and visualises organisational change over time. It allows HR teams and managers to upload CSV data about roles, people, and events, then explore how the organisation evolved through interactive timelines, org charts, and journey views.

---

## Project Description

**Lab:** Lab 2 - People-Centric Tech & Collaboration

**Problem:** Organisations undergo constant structural change — roles are created, people move between positions, departments are restructured. This history is often scattered across spreadsheets, HRIS snapshots, and institutional memory, making it difficult to understand how the organisation arrived at its current state.

**Solution:** Weave provides a centralised platform to import organisational data via CSV files, validate and cross-reference records, and present the history through interactive visualisations. Users can scrub through time to see the org chart at any point, trace a person's career journey, or track how a specific role has evolved.

**How It Works:**
1. Users upload CSV files containing roles, people, and organisational events
2. The system validates data, flags inconsistencies (missing fields, unmatched references, duplicates), and stores valid records
3. Interactive views let users explore the org chart timeline, individual role histories, person career journeys, and relationship connections between entities

**Technologies & Tools:**
- **Frontend:** Vanilla HTML5, CSS3, JavaScript (no framework dependencies)
- **Backend:** PHP with JSON file-based storage
- **Data Layer:** JSON flat files with file locking for concurrent access
- **Database Schema:** MySQL schema provided for production deployment
- **Architecture:** RESTful API with publish/subscribe event bus on the frontend

**Target Users:** HR administrators, people operations teams, organisational development professionals, and managers who need to understand historical team structures and personnel movements.

**What Makes It Unique:** Weave focuses on temporal reconstruction — instead of showing a single static org chart, it lets users navigate through time to see how the organisation looked at any given date, with animated transitions between states. It also features built-in data quality management that flags and surfaces issues for resolution rather than silently discarding problematic records.

---

## Project Structure

```
Weave_DevLeague26/
├── api/                    # PHP backend API endpoints
│   ├── includes/           # Shared utilities (store, auth, validation, CSV parsing)
│   ├── auth.php            # Login/logout/session check
│   ├── connections.php     # Entity relationship connections
│   ├── dataquality.php     # Flagged records management
│   ├── orgchart.php        # Org chart data by date
│   ├── people.php          # People CRUD
│   ├── roles.php           # Roles CRUD
│   ├── upload.php          # CSV file upload and processing
│   └── upload-history.php  # Upload audit log
├── assets/
│   ├── css/                # Stylesheets (main + page-specific)
│   ├── img/                # Images and icons
│   └── js/                 # Frontend JavaScript modules
├── data/                   # JSON data store (runtime data files)
├── database/               # MySQL schema and seed scripts
│   ├── schema.sql          # Full database schema
│   └── seed.sql            # Sample seed data
├── pages/                  # HTML pages for each feature
│   ├── connections.html    # Entity connection visualisation
│   ├── data-quality.html   # Data quality dashboard
│   ├── login.html          # Authentication page
│   ├── orgchart.html       # Org chart timeline view
│   ├── person-journey.html # Individual career journey
│   ├── role-history.html   # Role evolution timeline
│   └── upload.html         # CSV upload interface
└── index.html              # Landing page / dashboard
```

---

## Prerequisites

- **PHP 7.4+** (with `fileinfo` extension enabled)
- **A web server** — Apache (with `mod_rewrite`) or Nginx, or PHP's built-in development server
- **Web browser** — Any modern browser (Chrome, Firefox, Edge, Safari)

Optional for production:
- **MySQL 5.7+** or **MariaDB 10.3+** (if migrating from JSON storage to database)

---

## Installation & Setup

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/Weave_DevLeague26.git
cd Weave_DevLeague26
```

### 2. Ensure the Data Directory is Writable

The application stores data in the `data/` directory. Make sure your web server can write to it:

```bash
# Linux/macOS
chmod -R 775 data/

# Windows (PowerShell) — typically writable by default
# If issues arise, check folder permissions in Properties > Security
```

### 3. Start the Development Server

The quickest way to run Weave locally is with PHP's built-in server:

```bash
php -S localhost:8000
```

Then open your browser to: **http://localhost:8000**

### Alternative: Apache/Nginx

If using Apache, point your document root to the project folder. The `data/.htaccess` file already blocks direct web access to JSON data files.

For Nginx, add a location block to deny access to the `data/` directory:

```nginx
location /data/ {
    deny all;
}
```

---

## Running the Project

1. Start the PHP development server (see above)
2. Navigate to **http://localhost:8000** in your browser
3. Log in with the following credentials:
   - **Username:** `hrAdmin`
   - **Password:** `hrAdmin123@`
4. Upload CSV data via the **Upload** page
5. Explore the organisation through the available views

---

## CSV Data Format

Weave accepts three types of CSV files:

### roles.csv

| Column | Required | Description |
|--------|----------|-------------|
| role_id | Yes | Unique role identifier (e.g., R001) |
| title | Yes | Role title |
| department | Yes | Department name |
| reports_to | No | Parent role_id |
| effective_from | Yes | Start date (YYYY-MM-DD) |
| effective_to | No | End date (YYYY-MM-DD), empty if current |

### people.csv

| Column | Required | Description |
|--------|----------|-------------|
| person_id | Yes | Unique person identifier (e.g., P001) |
| name | Yes | Full name |
| role_id | Yes | Assigned role_id |
| start_date | Yes | Assignment start (YYYY-MM-DD) |
| end_date | No | Assignment end (YYYY-MM-DD), empty if current |

### events.csv

| Column | Required | Description |
|--------|----------|-------------|
| event_id | Yes | Unique event identifier (e.g., E001) |
| event_type | Yes | One of: title_change, reporting_change, promotion, transfer, department_change, hire, departure, restructure |
| entity_type | Yes | Either "role" or "person" |
| entity_id | Yes | The role_id or person_id this event affects |
| previous_value | No | Value before the change |
| new_value | No | Value after the change |
| effective_date | Yes | When the event occurred (YYYY-MM-DD) |
| description | No | Human-readable description |

---

## Features

- **CSV Upload & Validation** — Import organisational data with automatic validation and error flagging
- **Org Chart Timeline** — Interactive org chart with a time slider to see the structure at any date
- **Role History** — Track how any role evolved over time (title changes, reporting line shifts, occupants)
- **Person Journey** — Follow an individual's career path through the organisation
- **Connections View** — Visualise relationships and connections between entities
- **Data Quality Dashboard** — Review, investigate, and resolve flagged data inconsistencies
- **Authentication** — Session-based login to protect data uploads and modifications

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/auth.php?action=check` | Check auth status |
| POST | `/api/auth.php?action=login` | Log in |
| POST | `/api/auth.php?action=logout` | Log out |
| POST | `/api/upload.php` | Upload CSV files (multipart form) |
| GET | `/api/roles.php` | Query roles |
| GET | `/api/people.php` | Query people |
| GET | `/api/orgchart.php` | Get org chart for a date |
| GET | `/api/connections.php` | Get entity connections |
| GET | `/api/dataquality.php` | Get flagged records |
| GET | `/api/upload-history.php` | Get upload audit log |

---

## Optional: Database Setup (MySQL)

For production use with MySQL instead of JSON files:

```bash
mysql -u root -p < database/schema.sql
mysql -u root -p weave_db < database/seed.sql
```

Update the database connection settings in `api/includes/db.php` as needed.

---

## Team

DevLeague 26

---

## License

This project was developed as part of the DevLeague programme.
