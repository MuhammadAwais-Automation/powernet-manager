# PowerNet Manager — Full Database Design Spec
**Date:** 2026-04-24  
**Status:** Approved  

---

## Overview

PowerNet Manager is a Next.js + TypeScript ISP management system. Currently all data is hardcoded in `src/lib/data.ts`. This spec covers migrating all data to Supabase PostgreSQL and designing the complete database schema.

**Source data:**
- `APRIL_2026_RAHWALI.xlsx` — 18 civilian areas, ~2500+ customer records
- `APRIL 2026 GARRISON.xlsx` — 8 garrison (army) areas, ~1000+ customer records

---

## Customer Types

Two distinct customer types sharing one table, distinguished by `address_type`:

- **Garrison/Cantt** — Physical text address (e.g. `QTR NO 6/2 F2`, `BOQ NO 3`, `NLC`)
- **Civilian/Rahwali** — ID number assigned by ISP (e.g. `ID NO 14`, `ID NO 39 A`)

---

## Database Schema

### Approach: Single unified `customers` table

One table for all customers. `address_type` enum distinguishes garrison vs civilian. All other tables (areas, packages, staff, bills, complaints) are separate and linked via foreign keys.

---

### Table: `areas`

```sql
areas
├── id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
├── code        text UNIQUE NOT NULL     -- 'AR', 'BZR', 'N-AIT', 'AIT' etc.
├── name        text NOT NULL            -- 'Army Area', 'New Alama Iqbal Town'
├── type        text NOT NULL            -- 'garrison' | 'civilian'
└── is_active   boolean DEFAULT true
```

**Garrison areas (8):** AR, BZR, ASK-1, ASK-2, DEF-1, DEF-2, GT-ROAD, DC

**Civilian areas (18):** N-AIT, AIT, KT, GT, MT, SC, RW, SP, SF, MM, GS, GP, BT, DG, MC, MB, SLP, AMT

---

### Table: `packages`

```sql
packages
├── id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
├── name            text UNIQUE NOT NULL   -- '6 Mbps', '40 Mbps', '100 Mbps 5G'
├── speed_mbps      integer NOT NULL
├── default_price   integer                -- PKR, nullable until admin fills
└── is_active       boolean DEFAULT true
```

**Normalized package list (from Excel):**
2 Mbps, 3 Mbps, 4 Mbps, 5 Mbps, 6 Mbps, 8 Mbps, 10 Mbps, 12 Mbps, 16 Mbps, 18 Mbps, 20 Mbps, 30 Mbps, 40 Mbps, 50 Mbps, 50 Mbps 5G, 100 Mbps, 100 Mbps 5G

Default prices to be filled by admin after migration.

---

### Table: `customers`

```sql
customers
├── id                uuid PRIMARY KEY DEFAULT gen_random_uuid()
├── customer_code     text UNIQUE NOT NULL          -- 'C-10001', auto-generated
├── username          text UNIQUE                   -- 'a027_', 'ng001_14'
├── full_name         text NOT NULL
├── cnic              text                          -- optional
├── phone             text                          -- optional
├── package_id        uuid REFERENCES packages(id)
├── iptv              boolean DEFAULT false
├── address_type      text NOT NULL                 -- 'text' | 'id_number'
├── address_value     text                          -- free text or numeric ID
├── area_id           uuid REFERENCES areas(id)
├── connection_date   date
├── due_amount        integer                       -- PKR monthly amount, null for free/disconnected/shifted
├── onu_number        text                          -- garrison only, nullable
├── status            text NOT NULL DEFAULT 'active'
│                     -- 'active' | 'suspended' | 'disconnected' | 'free' | 'shifted' | 'tdc'
├── disconnected_date date
├── reconnected_date  date
├── remarks           text
└── created_at        timestamptz DEFAULT now()
```

**Status mapping from Excel DUE column:**
| Excel value | status |
|---|---|
| Numeric (1500, 2200…) | `active` |
| `DC` | `disconnected` |
| `TDC` | `tdc` |
| `FREE` | `free` |
| `SHIFT`, `SHIFT BA`, `SHIFT D1` | `shifted` |

