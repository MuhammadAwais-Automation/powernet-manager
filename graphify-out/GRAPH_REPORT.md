# Graph Report - e:\Power Net Manager  (2026-05-21)

## Corpus Check
- 96 files · ~68,093 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 683 nodes · 1067 edges · 42 communities (29 shown, 13 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 17 edges (avg confidence: 0.89)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Web Dashboard UI Shell|Web Dashboard UI Shell]]
- [[_COMMUNITY_Flutter Data Repositories|Flutter Data Repositories]]
- [[_COMMUNITY_Billing Core Logic|Billing Core Logic]]
- [[_COMMUNITY_Auth & Access Control|Auth & Access Control]]
- [[_COMMUNITY_Reports & Analytics|Reports & Analytics]]
- [[_COMMUNITY_Flutter App Theme & Screens|Flutter App Theme & Screens]]
- [[_COMMUNITY_Manager Pages & API Routes|Manager Pages & API Routes]]
- [[_COMMUNITY_DB Schema & Core Components|DB Schema & Core Components]]
- [[_COMMUNITY_Cable Operator Flow|Cable Operator Flow]]
- [[_COMMUNITY_Field Agent Customer Detail|Field Agent Customer Detail]]
- [[_COMMUNITY_Collector Bill List|Collector Bill List]]
- [[_COMMUNITY_Mobile Home Screen|Mobile Home Screen]]
- [[_COMMUNITY_Technician Complaint List|Technician Complaint List]]
- [[_COMMUNITY_Cable Operator Customer List|Cable Operator Customer List]]
- [[_COMMUNITY_Technician Complaint Detail|Technician Complaint Detail]]
- [[_COMMUNITY_Charts & UI Primitives|Charts & UI Primitives]]
- [[_COMMUNITY_Field Agent Customer List|Field Agent Customer List]]
- [[_COMMUNITY_Mobile Router & Navigation|Mobile Router & Navigation]]
- [[_COMMUNITY_Excel Migration Scripts|Excel Migration Scripts]]
- [[_COMMUNITY_Reports Core Tests|Reports Core Tests]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]

## God Nodes (most connected - your core abstractions)
1. `package:flutter/material.dart` - 18 edges
2. `../theme/app_theme.dart` - 17 edges
3. `Database Table: customers` - 13 edges
4. `supabase` - 12 edges
5. `Database Table: staff` - 12 edges
6. `useAuth()` - 11 edges
7. `package:go_router/go_router.dart` - 11 edges
8. `package:provider/provider.dart` - 11 edges
9. `../../providers/auth_provider.dart` - 10 edges
10. `Database Table: bills` - 10 edges

## Surprising Connections (you probably didn't know these)
- `Billing Core Module (src/lib/billing/core.ts)` --references--> `Database Table: customers`  [INFERRED]
  docs/superpowers/plans/2026-04-28-billing-payments-mvp.md → docs/superpowers/specs/2026-04-24-powernet-database-design.md
- `Billing Core Module (src/lib/billing/core.ts)` --references--> `Database Table: bills`  [INFERRED]
  docs/superpowers/plans/2026-04-28-billing-payments-mvp.md → docs/superpowers/specs/2026-04-24-powernet-database-design.md
- `Sidebar()` --calls--> `initials()`  [EXTRACTED]
  PowerNet Manager/src/components/App.tsx → PowerNet Manager/src/lib/utils.ts
- `Topbar()` --calls--> `initials()`  [EXTRACTED]
  PowerNet Manager/src/components/App.tsx → PowerNet Manager/src/lib/utils.ts
- `LoginScreen()` --calls--> `useAuth()`  [EXTRACTED]
  PowerNet Manager/src/components/auth/LoginScreen.tsx → PowerNet Manager/src/lib/auth/auth-context.tsx

## Hyperedges (group relationships)
- **Core Supabase Tables** — db_table_areas, db_table_packages, db_table_customers, db_table_staff, db_table_bills, db_table_complaints [EXTRACTED 1.00]
- **Dashboard Authentication Components** — component_auth_context, component_permissions_module, component_login_screen_dashboard, component_supabase_admin_client, api_create_dashboard_user, api_reset_dashboard_password [EXTRACTED 1.00]
- **Flutter App Screens** — flutter_splash_screen, flutter_login_screen, flutter_home_screen [EXTRACTED 1.00]
- **Dashboard Roles (admin + complaint_manager)** — role_admin, role_complaint_manager, component_permissions_module, component_auth_context [EXTRACTED 1.00]
- **Mobile Staff Roles** — role_technician, role_recovery_agent, role_helper, rpc_verify_staff_login [EXTRACTED 1.00]
- **Billing RPCs (generate + record payment)** — rpc_generate_monthly_bills, rpc_record_bill_payment, db_table_bills, db_table_payments [EXTRACTED 1.00]
- **Performance Improvements Set** — perf_customer_list_query, perf_customer_cache, rpc_get_dashboard_summary, perf_indexes_sql [EXTRACTED 1.00]
- **Phase 2 Fixed Features** — feature_customer_pagination, feature_customer_edit, feature_log_complaint_modal, feature_staff_create_account, feature_areas_crud, feature_dashboard_realdata [EXTRACTED 1.00]

