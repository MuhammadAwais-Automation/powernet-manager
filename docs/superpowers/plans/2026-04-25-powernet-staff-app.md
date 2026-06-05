# PowerNet Staff App (Flutter, Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Flutter Android app (`PowerNet Staff`) for ISP staff to log in with admin-issued credentials, persist session, and see their name + role on a welcome screen.

**Architecture:** Standalone Flutter project at `D:\PowerNet Staff App\` (separate folder, separate git repo). Calls Supabase `verify_staff_login` RPC via `supabase_flutter`. State in `AuthProvider` (ChangeNotifier + `provider` package). Session persisted in `SharedPreferences` as a JSON-encoded `Staff` object. Material 3 light theme with PowerNet orange (`#F05A2B`).

**Tech Stack:** Flutter 3.x, Dart, `supabase_flutter`, `provider`, `shared_preferences`, `flutter_dotenv`.

**Spec:** `docs/superpowers/specs/2026-04-25-powernet-staff-app-design.md` (in PowerNet Manager repo).

---

## File Structure

```
D:\PowerNet Staff App\
├── android/app/build.gradle              # applicationId = com.powernet.staff
├── lib/
│   ├── main.dart                         # App root, MultiProvider, theme, initial route = SplashScreen
│   ├── config/
│   │   └── supabase_config.dart          # Supabase.initialize() using dotenv values
│   ├── theme/
│   │   └── app_theme.dart                # Material 3 orange theme (ThemeData)
│   ├── models/
│   │   └── staff.dart                    # Staff class + fromJson/toJson + roleLabel getter
│   ├── services/
│   │   └── auth_service.dart             # login() → calls verify_staff_login RPC
│   ├── providers/
│   │   └── auth_provider.dart            # ChangeNotifier with currentStaff, login(), logout(), loadSavedStaff()
│   └── screens/
│       ├── splash_screen.dart            # Calls loadSavedStaff() on init, routes to Home or Login
│       ├── login_screen.dart             # Form: username + password + LOGIN button
│       └── home_screen.dart              # Welcome + name + role pill + logout
├── assets/
│   └── .env                              # SUPABASE_URL + SUPABASE_ANON_KEY (gitignored)
├── pubspec.yaml                          # Dependencies + asset declarations
└── .gitignore                            # Includes .env
```

**Note on testing:** Per the spec, Phase 1 has no formal test suite. Tasks end with manual verification steps instead of automated tests. Phase 2 will introduce `flutter_test`.

---

## Prerequisites

Before starting, verify:

- [ ] Flutter SDK installed (`flutter --version` works, 3.0+)
- [ ] Android Studio or Android SDK installed with an emulator or physical Android device
- [ ] Supabase URL and anon key available (copy from `D:\PowerNet Manager\.env.local`)
- [ ] `git` installed and configured

---

## Task 1: Create Flutter project + initial commit

**Files:**
- Create: `D:\PowerNet Staff App\` (entire project)

- [ ] **Step 1: Create the Flutter project**

Run (from `D:\`):
```bash
cd D:\
flutter create --org com.powernet --project-name powernet_staff --platforms=android "PowerNet Staff App"
```

Expected: `D:\PowerNet Staff App\` folder created with Flutter scaffold. Android `applicationId` will be `com.powernet.powernet_staff` by default — we'll fix to `com.powernet.staff` in Task 2.

- [ ] **Step 2: Verify app name in pubspec.yaml**

Open `D:\PowerNet Staff App\pubspec.yaml`. Confirm:
```yaml
name: powernet_staff
description: "PowerNet Staff mobile app."
```

- [ ] **Step 3: Verify it builds and runs**

Run (from `D:\PowerNet Staff App`):
```bash
flutter pub get
flutter run
```

Expected: Default Flutter counter app launches on emulator/device. Stop the app with `q` in terminal.

- [ ] **Step 4: Init git + first commit**

```bash
cd "D:\PowerNet Staff App"
git init
git add .
git commit -m "chore: initial Flutter scaffold from flutter create"
```

---

## Task 2: Fix Android application ID to `com.powernet.staff`

**Files:**
- Modify: `android/app/build.gradle` (or `build.gradle.kts`)
- Modify: `android/app/src/main/AndroidManifest.xml` (verify)

- [ ] **Step 1: Update applicationId in build.gradle**

Open `D:\PowerNet Staff App\android\app\build.gradle` (or `.gradle.kts` if Kotlin DSL). Find the `defaultConfig` block. Change `applicationId`:

```gradle
defaultConfig {
    applicationId "com.powernet.staff"
    minSdkVersion 21
    targetSdkVersion flutter.targetSdkVersion
    versionCode flutterVersionCode.toInteger()
    versionName flutterVersionName
}
```

If it's `build.gradle.kts`:
```kotlin
defaultConfig {
    applicationId = "com.powernet.staff"
    minSdk = 21
    targetSdk = flutter.targetSdkVersion
    versionCode = flutterVersionCode.toInteger()
    versionName = flutterVersionName
}
```

- [ ] **Step 2: Verify build**

```bash
flutter clean
flutter pub get
flutter run
```

Expected: App runs with package `com.powernet.staff`.

- [ ] **Step 3: Commit**

```bash
git add android/
git commit -m "chore: set applicationId to com.powernet.staff, minSdk 21"
```

---

## Task 3: Add dependencies + .env setup

**Files:**
- Modify: `pubspec.yaml`
- Create: `assets/.env`
- Modify: `.gitignore`

- [ ] **Step 1: Update pubspec.yaml dependencies**

Open `pubspec.yaml`. Replace the `dependencies:` and `flutter:` sections:

```yaml
dependencies:
  flutter:
    sdk: flutter
  cupertino_icons: ^1.0.6
  supabase_flutter: ^2.5.0
  provider: ^6.1.2
  shared_preferences: ^2.2.3
  flutter_dotenv: ^5.1.0

