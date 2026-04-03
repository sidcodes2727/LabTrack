# LabTrack - Campus Lab Asset Management System

LabTrack is a full-stack SaaS-style web app for campus lab asset visualization, issue reporting, and admin operations.

## Stack

- Frontend: React + Vite + Tailwind CSS + Framer Motion + Recharts
- Backend: Node.js + Express
- Database/Storage: Supabase (PostgreSQL + Storage)
- AI classification: Gemini API

## Features

- Role-based auth (Student/Admin)
- Lab visualization with real layout-style PC nodes
- Search by system ID and original ID
- Asset detail panel + timeline
- Complaint submission with optional image upload (JPG/PNG/WEBP)
- AI-powered priority classification (Low/Medium/High)
- Admin kanban (Pending/In Progress/Resolved) with drag-and-drop
- Dashboard analytics charts
- Import assets from CSV/Excel with validation + duplicate detection
- Export complaints to CSV/Excel/PDF with filters
- Notification center and toast feedback

## Project Structure

- `frontend` - React app
- `backend` - Express API
- `supabase/schema.sql` - DB schema
- `supabase/seed.sql` - deterministic seed data for labs/assets

## Setup

1. Install dependencies from project root:
   - `npm install`

2. Configure backend environment:
   - Copy `backend/.env.example` to `backend/.env`
   - Fill values:
     - `JWT_SECRET`
     - `SUPABASE_URL`
     - `SUPABASE_SERVICE_KEY`
     - `SUPABASE_BUCKET` (default: complaint-images)
     - `GEMINI_API_KEY`

3. Create Supabase schema:
   - Run SQL in order:
     - `supabase/schema.sql`
     - `supabase/seed.sql`

4. Start application:
   - `npm run dev`

5. URLs:
   - Frontend: `http://localhost:5173`
   - Backend: `http://localhost:4000`

## Seeded Accounts

- Admin: `admin@labtrack.edu` / `Password@123`
- Student: `student@labtrack.edu` / `Password@123`

## Lab Topology Seeded

- LAB 2
  - Sections: 2A, 2B, 2C
  - Layout: 2 rows x 9 PCs per section
  - Total: 54
- LAB 3A and LAB 3B
  - Sections: L, R
  - Layout: 4 x 4 grid per section
  - Total: 32 each

Status distribution is seeded close to 70% working, 20% faulty, 10% maintenance.

## Notes

- Complaint image uploads are stored in Supabase Storage bucket `complaint-images`.
- Export API supports filters via query params: `lab`, `date range`, `status`, `priority`, `section`.
- If Gemini key is missing, backend falls back to Medium priority.
