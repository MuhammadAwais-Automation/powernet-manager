-- Allow customers to read staff names only for technicians assigned to their complaints.
-- Safe to run even while auth_all exists on staff; prepares for future RLS hardening.

BEGIN;

DROP POLICY IF EXISTS staff_customer_read_assigned ON public.staff;
CREATE POLICY staff_customer_read_assigned
  ON public.staff
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.complaints c
      JOIN public.customers cu ON cu.id = c.customer_id
      WHERE c.assigned_to = staff.id
        AND cu.auth_user_id = auth.uid()
    )
  );

COMMIT;
