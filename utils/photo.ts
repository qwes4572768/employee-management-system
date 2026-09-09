import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';

import { createId } from '@/utils/id';

export async function pickAndStorePhoto(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('需要相簿權限才能設定照片');
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.8,
    allowsEditing: true,
    aspect: [1, 1],
  });
  if (result.canceled || !result.assets[0]?.uri) {
    return null;
  }
  const base = FileSystem.documentDirectory;
  if (!base) {
    return result.assets[0].uri;
  }
  const dir = `${base}photos/`;
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
  const dest = `${dir}${createId()}.jpg`;
  await FileSystem.copyAsync({ from: result.assets[0].uri, to: dest });
  return dest;
}
