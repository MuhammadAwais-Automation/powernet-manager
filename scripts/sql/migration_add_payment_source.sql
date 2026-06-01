-- Migration: Add missing payment_source column to public.bills table
-- This fixes the undefined_column (42703) exception on mobile client query calls.

BEGIN;

-- 1. Add column to public.bills table safely with default value
ALTER TABLE public.bills 
  ADD COLUMN IF NOT EXISTS payment_source text NOT NULL DEFAULT 'manual';

-- 2. Verify column addition (PostgreSQL index/cache reload)
COMMENT ON COLUMN public.bills.payment_source IS 'Tracks the transaction channel/origin (e.g. office, agent, customer, manual)';

COMMIT;
