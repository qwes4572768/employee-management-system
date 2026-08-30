export type LocationFix = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  mocked?: boolean | null;
};

export type LocationErrorCode =
  | 'permission_undetermined'
  | 'permission_denied'
  | 'permission_blocked'
  | 'gps_disabled'
  | 'timeout'
  | 'unavailable'
  | 'invalid_coords';

export type LocationResult =
  | { ok: true; fix: LocationFix }
  | { ok: false; code: LocationErrorCode; message: string };

export interface LocationProvider {
  getCurrentPosition(): Promise<LocationResult>;
}

class MockLocationProvider implements LocationProvider {
  result: LocationResult = {
    ok: false,
    code: 'unavailable',
    message: '測試環境未設定定位結果',
  };

  async getCurrentPosition(): Promise<LocationResult> {
    return this.result;
  }
}

const mockProvider = new MockLocationProvider();
let current: LocationProvider = mockProvider;

export function getLocationProvider(): LocationProvider {
  return current;
}

export function setLocationProvider(provider: LocationProvider): void {
  current = provider;
}

export function setMockLocationResult(result: LocationResult): void {
  mockProvider.result = result;
  current = mockProvider;
}

export function resetLocationProvider(): void {
  mockProvider.result = {
    ok: false,
    code: 'unavailable',
    message: '測試環境未設定定位結果',
  };
  current = mockProvider;
}

export async function createExpoLocationProvider(): Promise<LocationProvider> {
  const Location = await import('expo-location');
  return {
    async getCurrentPosition(): Promise<LocationResult> {
      try {
        const existing = await Location.getForegroundPermissionsAsync();
        if (existing.status === Location.PermissionStatus.UNDETERMINED) {
          const asked = await Location.requestForegroundPermissionsAsync();
          if (asked.status !== Location.PermissionStatus.GRANTED) {
            return {
              ok: false,
              code: asked.canAskAgain === false ? 'permission_blocked' : 'permission_denied',
              message:
                asked.canAskAgain === false
                  ? '定位權限已被永久拒絕，請至系統設定開啟'
                  : '尚未允許定位權限，無法進行 GPS 打卡',
            };
          }
        } else if (existing.status !== Location.PermissionStatus.GRANTED) {
          if (existing.canAskAgain === false) {
            return {
              ok: false,
              code: 'permission_blocked',
              message: '定位權限已被永久拒絕，請至系統設定開啟',
            };
          }
          const asked = await Location.requestForegroundPermissionsAsync();
          if (asked.status !== Location.PermissionStatus.GRANTED) {
            return {
              ok: false,
              code: asked.canAskAgain === false ? 'permission_blocked' : 'permission_denied',
              message: '尚未允許定位權限，無法進行 GPS 打卡',
            };
          }
        }

        const enabled = await Location.hasServicesEnabledAsync();
        if (!enabled) {
          return { ok: false, code: 'gps_disabled', message: '裝置定位服務已關閉，請開啟 GPS 後再試' };
        }

        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const latitude = pos.coords.latitude;
        const longitude = pos.coords.longitude;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          return { ok: false, code: 'invalid_coords', message: '取得的座標無效' };
        }
        return {
          ok: true,
          fix: {
            latitude,
            longitude,
            accuracy: pos.coords.accuracy,
            mocked: 'mocked' in pos.coords ? Boolean((pos.coords as { mocked?: boolean }).mocked) : null,
          },
        };
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error);
        if (/timeout/i.test(text)) {
          return { ok: false, code: 'timeout', message: '定位逾時，請移到空曠處後重新定位' };
        }
        return { ok: false, code: 'unavailable', message: `定位失敗：${text}` };
      }
    },
  };
}
