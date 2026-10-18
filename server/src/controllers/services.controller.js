import { Service } from '../models/Service.js';
import { ApiError } from '../utils/ApiError.js';

const isAdmin = (req) => req.user?.role === 'admin';

export async function listServices(req, res) {
  const { category, all, page, limit } = req.query;
  const filter = all && isAdmin(req) ? {} : { isActive: true };
  if (category) filter.category = category.toLowerCase();

  const [items, total] = await Promise.all([
    Service.find(filter)
      .sort({ category: 1, price: 1, title: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Service.countDocuments(filter),
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
}

export async function getService(req, res) {
  const service = await Service.findById(req.params.id);
  if (!service || (!service.isActive && !isAdmin(req))) throw ApiError.notFound('Service not found');
  res.json({ service });
}

export async function createService(req, res) {
  const service = await Service.create({ ...req.body, createdBy: req.user.id });
  res.status(201).json({ service });
}

export async function updateService(req, res) {
  const service = await Service.findById(req.params.id);
  if (!service) throw ApiError.notFound('Service not found');
  service.set(req.body);
  await service.save();
  res.json({ service });
}

// Archives rather than deletes, because existing appointments still reference the service.
export async function archiveService(req, res) {
  const service = await Service.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
  if (!service) throw ApiError.notFound('Service not found');
  res.json({ service });
}
