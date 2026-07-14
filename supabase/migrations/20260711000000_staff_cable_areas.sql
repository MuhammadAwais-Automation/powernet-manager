-- Add cable_area_ids column to staff table for cable recoveries
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS cable_area_ids uuid[];
