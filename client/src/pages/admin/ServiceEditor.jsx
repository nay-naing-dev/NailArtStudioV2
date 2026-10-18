import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Archive, ArchiveRestore, ArrowLeft, Save } from 'lucide-react';
import { errorMessage, servicesApi } from '../../lib/api';
import { Field, PageLoader, Spinner } from '../../components/ui';

const EMPTY = { title: '', category: '', price: '', duration: 60, description: '' };

const toForm = (s) => ({
  title: s.title,
  category: s.category ?? '',
  price: s.price,
  duration: s.duration,
  description: s.description ?? '',
});

export default function ServiceEditor() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY);

  const { data: service, isLoading } = useQuery({
    queryKey: ['service', id],
    queryFn: () => servicesApi.get(id),
    enabled: !isNew,
  });

  useEffect(() => {
    if (service) setForm(toForm(service));
  }, [service]);

  const onSaved = (s, msg) => {
    toast.success(msg);
    queryClient.setQueryData(['service', s.id], s);
    queryClient.invalidateQueries({ queryKey: ['admin-services'] });
    queryClient.invalidateQueries({ queryKey: ['services'] });
  };

  const save = useMutation({
    mutationFn: () => {
      const body = {
        ...form,
        price: Number(form.price),
        duration: Number(form.duration),
        category: form.category || undefined,
        description: form.description || undefined,
      };
      return isNew ? servicesApi.create(body) : servicesApi.update(id, body);
    },
    onSuccess: (s) => {
      onSaved(s, isNew ? 'Service added' : 'Saved');
      if (isNew) navigate(`/admin/services/${s.id}`, { replace: true });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const toggleActive = useMutation({
    mutationFn: () => (service.isActive ? servicesApi.archive(id) : servicesApi.update(id, { isActive: true })),
    onSuccess: (s) => onSaved(s, s.isActive ? 'Restored' : 'Archived'),
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (!isNew && isLoading) return <PageLoader />;
  if (!isNew && !service) {
    return (
      <p className="text-ink-soft">
        Service not found. <Link to="/admin/services" className="text-rose-600 hover:underline">Back to services</Link>
      </p>
    );
  }
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/admin/services" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink">
        <ArrowLeft className="size-4" /> Services
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">{isNew ? 'Add service' : service.title}</h1>
        {!isNew && (
          <button className="btn-secondary" onClick={() => toggleActive.mutate()} disabled={toggleActive.isPending}>
            {service.isActive ? <Archive className="size-4" /> : <ArchiveRestore className="size-4" />}
            {service.isActive ? 'Archive' : 'Restore'}
          </button>
        )}
      </div>

      <form
        className="card mt-6 grid gap-4 p-5 sm:grid-cols-2 md:p-6"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="sm:col-span-2">
          <Field label="Title">
            <input className="input" required maxLength={100} value={form.title} onChange={set('title')} placeholder="e.g. Classic Pedicure" />
          </Field>
        </div>
        <Field label="Category" hint="Services are grouped by category, e.g. manicure, pedicure, foot-spa">
          <input className="input" value={form.category} onChange={set('category')} placeholder="manicure" />
        </Field>
        <Field label="Price">
          <input className="input" type="number" min={0} step="any" required value={form.price} onChange={set('price')} />
        </Field>
        <Field label="Duration (minutes)">
          <input className="input" type="number" min={15} max={480} step={15} required value={form.duration} onChange={set('duration')} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Description">
            <textarea className="input min-h-28" maxLength={1000} value={form.description} onChange={set('description')} />
          </Field>
        </div>
        <div className="flex justify-end sm:col-span-2">
          <button className="btn-primary" disabled={save.isPending}>
            {save.isPending ? <Spinner className="size-4 text-white" /> : <Save className="size-4" />}
            {isNew ? 'Add service' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
