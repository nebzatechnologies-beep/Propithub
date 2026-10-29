import { Platform, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';

export interface PickedAsset {
  uri: string;
  name: string;
  mimeType?: string;
  size?: number;
  base64?: string;
  file?: any; // Web File if in DOM
}

/**
 * Universal Single Image Picker (Gallery)
 * Works across Web (HTML input) and Native (iOS / Android expo-image-picker).
 */
export async function pickSingleImage(options?: {
  allowsEditing?: boolean;
  aspect?: [number, number];
  quality?: number;
}): Promise<PickedAsset | null> {
  const quality = options?.quality ?? 0.8;

  // 1. Web Environment Fallback
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = async (e: any) => {
        const file = e.target.files?.[0];
        if (!file) return resolve(null);
        const reader = new FileReader();
        reader.onload = (loadEvent) => {
          resolve({
            uri: (loadEvent.target?.result as string) || '',
            name: file.name || 'photo.jpg',
            mimeType: file.type || 'image/jpeg',
            size: file.size,
            base64: (loadEvent.target?.result as string) || '',
            file,
          });
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      };
      input.click();
    });
  }

  // 2. Native iOS & Android
  try {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'Propithub needs photo library access to select photos. Please enable it in Settings.'
      );
      return null;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: options?.allowsEditing ?? false,
      aspect: options?.aspect,
      quality,
      base64: true,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return null;
    }

    const asset = result.assets[0];
    const name = asset.fileName || `photo_${Date.now()}.jpg`;
    const mimeType = asset.mimeType || 'image/jpeg';
    const base64Data = asset.base64 ? `data:${mimeType};base64,${asset.base64}` : asset.uri;

    return {
      uri: asset.uri,
      name,
      mimeType,
      size: asset.fileSize,
      base64: base64Data,
    };
  } catch (err: any) {
    console.error('[NativePicker] pickSingleImage error:', err);
    Alert.alert('Selection Error', err?.message || 'Could not select photo.');
    return null;
  }
}

/**
 * Universal Multiple Images Picker (Gallery)
 * Works across Web and Native (iOS / Android).
 */
export async function pickMultipleImages(options?: {
  quality?: number;
}): Promise<PickedAsset[]> {
  const quality = options?.quality ?? 0.8;

  // 1. Web Environment Fallback
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = true;
      input.onchange = async (e: any) => {
        const files: File[] = Array.from(e.target.files || []);
        if (files.length === 0) return resolve([]);

        const results: PickedAsset[] = [];
        for (const file of files) {
          const base64 = await new Promise<string>((res) => {
            const reader = new FileReader();
            reader.onload = (le) => res((le.target?.result as string) || '');
            reader.onerror = () => res('');
            reader.readAsDataURL(file);
          });

          if (base64) {
            results.push({
              uri: base64,
              name: file.name,
              mimeType: file.type || 'image/jpeg',
              size: file.size,
              base64,
              file,
            });
          }
        }
        resolve(results);
      };
      input.click();
    });
  }

  // 2. Native iOS & Android
  try {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'Propithub needs photo library access to upload gallery photos.'
      );
      return [];
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality,
      base64: true,
    });

    if (result.canceled || !result.assets) {
      return [];
    }

    return result.assets.map((asset, idx) => {
      const name = asset.fileName || `photo_${Date.now()}_${idx}.jpg`;
      const mimeType = asset.mimeType || 'image/jpeg';
      const base64Data = asset.base64 ? `data:${mimeType};base64,${asset.base64}` : asset.uri;

      return {
        uri: asset.uri,
        name,
        mimeType,
        size: asset.fileSize,
        base64: base64Data,
      };
    });
  } catch (err: any) {
    console.error('[NativePicker] pickMultipleImages error:', err);
    Alert.alert('Selection Error', err?.message || 'Could not select photos.');
    return [];
  }
}

/**
 * Universal Camera Photo Capture
 * Works across Web and Native.
 */
export async function takeCameraPhoto(options?: {
  allowsEditing?: boolean;
  quality?: number;
}): Promise<PickedAsset | null> {
  const quality = options?.quality ?? 0.8;

  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    // Camera capture on web via file capture attribute
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.capture = 'environment';
      input.onchange = async (e: any) => {
        const file = e.target.files?.[0];
        if (!file) return resolve(null);
        const reader = new FileReader();
        reader.onload = (loadEvent) => {
          resolve({
            uri: (loadEvent.target?.result as string) || '',
            name: file.name || `camera_${Date.now()}.jpg`,
            mimeType: file.type || 'image/jpeg',
            size: file.size,
            base64: (loadEvent.target?.result as string) || '',
            file,
          });
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      };
      input.click();
    });
  }

  try {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Camera Permission Required',
        'Propithub needs camera access to capture inspection photos and scan documents.'
      );
      return null;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: options?.allowsEditing ?? false,
      quality,
      base64: true,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return null;
    }

    const asset = result.assets[0];
    const name = asset.fileName || `capture_${Date.now()}.jpg`;
    const mimeType = asset.mimeType || 'image/jpeg';
    const base64Data = asset.base64 ? `data:${mimeType};base64,${asset.base64}` : asset.uri;

    return {
      uri: asset.uri,
      name,
      mimeType,
      size: asset.fileSize,
      base64: base64Data,
    };
  } catch (err: any) {
    console.error('[NativePicker] takeCameraPhoto error:', err);
    Alert.alert('Camera Error', err?.message || 'Could not take photo.');
    return null;
  }
}

/**
 * Universal Document Picker (PDF, Images, DOCX)
 * Works across Web and Native.
 */
export async function pickDocument(options?: {
  type?: string[] | string;
}): Promise<PickedAsset | null> {
  const allowedTypes = options?.type ?? ['application/pdf', 'image/*'];

  // 1. Web Environment Fallback
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = Array.isArray(allowedTypes) ? allowedTypes.join(',') : allowedTypes;
      input.onchange = async (e: any) => {
        const file = e.target.files?.[0];
        if (!file) return resolve(null);
        const reader = new FileReader();
        reader.onload = (loadEvent) => {
          resolve({
            uri: (loadEvent.target?.result as string) || '',
            name: file.name || 'Document.pdf',
            mimeType: file.type || 'application/pdf',
            size: file.size,
            base64: (loadEvent.target?.result as string) || '',
            file,
          });
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      };
      input.click();
    });
  }

  // 2. Native iOS & Android
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: allowedTypes,
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return null;
    }

    const asset = result.assets[0];
    let base64Data = asset.uri;

    // Convert file to base64 Data URL for Firestore / Firebase Storage compatibility
    try {
      const fileData = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const mime = asset.mimeType || (asset.name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
      base64Data = `data:${mime};base64,${fileData}`;
    } catch (readErr) {
      console.warn('[NativePicker] FileSystem base64 read note:', readErr);
    }

    return {
      uri: asset.uri,
      name: asset.name || 'Document.pdf',
      mimeType: asset.mimeType || 'application/pdf',
      size: asset.size,
      base64: base64Data,
    };
  } catch (err: any) {
    console.error('[NativePicker] pickDocument error:', err);
    Alert.alert('Document Selection Error', err?.message || 'Could not select document.');
    return null;
  }
}
