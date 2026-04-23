# LabTrack - Campus Lab Asset Management System

**LabTrack** is a full-stack web application that brings transparency and structure to campus lab operations. It connects asset visualization, complaint workflows, AI-assisted triage, and real-time admin operations into a single system.

---

## Table of Contents

- [System Overview](#system-overview)
- [Architecture](#architecture)
- [User Workflows](#user-workflows)
- [Backend Routes & Endpoints](#backend-routes--endpoints)
- [Database Schema](#database-schema)
- [Services Layer](#services-layer)
- [Real-Time Communication](#real-time-communication)
- [Setup & Deployment](#setup--deployment)
- [API Reference](#api-reference)
- [Key Features](#key-features)

---

## System Overview

LabTrack solves the problem of scattered, untracked lab asset management by creating a single source of truth. Students and staff can report issues in context (visually on a lab map), admins get structured workflows to resolve them, and management gets data to plan maintenance.

### Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18, Vite, Tailwind CSS, Framer Motion, Recharts |
| **Backend** | Node.js, Express.js |
| **Database** | Supabase (PostgreSQL) |
| **Real-time** | Socket.IO |
| **Storage** | Supabase Storage (complaint images) |
| **AI** | Google Gemini API (priority classification) |
| **Export** | ExcelJS, PDFKit, csv-parse |

### Key Stats

- **Deployment**: Frontend on Vite dev server or static build, Backend on Node.js, Database/Storage on Supabase
- **Auth**: JWT-based, role-separated (student/admin)
- **Real-time Sync**: Socket.IO with role and user rooms
- **Data Export**: CSV, Excel, PDF with filters and summaries

---



### System Diagram

```
┌─────────────────────────────────┐
│         Frontend (React)         │
│  - LandingPage                  │
│  - LoginPage                    │
│  - StudentPage (labs + map)     │
│  - AdminPage (dashboard, kanban)│
└──────────────┬──────────────────┘
               │ HTTP/HTTPS (axios)
               │ WebSocket (Socket.IO)
               ▼
┌─────────────────────────────────────────────────────────────┐
│              Backend (Express.js + Node)                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ authRoutes│ │assetRoutes│ │complaints│ │adminRoutes│     │
│  │          │ │          │ │ routes   │ │          │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│        ↓            ↓            ↓            ↓              │
│  ┌────────────────────────────────────────┐                │
│  │  Middleware: JWT Auth & Authorization  │                │
│  └────────────────────────────────────────┘                │
│        ↓            ↓            ↓            ↓              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Services: Supabase, AI, Socket.IO                    │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
               │                      │
        HTTP   │                      │ WebSocket
               ▼                      ▼
    ┌──────────────────┐    ┌──────────────────┐
    │  Supabase        │    │  Socket.IO Server│
    │  (PostgreSQL)    │    │  (Real-time sync)│
    │  (Storage)       │    └──────────────────┘
    └──────────────────┘
```

### Request Flow

1. **User opens browser** → Frontend loads from Vite dev server
2. **User logs in** → `POST /api/auth/login` → JWT issued → stored in localStorage
3. **User navigates to dashboard** → Protected routes verify JWT
4. **Student views labs** → `GET /api/assets/labs` → loaded from Supabase
5. **Student selects a PC** → `GET /api/assets/detail/:systemId` → detailed asset view
6. **Student files complaint** → `POST /api/complaints` → image uploaded → AI classifies → socket emitted
7. **Admin receives update** → Socket.IO emits to admin room → dashboard refreshes
8. **Admin moves complaint on kanban** → `PATCH /api/admin/kanban/:id` → asset status updated → history logged → student notified via notification

---

## User Workflows

### Student Workflow

```
1. Landing Page (public)
   ├─ View live snapshot (working/faulty/maintenance percentages)
   ├─ See labs and their status
   └─ Read recent activity

2. Login
   ├─ Enter email and password
   └─ Choose "Student" role tab

3. Student Portal (authenticated)
   ├─ "Current Arena" Tab
   │  ├─ Select a lab from tabs
   │  ├─ View lab visualization (grid of PCs)
   │  │  ├─ Green = working
   │  │  ├─ Red = faulty
   │  │  └─ Amber = maintenance
   │  ├─ Click a PC node
   │  │  ├─ Right panel shows "PC Details"
   │  │  │  └─ System ID, CPU, RAM, status, etc.
   │  │  ├─ Switch to "Timeline" tab
   │  │  │  ├─ View active complaints (pending/in_progress)
   │  │  │  ├─ View past complaints (resolved)
   │  │  │  ├─ Support existing complaint with +1 button
   │  │  │  └─ See asset events (purchase, maintenance, complaints)
   │  │  └─ Click "Report an Issue" button
   │  │     ├─ Modal opens
   │  │     ├─ Student writes description
   │  │     ├─ Optionally attach image (JPG/PNG/WEBP)
   │  │     ├─ Backend AI classifies priority
   │  │     └─ Complaint created, asset marked faulty
   │  └─ Search by system ID or original ID
   │
   └─ "My Complaints" Tab
      ├─ List of all student's submitted complaints
      ├─ Filter by status, priority, lab, section, date range
      ├─ Sort by newest, oldest, priority
      └─ See complaint details and status history

4. Notifications
   ├─ Bell icon in header
   ├─ Receive when admin resolves complaint
   ├─ Real-time push via Socket.IO
   └─ Mark as read (if implemented)
```

### Admin Workflow

```
1. Login
   ├─ Enter email and password
   └─ Choose "Admin" role tab

2. Admin Control Center (authenticated)
   ├─ "Dashboard" Tab
   │  ├─ KPI cards (total assets, faulty count, open complaints)
   │  ├─ Charts
   │  │  ├─ Complaints by lab (bar chart)
   │  │  ├─ Status breakdown (pending/in_progress/resolved)
   │  │  └─ Update in real-time as complaints change
   │  ├─ Export Section
   │  │  ├─ Select data type (complaints, inventory, both)
   │  │  ├─ Select format (CSV, Excel, PDF)
   │  │  ├─ Apply filters (lab, section, category, date range, priority, status)
   │  │  ├─ Click export button
   │  │  └─ Download file (CSV, XLSX, or PDF)
   │  └─ Import Section (if CSV uploaded)
   │     ├─ Bulk import assets from CSV/Excel file
   │     ├─ Validation and duplicate detection
   │     └─ Feedback on imported/skipped rows
   │
   ├─ "Complaints" Tab (Kanban Board)
   │  ├─ Three columns: Pending | In Progress | Resolved
   │  ├─ Urgent complaints section (top)
   │  │  ├─ Shows complaints breaching or near SLA
   │  │  ├─ Color-coded: breached (red) vs near breach (amber)
   │  │  ├─ Shows age in hours/days
   │  │  └─ Quick "Focus in Board" button
   │  ├─ Kanban Filters
   │  │  ├─ Search by system ID, issue description, student name
   │  │  ├─ Filter by status, priority, affected students count
   │  │  ├─ Filter by lab, section
   │  │  ├─ Filter by date range
   │  │  └─ Sort by newest, oldest, priority high-low, priority low-high
   │  ├─ Card (each complaint)
   │  │  ├─ System ID and location
   │  │  ├─ Student name and email
   │  │  ├─ Priority badge
   │  │  ├─ Support count
   │  │  ├─ Issue description
   │  │  ├─ Drag to move between columns
   │  │  └─ Click to see full details
   │  └─ On Move (drag & drop)
   │     ├─ Backend updates complaint status
   │     ├─ Asset status changes accordingly:
   │     │  ├─ pending or in_progress → asset faulty
   │     │  ├─ in_progress → asset maintenance
   │     │  └─ resolved → asset working/maintenance/faulty (auto-detect)
   │     ├─ History event logged
   │     ├─ Student notified (if resolved)
   │     ├─ Real-time update broadcast via Socket.IO
   │     └─ Dashboard refreshes
   │
   └─ Admin Notifications
      ├─ Bell icon in header
      ├─ Receive when new complaint filed
      ├─ Receive when complaint gets +1 support
      ├─ Real-time push via Socket.IO
      └─ Linked to admin control center

3. Admin can perform:
   ├─ View all complaints across all students
   ├─ Move complaint status (state machine)
   ├─ Bulk export data for reporting
   ├─ See complaint-to-asset and asset-to-complaints relationships
   └─ Monitor lab health and response times
```

---

## Backend Routes & Endpoints

### 1. Authentication Routes (`/api/auth`)

#### `POST /api/auth/signup`
- **Public**
- **Body**: `{ name, email, password, role }`
- **Response**: `{ id, name, email, role }`
- **Flow**:
  - Validate required fields
  - Check if email already exists
  - Hash password with bcryptjs (salt 10)
  - Insert into `users` table
  - Return user object (no token)

#### `POST /api/auth/login`
- **Public**
- **Body**: `{ email, password, role }`
- **Response**: `{ token: "JWT", user: { id, name, email, role } }`
- **Flow**:
  - Fetch user by email
  - Compare password hash with bcryptjs
  - Verify role matches (if role provided)
  - Generate JWT (expires 1 day)
  - Return token and user object
  - Frontend stores in localStorage

---

### 2. Asset Routes (`/api/assets`)

#### `GET /api/assets/landing-snapshot`
- **Public** (no auth required)
- **Response**: 
  ```json
  {
    "snapshot": {
      "totalAssets": 124,
      "working": 82,
      "maintenance": 12,
      "faulty": 6,
      "summary": "..."
    },
    "labStatuses": [
      { "id": "LAB 2", "state": "ok|maint|fault" }
    ],
    "recentActivity": ["event 1", "event 2", ...]
  }
  ```
- **Used by**: LandingPage
- **Flow**:
  - Count all assets
  - Count by status
  - Fetch first 12 history events
  - Group complaints by lab
  - Calculate percentages
  - Return snapshot

#### `GET /api/assets/labs`
- **Authenticated** (any role)
- **Response**: 
  ```json
  [
    {
      "lab": "LAB 2",
      "sections": { "2A": 10, "2B": 10 },
      "total": 20,
      "faulty": 2
    }
  ]
  ```
- **Used by**: StudentPage (lab tabs)
- **Flow**:
  - Query all assets
  - Group by lab and section
  - Count total and faulty per lab
  - Return array of lab summaries

#### `GET /api/assets/:lab`
- **Authenticated** (any role)
- **Query**: `q` (optional search term)
- **Response**: Array of assets in that lab
  ```json
  [
    {
      "id": "uuid",
      "system_id": "LAB-2-A-1-1",
      "lab": "LAB 2",
      "section": "2A",
      "row_num": 1,
      "position": 1,
      "status": "working",
      "cpu": "Intel i7",
      "ram": "16GB",
      ...
    }
  ]
  ```
- **Used by**: LabVisualizer (map of PCs)
- **Flow**:
  - Query assets by lab
  - Order by section, row, position (for grid layout)
  - Filter by search term (system_id or original_id) if provided
  - Return asset list

#### `GET /api/assets/detail/:systemId`
- **Authenticated** (any role)
- **Response**: 
  ```json
  {
    "asset": { id, system_id, lab, cpu, ram, status, ... },
    "history": [
      { id, event_type, details, event_date, ... }
    ],
    "complaints": [
      { id, description, priority, status, user_id, users: { name }, ... }
    ]
  }
  ```
- **Used by**: StudentPage (right panel detail view)
- **Flow**:
  - Query asset by system_id
  - Query history events for that asset
  - Query complaints for that asset
  - Enrich complaints with support count
  - Return combined object

---

### 3. Complaint Routes (`/api/complaints`)

#### `GET /api/complaints`
- **Authenticated**
- **Response**: Array of complaints
  - Students only see their own complaints
  - Admins see all complaints
- **Flow**:
  - Query all complaints with asset and user joins
  - Filter by current user if role is student
  - Return complaint list

#### `GET /api/complaints/notifications`
- **Authenticated**
- **Response**: Array of notifications
  - Filter by user role and user ID
- **Used by**: NotificationBell
- **Flow**:
  - Query notifications
  - Filter by role_target and user_id
  - Limit to 25 most recent
  - Return notification list

#### `GET /api/complaints/public-overdue`
- **Public** (no auth required)
- **Query**: `days` (default 3), `limit` (default 6)
- **Response**: Array of old pending/in_progress complaints with age
- **Used by**: LandingPage (showing overdue issues to public)
- **Flow**:
  - Calculate cutoff date (days ago)
  - Query pending and in_progress complaints before cutoff
  - Calculate age in days
  - Limit to N results
  - Return overdue complaints

#### `POST /api/complaints`
- **Authenticated** (student only)
- **Body**: `{ assetId, description, priority (optional), image (optional multipart) }`
- **Response**: Created complaint object
- **This is a critical endpoint. Full flow:**
  1. **Validate** asset and description exist
  2. **Image Upload** (if provided):
     - Upload to Supabase Storage (complaint-images bucket)
     - Get public URL
  3. **AI Classification**:
     - Call Gemini API with complaint description
     - Extract priority (Low/Medium/High)
     - Fallback to Medium if Gemini unavailable
  4. **Create Complaint**:
     - Insert into complaints table with status='pending'
     - Store both priority (user-provided or AI) and ai_priority
  5. **Update Asset Status**:
     - Mark asset as 'faulty'
  6. **Log History Event**:
     - Insert into history table with event_type='Complaint Logged'
  7. **Create Notification**:
     - Insert into notifications table (role_target='admin')
  8. **Emit Socket Update**:
     - Broadcast to admin room: complaint_created event
  9. **Return** created complaint object

#### `POST /api/complaints/:id/plus`
- **Authenticated** (student only)
- **Body**: `{ }` (empty)
- **Response**: Updated complaint with support count
- **This allows students to "+1" an existing complaint (indicate they have same issue):**
  1. **Validate**:
     - Complaint exists
     - Complaint not resolved
     - User is not the reporter
     - User hasn't already supported this complaint
  2. **Update**:
     - Add user_id to supporter_ids array
     - Increment support_count
  3. **Log History Event**:
     - Insert into history table with event_type='Complaint +1'
  4. **Create Notification**:
     - Insert into notifications (role_target='admin')
  5. **Emit Socket Update**:
     - Broadcast to admin room and reporter's user room
  6. **Return** updated complaint

---

### 4. Admin Routes (`/api/admin`)

#### `GET /api/admin/dashboard`
- **Authenticated** (admin only)
- **Response**:
  ```json
  {
    "totals": {
      "assets": 124,
      "faulty": 6,
      "complaints": 8
    },
    "complaintsPerLab": [
      { "name": "LAB 2", "value": 3 }
    ],
    "byStatus": [
      { "name": "pending", "value": 2 },
      { "name": "in_progress", "value": 4 },
      { "name": "resolved", "value": 2 }
    ]
  }
  ```
- **Used by**: AdminPage (dashboard charts)
- **Flow**:
  - Count total assets
  - Count faulty assets
  - Fetch all complaints (with joins to assets)
  - Group by lab and status
  - Return metrics

#### `GET /api/admin/kanban`
- **Authenticated** (admin only)
- **Response**: Array of all complaints with asset and user joins
- **Used by**: KanbanBoard
- **Flow**:
  - Query complaints with nested asset and user data
  - Order by created_at descending
  - Return complaint list (frontend filters into columns)

#### `PATCH /api/admin/kanban/:id`
- **Authenticated** (admin only)
- **Body**: `{ status }` (pending | in_progress | resolved)
- **Response**: Updated complaint object
- **This is a critical endpoint. Full flow:**
  1. **Validate**:
     - Status is in allowed list
     - Complaint exists
     - Complaint not already resolved (state machine lock)
  2. **Update Complaint**:
     - Set status and updated_at timestamp
  3. **Update Asset Status** (complex logic):
     - If moving to 'resolved':
       - Query remaining pending/in_progress complaints for this asset
       - If others exist in in_progress → asset becomes 'maintenance'
       - Else if others exist in pending → asset becomes 'faulty'
       - Else → asset becomes 'working'
     - If moving to 'pending' or 'in_progress':
       - Asset becomes 'faulty' (or 'maintenance' if in_progress)
  4. **Log History Event**:
     - Insert into history table with event_type and details
  5. **Create Notification** (if resolved):
     - Insert into notifications targeting the student
     - Message: "Your complaint has been resolved"
  6. **Emit Socket Updates**:
     - Broadcast to admin room: complaint_updated
     - Broadcast to student's user room: complaint_resolved (or complaint_updated)
  7. **Return** updated complaint

#### `GET /api/admin/notifications`
- **Authenticated** (admin only)
- **Response**: Array of notifications for admins
- **Flow**:
  - Query notifications where role_target='admin' or role_target IS NULL
  - Limit to 20 most recent
  - Return notification list

#### `POST /api/admin/import`
- **Authenticated** (admin only)
- **Body**: Multipart form data with file (CSV or Excel)
- **Response**: `{ imported, skippedDuplicates, validationErrors }`
- **Flow**:
  1. **Parse File**:
     - Detect if CSV or Excel
     - Parse into rows with columns (system_id, original_id, lab, section, row_num, position, status, cpu, ram, purchase_date, last_maintenance, etc.)
  2. **Validate**:
     - Check required fields (system_id, original_id, lab, section)
     - Detect duplicates within file
     - Log validation errors
  3. **Deduplicate**:
     - Query existing assets by system_id
     - Filter out rows that already exist in DB
  4. **Insert**:
     - Bulk insert final rows into assets table
  5. **Return** summary

#### `GET /api/admin/export`
- **Authenticated** (admin only)
- **Query Params**:
  ```
  ?format=csv|excel|pdf
  &dataType=inventory|complaints|both
  &lab=LAB%202
  &section=2A
  &category=...
  &status=pending|in_progress|resolved
  &assetStatus=working|faulty|maintenance
  &priority=Low|Medium|High
  &search=...
  &from=2024-01-01
  &to=2024-01-31
  ```
- **Response**: File download (blob) or PDF stream
- **Flow**:
  1. **Parse Filters**:
     - Extract and normalize all query params
     - Convert dates to ISO format (start of day and end of day)
  2. **Fetch Inventory** (if dataType includes inventory):
     - Query assets with filters applied
     - Join with complaints to get counts
     - Format dates and compute complaint stats
  3. **Fetch Complaints** (if dataType includes complaints):
     - Query complaints with filters
     - Join with assets and users
     - Fetch history events for timeline
     - Build status history timeline
     - Calculate affected students count
  4. **Format & Render**:
     - **CSV**: Build CSV string with proper escaping
     - **Excel**: Use ExcelJS to create workbook with sheets, frozen header, auto-filter
     - **PDF**: Use PDFKit to create formatted document with sections, summaries, detailed cards
  5. **Stream Response**:
     - Set appropriate headers (Content-Type, Content-Disposition)
     - Send file to client
     - Trigger browser download

---

## Database Schema

### Tables Overview

All tables use `uuid` primary keys with auto-generation via `gen_random_uuid()`.

#### `users` Table
```sql
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  role user_role NOT NULL DEFAULT 'student',  -- ENUM: 'student', 'admin'
  created_at timestamptz DEFAULT now()
);
```
- **Purpose**: Store user accounts and authentication
- **Indexes**: Email is unique
- **Roles**: 
  - `student`: Can view assets, file complaints, support complaints, view notifications
  - `admin`: Can manage complaints, view analytics, export data, import assets, send notifications

#### `assets` Table
```sql
CREATE TABLE assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  system_id text UNIQUE NOT NULL,           -- e.g., "LAB-2-A-1-1"
  original_id text UNIQUE NOT NULL,         -- e.g., "PC-00123"
  lab text NOT NULL,                        -- e.g., "LAB 2"
  section text NOT NULL,                    -- e.g., "2A"
  row_num int NOT NULL,
  position int NOT NULL,
  status asset_status NOT NULL DEFAULT 'working',  -- ENUM: 'working', 'faulty', 'maintenance'
  cpu text NOT NULL,                        -- e.g., "Intel i7-10700K"
  ram text NOT NULL,                        -- e.g., "16GB DDR4"
  purchase_date date NOT NULL,
  last_maintenance date NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_assets_lab_section ON assets(lab, section);
CREATE INDEX idx_assets_system_original ON assets(system_id, original_id);
```
- **Purpose**: Store inventory of lab computers
- **Status Flow**:
  - Starts as `working`
  - Becomes `faulty` when complaint filed or moved to pending/in_progress
  - Becomes `maintenance` when complaint moved to in_progress
  - Returns to `working` or `maintenance` when all complaints resolved
- **Location**: Grid position by lab, section, row, position (for visualizer)

#### `complaints` Table
```sql
CREATE TABLE complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  description text NOT NULL,                -- Issue description from student
  priority priority_level NOT NULL DEFAULT 'Medium',  -- ENUM: 'Low', 'Medium', 'High'
  ai_priority priority_level,               -- Priority from Gemini classification
  image_url text,                           -- URL to complaint image in Storage
  status complaint_status NOT NULL DEFAULT 'pending',  -- ENUM: 'pending', 'in_progress', 'resolved'
  support_count int NOT NULL DEFAULT 0,     -- How many other students +1'd this
  supporter_ids uuid[] NOT NULL DEFAULT '{}',  -- Array of user IDs who supported
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_complaints_status_priority ON complaints(status, priority);
CREATE INDEX idx_complaints_created_at ON complaints(created_at);
CREATE INDEX idx_complaints_asset_status_created ON complaints(asset_id, status, created_at DESC);
```
- **Purpose**: Store issue reports filed by students
- **Workflow**:
  - Created as `pending` → Admin sees in Pending column
  - Moved to `in_progress` by admin → Asset becomes maintenance
  - Moved to `resolved` by admin → Asset auto-status calculated → Student notified
  - Cannot move backward from `resolved` (state machine lock)
- **Support Mechanism**:
  - Other students can "+1" a complaint to indicate they have the same issue
  - `support_count` increments, `supporter_ids` array grows
  - Increases visibility for admin

#### `history` Table
```sql
CREATE TABLE history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  event_type text NOT NULL,                 -- e.g., 'Complaint Logged', 'Resolved'
  details text NOT NULL,                    -- Descriptive message
  event_date timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_history_asset_date ON history(asset_id, event_date DESC);
```
- **Purpose**: Audit trail for each asset
- **Event Types**:
  - `Complaint Logged`: Student filed complaint
  - `Complaint +1`: Student supported existing complaint
  - `Complaint Status Updated`: Admin moved to different status
  - `Complaint Resolved`: Complaint marked resolved
  - `Purchase`, `Maintenance`: Seeded data events

#### `notifications` Table
```sql
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  message text NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  role_target user_role,                    -- If NULL, targets everyone; if set, targets role
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_notifications_user_role_created ON notifications(user_id, role_target, created_at DESC);
```
- **Purpose**: Notifications for students and admins
- **Targeting**:
  - `role_target='admin', user_id=null` → All admins
  - `role_target='student', user_id=<uuid>` → Specific student
  - `role_target=null` → All users
- **Use Cases**:
  - New complaint filed → Notify all admins
  - Complaint resolved → Notify specific student
  - Complaint received +1 → Notify all admins

---

## Services Layer

### Supabase Service (`backend/src/services/supabase.js`)

```javascript
// Creates and exports Supabase client
// Uses environment variables:
//   - SUPABASE_URL: Base URL for Supabase project
//   - SUPABASE_SERVICE_ROLE_KEY: Service role key with full RLS bypass
// 
// Auth mode disabled (persistSession: false, autoRefreshToken: false)
// because backend is stateless and uses service role for server-side operations
```

**Key Points**:
- Service role key has full database and storage access (bypass RLS)
- Frontend uses a separate publishable key (if used) for client-side ops
- All queries go through this singleton instance
- Errors are thrown up to Express error handler

**Used by**: Every route that needs database access

---

### AI Service (`backend/src/services/aiService.js`)

```javascript
export const classifyComplaint = async (description) => {
  // Calls Google Gemini API
  // Prompt: "Analyze this lab complaint and return only: Low, Medium, or High. Complaint: {description}"
  // Returns: { priority: 'Low'|'Medium'|'High', source: 'gemini'|'fallback' }
  
  // Fallback: If GEMINI_API_KEY not set or API fails, return 'Medium'
}
```

**Key Points**:
- Runs on each complaint creation (not retroactive)
- Classifies based on issue severity keywords
- Fallback ensures system works without AI (graceful degradation)
- Result stored separately in `ai_priority` field
- User can override with manual priority selection

**Example**:
- Input: "Screen is completely black, can't boot"
- Output: `{ priority: 'High', source: 'gemini' }`

---

### Socket.IO Service (`backend/src/services/socket.js`)

```javascript
// Initializes Socket.IO server on HTTP server
// Handles real-time bidirectional communication

// Socket Connection Flow:
// 1. Client connects with JWT token in auth object
// 2. Server extracts token, verifies JWT
// 3. Socket user context set (id, role, email)
// 4. Socket joins rooms:
//    - role:{role}  → e.g., role:admin, role:student
//    - user:{userId} → e.g., user:550e8400-e29b-41d4-a716-446655440000
// 5. Socket emits 'labtrack:connected' event to client

// Emission Functions:
export const emitRoleUpdate = (role, payload) => {
  // Sends to all sockets in role:{role} room
  // Used for: admin dashboard updates, kanban changes
}

export const emitUserUpdate = (userId, payload) => {
  // Sends to all sockets in user:{userId} room
  // Used for: student notifications, personal complaint updates
}
```

**Room Structure**:
- **Role Rooms**: `role:admin`, `role:student`
  - All users with that role automatically joined
  - Used for broadcast updates (e.g., new complaint to all admins)
- **User Rooms**: `user:<uuid>`
  - One-to-one targeting
  - Used for personal notifications (e.g., complaint resolved just for that student)

**Events**:
- **Client receives**: `labtrack:update` with payload `{ type, complaintId, assetId, userId, status, ... }`
- **Example Payload**:
  ```json
  {
    "type": "complaint_updated",
    "complaintId": "550e8400-e29b-41d4-a716-446655440000",
    "assetId": "550e8400-e29b-41d4-a716-446655440001",
    "status": "in_progress"
  }
  ```

**Frontend Integration** (`frontend/src/lib/socket.js`):
```javascript
const socket = getSocket(token);
socket.on('labtrack:update', (payload) => {
  // Refresh local state or re-fetch from API
  // Triggers dashboard/board re-render
});
```

---

### Authentication Middleware (`backend/src/middleware/auth.js`)

```javascript
// middleware/auth.js
export const authenticate = (req, res, next) => {
  // Extracts JWT from "Authorization: Bearer <token>" header
  // Verifies token against JWT_SECRET
  // Sets req.user = decoded payload (id, email, role, name)
  // Passes to next middleware or route handler
  
  // Throws 401 if missing or invalid
}

export const authorize = (...roles) => (req, res, next) => {
  // Checks if req.user.role is in allowed roles
  // Used as: router.use(authenticate, authorize('admin'))
  
  // Throws 403 if not authorized
}
```

**Example Usage**:
```javascript
// Only admin route
router.get('/admin/dashboard', authenticate, authorize('admin'), (req, res) => {
  // req.user guaranteed to have role='admin'
});

// Student or admin
router.get('/assets', authenticate, (req, res) => {
  // Any authenticated user
  // Check role inside handler if needed
});
```

---

## Real-Time Communication

### Socket.IO Event Flow

1. **Student Files Complaint**:
   ```
   POST /api/complaints
   ├─ Create complaint row
   ├─ Update asset to faulty
   ├─ Log history event
   ├─ Create notification
   └─ emitRoleUpdate('admin', {
        type: 'complaint_created',
        complaintId: '...',
        assetId: '...'
      })
   
   Socket.IO Broadcast
   ├─ All admins receive 'labtrack:update' event
   └─ Frontend: Load new kanban card
   ```

2. **Admin Moves Complaint**:
   ```
   PATCH /api/admin/kanban/:id { status: 'in_progress' }
   ├─ Update complaint status
   ├─ Update asset status to maintenance
   ├─ Log history event
   ├─ emitRoleUpdate('admin', { type: 'complaint_updated' })
   ├─ emitUserUpdate(student_id, { type: 'complaint_updated' })
   └─ emitUserUpdate(student_id, { type: 'complaint_resolved' })
      (if status === 'resolved')
   
   Socket.IO Broadcasts
   ├─ Admin room: Card moves between columns
   └─ Student room: Notification + real-time update
   ```

3. **Frontend Socket Listeners** (StudentPage & AdminPage):
   ```javascript
   useEffect(() => {
     const socket = getSocket(session?.token);
     
     socket.on('labtrack:update', async (payload) => {
       // Refresh all relevant data
       await loadAssets();
       await loadComplaints();
       await refreshSelectedDetail();
     });
     
     return () => {
       socket.off('labtrack:update', handleUpdate);
     };
   }, [session?.token]);
   ```

---

## Setup & Deployment

### Environment Variables

**Backend** (`.env` in `backend/`):
```
PORT=4000
FRONTEND_URL=http://localhost:5173

JWT_SECRET=your_very_secret_key_min_32_chars

SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
SUPABASE_BUCKET=complaint-images

GEMINI_API_KEY=AIzaSyD...
```

**Frontend** (`.env` in `frontend/`):
```
VITE_API_URL=http://localhost:4000/api
VITE_SOCKET_URL=http://localhost:4000
```

### Database Setup

1. Create Supabase project
2. Run SQL files in order:
   ```bash
   supabase/schema.sql
   supabase/seed.sql
   ```
3. Create storage bucket `complaint-images` with public read policy

### Local Development

```bash
# Root
npm install

# Run both frontend and backend with live reload
npm run dev

# Frontend only
npm run dev -w frontend

# Backend only
npm run dev -w backend
```

**Frontend**: http://localhost:5173
**Backend**: http://localhost:4000
**API**: http://localhost:4000/api

### Seeded Credentials

```
Admin:   admin@labtrack.edu / Password@123
Student: student@labtrack.edu / Password@123
```

### Lab Topology (Seeded)

- **LAB 2**: Sections 2A, 2B, 2C | 2 rows × 10 PCs = 60 total
- **LAB 3A**: Sections L, R | 4 × 4 grid = 32 total
- **LAB 3B**: Sections L, R | 4 × 4 grid = 32 total
- **Status**: ~70% working, ~20% faulty, ~10% maintenance

---

## API Reference

### Authentication

| Method | Endpoint | Auth | Body | Response |
|--------|----------|------|------|----------|
| POST | `/api/auth/signup` | ❌ | `{ name, email, password, role }` | `{ id, name, email, role }` |
| POST | `/api/auth/login` | ❌ | `{ email, password, role }` | `{ token, user }` |

### Assets

| Method | Endpoint | Auth | Response |
|--------|----------|------|----------|
| GET | `/api/assets/landing-snapshot` | ❌ | Snapshot data |
| GET | `/api/assets/labs` | ✅ | Lab list with sections and counts |
| GET | `/api/assets/:lab` | ✅ | Assets in lab (searchable by system_id) |
| GET | `/api/assets/detail/:systemId` | ✅ | Asset detail + history + complaints |

### Complaints

| Method | Endpoint | Auth | Body | Response |
|--------|----------|------|------|----------|
| GET | `/api/complaints` | ✅ | - | Student's complaints or all (if admin) |
| GET | `/api/complaints/public-overdue` | ❌ | - | Overdue complaints |
| GET | `/api/complaints/notifications` | ✅ | - | User's notifications |
| POST | `/api/complaints` | ✅ | `{ assetId, description, priority?, image? }` | Created complaint |
| POST | `/api/complaints/:id/plus` | ✅ | - | Updated complaint with support |

### Admin

| Method | Endpoint | Auth | Body | Response |
|--------|----------|------|------|----------|
| GET | `/api/admin/dashboard` | ✅ Admin | - | KPI totals and charts data |
| GET | `/api/admin/kanban` | ✅ Admin | - | All complaints for kanban |
| PATCH | `/api/admin/kanban/:id` | ✅ Admin | `{ status }` | Updated complaint |
| GET | `/api/admin/notifications` | ✅ Admin | - | Admin notifications |
| POST | `/api/admin/import` | ✅ Admin | File (CSV/Excel) | Import summary |
| GET | `/api/admin/export` | ✅ Admin | Query filters | CSV/Excel/PDF file |

---

## Key Features

### 1. Visual Asset Map
- Interactive grid of lab computers
- Real-time status indication (working/faulty/maintenance)
- Click-to-inspect detail panel
- Search by system ID or original ID
- Responsive to status changes via Socket.IO

### 2. Complaint Workflow
- Student submits issue with optional image attachment
- AI auto-classifies priority (Gemini)
- Admin kanban: drag-and-drop status management
- State machine prevents resolved complaints from moving backward
- Support mechanism (+1) aggregates duplicate issues
- Auto-notification when resolved

### 3. Real-Time Sync
- WebSocket broadcasts to admins when new complaint filed
- Instant board refresh when status moved
- Student notified immediately when complaint resolved
- No page refresh needed

### 4. Data Export
- CSV: Full raw data for spreadsheet analysis
- Excel: Formatted workbook with frozen header and auto-filter
- PDF: Admin-ready report with summaries and detailed cards
- Filters: Lab, section, category, status, priority, date range, search

### 5. Audit Trail
- Every asset change logged to history table
- Timeline visible to students and admins
- Timestamps and actor information captured
- Used for reporting and accountability

---

## Troubleshooting

### Common Issues

**Frontend shows "Failed to load assets"**:
- Check `VITE_API_URL` environment variable
- Verify backend is running on port 4000
- Check CORS in backend (should allow `FRONTEND_URL`)

**JWT token invalid after time**:
- Token expires after 1 day
- User must log in again
- Check `JWT_SECRET` consistency between backend instances

**Complaints not appearing in real-time**:
- Check Socket.IO connection in browser DevTools (Network → WS)
- Verify backend socket.js is properly initialized
- Check browser console for socket errors

**Export file is empty or missing data**:
- Verify filters are applied correctly (check query params)
- Check Supabase query permissions and data integrity
- Test CSV export first (simpler than PDF)

**Gemini AI not classifying priorities**:
- Check `GEMINI_API_KEY` is set in backend .env
- Check API key is valid and has quota
- System falls back to Medium priority if API fails (no error thrown)

---

## Performance & Scalability

### Current Limitations

- **Real-time sync**: Socket.IO single server (no cluster support yet)
- **Database queries**: Limited indexing on complaints and history
- **Export**: Limited to ~200 rows in PDF (by design)
- **Image storage**: No automatic cleanup (storage grows)

### Recommendations

- Use Supabase connection pooling for high load
- Add Redis for session management if scaling
- Implement complaint archival after 30 days
- Add CDN for image storage distribution
- Consider Kafka or Redis Streams for event backlog

---

## Maintenance

### Regular Tasks

1. **Database Backups**: Enable Supabase automated backups
2. **Image Cleanup**: Implement cron job to delete old complaint images
3. **Log Rotation**: Check backend logs for errors
4. **Dependency Updates**: Keep npm packages current for security
5. **Monitoring**: Set up Supabase metrics alerts

### Backup & Recovery

```bash
# Export via Supabase CLI
supabase db dump --db-url postgres://... > backup.sql

# Restore
psql < backup.sql
```

---

## Contributing

When extending LabTrack:

1. **New Routes**: Add to appropriate router file, follow existing patterns
2. **Database Changes**: Update schema.sql, manage migrations
3. **Socket Events**: Use `emitRoleUpdate()` or `emitUserUpdate()` with clear payload
4. **Frontend Changes**: Test real-time sync with Socket.IO
5. **Export Features**: Add columns to INVENTORY_COLUMNS or COMPLAINT_COLUMNS arrays

---

## License

LabTrack © 2024. Campus Lab Management System.

---

**Created**: April 2026  
**Last Updated**: April 16, 2026  
**Status**: Active Development
