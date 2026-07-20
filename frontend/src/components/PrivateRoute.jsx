import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function PrivateRoute({ children, roles, module }) {
  const { user, canAccessModule, firstAllowedRoute } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles?.length && !roles.includes(user.role)) return <Navigate to={firstAllowedRoute()} replace />;
  if (module && !canAccessModule(module)) return <Navigate to={firstAllowedRoute()} replace />;
  return children;
}
