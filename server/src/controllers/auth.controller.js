import { User } from '../models/User.js';
import { signToken } from '../middleware/auth.js';
import { ApiError } from '../utils/ApiError.js';

export async function register(req, res) {
  const { name, email, password, phone } = req.body;
  if (await User.exists({ email: email.toLowerCase() })) {
    throw ApiError.conflict('An account with this email already exists');
  }
  const user = new User({ name, email, phone, role: 'customer' });
  await user.setPassword(password);
  await user.save();
  res.status(201).json({ user, token: signToken(user) });
}

export async function login(req, res) {
  const { email, password } = req.body;
  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
  if (!user || !(await user.checkPassword(password))) {
    throw ApiError.unauthorized('Incorrect email or password');
  }
  res.json({ user, token: signToken(user) });
}

export async function me(req, res) {
  res.json({ user: req.user });
}
