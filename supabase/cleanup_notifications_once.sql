-- Run this script once in Supabase SQL Editor.
-- Purpose: remove legacy notifications created by older app behavior.
-- Safe to run multiple times; after first run it will typically affect 0 rows.

begin;

-- Remove old student notifications that were sent on complaint creation/update.
delete from notifications
where title in (
  'Complaint submitted',
  'Your complaint was updated'
);

-- Remove old admin notifications that were sent on non-creation status updates.
delete from notifications
where title = 'Complaint status updated';

commit;
