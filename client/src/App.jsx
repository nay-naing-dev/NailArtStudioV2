import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import RequireAuth from './components/RequireAuth';
import { PageLoader } from './components/ui';
import Home from './pages/Home';
import Services from './pages/Services';
import Gallery from './pages/Gallery';
import DesignDetail from './pages/DesignDetail';
import Artists from './pages/Artists';
import Book from './pages/Book';
import Login from './pages/Login';
import Register from './pages/Register';
import MyBookings from './pages/MyBookings';
import NotFound from './pages/NotFound';

// Heavy or admin-only routes load on demand (try-on pulls in MediaPipe).
const TryOn = lazy(() => import('./pages/TryOn'));
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));
const Dashboard = lazy(() => import('./pages/admin/Dashboard'));
const AdminAppointments = lazy(() => import('./pages/admin/Appointments'));
const AdminServices = lazy(() => import('./pages/admin/Services'));
const ServiceEditor = lazy(() => import('./pages/admin/ServiceEditor'));
const AdminDesigns = lazy(() => import('./pages/admin/Designs'));
const AdminPromotions = lazy(() => import('./pages/admin/Promotions'));
const AdminBroadcast = lazy(() => import('./pages/admin/Broadcast'));
const DesignEditor = lazy(() => import('./pages/admin/DesignEditor'));

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="services" element={<Services />} />
          <Route path="designs" element={<Gallery />} />
          <Route path="designs/:id" element={<DesignDetail />} />
          <Route path="artists" element={<Artists />} />
          <Route path="book" element={<Book />} />
          <Route path="try-on" element={<TryOn />} />
          <Route path="login" element={<Login />} />
          <Route path="register" element={<Register />} />
          <Route
            path="my-bookings"
            element={
              <RequireAuth>
                <MyBookings />
              </RequireAuth>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Route>

        <Route
          path="admin"
          element={
            <RequireAuth admin>
              <AdminLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="appointments" element={<AdminAppointments />} />
          <Route path="services" element={<AdminServices />} />
          <Route path="services/new" element={<ServiceEditor />} />
          <Route path="services/:id" element={<ServiceEditor />} />
          <Route path="designs" element={<AdminDesigns />} />
          <Route path="promotions" element={<AdminPromotions />} />
          <Route path="broadcast" element={<AdminBroadcast />} />
          <Route path="designs/new" element={<DesignEditor />} />
          <Route path="designs/:id" element={<DesignEditor />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
