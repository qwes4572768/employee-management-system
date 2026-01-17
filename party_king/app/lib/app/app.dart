import 'package:flutter/material.dart';

import '../core/theme/app_theme.dart';
import '../features/auth/login_screen.dart';
import '../features/vip/vip_screen.dart';
import 'home_shell.dart';
import 'routes.dart';

class PartyKingApp extends StatelessWidget {
  const PartyKingApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Party King',
      theme: AppTheme.light(),
      initialRoute: Routes.login,
      routes: {
        Routes.login: (context) => const LoginScreen(),
        Routes.home: (context) => const HomeShell(),
        Routes.vip: (context) => const VipScreen(),
      },
    );
  }
}
