/*
  # Initial Database Setup

  ## Summary
  Creates the core tables for the icreate.africa platform including user profiles, sparks (posts), and messages.

  ## Tables Created

  1. **profiles** - User profile information
     - `id` (text, primary key) - Unique user identifier
     - `name` (text) - User's full name
     - `username` (text, unique) - Unique username
     - `email` (text) - User email address
     - `password` (text) - User password (hashed)
     - `country`, `state`, `city` (text) - Location information
     - `birth_year`, `birth_month`, `birth_day` (integer) - Date of birth
     - `gender` (text) - User gender
     - `occupation` (text) - User occupation
     - `profile_pic_url` (text) - Profile picture URL
     - `show_age` (boolean) - Whether to display age
     - `bio` (text) - User biography
     - `coins` (integer) - Token/coins balance
     - `is_admin` (boolean) - Admin status flag
     - `created_at` (timestamptz) - Account creation timestamp

  2. **sparks** - User posts/content
     - `id` (bigint, primary key) - Unique spark identifier
     - `user_id` (text) - Reference to user
     - `name`, `username`, `profile_pic_url` - User info snapshot
     - `caption` (text) - Post caption
     - `media_url` (text) - Media file URL
     - `media_type` (text) - Type of media (image/video)
     - `reach` (text) - Post reach (share/beyond)
     - `spark_type` (text) - Type of spark (new/ongoing)
     - `journey_id` (text) - Journey identifier for linked posts
     - `linked_spark_id` (bigint) - Reference to previous spark in journey
     - `reactions` (jsonb) - Reaction counts
     - `reacted_by` (jsonb) - Users who reacted
     - `is_admin_post` (boolean) - Whether posted by admin
     - `pinned` (boolean) - Whether pinned to top
     - `admin_post_type` (text) - Admin posting mode
     - `created_at` (timestamptz) - Post creation timestamp

  3. **messages** - User-to-user messaging
     - `id` (bigserial, primary key) - Message identifier
     - `from_username` (text) - Sender username
     - `to_username` (text) - Recipient username
     - `content` (text) - Message content
     - `read` (boolean) - Read status
     - `created_at` (timestamptz) - Message timestamp

  4. **incident_reports** - User-reported incidents
     - `id` (bigserial, primary key) - Report identifier
     - `reporter_username` (text) - Reporter username
     - `reported_username` (text) - Reported user username
     - `report_type` (text) - Type of incident
     - `description` (text) - Incident description
     - `chat_context` (text) - Chat context
     - `status` (text) - Report status
     - `created_at` (timestamptz) - Report timestamp

  ## Security
  - RLS disabled for application-level security management
  - Indexes added for performance optimization
*/

-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id text PRIMARY KEY,
  name text NOT NULL DEFAULT '',
  username text UNIQUE NOT NULL,
  email text DEFAULT '',
  password text DEFAULT '',
  country text DEFAULT '',
  state text DEFAULT '',
  city text DEFAULT '',
  birth_year integer,
  birth_month integer,
  birth_day integer,
  gender text DEFAULT '',
  occupation text DEFAULT '',
  profile_pic_url text DEFAULT '',
  show_age boolean DEFAULT true,
  bio text DEFAULT '',
  coins integer DEFAULT 1000,
  is_admin boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Create sparks table
CREATE TABLE IF NOT EXISTS sparks (
  id bigint PRIMARY KEY,
  user_id text NOT NULL,
  name text NOT NULL DEFAULT '',
  username text NOT NULL DEFAULT '',
  profile_pic_url text DEFAULT '',
  caption text DEFAULT '',
  media_url text DEFAULT '',
  media_type text DEFAULT 'image',
  reach text DEFAULT 'share',
  spark_type text DEFAULT 'new',
  journey_id text NOT NULL DEFAULT '',
  linked_spark_id bigint,
  reactions jsonb DEFAULT '{"Encourage":0,"Say Hi":0,"Applaud":0,"Keep Going":0}'::jsonb,
  reacted_by jsonb DEFAULT '{"Encourage":[],"Say Hi":[],"Applaud":[],"Keep Going":[]}'::jsonb,
  is_admin_post boolean DEFAULT false,
  pinned boolean DEFAULT false,
  admin_post_type text DEFAULT 'regular',
  created_at timestamptz DEFAULT now()
);

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
  id bigserial PRIMARY KEY,
  from_username text NOT NULL,
  to_username text NOT NULL,
  content text NOT NULL DEFAULT '',
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Create incident_reports table
CREATE TABLE IF NOT EXISTS incident_reports (
  id bigserial PRIMARY KEY,
  reporter_username text NOT NULL,
  reported_username text NOT NULL,
  report_type text NOT NULL DEFAULT 'other',
  description text NOT NULL DEFAULT '',
  chat_context text DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

-- Disable RLS (application handles security)
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE sparks DISABLE ROW LEVEL SECURITY;
ALTER TABLE messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE incident_reports DISABLE ROW LEVEL SECURITY;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS messages_from_idx ON messages (from_username);
CREATE INDEX IF NOT EXISTS messages_to_idx ON messages (to_username);
CREATE INDEX IF NOT EXISTS incident_reports_reporter_idx ON incident_reports (reporter_username);
CREATE INDEX IF NOT EXISTS incident_reports_reported_idx ON incident_reports (reported_username);
CREATE INDEX IF NOT EXISTS incident_reports_status_idx ON incident_reports (status);
CREATE INDEX IF NOT EXISTS sparks_admin_post_idx ON sparks (is_admin_post);
CREATE INDEX IF NOT EXISTS sparks_pinned_idx ON sparks (pinned);
CREATE INDEX IF NOT EXISTS sparks_user_id_idx ON sparks (user_id);
CREATE INDEX IF NOT EXISTS profiles_username_idx ON profiles (username);

-- Create storage bucket for media
INSERT INTO storage.buckets (id, name, public)
  VALUES ('spark-media', 'spark-media', true)
  ON CONFLICT DO NOTHING;

-- Create storage policies
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read spark-media' AND tablename = 'objects') THEN
    CREATE POLICY "Public read spark-media" ON storage.objects FOR SELECT USING (bucket_id = 'spark-media');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anon upload spark-media' AND tablename = 'objects') THEN
    CREATE POLICY "Anon upload spark-media" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'spark-media');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anon update spark-media' AND tablename = 'objects') THEN
    CREATE POLICY "Anon update spark-media" ON storage.objects FOR UPDATE USING (bucket_id = 'spark-media');
  END IF;
END $$;