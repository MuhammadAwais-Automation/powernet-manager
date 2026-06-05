# PowerNet Manager — Supabase Database Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate PowerNet Manager from hardcoded `data.ts` to a live Supabase PostgreSQL database with 6 tables (areas, packages, customers, staff, bills, complaints), a Python Excel migration script, and updated Next.js pages.

**Architecture:** Single Supabase project (`jzhxckqomhjgokkyxkmk`) holds all tables linked via foreign keys. Next.js pages use a thin `src/lib/db/` query layer over the Supabase JS client. Existing UI components stay unchanged — only data sources are swapped. A Python script migrates ~3000+ records from two Excel files.

**Tech Stack:** Next.js 14 (App Router), TypeScript, `@supabase/supabase-js`, Supabase PostgreSQL, Python 3.11 + openpyxl + supabase-py (migration only)

---

## File Map

**Create:**
- `.env.local` — Supabase URL + anon key
- `src/lib/supabase.ts` — typed Supabase client singleton
- `src/types/database.ts` — TypeScript types for all 6 tables
- `src/lib/db/areas.ts` — areas query functions
- `src/lib/db/packages.ts` — packages query functions
- `src/lib/db/customers.ts` — customers CRUD functions
- `src/lib/db/staff.ts` — staff query functions
- `src/lib/db/bills.ts` — bills query functions
- `src/lib/db/complaints.ts` — complaints query functions
- `scripts/migrate_excel.py` — Excel → Supabase migration script

**Modify:**
- `src/components/pages/CustomersPage.tsx` — use real data + Add Customer form
- `src/components/pages/AreasPage.tsx` — use real data
- `src/components/pages/StaffPage.tsx` — use real data
- `src/components/pages/BillingPage.tsx` — use real data
- `src/components/pages/ComplaintsPage.tsx` — use real data

**Delete after migration verified:**
- `src/lib/data.ts` — replaced by DB layer

---

## Task 1: Install Supabase SDK

**Files:**
- Modify: `package.json`
- Create: `.env.local`

- [ ] **Step 1: Install the Supabase JS client**

```bash
cd "D:/PowerNet Manager"
npm install @supabase/supabase-js
```

Expected output: `added 1 package` (or similar, no errors)

- [ ] **Step 2: Create `.env.local` with Supabase credentials**

Create file `D:/PowerNet Manager/.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://jzhxckqomhjgokkyxkmk.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<paste anon key from Supabase dashboard → Settings → API>
```

To get the anon key: go to Supabase dashboard → project → Settings → API → `anon` `public` key.

- [ ] **Step 3: Verify `.env.local` is in `.gitignore`**

Open `.gitignore` and confirm `.env.local` is listed. If not, add it:

```
.env.local
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .gitignore
git commit -m "feat: install @supabase/supabase-js"
```

---

## Task 2: Create Database Schema SQL

**Files:**
- Create: `scripts/schema.sql`

- [ ] **Step 1: Create `scripts/` directory and `schema.sql`**

Create file `D:/PowerNet Manager/scripts/schema.sql`:

```sql
-- ============================================================
-- AREAS
-- ============================================================
CREATE TABLE IF NOT EXISTS areas (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text UNIQUE NOT NULL,
  name       text NOT NULL,
  type       text NOT NULL CHECK (type IN ('garrison', 'civilian')),
  is_active  boolean DEFAULT true
);

-- ============================================================
-- PACKAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS packages (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text UNIQUE NOT NULL,
  speed_mbps     integer NOT NULL,
  default_price  integer,
  is_active      boolean DEFAULT true
);

-- ============================================================
-- CUSTOMERS
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_code     text UNIQUE NOT NULL DEFAULT '',
  username          text UNIQUE,
  full_name         text NOT NULL,
  cnic              text,
  phone             text,
  package_id        uuid REFERENCES packages(id),
  iptv              boolean DEFAULT false,
  address_type      text NOT NULL CHECK (address_type IN ('text', 'id_number')),
  address_value     text,
  area_id           uuid REFERENCES areas(id),
  connection_date   date,
  due_amount        integer,
  onu_number        text,
  status            text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','suspended','disconnected','free','shifted','tdc')),
  disconnected_date date,
  reconnected_date  date,
  remarks           text,
  created_at        timestamptz DEFAULT now()
);

-- Auto-generate customer_code: C-10001, C-10002 ...
CREATE SEQUENCE IF NOT EXISTS customer_code_seq START 10001;

CREATE OR REPLACE FUNCTION set_customer_code()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.customer_code = '' OR NEW.customer_code IS NULL THEN
    NEW.customer_code := 'C-' || nextval('customer_code_seq');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customer_code ON customers;
CREATE TRIGGER trg_customer_code
BEFORE INSERT ON customers
FOR EACH ROW EXECUTE FUNCTION set_customer_code();

-- ============================================================
-- STAFF
-- ============================================================
CREATE TABLE IF NOT EXISTS staff (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name   text NOT NULL,
  role        text NOT NULL CHECK (role IN ('technician','recovery_agent','admin')),
  phone       text,
  area_id     uuid REFERENCES areas(id),
  is_active   boolean DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

-- ============================================================
-- BILLS
-- ============================================================
CREATE TABLE IF NOT EXISTS bills (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   uuid REFERENCES customers(id) NOT NULL,
  amount        integer NOT NULL,
  month         text NOT NULL,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','paid','overdue')),
  collected_by  uuid REFERENCES staff(id),
  paid_at       date,
  created_at    timestamptz DEFAULT now()
);

-- ============================================================
-- COMPLAINTS
-- ============================================================
CREATE TABLE IF NOT EXISTS complaints (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_code  text UNIQUE NOT NULL DEFAULT '',
  customer_id     uuid REFERENCES customers(id) NOT NULL,
  issue           text NOT NULL,
  type            text NOT NULL
                  CHECK (type IN ('connectivity','speed','hardware','billing','upgrade','other')),
  priority        text NOT NULL DEFAULT 'medium'
                  CHECK (priority IN ('low','medium','high')),
  status          text NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','in_progress','resolved')),
  assigned_to     uuid REFERENCES staff(id),
  opened_at       timestamptz DEFAULT now(),
  resolved_at     timestamptz
);

-- Auto-generate complaint_code: CMP-3427, CMP-3428 ...
CREATE SEQUENCE IF NOT EXISTS complaint_code_seq START 3427;

CREATE OR REPLACE FUNCTION set_complaint_code()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.complaint_code = '' OR NEW.complaint_code IS NULL THEN
    NEW.complaint_code := 'CMP-' || nextval('complaint_code_seq');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_complaint_code ON complaints;
CREATE TRIGGER trg_complaint_code
BEFORE INSERT ON complaints
FOR EACH ROW EXECUTE FUNCTION set_complaint_code();

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE areas      ENABLE ROW LEVEL SECURITY;
ALTER TABLE packages   ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff      ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills      ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;

-- anon: read only
CREATE POLICY "anon_read" ON areas      FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON packages   FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON customers  FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON staff      FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON bills      FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON complaints FOR SELECT TO anon USING (true);

-- authenticated: full access
CREATE POLICY "auth_all" ON areas      FOR ALL TO authenticated USING (true);
CREATE POLICY "auth_all" ON packages   FOR ALL TO authenticated USING (true);
CREATE POLICY "auth_all" ON customers  FOR ALL TO authenticated USING (true);
CREATE POLICY "auth_all" ON staff      FOR ALL TO authenticated USING (true);
CREATE POLICY "auth_all" ON bills      FOR ALL TO authenticated USING (true);
CREATE POLICY "auth_all" ON complaints FOR ALL TO authenticated USING (true);
```

