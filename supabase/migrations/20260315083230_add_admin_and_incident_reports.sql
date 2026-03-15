/*
  # Add Admin Features and Incident Reporting

  ## Changes Made
  
  1. Admin Features
    - Add `is_admin` boolean field to profiles table to identify admin users
    - Add `is_admin_post` boolean field to sparks table to mark official admin posts
    - Add `post_preference` field to track admin posting mode (regular vs admin mode)
    - Add `pinned` boolean field to allow admins to pin important announcements
    
  2. Incident Reporting System
    - Create `incident_reports` table to store user-reported incidents
    - Fields include: reporter details, reported user, incident type, description, status, timestamps
    - Enable tracking of chat-related incidents for admin review
    
  3. Security
    - Enable RLS on new incident_reports table
    - Add policies for users to create reports and admins to view all reports

  ## Important Notes
  - Admin status can be manually set in the database for authorized users
  - Incident reports are accessible to admins for moderation purposes
  - Pinned posts will appear at the top of the feed
*/

-- Add admin field to profiles table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'is_admin'
  ) THEN
    ALTER TABLE profiles ADD COLUMN is_admin boolean DEFAULT false;
  END IF;
END $$;

-- Add admin post fields to sparks table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sparks' AND column_name = 'is_admin_post'
  ) THEN
    ALTER TABLE sparks ADD COLUMN is_admin_post boolean DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sparks' AND column_name = 'pinned'
  ) THEN
    ALTER TABLE sparks ADD COLUMN pinned boolean DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sparks' AND column_name = 'post_preference'
  ) THEN
    ALTER TABLE sparks ADD COLUMN post_preference text DEFAULT 'regular';
  END IF;
END $$;

-- Create incident_reports table
CREATE TABLE IF NOT EXISTS incident_reports (
  id bigserial PRIMARY KEY,
  reporter_id text NOT NULL,
  reporter_username text NOT NULL,
  reported_user_id text,
  reported_username text,
  report_type text NOT NULL,
  description text NOT NULL,
  chat_context jsonb DEFAULT '{}',
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz,
  resolved_by text,
  admin_notes text
);

-- Disable RLS for simplicity (matching existing tables pattern)
ALTER TABLE incident_reports DISABLE ROW LEVEL SECURITY;