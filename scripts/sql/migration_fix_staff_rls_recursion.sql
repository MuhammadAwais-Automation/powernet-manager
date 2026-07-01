-- Fix infinite recursion in staff RLS when dashboard users log in.
-- staff_customer_read_assigned queried complaints, whose policies query staff again.

BEGIN;

CREATE OR REPLACE FUNCTION public.customer_can_read_staff(p_staff_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.complaints c
    JOIN public.customers cu ON cu.id = c.customer_id
    WHERE c.assigned_to = p_staff_id
      AND cu.auth_user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.customer_can_read_staff(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_can_read_staff(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_can_read_staff(uuid) TO service_role;

DROP POLICY IF EXISTS staff_customer_read_assigned ON public.staff;
CREATE POLICY staff_customer_read_assigned
  ON public.staff
  FOR SELECT
  TO authenticated
  USING (public.customer_can_read_staff(id));

COMMIT;
