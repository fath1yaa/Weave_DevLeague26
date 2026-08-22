# Sample Data

Sample CSV files for testing the Weave upload feature. These files contain realistic organisational data that can be imported through the Upload page.

## How to Use

1. Navigate to the **Upload** page in the Weave application
2. Select a CSV file from this directory
3. The system will validate the data and flag any issues on the Data Quality page

> Some rows are **intentionally invalid** to test data quality detection. These are documented below.

## Files

### roles.csv

Organisational role definitions.

| Column | Description |
|--------|-------------|
| `role_id` | Unique role identifier (e.g. R001) |
| `title` | Job title |
| `department` | Department name |
| `reports_to` | role_id of the parent role (empty for top-level) |
| `effective_from` | Date the role became active (YYYY-MM-DD) |
| `effective_to` | Date the role was retired (empty if still active) |

**Invalid rows for testing:**
- R050 — missing required `title` field
- R051 — `effective_from` (2023-12-01) is after `effective_to` (2023-01-01)

### people.csv

People and their role assignments. A person with multiple roles appears on multiple rows.

| Column | Description |
|--------|-------------|
| `person_id` | Unique person identifier (e.g. P001) |
| `name` | Full name |
| `role_id` | The role assigned to this person |
| `start_date` | When the person started in this role (YYYY-MM-DD) |
| `end_date` | When the person left this role (empty if current) |

**Invalid rows for testing:**
- P099 (John Doe) — missing `role_id`
- P013 (Ghost Employee) — references non-existent role R999

### events.csv

Organisational change events (hires, departures, promotions, restructures, etc.).

| Column | Description |
|--------|-------------|
| `event_id` | Unique event identifier (e.g. E001) |
| `event_type` | Type: hire, departure, promotion, title_change, department_change, restructure, reporting_change |
| `entity_type` | Whether the event relates to a `person` or a `role` |
| `entity_id` | The person_id or role_id affected |
| `previous_value` | Value before the change (empty for hires) |
| `new_value` | Value after the change (empty for departures) |
| `effective_date` | When the event took effect (YYYY-MM-DD) |
| `description` | Human-readable summary of the event |

**Invalid rows for testing:**
- E100 — references non-existent person P200
- E101 — missing `effective_date`