## Communities (42 total, 13 thin omitted)

### Community 0 - "Web Dashboard UI Shell"
Cohesion: 0.05
Nodes (62): Sidebar(), Topbar(), IconName, IconProps, IconSet, Avatar(), Badge(), Drawer() (+54 more)

### Community 1 - "Flutter Data Repositories"
Cohesion: 0.05
Nodes (38): ../config/supabase_config.dart, dart:convert, ../../data/bills_repository.dart, AreasRepository, BillsRepository, ComplaintsRepository, AuthProvider, _listenAuthState (+30 more)

### Community 2 - "Billing Core Logic"
Cohesion: 0.08
Nodes (39): BillableStatus, BillAmountSource, getCurrentBillingMonth(), normalizeBillingMonth(), BillingTab, BillsPageQuery, BillStatus, BillStatusFilter (+31 more)

### Community 3 - "Auth & Access Control"
Cohesion: 0.06
Nodes (32): withTimeout(), AuthContext, AuthContextValue, AuthProvider(), fetchStaffByAuthId(), useAuth(), LoginScreen(), canAccessPage() (+24 more)

### Community 4 - "Reports & Analytics"
Cohesion: 0.1
Nodes (30): AgentCollectionReport, getReportsSummary(), normalizeAgentCollection(), normalizeCards(), normalizeChart(), normalizeReportsSummary(), ReportCards, reportsCache (+22 more)

### Community 5 - "Flutter App Theme & Screens"
Cohesion: 0.06
Nodes (29): build, Scaffold, SplashScreen, buildDarkTheme, buildLightTheme, _buildTheme, copyWith, lerp (+21 more)

### Community 6 - "Manager Pages & API Routes"
Cohesion: 0.07
Nodes (35): API Route: /api/admin/create-dashboard-user, API Route: /api/admin/reset-dashboard-password, App.tsx (Main Shell), AreasPage Component, ComplaintsPage Component, CustomersPage Component, DashboardPage Component, LoginScreen Component (Dashboard) (+27 more)

### Community 7 - "DB Schema & Core Components"
Cohesion: 0.1
Nodes (34): Billing Core Module (src/lib/billing/core.ts), React AuthContext & useAuth Hook, BillingPage Component, DB Query Layer (src/lib/db/), Database Table: areas, Database Table: bills, Database Table: complaints, Database Table: customers (+26 more)

### Community 8 - "Cable Operator Flow"
Cohesion: 0.09
Nodes (21): build, Card, CoCustomerDetailScreen, _CoCustomerDetailScreenState, _CoInfoTab, _ComplaintsTab, _CopyRow, dispose (+13 more)

### Community 9 - "Field Agent Customer Detail"
Cohesion: 0.1
Nodes (20): build, Card, _ComplaintsTab, _CopyRow, CustomerDetailScreen, _CustomerDetailScreenState, dispose, EmptyState (+12 more)

### Community 10 - "Collector Bill List"
Cohesion: 0.11
Nodes (18): _BillList, BillListScreen, _BillListScreenState, _BillTile, build, Card, Center, dispose (+10 more)

### Community 11 - "Mobile Home Screen"
Cohesion: 0.11
Nodes (18): _ActionTile, build, Card, Column, Container, HomeScreen, _HomeScreenState, initState (+10 more)

### Community 12 - "Technician Complaint List"
Cohesion: 0.11
Nodes (18): build, Card, Center, Color, _ComplaintList, ComplaintListScreen, _ComplaintListScreenState, _ComplaintTile (+10 more)

### Community 13 - "Cable Operator Customer List"
Cohesion: 0.11
Nodes (17): build, Card, Center, CoCustomerListScreen, _CoCustomerListScreenState, _CoCustomerTile, _CustomerList, dispose (+9 more)

### Community 14 - "Technician Complaint Detail"
Cohesion: 0.11
Nodes (17): _ActionButton, _Body, build, Card, ComplaintDetailScreen, _ComplaintDetailScreenState, _formatDate, Function (+9 more)

