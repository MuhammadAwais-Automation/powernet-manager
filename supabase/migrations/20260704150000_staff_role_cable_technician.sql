-- Allow cable_technician in staff.role check constraint
BEGIN;

UPDATE public.staff
SET role = 'cable_technician'
WHERE role = 'cable_operator';

ALTER TABLE public.staff DROP CONSTRAINT IF EXISTS staff_role_check;

ALTER TABLE public.staff
  ADD CONSTRAINT staff_role_check
  CHECK (role IN (
    'admin',
    'complaint_manager',
    'technician',
    'cable_technician',
    'recovery_agent',
    'helper'
  ));

COMMIT;