- [ ] **Step 2: Commit**

```bash
git add scripts/schema.sql
git commit -m "feat: add database schema SQL"
```

---

## Task 3: Apply Schema to Supabase

**Files:** None (runs SQL via MCP)

- [ ] **Step 1: Apply the schema using the Supabase MCP `execute_sql` tool**

Use the MCP tool `mcp__claude_ai_Supabase__execute_sql` with:
- `project_id`: `jzhxckqomhjgokkyxkmk`
- `query`: paste entire contents of `scripts/schema.sql`

- [ ] **Step 2: Verify tables exist**

Use MCP tool `mcp__claude_ai_Supabase__list_tables` with `project_id: jzhxckqomhjgokkyxkmk`.

Expected: tables `areas`, `packages`, `customers`, `staff`, `bills`, `complaints` all appear.

- [ ] **Step 3: Verify triggers work (test customer_code)**

Use MCP `execute_sql`:
```sql
INSERT INTO customers (full_name, address_type, status)
VALUES ('Test User', 'text', 'active')
RETURNING customer_code;
```
Expected: returns `C-10001`

Then clean up:
```sql
DELETE FROM customers WHERE full_name = 'Test User';
```

---

## Task 4: TypeScript Types

**Files:**
- Create: `src/types/database.ts`

- [ ] **Step 1: Create `src/types/database.ts`**

```typescript
export type Area = {
  id: string
  code: string
  name: string
  type: 'garrison' | 'civilian'
  is_active: boolean
}

export type Package = {
  id: string
  name: string
  speed_mbps: number
  default_price: number | null
  is_active: boolean
}

export type CustomerStatus = 'active' | 'suspended' | 'disconnected' | 'free' | 'shifted' | 'tdc'
export type AddressType = 'text' | 'id_number'

export type Customer = {
  id: string
  customer_code: string
  username: string | null
  full_name: string
  cnic: string | null
  phone: string | null
  package_id: string | null
  iptv: boolean
  address_type: AddressType
  address_value: string | null
  area_id: string | null
  connection_date: string | null
  due_amount: number | null
  onu_number: string | null
  status: CustomerStatus
  disconnected_date: string | null
  reconnected_date: string | null
  remarks: string | null
  created_at: string
}

export type CustomerWithRelations = Customer & {
  area: Area | null
  package: Package | null
}

export type NewCustomer = Omit<Customer, 'id' | 'customer_code' | 'created_at'>

export type StaffRole = 'technician' | 'recovery_agent' | 'admin'

export type Staff = {
  id: string
  full_name: string
  role: StaffRole
  phone: string | null
  area_id: string | null
  is_active: boolean
  created_at: string
}

export type StaffWithArea = Staff & { area: Area | null }

export type BillStatus = 'pending' | 'paid' | 'overdue'

export type Bill = {
  id: string
  customer_id: string
  amount: number
  month: string
  status: BillStatus
  collected_by: string | null
  paid_at: string | null
  created_at: string
}

export type BillWithRelations = Bill & {
  customer: Pick<Customer, 'id' | 'customer_code' | 'full_name' | 'package_id'> | null
  collector: Pick<Staff, 'id' | 'full_name'> | null
}

export type ComplaintType = 'connectivity' | 'speed' | 'hardware' | 'billing' | 'upgrade' | 'other'
export type ComplaintPriority = 'low' | 'medium' | 'high'
export type ComplaintStatus = 'open' | 'in_progress' | 'resolved'

export type Complaint = {
  id: string
  complaint_code: string
  customer_id: string
  issue: string
  type: ComplaintType
  priority: ComplaintPriority
  status: ComplaintStatus
  assigned_to: string | null
  opened_at: string
  resolved_at: string | null
}

export type ComplaintWithRelations = Complaint & {
  customer: Pick<Customer, 'id' | 'full_name' | 'area_id'> | null
  technician: Pick<Staff, 'id' | 'full_name'> | null
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/types/database.ts
git commit -m "feat: add TypeScript types for database schema"
```

---

## Task 5: Supabase Client

**Files:**
- Create: `src/lib/supabase.ts`

- [ ] **Step 1: Create `src/lib/supabase.ts`**

```typescript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase.ts
git commit -m "feat: add Supabase client"
```

---

## Task 6: DB Layer — Areas and Packages

**Files:**
- Create: `src/lib/db/areas.ts`
- Create: `src/lib/db/packages.ts`

- [ ] **Step 1: Create `src/lib/db/areas.ts`**

```typescript
import { supabase } from '@/lib/supabase'
import type { Area } from '@/types/database'

export async function getAreas(): Promise<Area[]> {
  const { data, error } = await supabase
    .from('areas')
    .select('*')
    .eq('is_active', true)
    .order('type')
    .order('name')
  if (error) throw error
  return data as Area[]
}

export async function getAreaById(id: string): Promise<Area | null> {
  const { data, error } = await supabase
    .from('areas')
    .select('*')
    .eq('id', id)
    .single()
  if (error) return null
  return data as Area
}
```

- [ ] **Step 2: Create `src/lib/db/packages.ts`**

```typescript
import { supabase } from '@/lib/supabase'
import type { Package } from '@/types/database'

export async function getPackages(): Promise<Package[]> {
  const { data, error } = await supabase
    .from('packages')
    .select('*')
    .eq('is_active', true)
    .order('speed_mbps')
  if (error) throw error
  return data as Package[]
}

export async function getPackageById(id: string): Promise<Package | null> {
  const { data, error } = await supabase
    .from('packages')
    .select('*')
    .eq('id', id)
    .single()
  if (error) return null
  return data as Package
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/areas.ts src/lib/db/packages.ts
git commit -m "feat: add areas and packages DB query layer"
```

