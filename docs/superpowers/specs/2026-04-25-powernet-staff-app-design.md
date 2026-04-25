# PowerNet Staff App (Flutter) — Design Spec
**Date:** 2026-04-25
**Project:** PowerNet Staff App (Flutter mobile app)
**Scope:** Phase 1 — login, session persistence, welcome screen with role display.

---

## Problem

Admin dashboard mein staff members ko username + password credentials diye jaate hain (via `set_staff_password` RPC). Staff ke paas abhi login karne ki koi jagah nahi hai. Ek simple Flutter mobile app chahiye jis mein wo apne credentials se login karein aur apna role confirm kar saken — features baad mein add honge.

---

## Goal

1. Staff Android phone par app install karein, username + password se login karein
2. Login ke baad welcome screen dikhaye: name + role
3. Session persist ho — app band kar ke kholne par wapas login nahi karna parhe
4. Logout button jo session clear kare
5. Wrong credentials / network errors par clean error messages

---

## What Is NOT In Scope (Phase 1)

- Role-specific feature screens (technician jobs, recovery agent collections, complaints)
- iOS build (Android only Phase 1, iOS Phase 2+)
- Push notifications
- Password reset from mobile (only admin can reset via dashboard)
- Profile edit
- Offline support
- Biometric login
- Formal unit/integration tests

---

## Key Decisions

| Decision | Value | Reason |
|---|---|---|
| Project location | `D:\PowerNet Staff App\` (separate folder, separate git repo) | Flutter aur admin dashboard ki dependencies alag, clean boundary |
| Platform | Android only Phase 1, iOS Phase 2 if needed | Saara staff Android use karta hai |
| State management | Provider | Simple, Flutter team recommended, Phase 1 ke liye sufficient |
| Session persistence | SharedPreferences, stay-logged-in indefinitely | Staff ke liye convenient — daily use |
| Theme | Material 3, light, primary `#F05A2B` (PowerNet orange) | Admin dashboard branding ke saath consistency |
| App name | "PowerNet Staff" | |
| Android package ID | `com.powernet.staff` | |

---

## Architecture

### Project Structure

```
D:\PowerNet Staff App\
├── android/                         # Android platform config
├── lib/
│   ├── main.dart                    # App entry + ThemeData + root routing
│   ├── config/
│   │   └── supabase_config.dart     # Supabase initialize (URL + anon key from .env)
│   ├── models/
│   │   └── staff.dart               # Staff model (fromJson/toJson)
│   ├── providers/
│   │   └── auth_provider.dart       # ChangeNotifier — login state + prefs persistence
│   ├── services/
│   │   └── auth_service.dart        # verify_staff_login RPC wrapper
│   ├── screens/
│   │   ├── splash_screen.dart       # Startup — checks saved session, routes
│   │   ├── login_screen.dart        # Username + password form
│   │   └── home_screen.dart         # Welcome + role + logout
│   └── theme/
│       └── app_theme.dart           # Orange Material 3 theme
├── pubspec.yaml
└── .env                             # Supabase creds (gitignored)
```

### Dependencies (pubspec.yaml)

- `supabase_flutter` — official Supabase client
- `provider` — state management
- `shared_preferences` — local session storage
- `flutter_dotenv` — `.env` file loading

---

## Data Model

### Staff model

```dart
class Staff {
  final String id;
  final String fullName;
  final String role;        // 'technician' | 'recovery_agent' | 'helper_technician' | 'cable_operator' | 'admin'
  final String? phone;
  final String? areaId;
  final String? areaName;

  Staff.fromJson(Map<String, dynamic> json);
  Map<String, dynamic> toJson();
}
```

### Role display labels

- `technician` → "Technician"
- `recovery_agent` → "Recovery Agent"
- `helper_technician` → "Helper Technician"
- `cable_operator` → "Cable Operator"
- `admin` → "Admin"

---

## Authentication Flow

```
App launches
    ↓
SplashScreen
  checks SharedPreferences 'staff_json'
    ↓                    ↓
  found              not found
    ↓                    ↓
HomeScreen          LoginScreen
                      ↓  user submits
                    AuthService.login(u, p)
                      ↓
                  supabase.rpc('verify_staff_login', {p_username, p_password})
                    ↓                ↓
                success            failure
                  ↓                  ↓
             save to prefs      show SnackBar
             → HomeScreen       "Invalid credentials"
```

### RPC Call

```dart
final response = await supabase.rpc('verify_staff_login', params: {
  'p_username': username,
  'p_password': password,
});

// response shape:
// success → { success: true, staff: { id, full_name, role, phone, area_id, area_name } }
// failure → { success: false, error: "Invalid credentials" }
```

### Session persistence

On successful login:
```dart
prefs.setString('staff_json', jsonEncode(staff.toJson()));
```
On splash startup:
```dart
final json = prefs.getString('staff_json');
if (json != null) currentStaff = Staff.fromJson(jsonDecode(json));
```
On logout:
```dart
prefs.remove('staff_json');
```

