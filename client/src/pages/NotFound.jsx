import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <p className="font-display text-6xl text-rose-500">404</p>
      <h1 className="mt-4 text-2xl font-semibold">Page not found</h1>
      <Link to="/" className="btn-primary mt-8">
        Go home
      </Link>
    </div>
  );
}
