import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { PageLoader } from './ui';

export default function RequireAuth({ admin = false, children }) {
  const { user, loading, isAdmin } = useAuth();
  const location = useLocation();

  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (admin && !isAdmin) return <Navigate to="/" replace />;
  return children;
}
