/*
  # Create profiles table for TreasureTrail users

  1. New Tables
    - `profiles`
      - `id` (uuid, primary key, references auth.users)
      - `username` (text, unique, user's chosen display name)
      - `bio` (text, short user biography)
      - `avatar_url` (text, nullable, URL to profile photo)
      - `favorite_categories` (text array, user's preferred hunting categories)
      - `created_at` (timestamptz, when the profile was created)
      - `updated_at` (timestamptz, last profile update)

  2. Security
    - Enable RLS on `profiles` table
    - Add policy for authenticated users to read their own profile
    - Add policy for authenticated users to insert their own profile
    - Add policy for authenticated users to update their own profile
    - Add policy for authenticated users to read other users' profiles (for social features)

  3. Notes
    - The `id` column references `auth.users(id)` to link profiles to Supabase auth
    - `favorite_categories` stores an array of category strings chosen during onboarding
    - Username has a minimum length constraint of 3 characters
*/

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL CHECK (char_length(username) >= 3),
  bio text DEFAULT '',
  avatar_url text,
  favorite_categories text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can read other profiles for social features"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() != id);
