import { router, type Href } from 'expo-router';

export function backOrFallback(fallbackHref: Href) {
  if (typeof router.canGoBack === 'function' && router.canGoBack()) {
    router.back();
    return;
  }

  router.replace(fallbackHref);
}
