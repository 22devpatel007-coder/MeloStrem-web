/**
 * client/src/hooks/useAuth.js
 *
 * Task 2.4 — Hook Return Contract Standardization
 *
 * DECISION: NO CHANGES to return shape.
 *
 * useAuth is a Zustand store selector hook, NOT a React Query data hook.
 * It does not fetch data, does not have loading/error states from a network call,
 * and does not need refetch. The standard contract { data, isLoading, isError,
 * error, refetch } applies to data-fetching hooks only.
 *
 * `loading` (not `isLoading`) is intentional here — it refers to the Firebase
 * Auth initialization state, not a React Query loading state. Renaming it would
 * break every caller silently and provide zero benefit.
 *
 * RETURN SHAPE (unchanged and correct for its purpose):
 *   {
 *     user:    FirebaseUser | null,
 *     isAdmin: boolean,
 *     loading: boolean,   — Firebase Auth init in progress
 *     logout:  () => Promise<void>,
 *   }
 *
 * @module useAuth
 */

import useAuthStore from '../store/authStore';

/**
 * @returns {{
 *   user:    import('firebase/auth').User | null,
 *   isAdmin: boolean,
 *   loading: boolean,
 *   logout:  () => Promise<void>,
 * }}
 */
export const useAuth = () => {
  const user    = useAuthStore((s) => s.user);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const loading = useAuthStore((s) => s.loading);
  const logout  = useAuthStore((s) => s.logout);
  return { user, isAdmin, loading, logout };
};