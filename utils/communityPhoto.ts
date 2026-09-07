import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';

import { createId } from '@/utils/id';

export async function captureCommunityPhoto(purpose: 'visitor' | 'parcel'): Promise<string | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new Error(purpose === 'parcel' ? '需要相機權限才能拍攝領取簽收照片' : '需要相機權限才能拍攝訪客進出照片');
  }
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 0.8,
    allowsEditing: false,
  });
  if (result.canceled || !result.assets[0]?.uri) {
    return null;
  }
  const base = FileSystem.documentDirectory;
  if (!base) {
    return result.assets[0].uri;
  }
  const dir = `${base}community-${purpose}/`;
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
  const dest = `${dir}${createId()}.jpg`;
  await FileSystem.copyAsync({ from: result.assets[0].uri, to: dest });
  return dest;
}
