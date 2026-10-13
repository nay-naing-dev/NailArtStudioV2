// Creates the admin account from ADMIN_* env vars, or resets its password if it already exists.
import { connectDB, disconnectDB } from '../config/db.js';
import { User } from '../models/User.js';

const name = process.env.ADMIN_NAME || 'Studio Admin';
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;

if (!email || !password) {
  console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD in .env first.');
  process.exit(1);
}

await connectDB();
let user = await User.findOne({ email: email.toLowerCase() });
const created = !user;
if (!user) user = new User({ name, email });
user.role = 'admin';
await user.setPassword(password);
await user.save();
console.log(`${created ? 'Created' : 'Updated'} admin ${user.email}`);
await disconnectDB();
