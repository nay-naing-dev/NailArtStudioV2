import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Field, Spinner } from '../components/ui';
import { AuthCard } from './Login';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await register({ ...form, phone: form.phone || undefined });
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Create an account" subtitle="Book faster and keep track of your appointments.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name">
          <input className="input" autoComplete="name" required value={form.name} onChange={set('name')} />
        </Field>
        <Field label="Email">
          <input className="input" type="email" autoComplete="email" required value={form.email} onChange={set('email')} />
        </Field>
        <Field label="Phone" hint="Optional. Used to confirm bookings.">
          <input className="input" type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} />
        </Field>
        <Field label="Password" hint="At least 8 characters.">
          <input className="input" type="password" autoComplete="new-password" required minLength={8} value={form.password} onChange={set('password')} />
        </Field>
        {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy && <Spinner className="size-4 text-white" />} Create account
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-soft">
        Already have an account?{' '}
        <Link to="/login" state={location.state} className="font-medium text-rose-600 hover:underline">
          Log in
        </Link>
      </p>
    </AuthCard>
  );
}
