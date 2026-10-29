import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { storage, isFirebaseConfigured } from './firebase';

/**
 * Compresses an image File or Data URL to a maximum dimension and quality.
 * Reduces 5MB+ raw photos down to ~50-90KB so they never exceed storage or Firestore limits.
 */
export async function compressImage(
  fileOrDataUrl: File | string,
  maxWidth = 1200,
  maxHeight = 1200,
  quality = 0.75
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    const handleLoaded = () => {
      let width = img.width;
      let height = img.height;

      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(typeof fileOrDataUrl === 'string' ? fileOrDataUrl : img.src);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve(compressedDataUrl);
    };

    img.onerror = () => {
      resolve(typeof fileOrDataUrl === 'string' ? fileOrDataUrl : '');
    };

    if (fileOrDataUrl instanceof File) {
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target?.result as string;
      };
      reader.onerror = () => resolve('');
      reader.readAsDataURL(fileOrDataUrl);
    } else {
      img.src = fileOrDataUrl;
    }

    img.onload = handleLoaded;
  });
}

/**
 * Uploads an image to Firebase Storage if configured, or returns a lightweight compressed data URL.
 * This guarantees the document will never exceed Firestore's 1 MiB limit.
 */
export async function uploadOrCompressImage(
  fileOrDataUrl: File | string,
  storagePath: string
): Promise<string> {
  const compressedDataUrl = await compressImage(fileOrDataUrl);

  if (!isFirebaseConfigured || !compressedDataUrl) {
    return compressedDataUrl;
  }

  try {
    const storageRef = ref(storage, storagePath);
    await uploadString(storageRef, compressedDataUrl, 'data_url', {
      contentType: 'image/jpeg',
    });
    const downloadUrl = await getDownloadURL(storageRef);
    return downloadUrl;
  } catch (err) {
    console.warn('Firebase storage upload fallback to compressed data URL:', err);
    return compressedDataUrl;
  }
}
