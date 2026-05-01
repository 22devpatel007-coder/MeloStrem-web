/**
 * client/src/services/auth.service.js
 */

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import api from './api';
import { auth } from '../firebase';

export const loginWithEmail = (email, password) =>
  signInWithEmailAndPassword(auth, email, password);

export const registerWithEmail = async (email, password, name) => {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  if (name) await updateProfile(credential.user, { displayName: name });
  return credential;
};
export const loginWithGoogle = async () => {
  const provider = new GoogleAuthProvider();
  return signInWithPopup(auth, provider);
};
export const logout = () => signOut(auth);

export const getCurrentUserToken = async () => {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken();
};

/**
 * sendPasswordReset
 *
 * Sends a Firebase password reset email to the given address.
 * Throws a Firebase AuthError on failure — caller handles error mapping.
 *
 * Security: caller should show the same success UI for auth/user-not-found
 * to prevent email enumeration. This function does NOT suppress that error —
 * suppression is the caller's responsibility so error mapping stays centralised.
 */
export const sendPasswordReset = (email) =>
  sendPasswordResetEmail(auth, email);
export const verifyWithBackend = () => api.post('/auth/verify');