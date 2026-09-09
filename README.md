# 勤管系統 QinGuan System

保全與物業勤務管理 APP（第一階段：iOS / Android，Offline First）。

## 技術

- React Native + Expo SDK 57
- TypeScript
- Expo Router
- expo-sqlite
- 本機安全登入（PBKDF2-SHA256，session 存 SecureStore）

## 啟動

```bash
npm install
npx expo start
```

然後以 Expo Go 在 Android / iOS 測試。

## 品質檢查

```bash
npm run typecheck
npm run lint
npm test
npx expo-doctor
```

## 第一次使用

1. 啟動後進入歡迎頁
2. 選擇「建立新系統」
3. 建立第一位總管理員（不可使用 admin / 123456 這類預設帳密）
4. 建立公司資料
5. 可建立第一個案場，或稍後再建立
6. 進入首頁

第二次啟動會進入登入頁，資料保存在本機 SQLite。

## 產品 Logo

請將正式「勤管系統」藍色雙子座 Logo 放到：

- `assets/icon.png`
- `assets/adaptive-icon.png`
- `assets/splash.png`

目前僅為深色空白佔位，沒有使用假 Logo。

## 架構

UI → Service → Repository → SQLite

資料表預留 `tenantId`、`syncStatus`、`deviceId`、`version`、soft delete，以支援未來多租戶雲端同步。

舊版 Flask 網頁原型已移至 `legacy-web/`。
