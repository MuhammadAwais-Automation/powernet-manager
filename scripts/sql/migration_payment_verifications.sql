-- Database DDL Migration: Customer Payment Verification Queue
-- Run this script in your Supabase SQL Editor (https://supabase.com/dashboard)

BEGIN;

-- 1. Create a table to act as our pending queue/ledger
CREATE TABLE IF NOT EXISTS public.payment_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id uuid NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  amount integer NOT NULL CHECK (amount > 0),
  method text NOT NULL CHECK (method IN ('bank', 'easypaisa', 'jazzcash', 'other')),
  receipt_url text NOT NULL,          -- Cloudinary screenshot URL
  customer_remarks text,              -- Optional customer note/transaction ID
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  review_note text,                   -- Admin's reason when approving/rejecting
  reviewed_by uuid REFERENCES public.staff(id),
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 2. Add verification columns to the final payments table for historical audits
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS receipt_url text,
  ADD COLUMN IF NOT EXISTS customer_remarks text;

-- 3. Create indices for performance optimization
CREATE INDEX IF NOT EXISTS payment_verifications_status_idx ON public.payment_verifications(status);
CREATE INDEX IF NOT EXISTS payment_verifications_customer_id_idx ON public.payment_verifications(customer_id);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.payment_verifications ENABLE ROW LEVEL SECURITY;

-- 5. Set up RLS policies
DROP POLICY IF EXISTS "Customers can insert their own payment verifications" ON public.payment_verifications;
CREATE POLICY "Customers can insert their own payment verifications" 
  ON public.payment_verifications FOR INSERT 
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.customers 
      WHERE customers.id = customer_id 
        AND customers.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Customers can view their own payment verifications" ON public.payment_verifications;
CREATE POLICY "Customers can view their own payment verifications" 
  ON public.payment_verifications FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.customers 
      WHERE customers.id = customer_id 
        AND customers.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Staff can view/update all payment verifications" ON public.payment_verifications;
CREATE POLICY "Staff can view/update all payment verifications" 
  ON public.payment_verifications FOR ALL 
  TO authenticated
  USING (
    auth.jwt() ->> 'email' LIKE '%@powernet.local' 
    AND auth.jwt() ->> 'email' NOT LIKE 'customer_%'
  )
  WITH CHECK (
    auth.jwt() ->> 'email' LIKE '%@powernet.local' 
    AND auth.jwt() ->> 'email' NOT LIKE 'customer_%'
  );

-- 6. Enable Realtime Replication
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'payment_verifications'
  ) then
    alter publication supabase_realtime add table public.payment_verifications;
  end if;
end $$;

COMMIT;
