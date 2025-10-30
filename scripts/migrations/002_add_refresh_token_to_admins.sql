-- Migration to add refresh_token_hash column to admins table
-- This is needed for JWT refresh token functionality

-- Add the refresh_token_hash column
ALTER TABLE admins 
ADD COLUMN IF NOT EXISTS refresh_token_hash VARCHAR(255);

-- Add an index for better performance on refresh token lookups
CREATE INDEX IF NOT EXISTS idx_admins_refresh_token ON admins(refresh_token_hash);