---

## Task 7: DB Layer — Customers

**Files:**
- Create: `src/lib/db/customers.ts`

- [ ] **Step 1: Create `src/lib/db/customers.ts`**

```typescript
import { supabase } from '@/lib/supabase'
import type { Customer, CustomerWithRelations, NewCustomer } from '@/types/database'

export async function getCustomers(): Promise<CustomerWithRelations[]> {
  const { data, error } = await supabase
    .from('customers')
    .select('*, area:areas(*), package:packages(*)')
    .order('customer_code')
  if (error) throw error
  return data as CustomerWithRelations[]
}

export async function getCustomerById(id: string): Promise<CustomerWithRelations | null> {
  const { data, error } = await supabase
    .from('customers')
    .select('*, area:areas(*), package:packages(*)')
    .eq('id', id)
    .single()
  if (error) return null
  return data as CustomerWithRelations
}

export async function createCustomer(input: NewCustomer): Promise<Customer> {
  const { data, error } = await supabase
    .from('customers')
    .insert(input)
    .select()
    .single()
  if (error) throw error
  return data as Customer
}

export async function updateCustomer(
  id: string,
  input: Partial<NewCustomer>
): Promise<Customer> {
  const { data, error } = await supabase
    .from('customers')
    .update(input)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Customer
}

export async function searchCustomers(query: string): Promise<CustomerWithRelations[]> {
  const { data, error } = await supabase
    .from('customers')
    .select('*, area:areas(*), package:packages(*)')
    .or(`full_name.ilike.%${query}%,customer_code.ilike.%${query}%,username.ilike.%${query}%`)
    .order('customer_code')
  if (error) throw error
  return data as CustomerWithRelations[]
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/customers.ts
git commit -m "feat: add customers DB query layer"
```

---

## Task 8: DB Layer — Staff, Bills, Complaints

**Files:**
- Create: `src/lib/db/staff.ts`
- Create: `src/lib/db/bills.ts`
- Create: `src/lib/db/complaints.ts`

- [ ] **Step 1: Create `src/lib/db/staff.ts`**

```typescript
import { supabase } from '@/lib/supabase'
import type { Staff, StaffWithArea } from '@/types/database'

export async function getStaff(): Promise<StaffWithArea[]> {
  const { data, error } = await supabase
    .from('staff')
    .select('*, area:areas(*)')
    .order('full_name')
  if (error) throw error
  return data as StaffWithArea[]
}
```

- [ ] **Step 2: Create `src/lib/db/bills.ts`**

```typescript
import { supabase } from '@/lib/supabase'
import type { Bill, BillWithRelations } from '@/types/database'

export async function getBills(): Promise<BillWithRelations[]> {
  const { data, error } = await supabase
    .from('bills')
    .select(`
      *,
      customer:customers(id, customer_code, full_name, package_id),
      collector:staff(id, full_name)
    `)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as BillWithRelations[]
}

export async function getBillsByCustomer(customerId: string): Promise<Bill[]> {
  const { data, error } = await supabase
    .from('bills')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as Bill[]
}
```

- [ ] **Step 3: Create `src/lib/db/complaints.ts`**

```typescript
import { supabase } from '@/lib/supabase'
import type { Complaint, ComplaintWithRelations } from '@/types/database'

export async function getComplaints(): Promise<ComplaintWithRelations[]> {
  const { data, error } = await supabase
    .from('complaints')
    .select(`
      *,
      customer:customers(id, full_name, area_id),
      technician:staff(id, full_name)
    `)
    .order('opened_at', { ascending: false })
  if (error) throw error
  return data as ComplaintWithRelations[]
}

export async function createComplaint(
  input: Omit<Complaint, 'id' | 'complaint_code' | 'opened_at' | 'resolved_at'>
): Promise<Complaint> {
  const { data, error } = await supabase
    .from('complaints')
    .insert(input)
    .select()
    .single()
  if (error) throw error
  return data as Complaint
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/staff.ts src/lib/db/bills.ts src/lib/db/complaints.ts
git commit -m "feat: add staff, bills, complaints DB query layer"
```

---

## Task 9: Python Migration Script

**Files:**
- Create: `scripts/migrate_excel.py`
- Create: `scripts/requirements.txt`

This script reads both Excel files and inserts all data into Supabase using the service role key (bypasses RLS).

- [ ] **Step 1: Create `scripts/requirements.txt`**

```
openpyxl==3.1.2
supabase==2.3.4
python-dotenv==1.0.0
```

- [ ] **Step 2: Install Python dependencies**

```bash
pip install -r scripts/requirements.txt
```

Expected: all packages install without errors.

- [ ] **Step 3: Create `scripts/migrate_excel.py`**

