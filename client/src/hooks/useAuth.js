import useAuthStore from '../store/authStore';

export const useAuth = () => {
  const user = useAuthStore((s) => s.user);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const loading = useAuthStore((s) => s.loading);
  const logout = useAuthStore((s) => s.logout);
  return { user, isAdmin, loading, logout };
};
