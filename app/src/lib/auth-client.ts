import * as ImagePicker from 'expo-image-picker';
import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  GoogleAuthProvider,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  type AuthError,
  type User,
  updatePassword,
  updateProfile,
  verifyBeforeUpdateEmail,
} from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadString } from 'firebase/storage';

import {
  auth,
  db,
  GOOGLE_ANDROID_CLIENT_ID,
  GOOGLE_IOS_CLIENT_ID,
  GOOGLE_WEB_CLIENT_ID,
  storage,
} from '@/lib/firebase-client';
import { ensureUserData } from '@/lib/autosense-data';

export {
  GOOGLE_ANDROID_CLIENT_ID,
  GOOGLE_IOS_CLIENT_ID,
  GOOGLE_WEB_CLIENT_ID,
};

export function firebaseAuthErrorMessage(error: unknown) {
  const code = (error as AuthError | undefined)?.code;
  const message = error instanceof Error ? error.message : '';

  if (message === 'media-library-permission-denied') {
    return 'Permite acceso a Fotos para actualizar tu imagen.';
  }

  switch (code) {
    case 'auth/email-already-in-use':
      return 'Ese correo ya está registrado.';
    case 'auth/invalid-email':
      return 'Ingresa un correo valido.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Correo o contrasena incorrectos.';
    case 'auth/weak-password':
      return 'Usa una contrasena de al menos 6 caracteres.';
    case 'auth/popup-closed-by-user':
      return 'Inicio con Google cancelado.';
    case 'auth/network-request-failed':
      return 'No se pudo conectar con Firebase.';
    case 'auth/missing-password':
      return 'Ingresa tu contrasena actual para confirmar el cambio.';
    case 'auth/requires-recent-login':
      return 'Vuelve a iniciar sesion antes de cambiar correo o contrasena.';
    case 'auth/password-change-not-supported':
      return 'Las cuentas con Google no cambian contrasena desde esta pantalla.';
    default:
      return 'No se pudo completar la autenticacion.';
  }
}

async function saveUserProfile(user: User) {
  await ensureUserData(user);
}

export async function registerWithEmail(
  email: string,
  password: string,
  displayName = '',
) {
  const credential = await createUserWithEmailAndPassword(
    auth,
    email.trim(),
    password,
  );

  if (displayName) {
    await updateProfile(credential.user, { displayName });
  }

  await saveUserProfile(credential.user);
  return credential.user;
}

export async function signInWithEmail(email: string, password: string) {
  const credential = await signInWithEmailAndPassword(
    auth,
    email.trim(),
    password,
  );

  await saveUserProfile(credential.user);
  return credential.user;
}

export async function signInWithGoogleIdToken(idToken: string) {
  const credential = GoogleAuthProvider.credential(idToken);
  const result = await signInWithCredential(auth, credential);

  await saveUserProfile(result.user);
  return result.user;
}

export function sendPasswordReset(email: string) {
  return sendPasswordResetEmail(auth, email.trim());
}

function authError(code: string) {
  return { code } as AuthError;
}

export async function updateAccountDetails(
  user: User,
  {
    displayName,
    email,
    phoneNumber,
    currentPassword,
    newPassword,
  }: {
    currentPassword?: string;
    displayName: string;
    email: string;
    newPassword?: string;
    phoneNumber: string;
  },
) {
  const nextDisplayName = displayName.trim();
  const nextEmail = email.trim();
  const nextPhoneNumber = phoneNumber.trim();
  const nextPassword = newPassword?.trim() ?? '';
  const currentEmail = user.email?.trim() ?? '';
  const isPasswordProvider = user.providerData.some(
    (provider) => provider.providerId === 'password',
  );
  const requiresSensitiveUpdate =
    nextEmail !== currentEmail || nextPassword.length > 0;
  let emailChangeRequiresVerification = false;

  if (requiresSensitiveUpdate && isPasswordProvider) {
    if (!currentPassword?.trim() || !currentEmail) {
      throw authError('auth/missing-password');
    }

    const credential = EmailAuthProvider.credential(
      currentEmail,
      currentPassword.trim(),
    );
    await reauthenticateWithCredential(user, credential);
  }

  if (nextPassword && !isPasswordProvider) {
    throw authError('auth/password-change-not-supported');
  }

  if (nextDisplayName && nextDisplayName !== user.displayName?.trim()) {
    await updateProfile(user, { displayName: nextDisplayName });
  }

  if (nextEmail && nextEmail !== currentEmail) {
    await verifyBeforeUpdateEmail(user, nextEmail);
    emailChangeRequiresVerification = true;
  }

  if (nextPassword) {
    await updatePassword(user, nextPassword);
  }

  await saveUserProfile(user);
  await setDoc(
    doc(db, 'users', user.uid),
    {
      displayName: nextDisplayName || user.displayName || '',
      email: emailChangeRequiresVerification ? currentEmail : user.email ?? nextEmail,
      phoneNumber: nextPhoneNumber,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return {
    emailChangeRequiresVerification,
  };
}

export async function uploadProfilePhoto(user: User) {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!permission.granted) {
    throw new Error('media-library-permission-denied');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.7,
    base64: true,
  });

  if (result.canceled || !result.assets[0]?.base64) {
    return null;
  }

  const asset = result.assets[0];
  const base64 = asset.base64;

  if (!base64) {
    return null;
  }

  const fileExtension = asset.fileName?.split('.').pop()?.toLowerCase() === 'png'
    ? 'png'
    : 'jpg';
  const contentType = fileExtension === 'png' ? 'image/png' : 'image/jpeg';
  const storageRef = ref(
    storage,
    `users/${user.uid}/avatars/profile.${fileExtension}`,
  );

  await uploadString(storageRef, base64, 'base64', { contentType });

  const photoURL = await getDownloadURL(storageRef);
  await updateProfile(user, { photoURL });
  await saveUserProfile(user);
  await setDoc(
    doc(db, 'users', user.uid),
    {
      photoURL,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return photoURL;
}
