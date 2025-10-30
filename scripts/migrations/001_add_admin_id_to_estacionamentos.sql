-- Migration to add admin_id column to estacionamentos table
-- This establishes a relationship between estacionamentos and admins tables

-- First, add the column without the foreign key constraint
ALTER TABLE estacionamentos 
ADD COLUMN admin_id INTEGER;

-- Update existing records to have a default admin if needed (optional)
-- For example, you might want to set all existing estacionamentos to be owned by a default admin
-- UPDATE estacionamentos SET admin_id = 1 WHERE admin_id IS NULL;

-- Then add the foreign key constraint
ALTER TABLE estacionamentos 
ADD CONSTRAINT fk_estacionamentos_admins 
FOREIGN KEY (admin_id) 
REFERENCES admins(id) 
ON DELETE SET NULL;