flutter:
  uses-material-design: true
  assets:
    - assets/.env
```

- [ ] **Step 2: Install dependencies**

```bash
flutter pub get
```

Expected: All packages downloaded with no errors.

- [ ] **Step 3: Create the .env file**

Create `D:\PowerNet Staff App\assets\.env` with the Supabase credentials from the admin dashboard's `.env.local`:

```
SUPABASE_URL=https://YOUR-PROJECT-ID.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
```

Use the values from `D:\PowerNet Manager\.env.local` — `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

- [ ] **Step 4: Add .env to .gitignore**

Open `.gitignore` and add at the bottom:

```
# Supabase secrets
assets/.env
```

- [ ] **Step 5: Commit**

```bash
git add pubspec.yaml pubspec.lock .gitignore
git commit -m "chore: add supabase_flutter, provider, shared_preferences, dotenv deps"
```

---

## Task 4: Supabase config

**Files:**
- Create: `lib/config/supabase_config.dart`

- [ ] **Step 1: Create the config file**

Create `lib/config/supabase_config.dart`:

```dart
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

Future<void> initSupabase() async {
  await dotenv.load(fileName: 'assets/.env');
  await Supabase.initialize(
    url: dotenv.env['SUPABASE_URL']!,
    anonKey: dotenv.env['SUPABASE_ANON_KEY']!,
  );
}

SupabaseClient get supabase => Supabase.instance.client;
```

- [ ] **Step 2: Commit**

```bash
git add lib/config/supabase_config.dart
git commit -m "feat: add Supabase initialization from .env"
```

---

## Task 5: Theme

**Files:**
- Create: `lib/theme/app_theme.dart`

- [ ] **Step 1: Create the theme file**

Create `lib/theme/app_theme.dart`:

```dart
import 'package:flutter/material.dart';

const primaryColor = Color(0xFFF05A2B);

ThemeData buildAppTheme() {
  return ThemeData(
    useMaterial3: true,
    brightness: Brightness.light,
    colorScheme: ColorScheme.fromSeed(
      seedColor: primaryColor,
      primary: primaryColor,
      brightness: Brightness.light,
    ),
    scaffoldBackgroundColor: Colors.white,
    appBarTheme: const AppBarTheme(
      backgroundColor: Colors.white,
      foregroundColor: Colors.black87,
      elevation: 0,
      centerTitle: false,
    ),
    inputDecorationTheme: InputDecorationTheme(
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
      ),
      contentPadding: const EdgeInsets.symmetric(
        horizontal: 16,
        vertical: 14,
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: primaryColor,
        foregroundColor: Colors.white,
        minimumSize: const Size.fromHeight(52),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
        textStyle: const TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.w600,
        ),
      ),
    ),
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/theme/app_theme.dart
git commit -m "feat: add Material 3 orange theme"
```

---

## Task 6: Staff model

**Files:**
- Create: `lib/models/staff.dart`

- [ ] **Step 1: Create the Staff model**

Create `lib/models/staff.dart`:

