# Requirements Document

## Introduction

Weave is a full-stack web application that reconstructs and visualises organisational change over time. The application accepts structured CSV data describing roles, people, and organisational events, then presents two connected historical views: how a role has evolved and how a person has moved through the organisation. The application uses an animated timeline slider with an org chart visualisation. A dedicated data quality page allows users to identify and manually resolve incomplete or inconsistent records. Built with HTML/CSS/JS, PHP, and MySQL (XAMPP stack) for a hackathon context (Lab 2 - People-Centric Tech & Collaboration, powered by Setel).

## Glossary

- **Weave_System**: The full-stack web application comprising the frontend (HTML/CSS/JS), backend (PHP), and database (MySQL)
- **CSV_Ingestion_Module**: The component responsible for parsing and importing uploaded CSV files into the database
- **Role_History_View**: The interface that displays the evolution of a specific role over time
- **Person_Journey_View**: The interface that displays a person's movement through the organisation over time
- **Timeline_Slider**: The animated UI control that allows users to navigate temporal data on the org chart
- **Org_Chart_View**: The visual representation of organisational structure at a given point in time
- **Data_Quality_Page**: The dedicated interface for identifying and resolving data inconsistencies
- **Connection_View**: The interface element that shows how a person's journey relates to a role's evolution at shared time points
- **roles.csv**: A CSV file containing role records with fields including role ID, title, department, reporting line, and effective dates
- **people.csv**: A CSV file containing person records with fields including person ID, name, role assignments, and effective dates
- **events.csv**: A CSV file containing organisational event records with fields including event ID, event type, affected entity IDs, and timestamps
- **User**: Any person operating the Weave application to explore organisational history

## Requirements

### Requirement 1: CSV Data Upload

**User Story:** As a User, I want to upload organisational data via CSV files, so that the system can reconstruct historical org structure.

#### Acceptance Criteria

1. THE Weave_System SHALL provide a file upload interface that accepts roles.csv, people.csv, and events.csv files.
2. WHEN a User uploads one or more CSV files, THE CSV_Ingestion_Module SHALL parse each file and store the extracted records in the MySQL database.
3. WHEN a CSV file is uploaded, THE CSV_Ingestion_Module SHALL validate that the file contains the expected column headers before processing rows.
4. IF a CSV file contains rows with missing required fields, THEN THE CSV_Ingestion_Module SHALL flag those rows as requiring manual resolution and continue processing remaining valid rows.
5. WHEN CSV files are uploaded, THE CSV_Ingestion_Module SHALL match records across files using shared ID and name fields.
6. WHEN file upload and processing completes, THE Weave_System SHALL display a summary showing the count of records imported and the count of records flagged for review.

### Requirement 2: Role History Reconstruction

**User Story:** As a User, I want to view the complete history of a specific role, so that I can understand how the role has evolved over time.

#### Acceptance Criteria

1. THE Role_History_View SHALL allow a User to search for and select a specific role by title or role ID.
2. WHEN a User selects a role, THE Role_History_View SHALL display a chronological timeline of changes to that role including title changes, redesignations, reporting-line shifts, and headcount changes.
3. WHEN a role has undergone a title change, THE Role_History_View SHALL display both the previous title and the new title with the effective date of the change.
4. WHEN a role has undergone a reporting-line change, THE Role_History_View SHALL display the previous reporting line and the new reporting line with the effective date.
5. THE Role_History_View SHALL display the list of persons who have occupied the selected role, ordered by assignment date.

### Requirement 3: Person Journey Reconstruction

**User Story:** As a User, I want to view the career journey of a specific person through the organisation, so that I can understand their progression over time.

#### Acceptance Criteria

1. THE Person_Journey_View SHALL allow a User to search for and select a specific person by name or person ID.
2. WHEN a User selects a person, THE Person_Journey_View SHALL display a chronological timeline of changes including promotions, transfers, department changes, and manager changes.
3. WHEN a person has moved between roles, THE Person_Journey_View SHALL display the previous role, the new role, and the effective date of the transition.
4. WHEN a person has changed departments, THE Person_Journey_View SHALL display the previous department, the new department, and the effective date.
5. THE Person_Journey_View SHALL display the person's current role and department at the top of the view.

### Requirement 4: Connected Views

**User Story:** As a User, I want to see how a person's journey connects to a role's evolution, so that I can understand the relationship between individual and structural changes.

#### Acceptance Criteria

1. WHEN a User views a role's history, THE Connection_View SHALL display links to the Person_Journey_View for each person who occupied that role.
2. WHEN a User views a person's journey, THE Connection_View SHALL display links to the Role_History_View for each role that person has held.
3. WHEN a structural change and a person movement share the same time period, THE Connection_View SHALL visually indicate the correlation between the two events.
4. THE Connection_View SHALL allow a User to navigate between the Role_History_View and Person_Journey_View without losing temporal context.

### Requirement 5: Animated Timeline and Org Chart

**User Story:** As a User, I want to explore the organisational structure at different points in time using an animated slider, so that I can observe how the org chart changed over time.

#### Acceptance Criteria

1. THE Timeline_Slider SHALL allow a User to select any date within the range of imported data.
2. WHEN a User moves the Timeline_Slider to a specific date, THE Org_Chart_View SHALL render the organisational structure as it existed on that date.
3. THE Timeline_Slider SHALL provide an animation mode that automatically advances through time at a configurable speed.
4. WHEN the Timeline_Slider advances, THE Org_Chart_View SHALL animate transitions between organisational states showing nodes being added, removed, or repositioned.
5. THE Org_Chart_View SHALL display role titles, occupant names, and reporting lines for each node.
6. WHEN a User clicks a node on the Org_Chart_View, THE Weave_System SHALL navigate to the Role_History_View or Person_Journey_View for that entity.

### Requirement 6: Data Quality Management

**User Story:** As a User, I want a dedicated page to review and resolve data quality issues, so that the visualisations are accurate and complete.

#### Acceptance Criteria

1. THE Data_Quality_Page SHALL display a list of all records flagged during CSV import due to missing fields, unmatched IDs, or inconsistent dates.
2. THE Data_Quality_Page SHALL categorise flagged records by issue type: missing fields, unmatched references, date conflicts, and duplicate records.
3. WHEN a User selects a flagged record, THE Data_Quality_Page SHALL display the original data and the identified issue.
4. THE Data_Quality_Page SHALL allow a User to manually edit field values to resolve flagged issues.
5. WHEN a User submits a resolution for a flagged record, THE Weave_System SHALL re-validate the record and update the database if the record passes validation.
6. THE Data_Quality_Page SHALL display a data quality score as a percentage of total records that are free of issues.

### Requirement 7: Application Structure and Documentation

**User Story:** As a team of 4 developers, I want clear documentation and task allocation, so that we can work on the project concurrently during the hackathon.

#### Acceptance Criteria

1. THE Weave_System SHALL include a README.md file containing a project overview, feature descriptions, setup instructions for XAMPP environment, and task allocation for 4 team members.
2. THE Weave_System SHALL use HTML, CSS, and JavaScript for the frontend presentation layer.
3. THE Weave_System SHALL use PHP for server-side logic and API endpoints.
4. THE Weave_System SHALL use MySQL as the database engine for storing all organisational data.
5. THE Weave_System SHALL organise source code into logical directories separating frontend assets, PHP backend logic, and database schema files.
