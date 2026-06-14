import { createAuthClient } from 'better-auth/react';
import { expoClient } from '@better-auth/expo/client';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

const scheme = Constants.expoConfig?.scheme ?? 'autosense';
const baseURL = process.env.EXPO_PUBLIC_BETTER_AUTH_URL ?? 'http://localhost:3000';

export const authClient = createAuthClient({
  baseURL,
  disableDefaultFetchPlugins: true,
  plugins: [
    expoClient({
      scheme,
      storage: SecureStore,
      storagePrefix: 'autosense',
      cookiePrefix: 'better-auth',
    }),
  ],
});
