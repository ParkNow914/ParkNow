-- Add admin_id column to estacionamentos table
ALTER TABLE estacionamentos 
ADD COLUMN admin_id INTEGER REFERENCES admins(id);

-- Update existing records if needed (you may need to adjust this based on your data)
-- UPDATE estacionamentos SET admin_id = [appropriate_admin_id] WHERE admin_id IS NULL;

-- Make the column NOT NULL after ensuring all records have a value
-- ALTER TABLE estacionamentos ALTER COLUMN admin_id SET NOT NULL;
