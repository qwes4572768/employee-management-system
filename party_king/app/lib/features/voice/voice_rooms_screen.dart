import 'package:flutter/material.dart';

class VoiceRoomsScreen extends StatelessWidget {
  const VoiceRoomsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final rooms = [
      _Room(name: 'Night Talk', members: 12, type: 'Public'),
      _Room(name: 'Coffee Break', members: 6, type: 'Public'),
      _Room(name: 'Private Lounge', members: 3, type: 'Private'),
    ];

    return Scaffold(
      appBar: AppBar(
        title: const Text('Voice Rooms'),
        actions: [
          IconButton(
            onPressed: () {},
            icon: const Icon(Icons.add),
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Level increases with time in room.',
              style: TextStyle(color: Colors.black54),
            ),
            const SizedBox(height: 12),
            Expanded(
              child: ListView.separated(
                itemCount: rooms.length,
                separatorBuilder: (_, __) => const SizedBox(height: 12),
                itemBuilder: (context, index) {
                  final room = rooms[index];
                  return Card(
                    child: ListTile(
                      leading: const Icon(Icons.mic),
                      title: Text(room.name),
                      subtitle: Text('${room.type} · ${room.members} members'),
                      trailing: ElevatedButton(
                        onPressed: () {},
                        child: const Text('Join'),
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

class _Room {
  _Room({required this.name, required this.members, required this.type});

  final String name;
  final int members;
  final String type;
}
import 'package:flutter/material.dart';

class VoiceRoomsScreen extends StatelessWidget {
  const VoiceRoomsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final rooms = [
      _Room(name: 'Night Talk', members: 12, type: 'Public'),
      _Room(name: 'Coffee Break', members: 6, type: 'Public'),
      _Room(name: 'Private Lounge', members: 3, type: 'Private'),
    ];

    return Scaffold(
      appBar: AppBar(
        title: const Text('Voice Rooms'),
        actions: [
          IconButton(
            onPressed: () {},
            icon: const Icon(Icons.add),
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Level increases with time in room.',
              style: TextStyle(color: Colors.black54),
            ),
            const SizedBox(height: 12),
            Expanded(
              child: ListView.separated(
                itemCount: rooms.length,
                separatorBuilder: (_, __) => const SizedBox(height: 12),
                itemBuilder: (context, index) {
                  final room = rooms[index];
                  return Card(
                    child: ListTile(
                      leading: const Icon(Icons.mic),
                      title: Text(room.name),
                      subtitle: Text('${room.type} · ${room.members} members'),
                      trailing: ElevatedButton(
                        onPressed: () {},
                        child: const Text('Join'),
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

class _Room {
  _Room({required this.name, required this.members, required this.type});

  final String name;
  final int members;
  final String type;
}
