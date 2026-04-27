create extension if not exists pg_trgm with schema extensions;

create index if not exists customers_area_id_idx on public.customers (area_id);
create index if not exists customers_package_id_idx on public.customers (package_id);
create index if not exists customers_status_idx on public.customers (status);
create index if not exists customers_created_at_idx on public.customers (created_at desc);
create index if not exists customers_customer_code_id_idx on public.customers (customer_code, id);
create index if not exists customers_search_name_trgm_idx on public.customers using gin (full_name gin_trgm_ops);
create index if not exists customers_search_code_trgm_idx on public.customers using gin (customer_code gin_trgm_ops);
create index if not exists customers_search_username_trgm_idx on public.customers using gin (username gin_trgm_ops);

create index if not exists areas_active_sort_idx on public.areas (is_active, type, name);
create index if not exists packages_active_name_idx on public.packages (is_active, name);

create index if not exists staff_area_id_idx on public.staff (area_id);
create index if not exists staff_role_idx on public.staff (role);
create index if not exists staff_is_active_idx on public.staff (is_active);

create index if not exists bills_customer_id_idx on public.bills (customer_id);
create index if not exists bills_collected_by_idx on public.bills (collected_by);
create index if not exists bills_status_idx on public.bills (status);
create index if not exists bills_month_idx on public.bills (month);

create index if not exists complaints_customer_id_idx on public.complaints (customer_id);
create index if not exists complaints_assigned_to_idx on public.complaints (assigned_to);
create index if not exists complaints_status_idx on public.complaints (status);
create index if not exists complaints_opened_at_idx on public.complaints (opened_at desc);
