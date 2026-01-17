import 'package:flutter/material.dart';

class GiftsScreen extends StatelessWidget {
  const GiftsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final gifts = [
      _Gift(name: 'Rose', price: 10),
      _Gift(name: 'Fireworks', price: 60),
      _Gift(name: 'Crown', price: 120),
    ];

    return Scaffold(
      appBar: AppBar(
        title: const Text('Gifts'),
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Points balance: 240',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 12),
            Expanded(
              child: ListView.separated(
                itemCount: gifts.length,
                separatorBuilder: (_, __) => const SizedBox(height: 12),
                itemBuilder: (context, index) {
                  final gift = gifts[index];
                  return Card(
                    child: ListTile(
                      leading: const Icon(Icons.card_giftcard),
                      title: Text(gift.name),
                      subtitle: Text('${gift.price} points'),
                      trailing: ElevatedButton(
                        onPressed: () {},
                        child: const Text('Send'),
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Gift {
  _Gift({required this.name, required this.price});

  final String name;
  final int price;
}