```dart
class Staff {
  final String id;
  final String fullName;
  final String role;
  final String? phone;
  final String? areaId;
  final String? areaName;

  Staff({
    required this.id,
    required this.fullName,
    required this.role,
    this.phone,
    this.areaId,
    this.areaName,
  });

  factory Staff.fromJson(Map<String, dynamic> json) {
    return Staff(
      id: json['id'] as String,
      fullName: json['full_name'] as String,
      role: json['role'] as String,
      phone: json['phone'] as String?,
      areaId: json['area_id'] as String?,
      areaName: json['area_name'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'full_name': fullName,
      'role': role,
      'phone': phone,
      'area_id': areaId,
      'area_name': areaName,
    };
  }

  String get roleLabel {
    switch (role) {
      case 'technician':
        return 'Technician';
      case 'recovery_agent':
        return 'Recovery Agent';
      case 'helper_technician':
        return 'Helper Technician';
      case 'cable_operator':
        return 'Cable Operator';
      case 'admin':
        return 'Admin';
      default:
        return role;
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/models/staff.dart
git commit -m "feat: add Staff model with fromJson/toJson and roleLabel"
```

---

## Task 7: AuthService (Supabase RPC wrapper)

**Files:**
- Create: `lib/services/auth_service.dart`

- [ ] **Step 1: Create AuthService**

Create `lib/services/auth_service.dart`:

```dart
import '../config/supabase_config.dart';
import '../models/staff.dart';

class AuthService {
  /// Returns Staff on success, null if credentials invalid.
  /// Throws on network / server errors.
  Future<Staff?> login(String username, String password) async {
    final response = await supabase.rpc('verify_staff_login', params: {
      'p_username': username,
      'p_password': password,
    });

    if (response is Map<String, dynamic> && response['success'] == true) {
      return Staff.fromJson(response['staff'] as Map<String, dynamic>);
    }
    return null;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/services/auth_service.dart
git commit -m "feat: add AuthService.login() wrapper for verify_staff_login RPC"
```

---

## Task 8: AuthProvider (state + persistence)

**Files:**
- Create: `lib/providers/auth_provider.dart`

- [ ] **Step 1: Create AuthProvider**

Create `lib/providers/auth_provider.dart`:

```dart
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/staff.dart';
import '../services/auth_service.dart';

class AuthProvider extends ChangeNotifier {
  static const _prefsKey = 'staff_json';
  final AuthService _service = AuthService();

  Staff? _currentStaff;
  Staff? get currentStaff => _currentStaff;
  bool get isLoggedIn => _currentStaff != null;

  /// Call once on app startup (from SplashScreen).
  Future<void> loadSavedStaff() async {
    final prefs = await SharedPreferences.getInstance();
    final json = prefs.getString(_prefsKey);
    if (json == null) return;
    try {
      _currentStaff = Staff.fromJson(jsonDecode(json) as Map<String, dynamic>);
      notifyListeners();
    } catch (_) {
      await prefs.remove(_prefsKey);
    }
  }

  /// Returns true on success, false on invalid credentials.
  /// Re-throws on network errors.
  Future<bool> login(String username, String password) async {
    final staff = await _service.login(username, password);
    if (staff == null) return false;
    _currentStaff = staff;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_prefsKey, jsonEncode(staff.toJson()));
    notifyListeners();
    return true;
  }

  Future<void> logout() async {
    _currentStaff = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_prefsKey);
    notifyListeners();
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/providers/auth_provider.dart
git commit -m "feat: add AuthProvider with login, logout, loadSavedStaff"
```

---

## Task 9: SplashScreen

**Files:**
- Create: `lib/screens/splash_screen.dart`

- [ ] **Step 1: Create SplashScreen**

Create `lib/screens/splash_screen.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../theme/app_theme.dart';
import 'home_screen.dart';
import 'login_screen.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    final auth = context.read<AuthProvider>();
    await auth.loadSavedStaff();
    if (!mounted) return;
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(
        builder: (_) => auth.isLoggedIn
            ? const HomeScreen()
            : const LoginScreen(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: Colors.white,
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.wifi_tethering, size: 72, color: primaryColor),
            SizedBox(height: 20),
            Text(
              'PowerNet Staff',
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w700,
                color: Colors.black87,
              ),
            ),
            SizedBox(height: 32),
            CircularProgressIndicator(
              valueColor: AlwaysStoppedAnimation(primaryColor),
              strokeWidth: 2.5,
            ),
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/screens/splash_screen.dart
git commit -m "feat: add SplashScreen with auto-routing based on saved session"
```