### Community 15 - "Charts & UI Primitives"
Cohesion: 0.16
Nodes (13): BarChart(), BarDatum, Donut(), RevenueLineChart(), Sparkline(), IconBadge(), ActivityItem, DashboardStats (+5 more)

### Community 16 - "Field Agent Customer List"
Cohesion: 0.12
Nodes (16): build, Card, Center, _CustomerTile, dispose, EmptyState, ErrorState, FieldAgentCustomerListScreen (+8 more)

### Community 17 - "Mobile Router & Navigation"
Cohesion: 0.13
Nodes (14): buildRouter, GoRouter, ../screens/cable_operator/co_customer_detail_screen.dart, ../screens/cable_operator/co_customer_list_screen.dart, ../screens/collector/bill_list_screen.dart, ../screens/collector/collect_payment_screen.dart, ../screens/field_agent/customer_detail_screen.dart, ../screens/field_agent/customer_list_screen.dart (+6 more)

### Community 18 - "Excel Migration Scripts"
Cohesion: 0.17
Nodes (9): find_header_row(), get_col(), load_env(), main(), parse_due(), PowerNet Manager — Excel to Supabase migration script. Run: python scripts/migra, Return 0-based index of row containing 'USER NAME'., Return 0-based column index for first matching header name. (+1 more)

### Community 19 - "Reports Core Tests"
Cohesion: 0.17
Nodes (11): assert, core, csv, { execFileSync }, fs, outDir, path, root (+3 more)

### Community 20 - "Community 20"
Cohesion: 0.18
Nodes (10): _Avatar, build, Center, Padding, ProfileScreen, _Row, Scaffold, SizedBox (+2 more)

### Community 21 - "Community 21"
Cohesion: 0.18
Nodes (10): app/router.dart, build, initState, initSupabase, MultiProvider, PowerNetStaffApp, _PowerNetStaffAppState, ../../providers/bills_provider.dart (+2 more)

### Community 22 - "Community 22"
Cohesion: 0.18
Nodes (10): build, dispose, Icon, LoginScreen, _LoginScreenState, Scaffold, _showError, SizedBox (+2 more)

### Community 23 - "Community 23"
Cohesion: 0.2
Nodes (9): assert, core, { execFileSync }, fs, outDir, path, root, source (+1 more)

### Community 24 - "Community 24"
Cohesion: 0.2
Nodes (9): assert, { execFileSync }, fs, outDir, path, query, root, source (+1 more)

### Community 25 - "Community 25"
Cohesion: 0.39
Nodes (5): getCallerStaffRole(), POST(), supabaseAdmin, getCallerStaffRole(), POST()

### Community 26 - "Community 26"
Cohesion: 0.32
Nodes (7): { createClient }, fs, getRows(), index, main(), supabase, timed()

### Community 27 - "Community 27"
Cohesion: 0.29
Nodes (5): ../../data/customers_repository.dart, CustomersRepository, clearSearch, CustomersProvider, ../../models/customer.dart

### Community 29 - "Community 29"
Cohesion: 0.5
Nodes (3): ../../data/complaints_repository.dart, ComplaintQueueProvider, ../../models/complaint.dart

## Knowledge Gaps
- **364 isolated node(s):** `inter`, `metadata`, `ALL_NAV`, `PAGE_META`, `ROLE_LABEL_SHORT` (+359 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `package:flutter/material.dart` connect `Flutter App Theme & Screens` to `Flutter Data Repositories`, `Cable Operator Flow`, `Field Agent Customer Detail`, `Collector Bill List`, `Mobile Home Screen`, `Technician Complaint List`, `Cable Operator Customer List`, `Technician Complaint Detail`, `Field Agent Customer List`, `Community 20`, `Community 21`, `Community 22`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **Why does `../theme/app_theme.dart` connect `Flutter App Theme & Screens` to `Flutter Data Repositories`, `Cable Operator Flow`, `Field Agent Customer Detail`, `Collector Bill List`, `Mobile Home Screen`, `Technician Complaint List`, `Cable Operator Customer List`, `Technician Complaint Detail`, `Field Agent Customer List`, `Community 20`, `Community 21`, `Community 22`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **Why does `../config/supabase_config.dart` connect `Flutter Data Repositories` to `Community 27`, `Community 21`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **What connects `inter`, `metadata`, `ALL_NAV` to the rest of the system?**
  _364 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Web Dashboard UI Shell` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Flutter Data Repositories` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Billing Core Logic` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._