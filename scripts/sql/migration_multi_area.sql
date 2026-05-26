-- Database DDL Migration: Staff Multi-Area Assignment Support
-- Run this script in your Supabase SQL Editor (https://supabase.com/dashboard)

BEGIN;

-- 1. Add area_ids text[] column to public.staff table if it doesn't exist
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS area_ids text[] DEFAULT '{}'::text[];

-- 2. Migrate existing single-area area_id values into the new area_ids array column
UPDATE public.staff
SET area_ids = ARRAY[area_id::text]
WHERE area_id IS NOT NULL 
  AND (area_ids IS NULL OR array_length(area_ids, 1) IS NULL OR area_ids = '{}'::text[]);

-- 3. Create index for performance optimization when searching array columns
CREATE INDEX IF NOT EXISTS staff_area_ids_idx ON public.staff USING gin (area_ids);

COMMIT;