```python
"""
PowerNet Manager — Excel to Supabase migration script.
Run: python scripts/migrate_excel.py
Requires SUPABASE_URL and SUPABASE_SERVICE_KEY in .env.local
"""
import os
import re
import datetime
import openpyxl
from supabase import create_client

# ── Config ──────────────────────────────────────────────────────────────────

RAHWALI_FILE = r'C:\Users\PC\Downloads\APRIL_2026_RAHWALI.xlsx'
GARRISON_FILE = r'C:\Users\PC\Downloads\APRIL 2026 GARRISON.xlsx'

# Load env
def get_env():
    env = {}
    with open('.env.local') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                env[k.strip()] = v.strip()
    return env

# ── Area definitions ─────────────────────────────────────────────────────────

RAHWALI_AREAS = {
    'NEW AIT':      {'code': 'N-AIT', 'name': 'New Alama Iqbal Town', 'type': 'civilian'},
    'AIT':          {'code': 'AIT',   'name': 'Alama Iqbal Town',     'type': 'civilian'},
    'KHUSHI T':     {'code': 'KT',    'name': 'Khushi Town',          'type': 'civilian'},
    'GREEN T':      {'code': 'GT',    'name': 'Green Town',            'type': 'civilian'},
    'MUSLIM T':     {'code': 'MT',    'name': 'Muslim Town',           'type': 'civilian'},
    'SETHI COLONY': {'code': 'SC',    'name': 'Sethi Colony',          'type': 'civilian'},
    'RW SHARQI':    {'code': 'RW',    'name': 'Rahwali Sharqi',        'type': 'civilian'},
    'SHARIF PURA':  {'code': 'SP',    'name': 'Sharif Pura',           'type': 'civilian'},
    'SHARIF FARM':  {'code': 'SF',    'name': 'Sharif Farm',           'type': 'civilian'},
    'MAKI MASJID':  {'code': 'MM',    'name': 'Maki Masjid',           'type': 'civilian'},
    'GHADI SHAHU':  {'code': 'GS',    'name': 'Ghadi Shahu',           'type': 'civilian'},
    'GULAB PURA':   {'code': 'GP',    'name': 'Gulab Pura',            'type': 'civilian'},
    'BILAL TOWN':   {'code': 'BT',    'name': 'Bilal Town',            'type': 'civilian'},
    'DHINGWALI':    {'code': 'DG',    'name': 'Dhingranwali',          'type': 'civilian'},
    'MADINA C':     {'code': 'MC',    'name': 'Madina Colony',         'type': 'civilian'},
    'MAIN BAZAR':   {'code': 'MB',    'name': 'Main Bazar',            'type': 'civilian'},
    'SLP PURA':     {'code': 'SLP',   'name': 'Salmat Pura',           'type': 'civilian'},
    'AMT PURA':     {'code': 'AMT',   'name': 'Amrat Pura',            'type': 'civilian'},
}

GARRISON_AREAS = {
    'ARMY AREA':  {'code': 'AR',      'name': 'Army Area',        'type': 'garrison'},
    'BZR':        {'code': 'BZR',     'name': 'Bazaar',            'type': 'garrison'},
    'ASK 1':      {'code': 'ASK-1',   'name': 'Ask Sector 1',     'type': 'garrison'},
    'ASK 2':      {'code': 'ASK-2',   'name': 'Ask Sector 2',     'type': 'garrison'},
    'DEF 1':      {'code': 'DEF-1',   'name': 'Defence Sector 1', 'type': 'garrison'},
    'DEF 2':      {'code': 'DEF-2',   'name': 'Defence Sector 2', 'type': 'garrison'},
    'GT ROAD':    {'code': 'GT-ROAD', 'name': 'GT Road',           'type': 'civilian'},
    'DC COLONY':  {'code': 'DC',      'name': 'DC Colony',         'type': 'garrison'},
}

# ── Helpers ──────────────────────────────────────────────────────────────────

def normalize_package(raw):
    """'6Mb' → '6 Mbps', '50MB 5G' → '50 Mbps 5G'"""
    if not raw:
        return None
    s = str(raw).strip()
    is_5g = '5G' in s.upper()
    match = re.search(r'(\d+)', s)
    if not match:
        return s
    speed = int(match.group(1))
    return f'{speed} Mbps 5G' if is_5g else f'{speed} Mbps'

def parse_due(due_val):
    """Returns (status, due_amount_int_or_None)"""
    if due_val is None:
        return ('active', None)
    s = str(due_val).strip().upper()
    if s == 'DC':
        return ('disconnected', None)
    if s == 'TDC':
        return ('tdc', None)
    if s == 'FREE':
        return ('free', None)
    if s.startswith('SHIFT'):
        return ('shifted', None)
    try:
        return ('active', int(float(due_val)))
    except (ValueError, TypeError):
        return ('active', None)

def parse_date(val):
    """datetime → ISO string, None → None"""
    if isinstance(val, datetime.datetime):
        return val.date().isoformat()
    return None

def find_header_row(ws):
    """Return 0-based row index of the header row (contains 'USER NAME')."""
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if any(str(c).strip().upper() == 'USER NAME' for c in row if c):
            return i
    return None

def get_col(headers, *names):
    """Return 0-based column index for any matching header name."""
    for name in names:
        for i, h in enumerate(headers):
            if h and str(h).strip().upper() == name.upper():
                return i
    return None

# ── Main migration ────────────────────────────────────────────────────────────

def main():
    env = get_env()
    url  = env['NEXT_PUBLIC_SUPABASE_URL']
    # Migration uses service role key to bypass RLS
    key  = env.get('SUPABASE_SERVICE_KEY') or input('Paste your service_role key: ').strip()
    sb   = create_client(url, key)

    # ── Step 1: Insert areas ─────────────────────────────────────────────────
    print('Inserting areas...')
    all_areas = list(RAHWALI_AREAS.values()) + list(GARRISON_AREAS.values())
    # Deduplicate by code (AMT appears in both)
    seen = set()
    unique_areas = []
    for a in all_areas:
        if a['code'] not in seen:
            seen.add(a['code'])
            unique_areas.append(a)
    sb.table('areas').upsert(unique_areas, on_conflict='code').execute()
    print(f'  {len(unique_areas)} areas inserted.')

    # Fetch area_id map: code → uuid
    area_rows = sb.table('areas').select('id,code').execute().data
    area_map = {r['code']: r['id'] for r in area_rows}

    # ── Step 2: Collect and insert packages ──────────────────────────────────
    print('Collecting packages...')
    pkg_names = set()

    def collect_packages(filepath, area_defs):
        wb = openpyxl.load_workbook(filepath, data_only=True)
        for sheet_name in wb.sheetnames:
            if sheet_name not in area_defs:
                continue
            ws = wb[sheet_name]
            hi = find_header_row(ws)
            if hi is None:
                continue
            headers = list(ws.iter_rows(values_only=True))[hi]
            pkg_col = get_col(headers, 'PKG')
            if pkg_col is None:
                continue
            for row in list(ws.iter_rows(values_only=True))[hi + 1:]:
                pkg = normalize_package(row[pkg_col])
                if pkg:
                    pkg_names.add(pkg)

    collect_packages(RAHWALI_FILE, RAHWALI_AREAS)
    collect_packages(GARRISON_FILE, GARRISON_AREAS)

    def speed_from_name(name):
        m = re.search(r'(\d+)', name)
        return int(m.group(1)) if m else 0

    pkg_records = [{'name': n, 'speed_mbps': speed_from_name(n)} for n in sorted(pkg_names)]
    sb.table('packages').upsert(pkg_records, on_conflict='name').execute()
    print(f'  {len(pkg_records)} packages inserted.')

    # Fetch package_id map: name → uuid
    pkg_rows = sb.table('packages').select('id,name').execute().data
    pkg_map = {r['name']: r['id'] for r in pkg_rows}

    # ── Step 3: Insert customers ─────────────────────────────────────────────
    print('Inserting customers...')
    total = 0

    def insert_customers(filepath, area_defs, is_garrison):
        nonlocal total
        wb = openpyxl.load_workbook(filepath, data_only=True)
        for sheet_name in wb.sheetnames:
            if sheet_name not in area_defs:
                continue
            area_info = area_defs[sheet_name]
            area_id   = area_map.get(area_info['code'])
            ws        = wb[sheet_name]
            hi        = find_header_row(ws)
            if hi is None:
                continue
            headers = list(ws.iter_rows(values_only=True))[hi]

            # Column indices
            col_username = get_col(headers, 'USER NAME')
            col_pkg      = get_col(headers, 'PKG')
            col_iptv     = get_col(headers, 'IPTV')
            col_name     = get_col(headers, 'NAME')
            col_cnic     = get_col(headers, 'CNIC NO', 'CNIC')
            col_phone    = get_col(headers, 'MOBILE NO', 'CELL NO', 'MOB NO', 'MOBILE')
            col_date     = get_col(headers, 'DATE', 'DATE ')
            col_due      = get_col(headers, 'DUE')
            col_remarks  = get_col(headers, 'REMARKS')
            col_onu      = get_col(headers, 'ONU') if is_garrison else None

            # Address column: AIT has NEW ID NO, garrison has ADRESS/ADDRESS, others have ID NO
            if sheet_name == 'AIT':
                col_addr = get_col(headers, 'NEW ID NO')
                addr_type = 'id_number'
            elif is_garrison and sheet_name != 'GT ROAD':
                col_addr = get_col(headers, 'ADRESS', 'ADDRESS')
                addr_type = 'text'
            else:
                col_addr = get_col(headers, 'ID NO', 'ID')
                addr_type = 'id_number'

            batch = []
            for row in list(ws.iter_rows(values_only=True))[hi + 1:]:
                # Skip empty rows
                name_val = row[col_name] if col_name is not None else None
                if not name_val:
                    continue

                username_val = str(row[col_username]).strip() if col_username is not None and row[col_username] else None
                pkg_raw      = row[col_pkg] if col_pkg is not None else None
                pkg_name     = normalize_package(pkg_raw)
                pkg_id       = pkg_map.get(pkg_name) if pkg_name else None
                iptv_val     = row[col_iptv] if col_iptv is not None else None
                cnic_val     = str(row[col_cnic]).strip() if col_cnic is not None and row[col_cnic] else None
                phone_val    = str(row[col_phone]).strip() if col_phone is not None and row[col_phone] else None
                addr_val     = str(row[col_addr]).strip() if col_addr is not None and row[col_addr] else None
                date_val     = parse_date(row[col_date]) if col_date is not None else None
                due_raw      = row[col_due] if col_due is not None else None
                remarks_val  = str(row[col_remarks]).strip() if col_remarks is not None and row[col_remarks] else None
                onu_val      = str(row[col_onu]).strip() if col_onu is not None and row[col_onu] else None

                status, due_amount = parse_due(due_raw)

                # IPTV: None → False, anything else → True
                has_iptv = iptv_val is not None

                # Clean CNIC (remove non-numeric/dash)
                if cnic_val and not re.search(r'\d{5}-\d{7}-\d', cnic_val):
                    # Try to format raw numeric CNIC
                    digits = re.sub(r'\D', '', cnic_val)
                    if len(digits) == 13:
                        cnic_val = f'{digits[:5]}-{digits[5:12]}-{digits[12]}'

                batch.append({
                    'username':        username_val,
                    'full_name':       str(name_val).strip(),
                    'cnic':            cnic_val,
                    'phone':           phone_val,
                    'package_id':      pkg_id,
                    'iptv':            has_iptv,
                    'address_type':    addr_type,
                    'address_value':   addr_val,
                    'area_id':         area_id,
                    'connection_date': date_val,
                    'due_amount':      due_amount,
                    'onu_number':      onu_val,
                    'status':          status,
                    'remarks':         remarks_val,
                })

            if batch:
                # Insert in chunks of 100
                for i in range(0, len(batch), 100):
                    sb.table('customers').insert(batch[i:i+100]).execute()
                total += len(batch)
                print(f'  [{sheet_name}] {len(batch)} records')

    insert_customers(RAHWALI_FILE,  RAHWALI_AREAS,  is_garrison=False)
    insert_customers(GARRISON_FILE, GARRISON_AREAS, is_garrison=True)
    print(f'Total customers inserted: {total}')

    # ── Step 4: Seed staff from hardcoded data ───────────────────────────────
    print('Seeding staff...')
    staff_seed = [
        {'full_name': 'Bilal Ahmed',   'role': 'technician',     'phone': '+92 301 1128473', 'area_id': area_map.get('AR')},
        {'full_name': 'Hassan Raza',   'role': 'recovery_agent', 'phone': '+92 333 7742891', 'area_id': area_map.get('DEF-1')},
        {'full_name': 'Fatima Noor',   'role': 'technician',     'phone': '+92 321 3392847', 'area_id': area_map.get('ASK-1')},
        {'full_name': 'Ahmed Sheikh',  'role': 'recovery_agent', 'phone': '+92 345 1102984', 'area_id': area_map.get('BZR')},
        {'full_name': 'Usman Khan',    'role': 'recovery_agent', 'phone': '+92 302 2297413', 'area_id': area_map.get('AR')},
        {'full_name': 'Sara Javed',    'role': 'technician',     'phone': '+92 312 6629187', 'area_id': area_map.get('DEF-2')},
        {'full_name': 'Kamran Butt',   'role': 'recovery_agent', 'phone': '+92 321 4419287', 'area_id': area_map.get('ASK-2')},
        {'full_name': 'Zainab Malik',  'role': 'technician',     'phone': '+92 300 8847162', 'area_id': area_map.get('AIT'),  'is_active': False},
    ]
    sb.table('staff').insert(staff_seed).execute()
    print(f'  {len(staff_seed)} staff inserted.')
    print('Migration complete.')

if __name__ == '__main__':
    main()
```

