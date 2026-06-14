import { router } from 'expo-router';

export function backOrFallback(fallbackHref: string) {
  if (typeof router.canGoBack === 'function' && router.canGoBack()) {
    router.back();
    return;
  }

  router.replace(fallbackHref);
}
