import { signInAnonymously, onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './firebase';

// Resolves with the current user if already signed in,
// otherwise signs in anonymously and resolves with the new user.
// Safe to call multiple times — subsequent calls resolve immediately.
export async function ensureSignedIn(): Promise<User> {
  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(
      auth,
      user => {
        unsubscribe();
        if (user) {
          resolve(user);
        } else {
          signInAnonymously(auth)
            .then(cred => resolve(cred.user))
            .catch(reject);
        }
      },
      reject
    );
  });
}

export function currentUid(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not signed in — call ensureSignedIn() first');
  return uid;
}