- [ ] **Step 4: Get service role key from Supabase dashboard**

Go to Supabase dashboard → project `jzhxckqomhjgokkyxkmk` → Settings → API → `service_role` `secret` key. Add to `.env.local`:

```env
SUPABASE_SERVICE_KEY=<service_role key here>
```

**Warning:** Never commit this key. `.env.local` is already in `.gitignore`.

- [ ] **Step 5: Run migration**

```bash
cd "D:/PowerNet Manager"
python scripts/migrate_excel.py
```

Expected output:
```
Inserting areas...
  26 areas inserted.
Collecting packages...
  17 packages inserted.
Inserting customers...
  [NEW AIT] 72 records
  [AIT] 900 records
  ... (all sheets)
Total customers inserted: ~3000+
Seeding staff...
  8 staff inserted.
Migration complete.
```

- [ ] **Step 6: Verify in Supabase dashboard**

Use MCP `execute_sql`:
```sql
SELECT
  (SELECT COUNT(*) FROM areas) AS areas,
  (SELECT COUNT(*) FROM packages) AS packages,
  (SELECT COUNT(*) FROM customers) AS customers,
  (SELECT COUNT(*) FROM staff) AS staff;
```

Expected: areas ≥ 26, packages ≥ 17, customers ≥ 3000, staff = 8.

