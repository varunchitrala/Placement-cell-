-- Migration: track whether a student registered online or was added offline by admin
-- Run once on your Neon database

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'online'
  CHECK (source IN ('online', 'offline'));

-- All existing students came through the website
UPDATE students SET source = 'online' WHERE source IS NULL;