Plain text password kabhi save nahi hoti — sirf staff object (jis mein password nahi hai).

---

## Screens

### 1. SplashScreen
- Center: PowerNet logo + small CircularProgressIndicator
- Background: white, orange accent
- 500ms ke andar `AuthProvider.loadSavedStaff()` run
- Saved staff mila → HomeScreen, nahi mila → LoginScreen

### 2. LoginScreen

```
┌──────────────────────────────┐
│     [PowerNet logo]          │
│     PowerNet Staff           │
│                              │
│  ┌────────────────────────┐  │
│  │ 👤 Username            │  │
│  └────────────────────────┘  │
│                              │
│  ┌────────────────────────┐  │
│  │ 🔒 Password       👁   │  │
│  └────────────────────────┘  │
│                              │
│  ┌────────────────────────┐  │
│  │   LOGIN  (orange)      │  │
│  └────────────────────────┘  │
└──────────────────────────────┘
```

- Username TextField — autocorrect off, lowercase input
- Password TextField — obscured with show/hide eye icon toggle
- LOGIN button — orange, full width, disabled while loading
- Full-screen loading overlay while RPC is in flight
- Invalid credentials → red SnackBar: "Invalid credentials"
- Network error → red SnackBar: "Connection error, try again"
- Empty fields → inline "Required" error + button disabled

### 3. HomeScreen

```
┌──────────────────────────────┐
│ PowerNet Staff         [⎋]   │  ← AppBar with logout icon
├──────────────────────────────┤
│                              │
│     [large user icon]        │
│                              │
│     Welcome,                 │
│     Muhammad Mohsin          │  ← 24px bold
│                              │
│     ┌──────────────────┐     │
│     │   Technician     │     │  ← orange pill badge
│     └──────────────────┘     │
└──────────────────────────────┘
```

- AppBar title: "PowerNet Staff"
- AppBar right: logout icon
- Logout tap → confirm dialog ("Are you sure? Logout / Cancel")
- Body: centered column — big avatar icon → "Welcome," → full name → role pill badge
- Android back button → system default (exit app, no navigate back to login)

---

## Error Handling Matrix

| Scenario | Behavior |
|---|---|
| Wrong credentials | Red SnackBar: "Invalid credentials" |
| Empty username or password | Inline "Required" error, LOGIN button disabled |
| No internet | Red SnackBar: "No internet connection" |
| Server error / timeout | Red SnackBar: "Connection error, try again" |
| Staff `is_active = false` | RPC returns `success: false` → same "Invalid credentials" (don't leak disabled status) |
| App crashes mid-login | Prefs only written on success — safe |
| Corrupt saved staff JSON | Try-catch → clear prefs → LoginScreen |
| Android back on HomeScreen | System default (exit) |

---

## Testing

Phase 1 ke liye formal test suite nahi — manual checklist:

- Sahi creds → HomeScreen + correct name/role
- Galat password → "Invalid credentials" SnackBar
- Empty fields → LOGIN disabled
- Login karo → app band → kholo → auto HomeScreen
- Logout → LoginScreen → app band → kholo → LoginScreen (session cleared)
- Internet off → login try → "No internet" SnackBar
- Admin dashboard se password reset hone ke baad app mein purana password reject

Phase 2 mein `flutter_test` add hoga jab real features aayenge.

---

## Environment Setup

`.env` (gitignored):
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOi...
```

`pubspec.yaml` assets section:
```yaml
flutter:
  assets:
    - .env
```

---

## File Changes Summary

| File | Purpose |
|---|---|
| `pubspec.yaml` | Flutter dependencies |
| `.env` | Supabase credentials (gitignored) |
| `lib/main.dart` | App root, ThemeData, MultiProvider wrapping |
| `lib/config/supabase_config.dart` | Supabase.initialize() |
| `lib/theme/app_theme.dart` | Material 3 orange theme |
| `lib/models/staff.dart` | Staff model |
| `lib/services/auth_service.dart` | RPC wrapper for verify_staff_login |
| `lib/providers/auth_provider.dart` | ChangeNotifier — login state + prefs |
| `lib/screens/splash_screen.dart` | Startup routing |
| `lib/screens/login_screen.dart` | Username + password form |
| `lib/screens/home_screen.dart` | Welcome + role + logout |
| `android/app/build.gradle` | App ID `com.powernet.staff`, min SDK 21 |

---

## Future Phases (Out of Scope)

- **Phase 2:** Role-specific dashboards — Technician sees assigned complaints, Recovery Agent sees collection list, etc.
- **Phase 3:** Push notifications for new assignments
- **Phase 4:** iOS build
- **Phase 5:** Offline support, biometric login

No changes to this Phase 1 spec are needed when building later phases — har phase apna spec banayega.