- [ ] **Step 7: Commit migration script**

```bash
git add scripts/migrate_excel.py scripts/requirements.txt
git commit -m "feat: add Excel to Supabase migration script"
```

---

## Task 10: Update CustomersPage with Real Data

**Files:**
- Modify: `src/components/pages/CustomersPage.tsx`

Replace hardcoded `CUSTOMERS` import with `getCustomers()` DB call. Keep all existing UI — only swap the data source.

- [ ] **Step 1: Replace imports and add state for loading**

At top of `CustomersPage.tsx`, make these two changes:

1. Change the React import to include `useEffect`:
```typescript
import React, { useState, useEffect } from 'react';
```

2. Replace the data import:
```typescript
// Remove this line:
// import { CUSTOMERS, AREAS, PACKAGES, PKG_PRICE } from '@/lib/data';

// Add these:
import { getCustomers } from '@/lib/db/customers';
import { getAreas } from '@/lib/db/areas';
import { getPackages } from '@/lib/db/packages';
import type { CustomerWithRelations, Area, Package } from '@/types/database';
```

- [ ] **Step 2: Update the component state and data fetching**

Replace the existing `const [selected, setSelected] = useState...` block with:

```typescript
export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerWithRelations[]>([])
  const [areas, setAreas] = useState<Area[]>([])
  const [packages, setPackages] = useState<Package[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<CustomerWithRelations | null>(null)
  const [search, setSearch] = useState('')
  const [areaFilter, setAreaFilter] = useState('All areas')
  const [statusFilter, setStatusFilter] = useState('All status')
  const [pkgFilter, setPkgFilter] = useState('All packages')

  useEffect(() => {
    Promise.all([getCustomers(), getAreas(), getPackages()])
      .then(([c, a, p]) => { setCustomers(c); setAreas(a); setPackages(p) })
      .finally(() => setLoading(false))
  }, [])
```

- [ ] **Step 3: Update the filter logic**

Replace the hardcoded `filtered` constant:

```typescript
  const filtered = customers.filter(c => {
    if (search && !c.full_name.toLowerCase().includes(search.toLowerCase()) &&
        !c.customer_code.includes(search)) return false
    if (areaFilter !== 'All areas' && c.area?.name !== areaFilter) return false
    if (statusFilter !== 'All status' && c.status !== statusFilter.toLowerCase()) return false
    if (pkgFilter !== 'All packages' && c.package?.name !== pkgFilter) return false
    return true
  })
```

- [ ] **Step 4: Add loading state to JSX**

At the start of the return, before `<div className="page">`, add:

```typescript
  if (loading) return (
    <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
      <div className="muted">Loading customers…</div>
    </div>
  )
```

- [ ] **Step 5: Update table row fields**

In the `tbody` map, update field references from old `Customer` shape to `CustomerWithRelations`:

```typescript
{filtered.map(c => (
  <tr key={c.id} className={`clickable ${selected?.id === c.id ? 'selected' : ''}`}
      onClick={() => setSelected(c)}>
    <td onClick={e => e.stopPropagation()}><input type="checkbox" /></td>
    <td>
      <div className="cell-user">
        <Avatar name={c.full_name} size={32} />
        <div>
          <div className="nm">{c.full_name}</div>
          <div className="sub mono">{c.customer_code}</div>
        </div>
      </div>
    </td>
    <td className="mono muted" style={{ fontSize: 12 }}>{c.cnic ?? '—'}</td>
    <td className="mono" style={{ fontSize: 12 }}>{c.phone ?? '—'}</td>
    <td>{c.area?.name ?? '—'}</td>
    <td>{c.package?.name ?? '—'}</td>
    <td>
      <Badge color={c.status === 'active' ? 'green' : c.status === 'suspended' ? 'amber' : 'red'} dot>
        {c.status}
      </Badge>
    </td>
    <td className="mono" style={{ fontSize: 12 }}>
      {c.due_amount ? `Rs. ${c.due_amount.toLocaleString()}` : '—'}
    </td>
    <td onClick={e => e.stopPropagation()} style={{ textAlign: 'right' }}>
      <div className="row gap-sm" style={{ justifyContent: 'flex-end' }}>
        <button className="icon-btn" style={{ width: 28, height: 28 }}><Icon name="eye" size={14} /></button>
        <button className="icon-btn" style={{ width: 28, height: 28 }}><Icon name="edit" size={14} /></button>
        <button className="icon-btn" style={{ width: 28, height: 28 }}><Icon name="moreV" size={14} /></button>
      </div>
    </td>
  </tr>
))}
```

- [ ] **Step 6: Update filter dropdowns**

Replace hardcoded `AREAS` and `PACKAGES` with the loaded state:

```typescript
// Area filter dropdown
{areas.map(a => <option key={a.id}>{a.name}</option>)}

// Package filter dropdown
{packages.map(p => <option key={p.id}>{p.name}</option>)}

// Status filter: update options to match DB enum
<option>active</option>
<option>suspended</option>
<option>disconnected</option>
<option>free</option>
<option>shifted</option>
<option>tdc</option>
```

- [ ] **Step 7: Update CustomerDetail drawer**

In `CustomerDetail`, update field names to match `CustomerWithRelations`:

```typescript
// Replace customer.name → customer.full_name
// Replace customer.id → customer.customer_code  
// Replace customer.joined → customer.connection_date ?? '—'
// Replace customer.pkg → customer.package?.name ?? '—'
// Replace customer.area → customer.area?.name ?? '—'
// Add: PKG_PRICE lookup → customer.package?.default_price ?? customer.due_amount
```

- [ ] **Step 8: Start dev server and verify**

```bash
npm run dev
```

Open `http://localhost:3000` → Customers page. Verify:
- Customer list loads from DB (real names, not hardcoded)
- Search works
- Area/status/package filters work
- Clicking a row opens the detail drawer

- [ ] **Step 9: Commit**

```bash
git add src/components/pages/CustomersPage.tsx
git commit -m "feat: CustomersPage now uses real Supabase data"
```

---

## Task 11: Add Customer Form

**Files:**
- Modify: `src/components/pages/CustomersPage.tsx`

Add a full "Add Customer" form as a `Drawer` that opens when the "+ Add Customer" button is clicked.

- [ ] **Step 1: Add `showAdd` state and wire button**

In `CustomersPage`, add:
```typescript
const [showAdd, setShowAdd] = useState(false)
```

Update the "Add Customer" button:
```typescript
<button className="btn btn-primary" onClick={() => setShowAdd(true)}>
  <Icon name="plus" size={14} />Add Customer
</button>
```