---

## Task 10: LoginScreen

**Files:**
- Create: `lib/screens/login_screen.dart`

- [ ] **Step 1: Create LoginScreen**

Create `lib/screens/login_screen.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../theme/app_theme.dart';
import 'home_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _usernameCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  bool _obscure = true;
  bool _loading = false;

  @override
  void dispose() {
    _usernameCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }

  bool get _canSubmit =>
      _usernameCtrl.text.trim().isNotEmpty &&
      _passwordCtrl.text.isNotEmpty &&
      !_loading;

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    setState(() => _loading = true);
    final auth = context.read<AuthProvider>();
    try {
      final ok = await auth.login(
        _usernameCtrl.text.trim().toLowerCase(),
        _passwordCtrl.text,
      );
      if (!mounted) return;
      if (ok) {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (_) => const HomeScreen()),
        );
      } else {
        _showError('Invalid credentials');
      }
    } catch (e) {
      if (!mounted) return;
      final msg = e.toString().toLowerCase().contains('socket') ||
              e.toString().toLowerCase().contains('network')
          ? 'No internet connection'
          : 'Connection error, try again';
      _showError(msg);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _showError(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg),
        backgroundColor: Colors.red.shade600,
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Icon(Icons.wifi_tethering, size: 64, color: primaryColor),
              const SizedBox(height: 12),
              const Text(
                'PowerNet Staff',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w700,
                  color: Colors.black87,
                ),
              ),
              const SizedBox(height: 40),
              TextField(
                controller: _usernameCtrl,
                textInputAction: TextInputAction.next,
                autocorrect: false,
                enableSuggestions: false,
                textCapitalization: TextCapitalization.none,
                decoration: const InputDecoration(
                  labelText: 'Username',
                  prefixIcon: Icon(Icons.person_outline),
                ),
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _passwordCtrl,
                obscureText: _obscure,
                textInputAction: TextInputAction.done,
                onSubmitted: (_) => _canSubmit ? _submit() : null,
                decoration: InputDecoration(
                  labelText: 'Password',
                  prefixIcon: const Icon(Icons.lock_outline),
                  suffixIcon: IconButton(
                    icon: Icon(_obscure
                        ? Icons.visibility_off_outlined
                        : Icons.visibility_outlined),
                    onPressed: () => setState(() => _obscure = !_obscure),
                  ),
                ),
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: 24),
              ElevatedButton(
                onPressed: _canSubmit ? _submit : null,
                child: _loading
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(
                          strokeWidth: 2.5,
                          valueColor: AlwaysStoppedAnimation(Colors.white),
                        ),
                      )
                    : const Text('LOGIN'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/screens/login_screen.dart
git commit -m "feat: add LoginScreen with username/password form and error handling"
```

---

## Task 11: HomeScreen

**Files:**
- Create: `lib/screens/home_screen.dart`

- [ ] **Step 1: Create HomeScreen**

Create `lib/screens/home_screen.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../theme/app_theme.dart';
import 'login_screen.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  Future<void> _confirmLogout(BuildContext context) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Logout'),
        content: const Text('Are you sure you want to logout?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: TextButton.styleFrom(foregroundColor: Colors.red.shade600),
            child: const Text('Logout'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    if (!context.mounted) return;
    await context.read<AuthProvider>().logout();
    if (!context.mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (_) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    final staff = context.watch<AuthProvider>().currentStaff;
    if (staff == null) return const SizedBox.shrink();

    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'PowerNet Staff',
          style: TextStyle(fontWeight: FontWeight.w700),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'Logout',
            onPressed: () => _confirmLogout(context),
          ),
        ],
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 110,
                height: 110,
                decoration: BoxDecoration(
                  color: primaryColor.withOpacity(0.1),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.person,
                  size: 64,
                  color: primaryColor,
                ),
              ),
              const SizedBox(height: 28),
              const Text(
                'Welcome,',
                style: TextStyle(fontSize: 16, color: Colors.black54),
              ),
              const SizedBox(height: 6),
              Text(
                staff.fullName,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w700,
                  color: Colors.black87,
                ),
              ),
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 18,
                  vertical: 8,
                ),
                decoration: BoxDecoration(
                  color: primaryColor,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  staff.roleLabel,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/screens/home_screen.dart
git commit -m "feat: add HomeScreen with welcome, role badge, logout confirmation"
```

---

## Task 12: Wire it all up in main.dart

**Files:**
- Modify: `lib/main.dart` (replace existing scaffold code)

