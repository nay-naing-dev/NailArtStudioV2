// Upserts the salon services by title (safe to re-run). Prices are in your studio currency.
// Services are bookable treatments only: nail art lives in the separate NailDesign collection.
import { connectDB, disconnectDB } from '../config/db.js';
import { Service } from '../models/Service.js';

const SERVICES = [
  {
    title: 'Classic Manicure',
    category: 'manicure',
    description: 'Nail shaping, cuticle care, hand massage and polish of your choice.',
    price: 20000,
    duration: 45,
  },
  {
    title: 'Gel Manicure',
    category: 'manicure',
    description: 'Our full manicure finished with long-lasting gel polish that stays glossy and chip-free for weeks.',
    price: 30000,
    duration: 60,
  },
  {
    title: 'Classic Pedicure',
    category: 'pedicure',
    description: 'Soak, nail shaping, cuticle care, light exfoliation and a relaxing foot massage, finished with polish of your choice.',
    price: 25000,
    duration: 60,
  },
  {
    title: 'Gel Pedicure',
    category: 'pedicure',
    description: 'Our full pedicure with long-lasting gel polish that stays glossy and chip-free for weeks.',
    price: 40000,
    duration: 75,
  },
  {
    title: 'Foot Spa & Scrub',
    category: 'foot-spa',
    description: 'A warm mineral soak, deep exfoliating scrub, callus smoothing and a hydrating mask for soft, refreshed feet.',
    price: 30000,
    duration: 60,
  },
];

await connectDB();
const res = await Service.bulkWrite(
  SERVICES.map((s) => ({
    updateOne: {
      filter: { title: s.title },
      update: { $set: { ...s, isActive: true } },
      upsert: true,
    },
  })),
);
console.log(`Services upserted: ${res.upsertedCount} new, ${res.modifiedCount} updated.`);
await disconnectDB();
