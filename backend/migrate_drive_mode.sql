-- Migration: add mode column to drives table
-- Run once on your Neon database
-- mode: 'offline' (physical, attendance tracked) | 'online' (virtual, no attendance)

ALTER TABLE drives
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'offline'
  CHECK (mode IN ('offline', 'online'));

-- Update all existing drives to offline (safe default)
UPDATE drives SET mode = 'offline' WHERE mode IS NULL;