- [ ] **Step 2: Add the `AddCustomerDrawer` component above `CustomersPage`**

```typescript
// Add this import at the top of the file with other DB imports:
// import { createCustomer, getCustomerById } from '@/lib/db/customers'

function AddCustomerDrawer({
  areas, packages, onClose, onSaved
}: {
  areas: Area[]
  packages: Package[]
  onClose: () => void
  onSaved: (c: CustomerWithRelations) => void
}) {
  const [form, setForm] = useState({
    full_name: '', cnic: '', phone: '', username: '',
    package_id: '', iptv: false,
    address_type: 'id_number' as 'text' | 'id_number',
    address_value: '', area_id: '',
    connection_date: '', due_amount: '',
    status: 'active' as CustomerStatus,
    onu_number: '', remarks: '',
    disconnected_date: '', reconnected_date: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (key: string, val: unknown) =>
    setForm(f => ({ ...f, [key]: val }))

  const handleSubmit = async () => {
    if (!form.full_name.trim()) { setError('Name required'); return }
    if (!form.area_id) { setError('Area required'); return }
    setSaving(true)
    setError(null)
    try {
      const created = await createCustomer({
        username:          form.username || null,
        full_name:         form.full_name.trim(),
        cnic:              form.cnic || null,
        phone:             form.phone || null,
        package_id:        form.package_id || null,
        iptv:              form.iptv,
        address_type:      form.address_type,
        address_value:     form.address_value || null,
        area_id:           form.area_id,
        connection_date:   form.connection_date || null,
        due_amount:        form.due_amount ? parseInt(form.due_amount) : null,
        onu_number:        form.onu_number || null,
        status:            form.status,
        disconnected_date: form.disconnected_date || null,
        reconnected_date:  form.reconnected_date || null,
        remarks:           form.remarks || null,
      })
      const full = await getCustomerById(created.id)
      if (full) onSaved(full)
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="drawer-head">
        <div><div style={{ fontSize: 15, fontWeight: 600 }}>Add Customer</div></div>
        <button className="icon-btn" onClick={onClose}><Icon name="close" size={16} /></button>
      </div>
      <div className="drawer-body">
        {error && (
          <div style={{ padding: '10px 16px', background: 'var(--red-bg)', color: 'var(--red)',
                        borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* Section 1: Basic Info */}
        <div className="card card-pad" style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="muted" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Basic Info</div>
          <input className="select" placeholder="Full Name *"
            value={form.full_name} onChange={e => set('full_name', e.target.value)} />
          <input className="select" placeholder="CNIC (optional)"
            value={form.cnic} onChange={e => set('cnic', e.target.value)} />
          <input className="select" placeholder="Phone (optional)"
            value={form.phone} onChange={e => set('phone', e.target.value)} />
        </div>

        {/* Section 2: Connection */}
        <div className="card card-pad" style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="muted" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Connection</div>
          <input className="select" placeholder="Username (e.g. a027_)"
            value={form.username} onChange={e => set('username', e.target.value)} />
          <select className="select" value={form.package_id} onChange={e => set('package_id', e.target.value)}>
            <option value="">Select package</option>
            {packages.map(p => <option key={p.id} value={p.id}>{p.name}{p.default_price ? ` — Rs. ${p.default_price}` : ''}</option>)}
          </select>
          <div className="row gap-sm" style={{ alignItems: 'center' }}>
            <Switch on={form.iptv} onChange={(v: boolean) => set('iptv', v)} />
            <span style={{ fontSize: 13 }}>IPTV</span>
          </div>
        </div>

        {/* Section 3: Location */}
        <div className="card card-pad" style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="muted" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Location</div>
          <div className="row gap-sm">
            <button
              className={`btn btn-sm ${form.address_type === 'id_number' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => set('address_type', 'id_number')}>ID Number</button>
            <button
              className={`btn btn-sm ${form.address_type === 'text' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => set('address_type', 'text')}>Text Address</button>
          </div>
          <input className="select"
            placeholder={form.address_type === 'id_number' ? 'ID Number (e.g. 14)' : 'Address (e.g. QTR NO 6/2 F2)'}
            value={form.address_value} onChange={e => set('address_value', e.target.value)} />
          <select className="select" value={form.area_id} onChange={e => set('area_id', e.target.value)}>
            <option value="">Select area *</option>
            {areas.map(a => <option key={a.id} value={a.id}>{a.name} ({a.code})</option>)}
          </select>
        </div>

        {/* Section 4: Financial */}
        <div className="card card-pad" style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="muted" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Financial</div>
          <input className="select" type="number" placeholder="Monthly Due (PKR)"
            value={form.due_amount} onChange={e => set('due_amount', e.target.value)} />
          <input className="select" type="date" placeholder="Connection Date"
            value={form.connection_date} onChange={e => set('connection_date', e.target.value)} />
          <select className="select" value={form.status} onChange={e => set('status', e.target.value as CustomerStatus)}>
            <option value="active">Active</option>
            <option value="free">Free</option>
            <option value="suspended">Suspended</option>
            <option value="disconnected">Disconnected</option>
            <option value="tdc">TDC (Temp Disconnected)</option>
            <option value="shifted">Shifted</option>
          </select>
        </div>

        {/* Section 5: Equipment & Notes */}
        <div className="card card-pad" style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="muted" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Equipment & Notes</div>
          <input className="select" placeholder="ONU Number (garrison only)"
            value={form.onu_number} onChange={e => set('onu_number', e.target.value)} />
          <textarea className="select" placeholder="Remarks" rows={2}
            value={form.remarks} onChange={e => set('remarks', e.target.value)}
            style={{ resize: 'none' }} />
          {(form.status === 'disconnected' || form.status === 'tdc') && (
            <>
              <input className="select" type="date" placeholder="Disconnected Date"
                value={form.disconnected_date} onChange={e => set('disconnected_date', e.target.value)} />
              <input className="select" type="date" placeholder="Reconnected Date"
                value={form.reconnected_date} onChange={e => set('reconnected_date', e.target.value)} />
            </>
          )}
        </div>
      </div>
      <div className="drawer-foot">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
          {saving ? 'Saving…' : 'Save Customer'}
        </button>
      </div>
    </>
  )
}
```

- [ ] **Step 3: Add `onSaved` handler in `CustomersPage`**

In the `CustomersPage` component, add handler:
```typescript
const handleCustomerSaved = (c: CustomerWithRelations) => {
  setCustomers(prev => [c, ...prev])
}
```

- [ ] **Step 4: Add the Add Customer drawer to JSX**

At bottom of `CustomersPage` return, after the existing `<Drawer>` for detail:

```typescript
<Drawer open={showAdd} onClose={() => setShowAdd(false)}>
  {showAdd && (
    <AddCustomerDrawer
      areas={areas}
      packages={packages}
      onClose={() => setShowAdd(false)}
      onSaved={handleCustomerSaved}
    />
  )}
</Drawer>
```

- [ ] **Step 5: Verify in browser**

Open `http://localhost:3000` → Customers → click "+ Add Customer". Verify:
- Drawer opens with all 5 sections
- Address type toggle switches between ID Number and Text fields
- Disconnected date fields only appear when status is `disconnected` or `tdc`
- Save creates a new customer and it appears in the list

- [ ] **Step 6: Commit**

```bash
git add src/components/pages/CustomersPage.tsx
git commit -m "feat: add Add Customer form with real DB save"
```

---

## Task 12: Update AreasPage

**Files:**
- Modify: `src/components/pages/AreasPage.tsx`

- [ ] **Step 1: Replace hardcoded AREAS with DB call**

At top of `AreasPage.tsx`, replace `AREAS` import with:
```typescript
import { useState, useEffect } from 'react'
import { getAreas } from '@/lib/db/areas'
import type { Area } from '@/types/database'
```

- [ ] **Step 2: Add data fetching**

Inside the component, replace `const areas = AREAS` with:
```typescript
const [areas, setAreas] = useState<Area[]>([])
const [loading, setLoading] = useState(true)

useEffect(() => {
  getAreas().then(setAreas).finally(() => setLoading(false))
}, [])

if (loading) return <div className="page"><div className="muted" style={{ padding: 32 }}>Loading areas…</div></div>
```

- [ ] **Step 3: Update field references**

Map over `areas` using the DB field names (`a.code`, `a.name`, `a.type`). Remove any references to hardcoded fields like `a.customers`, `a.active`, `a.agent` — show `—` for stats not yet in schema.

- [ ] **Step 4: Verify and commit**

```bash
npm run dev
# Verify AreasPage loads from DB
git add src/components/pages/AreasPage.tsx
git commit -m "feat: AreasPage uses real Supabase data"
```

---

## Task 13: Update StaffPage, BillingPage, ComplaintsPage

**Files:**
- Modify: `src/components/pages/StaffPage.tsx`
- Modify: `src/components/pages/BillingPage.tsx`
- Modify: `src/components/pages/ComplaintsPage.tsx`

Each page follows the same 3-step pattern:
1. Replace import → add `useEffect` + `useState` + DB function call
2. Add loading state
3. Update field references to match DB types

- [ ] **Step 1: Update StaffPage.tsx**

Replace hardcoded `STAFF` import with:
```typescript
import { useState, useEffect } from 'react'
import { getStaff } from '@/lib/db/staff'
import type { StaffWithArea } from '@/types/database'
```

Add inside component:
```typescript
const [staff, setStaff] = useState<StaffWithArea[]>([])
const [loading, setLoading] = useState(true)
useEffect(() => { getStaff().then(setStaff).finally(() => setLoading(false)) }, [])
if (loading) return <div className="page"><div className="muted" style={{ padding: 32 }}>Loading…</div></div>
```

Update field references: `s.full_name`, `s.role`, `s.phone`, `s.is_active`, `s.area?.name`.

- [ ] **Step 2: Update BillingPage.tsx**

Replace hardcoded `BILLS` import with:
```typescript
import { useState, useEffect } from 'react'
import { getBills } from '@/lib/db/bills'
import type { BillWithRelations } from '@/types/database'
```

Add inside component:
```typescript
const [bills, setBills] = useState<BillWithRelations[]>([])
const [loading, setLoading] = useState(true)
useEffect(() => { getBills().then(setBills).finally(() => setLoading(false)) }, [])
if (loading) return <div className="page"><div className="muted" style={{ padding: 32 }}>Loading…</div></div>
```

Update field references: `b.customer?.full_name`, `b.amount`, `b.month`, `b.status`, `b.collector?.full_name`.

- [ ] **Step 3: Update ComplaintsPage.tsx**

Replace hardcoded `COMPLAINTS` import with:
```typescript
import { useState, useEffect } from 'react'
import { getComplaints } from '@/lib/db/complaints'
import type { ComplaintWithRelations } from '@/types/database'
```

Add inside component:
```typescript
const [complaints, setComplaints] = useState<ComplaintWithRelations[]>([])
const [loading, setLoading] = useState(true)
useEffect(() => { getComplaints().then(setComplaints).finally(() => setLoading(false)) }, [])
if (loading) return <div className="page"><div className="muted" style={{ padding: 32 }}>Loading…</div></div>
```

Update field references: `c.complaint_code`, `c.customer?.full_name`, `c.issue`, `c.type`, `c.priority`, `c.status`, `c.technician?.full_name`.

- [ ] **Step 4: Verify all three pages in browser**

```bash
npm run dev
```

Open each page and verify data loads from DB.

- [ ] **Step 5: Commit**

```bash
git add src/components/pages/StaffPage.tsx src/components/pages/BillingPage.tsx src/components/pages/ComplaintsPage.tsx
git commit -m "feat: Staff, Billing, Complaints pages use real Supabase data"
```

---

## Task 14: Final Cleanup

**Files:**
- Delete: `src/lib/data.ts` (after verifying no remaining imports)

- [ ] **Step 1: Check for remaining imports of data.ts**

```bash
grep -r "from '@/lib/data'" src/
grep -r "from '../lib/data'" src/
grep -r "from './data'" src/
```

Expected: no results. If any found, update those files first.

- [ ] **Step 2: Delete data.ts**

```bash
rm "D:/PowerNet Manager/src/lib/data.ts"
```

- [ ] **Step 3: Verify TypeScript still compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Final browser check**

```bash
npm run dev
```

Open all 5 pages (Customers, Areas, Staff, Billing, Complaints) and verify each loads from DB correctly.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete Supabase integration — remove hardcoded data.ts"
```

---

## Summary

| Task | What it does |
|------|-------------|
| 1 | Install SDK, setup env |
| 2 | Write schema SQL |
| 3 | Apply schema to Supabase |
| 4 | TypeScript types |
| 5 | Supabase client |
| 6 | Areas + Packages DB layer |
| 7 | Customers DB layer |
| 8 | Staff + Bills + Complaints DB layer |
| 9 | Python Excel migration script |
| 10 | CustomersPage → real data |
| 11 | Add Customer form |
| 12 | AreasPage → real data |
| 13 | Staff + Billing + Complaints → real data |
| 14 | Remove hardcoded data.ts |
