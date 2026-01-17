import 'package:flutter/material.dart';

class VipScreen extends StatelessWidget {
  const VipScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final benefits = [
      'See who liked me',
      'More daily likes',
    ];

    return Scaffold(
      appBar: AppBar(
        title: const Text('VIP'),
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Unlock VIP benefits',
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 12),
            ...benefits.map(
              (benefit) => ListTile(
                leading: const Icon(Icons.check_circle, color: Colors.green),
                title: Text(benefit),
              ),
            ),
            const Spacer(),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () {},
                child: const Text('Upgrade now'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
import 'package:flutter/material.dart';

class VipScreen extends StatelessWidget {
  const VipScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final benefits = [
      'See who liked me',
      'More daily likes',
    ];

    return Scaffold(
      appBar: AppBar(
        title: const Text('VIP'),
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Unlock VIP benefits',
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 12),
            ...benefits.map(
              (benefit) => ListTile(
                leading: const Icon(Icons.check_circle, color: Colors.green),
                title: Text(benefit),
              ),
            ),
            const Spacer(),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () {},
                child: const Text('Upgrade now'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
