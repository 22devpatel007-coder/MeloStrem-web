import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, updateProfile } from 'firebase/auth';
import { auth } from '../firebase';

export const loginWithEmail = (email, password) => signInWithEmailAndPassword(auth, email, password);

export const registerWithEmail = async (email, password, name) => {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  if (name) await updateProfile(credential.user, { displayName: name });
  return credential;
};

export const logout = () => signOut(auth);

export const getCurrentUserToken = async () => {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken();
};
