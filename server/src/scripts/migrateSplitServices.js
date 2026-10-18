// One-off migration for the Service / NailDesign split. Safe to re-run.
//
//   npm run migrate:split-services
//
// Before: services and nail art shared the `designs` collection, told apart by `kind`.
// After:  services live in `services`; `designs` holds only nail art, with `name` renamed to `title`.
//
// Service documents keep their _id, so appointments that referenced one as a "design" are re-pointed
// to `service` without a lookup table.
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../config/db.js';
import { NailDesign } from '../models/NailDesign.js';
import { Service } from '../models/Service.js';

await connectDB();
try {
  const db = mongoose.connection.db;
  const designs = db.collection('designs');
  const appointments = db.collection('appointments');

  // 1. Move services out of the designs collection.
  const legacyServices = await designs.find({ kind: 'service' }).toArray();
  for (const s of legacyServices) {
    await Service.collection.updateOne(
      { _id: s._id },
      {
        $set: {
          title: s.title ?? s.name,
          category: s.category ?? 'general',
          price: s.price ?? 0,
          duration: s.durationMinutes ?? s.duration ?? 60,
          description: s.description,
          isActive: s.isActive !== false,
          createdBy: s.createdBy,
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: s.createdAt ?? new Date() },
      },
      { upsert: true },
    );
    await appointments.updateMany({ design: s._id }, { $set: { service: s._id }, $unset: { design: '' } });
  }
  if (legacyServices.length) await designs.deleteMany({ _id: { $in: legacyServices.map((s) => s._id) } });
  console.log(`Moved ${legacyServices.length} service(s) to the services collection.`);

  // 2. Nail art: name -> title, drop the fields that now belong to services.
  const renamed = await designs.updateMany({ name: { $exists: true }, title: { $exists: false } }, { $rename: { name: 'title' } });
  const cleaned = await designs.updateMany({}, { $unset: { kind: '', price: '', durationMinutes: '' } });
  console.log(`Renamed name -> title on ${renamed.modifiedCount} design(s); removed service-only fields from ${cleaned.modifiedCount}.`);

  // 3. The old text index covered `name`; replace it with the one on `title`.
  const stale = (await designs.indexes()).filter((i) => i.key?._fts === 'text' && !i.weights?.title);
  for (const i of stale) await designs.dropIndex(i.name);
  await Promise.all([NailDesign.syncIndexes(), Service.syncIndexes()]);
  console.log('Indexes synced.');
} finally {
  await disconnectDB();
}