- [ ] **Step 1: Replace main.dart**

Overwrite `lib/main.dart` with:

```dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'config/supabase_config.dart';
import 'providers/auth_provider.dart';
import 'screens/splash_screen.dart';
import 'theme/app_theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initSupabase();
  runApp(const PowerNetStaffApp());
}

class PowerNetStaffApp extends StatelessWidget {
  const PowerNetStaffApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthProvider()),
      ],
      child: MaterialApp(
        title: 'PowerNet Staff',
        debugShowCheckedModeBanner: false,
        theme: buildAppTheme(),
        home: const SplashScreen(),
      ),
    );
  }
}
```

- [ ] **Step 2: Run the app**

```bash
flutter run
```

Expected: App builds, shows SplashScreen briefly, then LoginScreen (no saved session).

- [ ] **Step 3: Commit**

```bash
git add lib/main.dart
git commit -m "feat: wire up MultiProvider + SplashScreen in main.dart"
```

---

## Task 13: Manual end-to-end testing

No automated tests in Phase 1. Perform this checklist against a real device or emulator with the admin dashboard running (so you can create/reset staff accounts).

**Prep:**
- In the admin dashboard (`D:\PowerNet Manager\`), create a test staff member with username `test_tech` and password `test123`, role Technician. Note the area assignment.
- Launch the Flutter app: `flutter run`

- [ ] **Test 1: Login with correct credentials**
  - Enter `test_tech` / `test123`
  - Tap LOGIN
  - Expected: HomeScreen shows — full name, "Technician" orange pill badge

- [ ] **Test 2: Login with wrong password**
  - Logout first
  - Enter `test_tech` / `wrongpass`
  - Expected: Red SnackBar "Invalid credentials", stays on LoginScreen

- [ ] **Test 3: Empty fields**
  - Clear both fields
  - Expected: LOGIN button disabled (greyed out)

- [ ] **Test 4: Session persistence**
  - Login successfully
  - Close the app (swipe from recents)
  - Reopen
  - Expected: SplashScreen → HomeScreen directly (no login prompt)

- [ ] **Test 5: Logout clears session**
  - On HomeScreen, tap logout icon
  - Confirm in dialog
  - Expected: LoginScreen
  - Close app, reopen
  - Expected: LoginScreen again (session cleared)

- [ ] **Test 6: No internet**
  - Turn off WiFi + mobile data on device
  - Try to login
  - Expected: Red SnackBar "No internet connection" or "Connection error, try again"

- [ ] **Test 7: Password reset invalidates old password**
  - Login with `test_tech` / `test123` → success → logout
  - In admin dashboard, reset `test_tech` password to `newpass456`
  - In app, try login with `test_tech` / `test123`
  - Expected: "Invalid credentials"
  - Try `test_tech` / `newpass456`
  - Expected: Success

- [ ] **Test 8: Disabled staff cannot login**
  - In admin dashboard, toggle `test_tech` to inactive
  - In app, try login with valid creds
  - Expected: "Invalid credentials" (same message — don't leak disabled status)

- [ ] **Test 9: Android back button on HomeScreen**
  - On HomeScreen, press Android system back button
  - Expected: App exits (does NOT return to LoginScreen)

If all tests pass, mark complete. If any fail, debug and re-test.

---

## Task 14: Final commit + push to remote (optional)

- [ ] **Step 1: Verify clean working tree**

```bash
git status
```

Expected: `nothing to commit, working tree clean`

- [ ] **Step 2: (Optional) Create remote repo + push**

If user wants to back up to GitHub:
```bash
# After creating empty repo on GitHub:
git remote add origin https://github.com/USERNAME/powernet-staff-app.git
git branch -M main
git push -u origin main
```

Skip this step if local-only is fine.

---

## Self-Review Checklist

- ✅ Spec coverage — every section covered:
  - Architecture → Task 1, 12
  - Dependencies → Task 3
  - Data model → Task 6
  - Supabase → Task 4, 7
  - Screens → Task 9, 10, 11
  - Session persistence → Task 8
  - Theme → Task 5
  - Error handling → Task 10 (catches in `_submit`), Task 8 (corrupt JSON)
  - Testing → Task 13
- ✅ No placeholders — every code block is complete
- ✅ Type consistency — `Staff.fromJson/toJson` fields match across tasks; `AuthProvider.login/logout/loadSavedStaff` names match usage in Splash/Login/Home
- ✅ Exact file paths everywhere
- ✅ Frequent commits (one per task minimum)
