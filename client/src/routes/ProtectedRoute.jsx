import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
// ✅ FIX Bug 10: was `import { Loader }` (named export) but Loader.jsx uses
// a default export. Named import returns undefined — blank screen during
// auth loading instead of a spinner.
import Loader from '../components/ui/Loader';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <Loader />;
  if (!user) return <Navigate to='/login' replace />;
  return children;
};

export default ProtectedRoute;