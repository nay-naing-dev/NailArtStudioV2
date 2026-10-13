// Upserts the studio's artists by name (safe to re-run). Photos live in client/public/artists/;
// swap `image` for a Cloudinary URL whenever you like. Edit names, roles and bios to match the real team.
import { connectDB, disconnectDB } from '../config/db.js';
import { Artist } from '../models/Artist.js';

const ARTISTS = [
  {
    name: 'Artist One',
    role: 'Senior Nail Stylist',
    bio: 'Years of experience turning ideas into wearable art, with a soft spot for clean lines and glossy finishes.',
    image: '/artists/artist-1.jpg',
    imagePosition: '50% 70%',
    specialties: ['Gel Extensions', 'French Tips', 'Minimalist Design'],
  },
  {
    name: 'Artist Two',
    role: 'Nail Art Specialist',
    bio: 'Loves bold colour, hand-painted detail and helping every client find a look that feels like them.',
    image: '/artists/artist-2.jpg',
    imagePosition: '50% 5%',
    specialties: ['Hand-painted Art', '3D Nail Art', 'Gel Polish'],
  },
];

await connectDB();
const res = await Artist.bulkWrite(
  ARTISTS.map((a, i) => ({
    updateOne: { filter: { name: a.name }, update: { $set: { ...a, sortOrder: i, isActive: true } }, upsert: true },
  })),
);
console.log(`Artists upserted: ${res.upsertedCount} new, ${res.modifiedCount} updated.`);
await disconnectDB();
