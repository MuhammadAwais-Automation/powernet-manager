-- Cable signal type from Excel registers: DECO = digital, ANAL = analog
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS cable_type text;

ALTER TABLE public.customers
  DROP CONSTRAINT IF EXISTS customers_cable_type_check;

ALTER TABLE public.customers
  ADD CONSTRAINT customers_cable_type_check
  CHECK (cable_type IS NULL OR cable_type IN ('digital', 'analog'));

UPDATE public.customers
SET cable_type = 'digital'
WHERE cable_type IS NULL
  AND remarks ILIKE '%Sheet status: DECO%';

UPDATE public.customers
SET cable_type = 'analog'
WHERE cable_type IS NULL
  AND remarks ILIKE '%Sheet status: ANAL%';

COMMENT ON COLUMN public.customers.cable_type IS 'Cable signal: digital (DECO set-top) or analog';
