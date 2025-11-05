-- Migration: merge status_reserva into status and drop status_reserva
-- Date: 2025-11-04

BEGIN;

-- 1) Update status from status_reserva when they differ and status_reserva is not null
UPDATE reservas
SET status = status_reserva
WHERE status_reserva IS NOT NULL
  AND status IS DISTINCT FROM status_reserva;

-- 2) Drop the status_reserva column if it exists
DO $$
BEGIN
    IF EXISTS(
        SELECT 1 FROM information_schema.columns
        WHERE table_name='reservas' AND column_name='status_reserva'
    ) THEN
        ALTER TABLE reservas DROP COLUMN status_reserva;
    END IF;
END$$;

COMMIT;
