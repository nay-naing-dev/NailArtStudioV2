// Upserts the foot care & pedicure services by name (safe to re-run). Prices are in your studio currency
// (the same unit as designs). Services have no try-on photo, so they are created ready to book.
import { connectDB, disconnectDB } from '../config/db.js';
import { Design } from '../models/Design.js';

const SERVICES = [
  {
    name: 'Classic Pedicure',
    category: 'pedicure',
    description: 'Soak, nail shaping, cuticle care, light exfoliation and a relaxing foot massage, finished with polish of your choice.',
    tags: ['pedicure', 'classic', 'polish'],
    price: 25000,
    durationMinutes: 60,
  },
  {
    name: 'Foot Spa & Scrub',
    category: 'foot-spa',
    description: 'A warm mineral soak, deep exfoliating scrub, callus smoothing and a hydrating mask for soft, refreshed feet.',
    tags: ['foot spa', 'scrub', 'relax'],
    price: 30000,
    durationMinutes: 60,
  },
  {
    name: 'Gel Pedicure',
    category: 'pedicure',
    description: 'Our full pedicure with long-lasting gel polish that stays glossy and chip-free for weeks.',
    tags: ['pedicure', 'gel', 'long-lasting'],
    price: 40000,
    durationMinutes: 75,
  },
];

await connectDB();
const res = await Design.bulkWrite(
  SERVICES.map((s) => ({
    updateOne: {
      filter: { name: s.name, kind: 'service' },
      update: { $set: { ...s, kind: 'service', isActive: true, 'processing.status': 'ready' } },
      upsert: true,
    },
  })),
);
console.log(`Services upserted: ${res.upsertedCount} new, ${res.modifiedCount} updated.`);
await disconnectDB();
