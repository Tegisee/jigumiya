import { getShareExtensionKey } from 'expo-share-intent';

export function redirectSystemPath({
  path,
  initial,
}: {
  path: string;
  initial: boolean;
}) {
  try {
    if (path.includes(`dataUrl=${getShareExtensionKey()}`)) {
      return '/shareintent';
    }
    return path;
  } catch {
    return '/';
  }
}
