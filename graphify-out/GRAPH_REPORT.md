# Graph Report - .  (2026-05-26)

## Corpus Check
- 97 files · ~67,042 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 644 nodes · 1033 edges · 47 communities (33 shown, 14 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 19 edges (avg confidence: 0.82)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Auth Shell|Auth Shell]]
- [[_COMMUNITY_Billing Utilities|Billing Utilities]]
- [[_COMMUNITY_Billing Payments MVP|Billing Payments MVP]]
- [[_COMMUNITY_Dashboard Auth Design|Dashboard Auth Design]]
- [[_COMMUNITY_Reports Summary|Reports Summary]]
- [[_COMMUNITY_Package Dependencies|Package Dependencies]]
- [[_COMMUNITY_Billing Notifications|Billing Notifications]]
- [[_COMMUNITY_Customer List Cache|Customer List Cache]]
- [[_COMMUNITY_Chart Components|Chart Components]]
- [[_COMMUNITY_UI Primitives|UI Primitives]]
- [[_COMMUNITY_TypeScript Compiler|TypeScript Compiler]]
- [[_COMMUNITY_Admin Staff APIs|Admin Staff APIs]]
- [[_COMMUNITY_Database Schema|Database Schema]]
- [[_COMMUNITY_Complaint Data Layer|Complaint Data Layer]]
- [[_COMMUNITY_Area Data Layer|Area Data Layer]]
- [[_COMMUNITY_Excel Migration|Excel Migration]]
- [[_COMMUNITY_Billing Notification Tests|Billing Notification Tests]]
- [[_COMMUNITY_Report Tests|Report Tests]]
- [[_COMMUNITY_Async Timeout Tests|Async Timeout Tests]]
- [[_COMMUNITY_Dashboard Realtime Tests|Dashboard Realtime Tests]]
- [[_COMMUNITY_Staff Package Data|Staff Package Data]]
- [[_COMMUNITY_Billing Core Tests|Billing Core Tests]]
- [[_COMMUNITY_Billing Query Tests|Billing Query Tests]]
- [[_COMMUNITY_Notification Navigation Tests|Notification Navigation Tests]]
- [[_COMMUNITY_Realtime Resilience Tests|Realtime Resilience Tests]]
- [[_COMMUNITY_Notification Builders|Notification Builders]]
- [[_COMMUNITY_Project Documentation|Project Documentation]]
- [[_COMMUNITY_Performance Smoke|Performance Smoke]]
- [[_COMMUNITY_Report CSV Core|Report CSV Core]]
- [[_COMMUNITY_Caveman Rules|Caveman Rules]]
- [[_COMMUNITY_Billing Query Filters|Billing Query Filters]]
- [[_COMMUNITY_Root Layout|Root Layout]]
- [[_COMMUNITY_Query State Types|Query State Types]]
- [[_COMMUNITY_Agent Instructions|Agent Instructions]]
- [[_COMMUNITY_ESLint Extends|ESLint Extends]]
- [[_COMMUNITY_Next Config|Next Config]]
- [[_COMMUNITY_Path Alias|Path Alias]]
- [[_COMMUNITY_Dashboard Role Checks|Dashboard Role Checks]]
- [[_COMMUNITY_Page Access Control|Page Access Control]]
- [[_COMMUNITY_ESLint Config|ESLint Config]]
- [[_COMMUNITY_Default Role Page|Default Role Page]]
- [[_COMMUNITY_Page ID Type|Page ID Type]]
- [[_COMMUNITY_Valid Page IDs|Valid Page IDs]]
- [[_COMMUNITY_Supabase Admin Client|Supabase Admin Client]]

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 16 edges
2. `scripts` - 14 edges
3. `supabase` - 13 edges
4. `Dashboard Auth & Role-Based Access Design Spec` - 13 edges
5. `PowerNet Full Database Design Spec` - 11 edges
6. `useAuth()` - 9 edges
7. `Area` - 9 edges
8. `customers Table` - 9 edges
9. `bills Table` - 9 edges
10. `initials()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `run()` --calls--> `withTimeout()`  [INFERRED]
  scripts/async-core.test.js → src/lib/async/with-timeout.ts
- `Caveman Response Style` --semantically_similar_to--> `OpenCode Caveman Response Style`  [INFERRED] [semantically similar]
  .github/copilot-instructions.md → .opencode/AGENTS.md
- `OpenCode Caveman Response Style` --semantically_similar_to--> `Always-On Caveman Rule`  [INFERRED] [semantically similar]
  .opencode/AGENTS.md → .windsurf/rules/caveman.md
- `supabase Python Client` --conceptually_related_to--> `Supabase Auth for Dashboard Login`  [INFERRED]
  scripts/requirements.txt → docs/superpowers/specs/2026-04-25-dashboard-auth-design.md
- `PowerNet Manager` --implements--> `React State Routing (SPA Pattern)`  [EXTRACTED]
  README.md → CLAUDE.md

## Hyperedges (group relationships)
- **Billing RPC Functions** — rpc_generate_monthly_bills, rpc_record_bill_payment [EXTRACTED 1.00]
- **PowerNet Core Database Tables** — db_table_customers, db_table_bills, db_table_payments, db_table_complaints, db_table_staff, db_table_areas, db_table_packages [EXTRACTED 1.00]
- **Caveman Style Rule shared across IDE tools** — caveman_CavemanStyle [EXTRACTED 1.00]
- **Dashboard Authentication Flow** — dashboard_auth_login_screen, dashboard_auth_supabase_auth, dashboard_auth_auth_context, dashboard_auth_email_username_trick, dashboard_auth_staff_table [EXTRACTED 1.00]
- **Flutter Staff App Authentication Flow** — staff_app_splash_screen, staff_app_auth_provider, staff_app_verify_staff_login_rpc, staff_app_shared_preferences, staff_app_home_screen [EXTRACTED 1.00]
- **Python Scripts Dependency Stack** — scripts_requirements_txt, scripts_openpyxl, scripts_supabase_python, scripts_python_dotenv [EXTRACTED 1.00]
- **Core Database Model** — database_areas_table, database_packages_table, database_customers_table, database_staff_table, database_bills_table, database_complaints_table [EXTRACTED 1.00]
- **Staff Authentication Flow** — staff_auth_credentials, staff_auth_pgcrypto_hashing, staff_auth_set_staff_password, staff_auth_verify_staff_login, staff_app_auth_provider [INFERRED 0.82]
- **Performance Data Access Improvements** — performance_paginated_customer_query, performance_page_cache, performance_dashboard_summary_rpc, performance_db_indexes, performance_perf_smoke [EXTRACTED 1.00]

## Communities (47 total, 14 thin omitted)

### Community 0 - "Auth Shell"
Cohesion: 0.06
Nodes (36): withTimeout(), AuthContext, AuthContextValue, AuthProvider(), fetchStaffByAuthId(), useAuth(), LoginScreen(), canAccessPage() (+28 more)

### Community 1 - "Billing Utilities"
Cohesion: 0.07
Nodes (40): BillableStatus, BillAmountSource, getCurrentBillingMonth(), normalizeBillingMonth(), BillingTab, BillsPageQuery, BillStatus, BillStatusFilter (+32 more)

### Community 2 - "Billing Payments MVP"
Cohesion: 0.06
Nodes (44): Billing Core Helpers, generate_monthly_bills RPC, Billing Payments MVP Plan, Billing Page Payment UX, Payments Table, record_bill_payment RPC, areas Table, bills Table (+36 more)

### Community 3 - "Dashboard Auth Design"
Cohesion: 0.07
Nodes (44): AccessDenied Component, Admin Role, Admin API Routes (create-dashboard-user, reset-dashboard-password), AuthContext (AuthProvider + useAuth), Complaint Manager Role, Dashboard Auth & Role-Based Access Design Spec, Dashboard Auth Design Spec Citation, Email-as-Username Mapping (@powernet.local) (+36 more)

### Community 4 - "Reports Summary"
Cohesion: 0.09
Nodes (30): AgentCollectionReport, getReportsSummary(), normalizeAgentCollection(), normalizeCards(), normalizeChart(), normalizeReportsSummary(), ReportCards, reportsCache (+22 more)

### Community 5 - "Package Dependencies"
Cohesion: 0.06
Nodes (30): dependencies, next, react, react-dom, @supabase/supabase-js, devDependencies, eslint, eslint-config-next (+22 more)

### Community 6 - "Billing Notifications"
Cohesion: 0.11
Nodes (26): getRecentPaymentEvents(), getRecentVisitedBills(), BillingNotification, BillingNotificationSource, BillingNotificationType, BillingRealtimeBillRow, buildBillingNotification(), buildBillingNotificationDedupeKey() (+18 more)

### Community 7 - "Customer List Cache"
Cohesion: 0.12
Nodes (23): getCachedAreas(), getCachedPackages(), setCachedAreas(), setCachedPackages(), CustomerListParams, getCustomerList(), createCustomer(), CustomerSearchResult (+15 more)

### Community 8 - "Chart Components"
Cohesion: 0.12
Nodes (18): BarChart(), BarDatum, Donut(), RevenueLineChart(), Sparkline(), IconBadge(), DashboardStatsShape, getDashboardRefreshToken() (+10 more)

### Community 9 - "UI Primitives"
Cohesion: 0.16
Nodes (15): Sidebar(), Avatar(), Badge(), Drawer(), Modal(), Switch(), Tabs(), avClass() (+7 more)

### Community 10 - "TypeScript Compiler"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 11 - "Admin Staff APIs"
Cohesion: 0.20
Nodes (13): createOrReuseStaffAuthUser(), findAuthUserByEmail(), StaffAuthUserResult, getCallerStaffRole(), POST(), getCallerStaffRole(), MOBILE_ROLES, POST() (+5 more)

### Community 12 - "Database Schema"
Cohesion: 0.27
Nodes (18): areas Table, bills Table, complaints Table, customers Table, packages Table, payments Table, staff Table, pg_trgm Trigram Search (GIN indexes) (+10 more)

### Community 13 - "Complaint Data Layer"
Cohesion: 0.16
Nodes (13): RECENT_COMPLAINT_STATUSES, RecentComplaintStatus, clearComplaintsCache(), createComplaint(), getComplaintById(), getComplaints(), getRecentComplaintStatusEvents(), updateComplaint() (+5 more)

### Community 14 - "Area Data Layer"
Cohesion: 0.21
Nodes (8): clearAreaCaches(), createArea(), getAreaCustomerCounts(), getAreas(), updateArea(), getStaff(), pins, StaffWithArea

### Community 15 - "Excel Migration"
Cohesion: 0.17
Nodes (9): find_header_row(), get_col(), load_env(), main(), parse_due(), PowerNet Manager — Excel to Supabase migration script. Run: python scripts/migra, Return 0-based index of row containing 'USER NAME'., Return 0-based column index for first matching header name. (+1 more)

### Community 16 - "Billing Notification Tests"
Cohesion: 0.17
Nodes (11): assert, billing, { execFileSync }, fs, full, outDir, partial, path (+3 more)

### Community 17 - "Report Tests"
Cohesion: 0.17
Nodes (11): assert, core, csv, { execFileSync }, fs, outDir, path, root (+3 more)

### Community 18 - "Async Timeout Tests"
Cohesion: 0.18
Nodes (10): assert, { execFileSync }, fs, outDir, path, root, run(), source (+2 more)

### Community 19 - "Dashboard Realtime Tests"
Cohesion: 0.18
Nodes (10): assert, { execFileSync }, fs, outDir, path, root, sources, statuses (+2 more)

### Community 20 - "Staff Package Data"
Cohesion: 0.29
Nodes (7): getPackages(), clearStaffCache(), createStaff(), deleteStaff(), updateStaff(), updateStaffPassword(), supabase

### Community 21 - "Billing Core Tests"
Cohesion: 0.20
Nodes (9): assert, core, { execFileSync }, fs, outDir, path, root, source (+1 more)

### Community 22 - "Billing Query Tests"
Cohesion: 0.20
Nodes (9): assert, { execFileSync }, fs, outDir, path, query, root, source (+1 more)

### Community 23 - "Notification Navigation Tests"
Cohesion: 0.20
Nodes (9): assert, { execFileSync }, fs, navigation, outDir, path, root, source (+1 more)

### Community 24 - "Realtime Resilience Tests"
Cohesion: 0.20
Nodes (9): assert, { execFileSync }, fs, outDir, path, resilience, root, source (+1 more)

### Community 25 - "Notification Builders"
Cohesion: 0.39
Nodes (8): buildBillingNotification(), buildBillingNotificationDedupeKey(), didBillRefreshChange(), didNotifyChange(), didPaymentChange(), formatRs(), formatVisitNote(), toNumber()

### Community 26 - "Project Documentation"
Cohesion: 0.25
Nodes (8): CLAUDE.md — Claude Code Project Instructions, CSS Custom Properties Theming (no Tailwind), Next.js 15 App Router, PowerNet Manager, React State Routing (SPA Pattern), README.md — Project Documentation, Role-Based Access Control, Supabase (PostgreSQL Backend)

### Community 27 - "Performance Smoke"
Cohesion: 0.32
Nodes (7): { createClient }, fs, getRows(), index, main(), supabase, timed()

### Community 29 - "Caveman Rules"
Cohesion: 0.25
Nodes (8): Auto-Clarity Boundary, Caveman Response Style, Copilot Instructions, Caveman Mode Switches, OpenCode Caveman Response Style, OpenCode Agents Instructions, Always-On Caveman Rule, Windsurf Caveman Rule

### Community 30 - "Billing Query Filters"
Cohesion: 0.60
Nodes (3): buildBillsPageCacheKey(), getBillRange(), normalizeBillingSearch()

## Knowledge Gaps
- **202 isolated node(s):** `extends`, `nextConfig`, `name`, `version`, `private` (+197 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **14 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `withTimeout()` connect `Auth Shell` to `Billing Utilities`, `Async Timeout Tests`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Why does `supabase` connect `Staff Package Data` to `Auth Shell`, `Billing Utilities`, `Reports Summary`, `Billing Notifications`, `Customer List Cache`, `Chart Components`, `UI Primitives`, `Complaint Data Layer`, `Area Data Layer`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **Why does `run()` connect `Async Timeout Tests` to `Auth Shell`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **What connects `extends`, `nextConfig`, `name` to the rest of the system?**
  _236 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Auth Shell` be split into smaller, more focused modules?**
  _Cohesion score 0.05576441102756892 - nodes in this community are weakly interconnected._
- **Should `Billing Utilities` be split into smaller, more focused modules?**
  _Cohesion score 0.07246376811594203 - nodes in this community are weakly interconnected._
- **Should `Billing Payments MVP` be split into smaller, more focused modules?**
  _Cohesion score 0.0613107822410148 - nodes in this community are weakly interconnected._