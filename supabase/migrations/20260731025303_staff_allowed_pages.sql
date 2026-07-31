-- Per-section dashboard access for custom (non-admin) staff
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS allowed_pages text[] NULL;

COMMENT ON COLUMN public.staff.allowed_pages IS
  'Dashboard page IDs for complaint_manager / custom access. NULL = role default. Ignored for admin (full access).';
