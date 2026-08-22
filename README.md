# Weave - Organisational Change Visualiser

Weave reconstructs and visualises organisational change over time. It accepts structured CSV data describing roles, people, and organisational events, then presents connected historical views showing how roles have evolved and how people have moved through the organisation.

Built for **Lab 2 - People-Centric Tech & Collaboration**, powered by Setel.

## Tech Stack

| Layer    | Technology                    |
|----------|-------------------------------|
| Frontend | HTML, CSS, JavaScript         |
| Backend  | PHP                           |
| Database | MySQL                         |
| Server   | XAMPP (Apache + MySQL)        |

## Features

- **CSV Upload & Data Ingestion** - Upload roles, people, and events CSV files. The system validates, parses, and stores records while flagging problematic rows for manual review.
- **Role History View** - Search for any role and see its complete evolution: title changes, reporting-line shifts, redesignations, and the list of people who have held the role.
- **Person Journey View** - Search for any person and trace their career path: promotions, transfers, department changes, and manager changes over time.
- **Animated Timeline & Org Chart** - Drag a slider to any date and see the org structure at that moment. Play an animation to watch the organisation evolve in real time.
- **Connected Views** - Navigate seamlessly between role history and person journey. Temporal correlations between structural changes and personal movements are highlighted.
- **Data Quality Management** - Review flagged records categorised by issue type, resolve them inline, and track overall data quality with a live percentage score.

## Setup Instructions (XAMPP)

### Prerequisites

- [XAMPP](https://www.apachefriends.org/) installed (includes Apache, MySQL, PHP)

### Steps

1. **Start XAMPP** - Open XAMPP Control Panel and start **Apache** and **MySQL**.

2. **Clone the project** into your XAMPP `htdocs` directory:
   ```bash
   cd C:\xampp\htdocs
   git clone <repository-url> weave
   ```
   Alternatively, copy this project folder into `C:\xampp\htdocs\weave`.

3. **Set up the database** (see section below).

4. **Access the application** at:
   ```
   http://localhost/weave/
   ```

## Database Setup

1. Open **phpMyAdmin** at `http://localhost/phpmyadmin`.
2. Create a new database called `weave`.
3. Select the `weave` database, then go to the **Import** tab.
4. Import the schema file:
   ```
   database/schema.sql
   ```
   This creates all required tables: `roles`, `people`, `events`, `role_assignments`, and `flagged_records`.
5. (Optional) Import sample development data:
   ```
   database/seed.sql
   ```

Alternatively, via command line:
```bash
mysql -u root -p weave < database/schema.sql
mysql -u root -p weave < database/seed.sql
```

## Task Allocation

This project is divided among 4 team members who can work concurrently after the foundation layer is established.

| Member   | Responsibility                      | Key Files                                                                                          |
|----------|-------------------------------------|----------------------------------------------------------------------------------------------------|
| Member 1 | CSV Upload & Data Ingestion         | `api/upload.php`, `api/includes/csv-parser.php`, `api/includes/validator.php`, `pages/upload.html`  |
| Member 2 | Timeline Slider & Org Chart         | `api/orgchart.php`, `assets/js/timeline-slider.js`, `assets/js/orgchart.js`                        |
| Member 3 | Role History & Person Journey       | `api/roles.php`, `api/people.php`, `api/connections.php`                                           |
| Member 4 | Data Quality & Database             | `database/schema.sql`, `api/dataquality.php`, `api/includes/db.php`                                |

### Workflow

1. **Foundation first** - Member 4 sets up the database schema and shared PHP utilities. Any member creates the directory structure and landing page.
2. **Parallel development** - Each member builds their feature area independently.
3. **Integration** - Wire navigation, cross-page links, and run end-to-end testing.

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

## Hackathon Context

This project was developed for **DevLeague 2026 - Lab 2: People-Centric Tech & Collaboration**, powered by Setel. The challenge focuses on building technology solutions that place people at the centre, enabling better understanding of how organisations evolve and how individuals navigate structural change.
