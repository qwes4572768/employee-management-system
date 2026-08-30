# GPS打卡員工管理系統

一個基於 Flask 的現代化員工管理系統，具備 GPS 打卡功能、員工資料管理和考勤記錄追蹤。

## 🚀 功能特色

- **GPS 打卡系統**：精確定位員工打卡位置
- **員工資料管理**：完整的員工資訊 CRUD 操作
- **考勤記錄追蹤**：詳細的上下班時間記錄
- **響應式 Web 介面**：支援桌面和行動裝置
- **資料庫管理**：SQLite 資料庫，支援資料遷移

## 🛠️ 技術架構

- **後端框架**：Flask (Python)
- **資料庫**：SQLite
- **前端技術**：HTML5, CSS3, JavaScript
- **部署平台**：支援 Heroku 部署

## 📋 系統需求

- Python 3.7+
- Flask 2.0+
- 現代化瀏覽器支援

## 🚀 快速開始

### 1. 克隆專案
```bash
git clone https://github.com/qwes4572768/employee-management-system.git
cd employee-management-system
```

### 2. 安裝依賴
```bash
pip install -r requirements.txt
```

### 3. 初始化資料庫
```bash
python migrate_db.py
```

### 4. 啟動應用
```bash
python app.py
```

### 5. 訪問系統
在瀏覽器中打開 `http://localhost:5000`

## 📁 專案結構

```
tmie/
├── app.py                 # 主應用程式
├── migrate_db.py          # 資料庫遷移腳本
├── requirements.txt       # Python 依賴
├── templates/            # HTML 模板
│   ├── base.html         # 基礎模板
│   ├── dashboard.html    # 儀表板
│   ├── login.html        # 登入頁面
│   └── ...              # 其他頁面
├── instance/             # 資料庫檔案
└── README.md            # 專案說明
```

## 🔧 配置說明

### 環境變數
- `SECRET_KEY`：Flask 應用密鑰
- `DATABASE_URL`：資料庫連接字串

### 資料庫配置
系統使用 SQLite 資料庫，資料檔案位於 `instance/employee_management.db`

## 📱 使用說明

1. **登入系統**：使用管理員帳號登入
2. **員工管理**：新增、編輯、刪除員工資料
3. **GPS 打卡**：員工可透過 GPS 定位進行打卡
4. **考勤記錄**：查看和管理員工考勤資料

## 🚀 部署到 Heroku

1. 確保已安裝 Heroku CLI
2. 登入 Heroku：`heroku login`
3. 創建應用：`heroku create your-app-name`
4. 部署：`git push heroku main`

## 🤝 貢獻指南

歡迎提交 Issue 和 Pull Request 來改善這個專案！

## 📄 授權條款

本專案採用 MIT 授權條款 - 詳見 [LICENSE](LICENSE) 檔案

## 📞 聯絡資訊

- 專案維護者：qwes4572768
- GitHub：[https://github.com/qwes4572768](https://github.com/qwes4572768)

---

⭐ 如果這個專案對您有幫助，請給我們一個星標！
