import { decode, encode } from 'base-64';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  type Auth,
  type Persistence,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

if (typeof globalThis.atob === 'undefined') {
  globalThis.atob = decode;
}

function secureStoreKey(key: string) {
  return `firebase_${encode(key)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')}`;
}

const firebaseConfig = {
  apiKey: 'AIzaSyCYsE79pTyaWJrx6aAjOQuCyouB25jR2Cc',
  authDomain: 'autosense-1178d.firebaseapp.com',
  projectId: 'autosense-1178d',
  storageBucket: 'autosense-1178d.firebasestorage.app',
  messagingSenderId: '985890980686',
  appId: '1:985890980686:web:28b2afa3ccf718e33b141f',
};

class SecureStorePersistence {
  static type = 'LOCAL';

  type = 'LOCAL' as const;

  async _isAvailable() {
    try {
      const availabilityKey = secureStoreKey('__autosense.auth__');
      await SecureStore.setItemAsync(availabilityKey, '1');
      await SecureStore.deleteItemAsync(availabilityKey);
      return true;
    } catch {
      return false;
    }
  }

  _set(key: string, value: unknown) {
    return SecureStore.setItemAsync(
      secureStoreKey(key),
      JSON.stringify(value),
    );
  }

  async _get<T>(key: string) {
    const value = await SecureStore.getItemAsync(secureStoreKey(key));
    return value ? (JSON.parse(value) as T) : null;
  }

  _remove(key: string) {
    return SecureStore.deleteItemAsync(secureStoreKey(key));
  }

  _addListener() {}

  _removeListener() {}
}

const secureStorePersistence = SecureStorePersistence as unknown as Persistence;

export const GOOGLE_WEB_CLIENT_ID =
  '985890980686-fobo39bqp5dgcajgeus4s891sm189vnh.apps.googleusercontent.com';
export const GOOGLE_ANDROID_CLIENT_ID =
  '985890980686-l37k3m1ian0qdaruhulapkqdaekl5mtf.apps.googleusercontent.com';
export const GOOGLE_IOS_CLIENT_ID =
  '985890980686-g139707kq5g778n8cll75obnh5fhe67d.apps.googleusercontent.com';

export const firebaseApp = getApps().length
  ? getApp()
  : initializeApp(firebaseConfig);

export const db = getFirestore(firebaseApp);
export const storage = getStorage(firebaseApp);

function initAuth() {
  if (Platform.OS === 'web') {
    return getAuth(firebaseApp);
  }

  try {
    return initializeAuth(firebaseApp, {
      persistence: secureStorePersistence,
    });
  } catch {
    return getAuth(firebaseApp);
  }
}

export const auth: Auth = initAuth();
