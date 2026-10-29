import { Platform } from 'react-native';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import * as ImageManipulator from 'expo-image-manipulator';
import { storage, isFirebaseConfigured } from './firebase';

/**
 * Checks if a string is a Base64 data URL
 */
export const isDataUrl = (str?: string): boolean => {
  return typeof str === 'string' && str.startsWith('data:');
};

/**
 * Compresses an image File, Blob, data URL, or file URI to a maximum dimension and quality.
 * Shrinks multi-megabyte images (e.g. 5MB raw photos) down to ~50-90KB so they
 * never exceed Firestore or network limits.
 */
export async function compressImage(
  fileOrDataUrl: any,
  maxWidth = 1200,
  maxHeight = 1200,
  quality = 0.7
): Promise<string> {
  if (!fileOrDataUrl) return '';

  let uriOrDataUrl = '';
  if (typeof fileOrDataUrl !== 'string') {
    if (typeof FileReader !== 'undefined') {
      uriOrDataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve((e.target?.result as string) || '');
        reader.onerror = () => resolve('');
        reader.readAsDataURL(fileOrDataUrl);
      });
    }
  } else {
    uriOrDataUrl = fileOrDataUrl;
  }

  if (!uriOrDataUrl) return '';

  // If it's not an image (e.g. PDF data URL), return as-is
  if (uriOrDataUrl.startsWith('data:application/pdf') || uriOrDataUrl.endsWith('.pdf')) {
    return uriOrDataUrl;
  }

  // 1. Web Environment: Use Canvas compression
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
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
          resolve(uriOrDataUrl);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedDataUrl);
      };
      img.onerror = () => resolve(uriOrDataUrl);
      img.src = uriOrDataUrl;
    });
  }

  // 2. React Native Native (iOS / Android): Use expo-image-manipulator
  try {
    const manipResult = await ImageManipulator.manipulateAsync(
      uriOrDataUrl,
      [{ resize: { width: maxWidth } }],
      {
        compress: quality,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      }
    );

    if (manipResult.base64) {
      return `data:image/jpeg;base64,${manipResult.base64}`;
    }
    return manipResult.uri || uriOrDataUrl;
  } catch (err) {
    console.warn('Native image compression fallback:', err);
    return uriOrDataUrl;
  }
}

/**
 * Uploads an image or document (PDF/JPG) to Firebase Cloud Storage if configured.
 * Returns the short, permanent HTTPS download URL (~150 bytes) instead of storing
 * a megabyte-sized Base64 payload in Firestore.
 */
export async function uploadOrCompressDocument(
  fileOrDataUrl: any,
  storagePath: string,
  mimeType?: string
): Promise<string> {
  if (!fileOrDataUrl) return '';

  let preparedPayload: string = '';
  if (typeof fileOrDataUrl !== 'string') {
    if (typeof FileReader !== 'undefined') {
      preparedPayload = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve((e.target?.result as string) || '');
        reader.onerror = () => resolve('');
        reader.readAsDataURL(fileOrDataUrl);
      });
    }
  } else {
    preparedPayload = fileOrDataUrl;
  }

  if (!preparedPayload) return '';

  // Already a remote HTTPS URL (e.g. Firebase Storage, Cloudinary, AWS S3)
  if (preparedPayload.startsWith('http://') || preparedPayload.startsWith('https://')) {
    return preparedPayload;
  }

  // Compress if it is an image
  const isImage =
    preparedPayload.startsWith('data:image/') ||
    storagePath.endsWith('.jpg') ||
    storagePath.endsWith('.jpeg') ||
    storagePath.endsWith('.png');

  if (isImage) {
    try {
      preparedPayload = await compressImage(preparedPayload, 1200, 1200, 0.7);
    } catch (e) {
      console.warn('Compression step error:', e);
    }
  }

  // If Firebase Storage is configured, upload to cloud storage
  if (isFirebaseConfigured && storage && isDataUrl(preparedPayload)) {
    try {
      const storageRef = ref(storage, storagePath);
      const effectiveContentType =
        mimeType ||
        (preparedPayload.startsWith('data:application/pdf')
          ? 'application/pdf'
          : preparedPayload.startsWith('data:image/png')
          ? 'image/png'
          : 'image/jpeg');

      await uploadString(storageRef, preparedPayload, 'data_url', {
        contentType: effectiveContentType,
      });

      const downloadUrl = await getDownloadURL(storageRef);
      return downloadUrl;
    } catch (err) {
      console.warn('Firebase Storage upload error, falling back to compressed payload:', err);
    }
  }

  return preparedPayload;
}

/**
 * Inspects approximate size in bytes of any object when serialized to JSON
 */
export const getObjectByteSize = (obj: any): number => {
  try {
    const str = JSON.stringify(obj);
    return encodeURI(str).split(/%..|./).length - 1;
  } catch {
    return 0;
  }
};

export const uploadOrCompressImage = uploadOrCompressDocument;