**due_amount** stores the monthly PKR amount (e.g. `2500`) only for active customers. For free/disconnected/shifted/tdc, it is null.

**customer_code** format: `C-10001` — auto-incremented sequence starting at 10001.

**RD column from Excel:** Ignored. Numeric RD values have no meaningful business definition. Text RD values (e.g. `DC DEC 2023`) are already captured in `disconnected_date` or `remarks`.

**AIT sheet OLD ID NO vs NEW ID NO:** Only NEW ID NO is used as `address_value`. OLD ID NO is discarded.

---

### Table: `staff`

```sql
staff
├── id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
├── full_name   text NOT NULL
├── role        text NOT NULL    -- 'technician' | 'recovery_agent' | 'admin'
├── phone       text
├── area_id     uuid REFERENCES areas(id)
├── is_active   boolean DEFAULT true
└── created_at  timestamptz DEFAULT now()
```

---

### Table: `bills`

```sql
bills
├── id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
├── customer_id     uuid REFERENCES customers(id) NOT NULL
├── amount          integer NOT NULL              -- PKR
├── month           text NOT NULL                 -- 'Apr 2026'
├── status          text NOT NULL DEFAULT 'pending'
│                   -- 'pending' | 'paid' | 'overdue'
├── collected_by    uuid REFERENCES staff(id)     -- nullable
├── paid_at         date
└── created_at      timestamptz DEFAULT now()
```

---

### Table: `complaints`

```sql
complaints
├── id               uuid PRIMARY KEY DEFAULT gen_random_uuid()
├── complaint_code   text UNIQUE NOT NULL        -- 'CMP-3427', auto-generated
├── customer_id      uuid REFERENCES customers(id) NOT NULL
├── issue            text NOT NULL
├── type             text NOT NULL
│                    -- 'connectivity' | 'speed' | 'hardware' | 'billing' | 'upgrade' | 'other'
├── priority         text NOT NULL DEFAULT 'medium'
│                    -- 'low' | 'medium' | 'high'
├── status           text NOT NULL DEFAULT 'open'
│                    -- 'open' | 'in_progress' | 'resolved'
├── assigned_to      uuid REFERENCES staff(id)   -- nullable
├── opened_at        timestamptz DEFAULT now()
└── resolved_at      timestamptz
```

---

## Relationships

```
areas ──────────────┬── customers.area_id
packages ───────────┴── customers.package_id

customers ──────────┬── bills.customer_id
                    └── complaints.customer_id

staff ──────────────┬── bills.collected_by
                    └── complaints.assigned_to
```

---

## Architecture

- **Frontend:** Next.js 14, TypeScript, existing custom CSS design system
- **Backend:** Supabase PostgreSQL
- **Client:** `src/lib/supabase.ts` — single Supabase client instance
- **Query layer:** `src/lib/db/` — one file per table (customers.ts, areas.ts, packages.ts, staff.ts, bills.ts, complaints.ts)
- **Migration:** `src/lib/data.ts` hardcoded data replaced by real DB calls
- **UI:** Existing components remain — only data source changes

---

## RLS Policy

- `anon` role: read-only access on all tables
- `authenticated` role: full CRUD
- Role-based (admin vs staff) to be added in a future iteration

---

## Data Migration Plan

A Python script (`scripts/migrate_excel.py`) will:
1. Read both Excel files using openpyxl
2. Normalize package names, area codes, status values
3. Insert seed data: areas → packages → customers (in order to satisfy FK constraints)
4. Staff, bills, complaints seeded from current `src/lib/data.ts` hardcoded values
5. Auto-generate `customer_code` (C-10001+) and `complaint_code` (CMP-3427+) sequences

---

## What is NOT in scope

- Authentication/login system
- Role-based access control (beyond basic RLS)
- Payment gateway integration
- Real-time subscriptions
- Mobile app
