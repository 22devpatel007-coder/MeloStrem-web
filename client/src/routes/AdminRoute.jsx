import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
// ✅ FIX Bug 10: same as ProtectedRoute — was named import { Loader }
// but Loader.jsx has a default export. Blank screen during auth check.
import Loader from '../components/ui/Loader';

const AdminRoute = ({ children }) => {
  const { user, isAdmin, loading } = useAuth();
  if (loading) return <Loader />;
  if (!user || !isAdmin) return <Navigate to='/' replace />;
  return children;
};

export default AdminRoute;