# 跨手機 API 接線盤點與部署邊界

日期：2026-09-09。依目前工作樹實際程式盤點；這是設計與缺口清單，不是已部署或同步完成的聲明。

## 結論與既有服務隔離

短期可以保留既有 service／SQLite schema，在**全新、獨立的 API 服務**集中執行業務操作；手機只傳送明確命令、取得授權範圍內的 DTO。這能減少重寫已測試業務規則的風險，但並不是把 SQLite 檔案搬到雲端就完成。部署前必須有真正的伺服器 session、逐請求權限、附件上傳及全 UI 的資料來源切換。

使用者已要求不能影響既有「懶人管理」服務。本案不得修改、重啟、換 branch、重設環境變數、掛接磁碟或改網域到既有服務。新 API 必須具有獨立 service ID、儲存路徑、憑證、網域、備份與回復程序。本文沒有操作 Render，也沒有確認方案、磁碟資格或實際資源設定；這些需由部署主流程另外核對。

禁止採用任意遠端 SQL、傳入 repository／函式名稱任意執行、下載全公司資料庫到每支手機，或把手機 SQLite 覆蓋到伺服器的方案。沿用 QR、Audit、Scan Log、Notification、住戶及訪客資料模型，不建立第二套。

## 方案風險：既有 SQLite API 與 Postgres

### A. 獨立 API＋既有 SQLite：最少業務改造，但必須有限制

- `database/betterSqliteAdapter.ts` 已提供 Node 的 `createBetterSqliteDatabase(filename)`；可沿用 `database/migrate.ts` 與 001～010 migrations。SQLite 檔案及 WAL 必須位於同一個確認持久化的目錄。不能放在部署重建會遺失的路徑。
- Adapter 的 `withTransaction` 使用**同一個全域 depth**，且交易函式會 await。HTTP 請求 A 在 await 時，B 若進入交易會因 depth > 0 被誤認為 A 的巢狀交易。即使 SQL 方法是同步的，也不能推論整筆業務操作沒有交錯。
- 保留此 adapter 時，必須把所有使用這條連線的**完整業務請求（包括讀取）及背景任務**送入同一序列佇列；只鎖單條 SQL 或寫入端點不夠。部分看似讀取的 dashboard 會產生提醒或刷新狀態。較長的密碼運算、影像處理、外部 I/O 應在適當邊界處理，避免長時間卡住所有人。
- 必須單程序／單 instance 擁有資料庫。不能使用多 worker、自動水平擴充或兩個 app instance 各寫不同本機檔案。真正吞吐量、排隊時間及重啟恢復必須量測，不能由目前小型測試推定可承載全公司。
- 備份必須採 SQLite 一致性備份或停寫快照，不能只複製可能正在寫入的主檔而忽略 WAL。需演練還原、維護視窗、磁碟容量告警及部署中止回復。
- `database/runtime.ts` 的 current 是全域連線；這可保留為單中央 DB，但不能依每個請求任意更換成不同公司的連線。

### B. Postgres：較適合多人擴充，但目前不是只換連線字串

- `SqlDatabase` 使用 `?` 參數、`changes`、`lastInsertRowId`、`exec`、自製巢狀交易語意。Postgres adapter 需要參數轉換、結果映射與交易綁定連線，不能只把 getDatabase 換成網路查詢。
- `database/migrate.ts` 及 migrations 有 PRAGMA；`inspectionCatalogRepository.ts`、`leaveRepository.ts`、`workforceRepository.ts`、`userRepository.ts` 等使用 SQLite 特有操作；migrations 002～010 有 SQLite 約束／trigger／重建流程。需要另建 Postgres migration 及等價完整性測試，保留原 001～009 檔案不變。
- append-only 事件、住戶 occupancy 正規化、最後管理員約束、鑰匙庫存及物品部分歸還需確認競態下仍一致。資料搬遷需驗證列數、關聯、時間、Audit 及原始事件，不是只搬最終畫面狀態。
- 長期可選 Postgres，但它不能替代 HTTP 權限、session、API DTO、附件及 App 接線；這些兩種方案都要做。

## 身分、初始化及裝置狀態必須替換的接點

1. `app/(onboarding)/create-site.tsx` 直接呼叫 `bootstrapSystem`，目前本機每支手機都能初始化公司。雲端改成只讀 bootstrap status；首次公司／董事長建立必須伺服器一次性安全初始化，有原子檢查與不可重用的初始化授權。不能把現在的函式無保護公開。
2. `app/(auth)/login.tsx` 呼叫 `authService.login`。既有函式驗密碼後呼叫 `saveSession(createSession(...))`；`sessionStore.ts` 僅建立 UUID、存到單例 KV，沒有伺服器 token 驗證表。API 需要伺服器產生且持久管理的 session，過期、撤銷、停權及改密碼後的 session 策略，登入速率限制，不回傳密碼 hash／salt。
3. `app/(auth)/register.tsx` 直接 `listTenants` 並 `registerAccount`。雲端註冊應用邀請／公司代碼取得最少公司識別，不公開所有公司的完整資料。註冊者不能自行指定角色或偽造 ActorContext。
4. `providers/SessionProvider.tsx` 目前 initialize SQLite、countTenants、loadSession、getUserById、getTenantById、getEffectiveRoles、getEffectivePermissionKeys、getAuthorizedSites。雲端應改為 bootstrap status＋session/me 回傳已清理 user／tenant／roles／permissionKeys／authorizedSites。手機只存 token 與必要 UI 偏好；身分及角色以伺服器每次確認為準。
5. `services/sessionStore.ts` 的 store、cachedDeviceId 是 process 全域。不能把每個 HTTP 請求都 configureKvStore 到不同手機；不然 session／deviceId 會串人。服務層驗密碼與 session 簽發要分離，裝置 metadata 以 request 範圍傳入且標明只是客戶端宣告。
6. `siteService.getCurrentSite/switchCurrentSite` 使用 `appStateRepository` 以 CURRENT_SITE_KEY:userId 存選定案場（已按使用者區分，但同使用者的兩支手機仍會共用）。雲端「目前案場」應是裝置／session 偏好，命令也必須明確傳 siteId 並重新授權；不能以伺服器全域目前案場决定另一人的操作。
7. `locationProvider.ts` 的 current 是 process 全域；不能為每個 HTTP 請求 setMockLocationResult。GPS 由手機取得，作為有時間戳、精度及失敗狀態的輸入，伺服器驗範圍及時間，不聲稱可證明 GPS 未偽造。打卡 server 時間及業務時區需明確設定（現有日期函式會使用執行環境時區）。

## 最小完整 API 能力（路由名称為設計建議，函式為實際來源）

每個端點必須有明確輸入 schema、伺服器建立 ActorContext、目前有效帳號／tenant 驗證、權限及案場／本人範圍檢查、分頁／日期上限、穩定錯誤碼。不得信任 body 裡的 userId、tenantId、roleSnapshot、permissionKeys、createdBy。需要目標 userId 的主管操作也要另驗管理範圍。

- **初始化與帳號**：bootstrap status、一次性 bootstrap、register、login、logout、session/me、changeOwnPassword、changeOwnProfile、listPendingAccounts、listAccounts、reviewAccount、setAccountStatus。停權與角色變更不得只等手機刷新後才生效。
- **公司／案場／角色**：editTenant；listSites/getSiteById 的安全 DTO；createSite/editSite/changeSiteStatus；getAuthorizedSites、assignUserToSite/removeUserSite；listRoles/getRoleById/listAssignableRoles、createCustomRole/renameRole/setRoleStatus/updateRolePermissionSet、assignRoleToUser/removeUserRoleAssignment、addUserPermissionOverride。角色詳情／指派清單亦須過濾不可授予權限。
- **排班與編制**：getShiftTemplates/createShiftTemplate、previewSchedule/createSchedule、listMySchedules/listSiteSchedules、copyDay/copyWeek/copyMonth/commitCopySchedules、setUserStaffingMode、saveWorkforceSettings、evaluateScheduleWarnings、listStaffingRequirements/getStaffingRequirement/createStaffingRequirement/editStaffingRequirement/deactivateStaffingRequirement/removeStaffingRequirement、getShiftCoverageForActor/listSiteCoveragesForActor。複製預覽與 commit 之間需要伺服器重驗，不採信手機預覽結果。
- **出勤／勤務**：getActiveWorkSession/startWorkSession/endWorkSession、clockIn/clockOut、requestAttendanceCorrection/listCorrectionsForReview/reviewAttendanceCorrection。每次 command 提供 idempotency key，重試不能多打一次；驗證本人 schedule、site、QR 掃描證據、GPS 結果。禁止任意傳入未驗證的「QR 已通過」。
- **請假**：listOwnLeave/getLeaveDetail/submitLeaveRequest、attachLeaveFile、listLeaveForReview/staffingImpactIfApproved、reviewLeaveRequest、病假／面談／餘額／政策相關函式見附錄。getLeaveBalance 不能直接任意指定其他員工；健康附件需本人或 leave.attachment.view 的限定授權。
- **QR 共用中心**：listQrAssetsForActor/getQrAssetForViewer/getEmployeeQrCard、issueEmployeeQr/issueSiteQr/issuePatrolPointQr、deactivateQrAssetByActor/reactivateQrAssetByActor、scanQr/listScanHistory。QR export／相機權限留在手機。共用掃描紀錄持續使用既有表，伺服器限流與證據關聯不只用手機 cooldown。
- **巡邏**：listPatrolPointsForActor/getPatrolPointForActor/createPatrolPoint/deactivatePatrolPointByActor；listPatrolTemplatesForActor/getPatrolTemplateDetail/createPatrolTemplate/updatePatrolTemplateByActor/addPatrolTemplatePoint；listOwnPatrolTasks/getOwnActivePatrolCard/getPatrolTaskDetail/requirePatrolTaskPoint；completePatrolPoint/savePatrolPhoto/createPatrolException；getPatrolSiteDashboard/listPatrolDashboardTasks。
- **督勤／改善／懲處**：startInspectionFromQr/getInspectionContext/saveInspectionEvaluation/addInspectionEvidence/listOwnInspectionHistory、getInspectionSiteDashboard；listInspectionCriteriaForActor/updateInspectionCriteriaForActor/getInspectionPolicyForActor/updateInspectionPolicyForActor；createImprovementOrder/getImprovementDetail/listImprovementsForActor/submitImprovementReply/reviewImprovement；recommendDiscipline/getDisciplineDetail/listDisciplineForActor/reviewDiscipline。保留現有 patrol_exceptions、改善、懲處獨立語意。
- **戶別／住戶**：listSiteUnitsForActor/getSiteUnitForActor/createSiteUnit/updateSiteUnitForActor；listResidentsForActor/createResidentWithOccupancy/getResidentForActor/updateResidentForActor、occupancy 搬入搬出等見附錄。列表與詳情限制案場，DTO 不任意帶出電話／證件末碼。
- **訪客／包裹**：listVisitorPassesForActor/getVisitorPassForActor/registerVisitorPass/checkInVisitor/checkOutVisitor/cancelVisitorPass/voidVisitorMovement；listParcelsForActor/getParcelForActor/registerParcel/pickupParcel/cancelParcel/notifyParcel/returnParcel/reverseParcelEvent。保留 append-only 事件，回退操作寫反向事件；重試需冪等。
- **車位／車輛**：parkingSpaceService、vehicleService 附錄中所有 UI 匯入；必須支援車位設定／指派、車輛主檔、通行證、進出、佔用／釋放、違停記錄／結案。所有關聯戶別、車輛、訪客與車位皆重新驗 tenant/site；違停不產生直接罰款。
- **鑰匙／物品**：createManagedKeyForActor/listManagedKeysForActor/getManagedKeyForActor/checkoutKeyForActor/returnKeyForActor/reportKeyIssueForActor；createLoanItemForActor/listLoanItemsForActor/getLoanItemForActor/borrowLoanItemForActor/returnLoanItemForActor/reportLoanItemIssueForActor。併發借用、分次歸還及庫存扣回須原子，不能只信 UI 計算 outstandingForBorrow。
- **首頁／通知／稽核**：getDashboardSnapshot、getMobilityHomeCard、getAuditLogs；listNotifications、markNotificationRead 建立本人範圍端點。現有 app_notifications 是站內紀錄，跨手機讀取與系統推播是兩件事；若需要手機背景推播另做 device token 與送達流程，不能宣稱現在已有。

完整最低範圍以附錄所有 UI 資料相依為準，不能只完成登入與打卡後宣稱全系統同步。沒有完成的模組應明確關閉或保留單機標示，不能混接同帳號的兩份真實資料。

## 讀取權限缺口不能略過

以下 UI 直接呼叫 repository，不可原樣轉為公開通用 API。repository 的 tenantId filter 不是驗證身分：

- `listUsersByTenant/getUserById`：排班、審核、QR、補登／假單頁。需要最少欄位的名單／詳情 DTO，區分本人、主管管理範圍、已授權案場；不回傳 secret 欄位。
- `listSites/getSiteById`：案場、排班、QR、審核頁。下拉清單也需授權案場篩選；停用案場歷史名稱可提供，不能藉此恢復作業資格。
- `listRoles/getRoleById/listUserRoles/listRolePermissionKeys/listUserSitePermissions`：只有有權管理該目標帳號／角色的人能查看；UI 隱藏不是 API 保護。
- `requireWorkforceSettings/ensureTenantWorkforceDefaults/ensureLeavePolicy`：ensure 會寫資料，不能作公開 GET 的無限副作用；公司設置只供有權限者。手機自己的班表可以取得計算所需的限定 policy DTO。
- `listSchedulesForUserInRange/getShiftTemplateById/getLeaveBalance`：本人路由從 session 取 userId；主管讀別人需額外權限，不接受自由 tenantId。
- `getActiveQrAssetForTarget`：巡邏點頁的 QR 查詢須先驗目標案場及 QR 查看權限；不能按任意 targetId 洩漏有效代碼。
- `listNotifications` 必須用已驗證 session 的 tenantId/userId；`listScanHistory` 目前回傳 tenant-wide scan logs，`getPatrolSiteDashboard` 需再檢查 permission/site guard 才能暴露 API。即使函式名稱有 Actor，也不能假設已具所有跨網路安全邊界。

`getDashboardSnapshot` 會 `refreshSickLeaveOverdue`；`getInspectionSiteDashboard` 會 `remindDueReinspections`；`getMobilityHomeCard` 會刷新逾時停車。這些讀取有写入副作用，必須序列化／冪等，之後可移到明確排程 job。jobs 亦不得建立第二套 Notification／Audit。

## 手機附件與原始照片

`file://`、`content://`、瀏覽器 `blob:` URI 只在原裝置可用，傳字串到 API 不會上傳照片。以下都須接入同一個受控附件機制：

- `authService.changeOwnProfile(photoUri)`、`residentService.createResidentWithOccupancy/updateResidentForActor(photoUri)`。
- `leaveService.attachLeaveFile({fileName,mimeType,localUri,kind})`。
- `inspectionService.addInspectionEvidence({localUri,...})`、`patrolCheckService.savePatrolPhoto({localUri,...})`／`completePatrolPoint`；`patrolWatermarkService.applyPatrolWatermark` 目前只回傳 overlayText、watermarkUri:null，**沒有真的產出浮水印影像**。
- `improvementService.submitImprovementReply(photoUri)`；訪客 checkIn/checkOut、包裹 register/pickup、vehicleService 違停／進出、loanItemService 借還／問題照片欄位。

最小能力：建立上傳意圖（指定業務用途與案場）→限量二進位上傳與 MIME／大小檢查→完成確認回 attachment ID→業務命令驗附件所有者／公司／案場→有時效或有驗證的下載。存物件 key 與 metadata，不把本機URI當永久資源；私人住戶／病假／督勤照片不能公開裸URL。上傳與業務 command 失敗後需可安全重試、處理未引用附件；檔案備份需與DB備份可對應。

## 上線前最低驗收

- 不同裝置、不同帳號共用一個公司中央資料來源；董事長建立排班，保全看見並打卡，董事長看到正確時間與紀錄。
- 公司 A 不能猜 ID 讀寫公司 B；案場 A 員工不能讀寫案場 B；停權／撤銷角色在下一次 API 生效。列表、詳情、附件和下載同樣驗證。
- 重複送出、網路逾時重試、兩人同借一把鑰匙／同車位、部分歸還並發不重複記錄或產生負庫存。
- 照片跨手機可讀，但未授權帳號不可讀；定位權限拒絕、相機拒絕、App 回前景及網路斷線顯示可理解的狀態，不偽裝成功。
- 服務重啟後 session／資料保留、備份可还原；序列佇列在公司預期負載下可接受，健康檢查不被卡住；新服務故障不影響既有懶人管理。
- 初期建議雲端模式明確要求在線；完整離線寫入佇列／衝突合併是另一個必須設計與測試的範圍，不能沿用 sync_status='pending' 便宣稱完成。


## 附錄：UI／Provider 直接匯入清單

依 TypeScript AST 掃描 app/、providers/，排除 type-only imports。包含少量常數、錯誤類別、純計算／裝置函式；清單是 UI 接線面，不代表每個名稱都該成為公開 API。間接服務呼叫與背景任務不在此清單，另見上文。

共 109 個檔案、49 個模組。

### @/repositories/leaveRepository

- `ensureLeavePolicy` — `app/(main)/manage/workforce.tsx`
- `getLeaveBalance` — `app/(main)/duty/leave.tsx`

### @/repositories/notificationRepository

- `listNotifications` — `app/(main)/duty/index.tsx`、`app/(main)/messages/index.tsx`

### @/repositories/permissionRepository

- `listRolePermissionKeys` — `app/(main)/manage/roles/[id].tsx`
- `listUserRoles` — `app/(main)/manage/accounts/[id].tsx`

### @/repositories/qrAssetRepository

- `getActiveQrAssetForTarget` — `app/(main)/manage/patrol-points/[id].tsx`

### @/repositories/roleRepository

- `getRoleById` — `app/(main)/manage/roles/[id].tsx`
- `listRoles` — `app/(main)/manage/accounts/[id].tsx`、`app/(main)/manage/approvals/[id].tsx`、`app/(main)/manage/roles/index.tsx`

### @/repositories/siteRepository

- `getSiteById` — `app/(main)/duty/schedule.tsx`、`app/(main)/manage/leave-review/index.tsx`、`app/(main)/manage/schedules/index.tsx`、`app/(main)/manage/sites/[id].tsx`、`app/(main)/manage/staffing-requirements/[id].tsx`
- `listSites` — `app/(main)/manage/accounts/[id].tsx`、`app/(main)/manage/approvals/[id].tsx`、`app/(main)/manage/qr-assets/new-site.tsx`、`app/(main)/manage/schedules/new.tsx`、`app/(main)/manage/sites/index.tsx`、`app/(main)/manage/staffing-requirements/index.tsx`、`app/(main)/manage/staffing-requirements/new.tsx`

### @/repositories/tenantRepository

- `countTenants` — `providers/SessionProvider.tsx`
- `getTenantById` — `providers/SessionProvider.tsx`
- `listTenants` — `app/(auth)/register.tsx`

### @/repositories/userRepository

- `getUserById` — `app/(main)/manage/accounts/[id].tsx`、`app/(main)/manage/approvals/[id].tsx`、`app/(main)/manage/corrections/index.tsx`、`app/(main)/manage/leave-review/index.tsx`、`app/(main)/manage/leave-review/[id].tsx`、`app/(main)/manage/qr-assets/[id].tsx`、`app/(main)/manage/schedules/index.tsx`、`providers/SessionProvider.tsx`
- `listUsersByTenant` — `app/(main)/manage/schedules/new.tsx`

### @/repositories/userSiteRepository

- `listUserSitePermissions` — `app/(main)/manage/accounts/[id].tsx`

### @/repositories/workforceRepository

- `ensureTenantWorkforceDefaults` — `app/(main)/manage/workforce.tsx`
- `getShiftTemplateById` — `app/(main)/duty/schedule.tsx`
- `listSchedulesForUserInRange` — `app/(main)/duty/clock.tsx`
- `requireWorkforceSettings` — `app/(main)/duty/schedule.tsx`、`app/(main)/manage/schedules/index.tsx`

### @/services/attendanceService

- `GpsClockError` — `app/(main)/duty/clock.tsx`
- `clockIn` — `app/(main)/duty/clock.tsx`、`app/(main)/duty/scan.tsx`
- `clockOut` — `app/(main)/duty/clock.tsx`、`app/(main)/duty/scan.tsx`
- `listCorrectionsForReview` — `app/(main)/manage/corrections/index.tsx`
- `requestAttendanceCorrection` — `app/(main)/duty/correction-new.tsx`
- `reviewAttendanceCorrection` — `app/(main)/manage/corrections/index.tsx`

### @/services/auditService

- `getAuditLogs` — `app/(main)/manage/audit/index.tsx`

### @/services/authService

- `changeOwnPassword` — `app/(main)/me/password.tsx`
- `changeOwnProfile` — `app/(main)/me/profile.tsx`
- `login` — `app/(auth)/login.tsx`
- `logout` — `app/(main)/me/index.tsx`
- `registerAccount` — `app/(auth)/register.tsx`
- `reviewAccount` — `app/(main)/manage/approvals/[id].tsx`

### @/services/bootstrapService

- `bootstrapSystem` — `app/(onboarding)/create-site.tsx`
- `validateAdminInput` — `app/(onboarding)/create-admin.tsx`
- `validateCompanyInput` — `app/(onboarding)/create-company.tsx`

### @/services/dashboardService

- `DUTY_STATUS_LABELS` — `app/(main)/duty/index.tsx`、`app/(main)/index.tsx`
- `getDashboardSnapshot` — `app/(main)/duty/index.tsx`、`app/(main)/index.tsx`

### @/services/disciplineService

- `getDisciplineDetail` — `app/(main)/manage/discipline/[id].tsx`
- `listDisciplineForActor` — `app/(main)/manage/discipline/index.tsx`
- `recommendDiscipline` — `app/(main)/inspect/[sessionId].tsx`
- `reviewDiscipline` — `app/(main)/manage/discipline/[id].tsx`

### @/services/improvementService

- `createImprovementOrder` — `app/(main)/inspect/[sessionId].tsx`
- `getImprovementDetail` — `app/(main)/manage/improvements/[id].tsx`、`app/(main)/me/improvements/[id].tsx`
- `listImprovementsForActor` — `app/(main)/manage/improvements/index.tsx`、`app/(main)/me/improvements/index.tsx`
- `reviewImprovement` — `app/(main)/manage/improvements/[id].tsx`
- `submitImprovementReply` — `app/(main)/me/improvements/[id].tsx`

### @/services/inspectionCatalogService

- `getInspectionPolicyForActor` — `app/(main)/manage/inspection-criteria/index.tsx`
- `listInspectionCriteriaForActor` — `app/(main)/manage/inspection-criteria/index.tsx`
- `updateInspectionCriteriaForActor` — `app/(main)/manage/inspection-criteria/index.tsx`
- `updateInspectionPolicyForActor` — `app/(main)/manage/inspection-criteria/index.tsx`

### @/services/inspectionDashboardService

- `getInspectionSiteDashboard` — `app/(main)/manage/inspection-dashboard/index.tsx`

### @/services/inspectionService

- `InspectionUnauthorizedError` — `app/(main)/inspect/index.tsx`
- `addInspectionEvidence` — `app/(main)/inspect/[sessionId].tsx`
- `getInspectionContext` — `app/(main)/inspect/[sessionId].tsx`
- `listOwnInspectionHistory` — `app/(main)/me/inspections.tsx`
- `remindDueReinspections` — `app/(main)/messages/index.tsx`
- `saveInspectionEvaluation` — `app/(main)/inspect/[sessionId].tsx`
- `startInspectionFromQr` — `app/(main)/inspect/index.tsx`

### @/services/keyService

- `checkoutKeyForActor` — `app/(main)/duty/keys/[id].tsx`
- `createManagedKeyForActor` — `app/(main)/manage/keys/new.tsx`
- `getManagedKeyForActor` — `app/(main)/duty/keys/[id].tsx`、`app/(main)/manage/keys/[id].tsx`
- `listManagedKeysForActor` — `app/(main)/duty/keys/index.tsx`、`app/(main)/manage/keys/index.tsx`
- `reportKeyIssueForActor` — `app/(main)/manage/keys/[id].tsx`
- `returnKeyForActor` — `app/(main)/duty/keys/[id].tsx`

### @/services/leaveService

- `attachLeaveFile` — `app/(main)/duty/leave-detail.tsx`
- `getLeaveDetail` — `app/(main)/duty/leave-detail.tsx`、`app/(main)/manage/leave-review/[id].tsx`
- `listLeaveForReview` — `app/(main)/manage/leave-review/index.tsx`
- `listOwnLeave` — `app/(main)/duty/leave.tsx`
- `recordLeaveInterview` — `app/(main)/manage/leave-review/[id].tsx`
- `refreshLeaveBalances` — `app/(main)/duty/leave.tsx`
- `reviewLeaveRequest` — `app/(main)/manage/leave-review/[id].tsx`
- `saveLeavePolicy` — `app/(main)/manage/workforce.tsx`
- `staffingImpactIfApproved` — `app/(main)/manage/leave-review/index.tsx`
- `submitLeaveRequest` — `app/(main)/duty/leave-new.tsx`
- `verifyLeaveDocument` — `app/(main)/manage/leave-review/[id].tsx`

### @/services/loanItemService

- `borrowLoanItemForActor` — `app/(main)/duty/loan-items/[id].tsx`
- `createLoanItemForActor` — `app/(main)/manage/loan-items/new.tsx`
- `getLoanItemForActor` — `app/(main)/duty/loan-items/[id].tsx`、`app/(main)/manage/loan-items/[id].tsx`
- `listLoanItemsForActor` — `app/(main)/duty/loan-items/index.tsx`、`app/(main)/manage/loan-items/index.tsx`
- `outstandingForBorrow` — `app/(main)/duty/loan-items/[id].tsx`、`app/(main)/manage/loan-items/[id].tsx`
- `reportLoanItemIssueForActor` — `app/(main)/manage/loan-items/[id].tsx`
- `returnLoanItemForActor` — `app/(main)/duty/loan-items/[id].tsx`

### @/services/mobilityDashboardService

- `getMobilityHomeCard` — `app/(main)/manage/parking-dashboard/index.tsx`

### @/services/parcelService

- `cancelParcel` — `app/(main)/manage/parcels/[id].tsx`
- `getParcelForActor` — `app/(main)/duty/parcels/[id].tsx`、`app/(main)/manage/parcels/[id].tsx`
- `listParcelsForActor` — `app/(main)/duty/parcels/index.tsx`、`app/(main)/manage/parcels/index.tsx`
- `notifyParcel` — `app/(main)/manage/parcels/[id].tsx`
- `pickupParcel` — `app/(main)/duty/parcels/[id].tsx`
- `registerParcel` — `app/(main)/duty/parcels/register.tsx`
- `returnParcel` — `app/(main)/manage/parcels/[id].tsx`
- `reverseParcelEvent` — `app/(main)/manage/parcels/[id].tsx`

### @/services/parkingSpaceService

- `addParkingAssignmentForActor` — `app/(main)/manage/parking-spaces/[id].tsx`
- `createParkingSpaceForActor` — `app/(main)/manage/parking-spaces/new.tsx`
- `endParkingAssignmentForActor` — `app/(main)/manage/parking-spaces/[id].tsx`
- `getParkingSettingsForActor` — `app/(main)/manage/parking-spaces/[id].tsx`
- `getParkingSpaceForActor` — `app/(main)/manage/parking-spaces/[id].tsx`
- `listParkingAssignmentsForActor` — `app/(main)/duty/parking/index.tsx`、`app/(main)/manage/parking-spaces/[id].tsx`
- `listParkingSpacesForActor` — `app/(main)/duty/parking/index.tsx`、`app/(main)/duty/vehicles/index.tsx`、`app/(main)/manage/parking-spaces/index.tsx`
- `updateParkingSettingsForActor` — `app/(main)/manage/parking-spaces/[id].tsx`
- `updateParkingSpaceForActor` — `app/(main)/manage/parking-spaces/[id].tsx`

### @/services/patrolCheckService

- `completePatrolPoint` — `app/(main)/duty/patrol/check.tsx`
- `savePatrolPhoto` — `app/(main)/duty/patrol/exception.tsx`

### @/services/patrolDashboardService

- `getPatrolSiteDashboard` — `app/(main)/manage/patrol-dashboard/index.tsx`
- `listPatrolDashboardTasks` — `app/(main)/manage/patrol-dashboard/index.tsx`

### @/services/patrolExceptionService

- `createPatrolException` — `app/(main)/duty/patrol/exception.tsx`

### @/services/patrolPointService

- `createPatrolPoint` — `app/(main)/manage/patrol-points/new.tsx`
- `deactivatePatrolPointByActor` — `app/(main)/manage/patrol-points/[id].tsx`
- `getPatrolPointForActor` — `app/(main)/manage/patrol-points/[id].tsx`
- `listPatrolPointsForActor` — `app/(main)/manage/patrol-points/index.tsx`、`app/(main)/manage/patrol-templates/[id].tsx`、`app/(main)/manage/qr-assets/new-patrol-point.tsx`

### @/services/patrolTaskService

- `getOwnActivePatrolCard` — `app/(main)/duty/patrol/index.tsx`
- `getPatrolTaskDetail` — `app/(main)/duty/patrol/check.tsx`、`app/(main)/duty/patrol/[taskId].tsx`、`app/(main)/manage/patrol-dashboard/[taskId].tsx`
- `listOwnPatrolTasks` — `app/(main)/duty/patrol/index.tsx`
- `requirePatrolTaskPoint` — `app/(main)/duty/patrol/check.tsx`、`app/(main)/duty/patrol/exception.tsx`

### @/services/patrolTemplateService

- `addPatrolTemplatePoint` — `app/(main)/manage/patrol-templates/[id].tsx`
- `createPatrolTemplate` — `app/(main)/manage/patrol-templates/new.tsx`
- `getPatrolTemplateDetail` — `app/(main)/manage/patrol-templates/[id].tsx`
- `listPatrolTemplatesForActor` — `app/(main)/manage/patrol-templates/index.tsx`
- `updatePatrolTemplateByActor` — `app/(main)/manage/patrol-templates/[id].tsx`

### @/services/permissionService

- `getEffectivePermissionKeys` — `providers/SessionProvider.tsx`
- `getEffectiveRoles` — `providers/SessionProvider.tsx`
- `roleSnapshotForUser` — `providers/SessionProvider.tsx`

### @/services/qrAssetService

- `deactivateQrAssetByActor` — `app/(main)/manage/qr-assets/[id].tsx`
- `getEmployeeQrCard` — `app/(main)/me/qr.tsx`
- `getQrAssetForViewer` — `app/(main)/manage/qr-assets/[id].tsx`
- `issueEmployeeQr` — `app/(main)/manage/qr-assets/new-employee.tsx`、`app/(main)/manage/qr-assets/[id].tsx`
- `issuePatrolPointQr` — `app/(main)/manage/patrol-points/[id].tsx`、`app/(main)/manage/qr-assets/new-patrol-point.tsx`
- `issueSiteQr` — `app/(main)/manage/qr-assets/new-site.tsx`、`app/(main)/manage/qr-assets/[id].tsx`
- `listQrAssetsForActor` — `app/(main)/manage/qr-assets/index.tsx`
- `reactivateQrAssetByActor` — `app/(main)/manage/qr-assets/[id].tsx`

### @/services/qrRenderService

- `exportQrPng` — `app/(main)/manage/qr-assets/[id].tsx`

### @/services/qrScannerService

- `getCameraPermissionState` — `app/(main)/duty/patrol/check.tsx`、`app/(main)/duty/scan.tsx`、`app/(main)/inspect/index.tsx`
- `listScanHistory` — `app/(main)/manage/qr-assets/scans.tsx`
- `requestCameraPermission` — `app/(main)/duty/patrol/check.tsx`、`app/(main)/duty/scan.tsx`、`app/(main)/inspect/index.tsx`
- `scanQr` — `app/(main)/duty/scan.tsx`

### @/services/residentService

- `addResidentOccupancyForActor` — `app/(main)/manage/residents/[id].tsx`
- `createResidentWithOccupancy` — `app/(main)/manage/residents/new.tsx`
- `endResidentOccupancyForActor` — `app/(main)/manage/residents/[id].tsx`
- `getResidentForActor` — `app/(main)/manage/residents/[id].tsx`
- `listResidentsForActor` — `app/(main)/duty/parcels/register.tsx`、`app/(main)/duty/visitors/register.tsx`、`app/(main)/manage/residents/index.tsx`、`app/(main)/manage/vehicles/new.tsx`
- `listUnitOccupanciesForActor` — `app/(main)/manage/units/[id].tsx`

### @/services/roleService

- `addUserPermissionOverride` — `app/(main)/manage/approvals/[id].tsx`
- `assignRoleToUser` — `app/(main)/manage/accounts/[id].tsx`、`app/(main)/manage/approvals/[id].tsx`
- `createCustomRole` — `app/(main)/manage/roles/new.tsx`
- `listAssignableRoles` — `app/(main)/manage/accounts/[id].tsx`
- `removeUserRoleAssignment` — `app/(main)/manage/accounts/[id].tsx`
- `renameRole` — `app/(main)/manage/roles/[id].tsx`
- `setRoleStatus` — `app/(main)/manage/roles/[id].tsx`
- `updateRolePermissionSet` — `app/(main)/manage/roles/[id].tsx`

### @/services/scheduleService

- `ScheduleDecisionError` — `app/(main)/manage/schedules/new.tsx`
- `commitCopySchedules` — `app/(main)/manage/schedules/index.tsx`
- `copyDay` — `app/(main)/manage/schedules/index.tsx`
- `copyMonth` — `app/(main)/manage/schedules/index.tsx`
- `copyWeek` — `app/(main)/manage/schedules/index.tsx`
- `createSchedule` — `app/(main)/manage/schedules/new.tsx`
- `createShiftTemplate` — `app/(main)/manage/shifts/new.tsx`
- `getShiftTemplates` — `app/(main)/manage/patrol-templates/new.tsx`、`app/(main)/manage/schedules/new.tsx`、`app/(main)/manage/shifts/index.tsx`、`app/(main)/manage/staffing-requirements/index.tsx`、`app/(main)/manage/staffing-requirements/new.tsx`、`app/(main)/manage/staffing-requirements/[id].tsx`
- `listMySchedules` — `app/(main)/duty/schedule.tsx`
- `listSiteSchedules` — `app/(main)/manage/schedules/index.tsx`
- `previewSchedule` — `app/(main)/manage/schedules/new.tsx`
- `saveWorkforceSettings` — `app/(main)/manage/workforce.tsx`
- `setUserStaffingMode` — `app/(main)/manage/accounts/[id].tsx`

### @/services/sessionStore

- `clearSession` — `providers/SessionProvider.tsx`
- `configureKvStore` — `providers/SessionProvider.tsx`
- `getAppVersion` — `app/(auth)/login.tsx`、`app/(auth)/register.tsx`、`app/(onboarding)/create-site.tsx`、`providers/SessionProvider.tsx`
- `getDeviceId` — `app/(auth)/login.tsx`、`app/(auth)/register.tsx`、`app/(onboarding)/create-site.tsx`、`providers/SessionProvider.tsx`
- `loadSession` — `providers/SessionProvider.tsx`

### @/services/siteService

- `assignUserToSite` — `app/(main)/manage/accounts/[id].tsx`、`app/(main)/manage/approvals/[id].tsx`
- `changeSiteStatus` — `app/(main)/manage/sites/[id].tsx`
- `createSite` — `app/(main)/manage/sites/new.tsx`
- `editSite` — `app/(main)/manage/sites/[id].tsx`
- `getAuthorizedSites` — `providers/SessionProvider.tsx`
- `getCurrentSite` — `providers/SessionProvider.tsx`
- `removeUserSite` — `app/(main)/manage/accounts/[id].tsx`
- `switchCurrentSite` — `providers/SessionProvider.tsx`

### @/services/staffingRequirementService

- `createStaffingRequirement` — `app/(main)/manage/staffing-requirements/new.tsx`
- `deactivateStaffingRequirement` — `app/(main)/manage/staffing-requirements/[id].tsx`
- `editStaffingRequirement` — `app/(main)/manage/staffing-requirements/[id].tsx`
- `getShiftCoverageForActor` — `app/(main)/manage/schedules/new.tsx`
- `getStaffingRequirement` — `app/(main)/manage/staffing-requirements/[id].tsx`
- `listSiteCoveragesForActor` — `app/(main)/manage/schedules/index.tsx`
- `listStaffingRequirements` — `app/(main)/manage/staffing-requirements/index.tsx`

### @/services/tenantService

- `editTenant` — `app/(main)/manage/company.tsx`

### @/services/unitService

- `createSiteUnit` — `app/(main)/manage/units/new.tsx`
- `getSiteUnitForActor` — `app/(main)/manage/units/[id].tsx`
- `listSiteUnitsForActor` — `app/(main)/duty/parcels/register.tsx`、`app/(main)/duty/visitors/register.tsx`、`app/(main)/manage/parking-spaces/[id].tsx`、`app/(main)/manage/residents/new.tsx`、`app/(main)/manage/residents/[id].tsx`、`app/(main)/manage/units/index.tsx`、`app/(main)/manage/vehicles/new.tsx`
- `updateSiteUnitForActor` — `app/(main)/manage/units/[id].tsx`

### @/services/userService

- `listAccounts` — `app/(main)/manage/accounts/index.tsx`、`app/(main)/manage/qr-assets/new-employee.tsx`
- `listPendingAccounts` — `app/(main)/manage/approvals/index.tsx`
- `setAccountStatus` — `app/(main)/manage/accounts/[id].tsx`

### @/services/vehicleService

- `checkInVehicleForActor` — `app/(main)/duty/vehicles/index.tsx`
- `checkOutVehicleForActor` — `app/(main)/duty/vehicles/index.tsx`
- `createParkingViolationForActor` — `app/(main)/duty/parking/index.tsx`
- `createResidentVehicleForActor` — `app/(main)/manage/vehicles/new.tsx`
- `createVehicleAccessPassForActor` — `app/(main)/duty/vehicles/index.tsx`
- `getResidentVehicleForActor` — `app/(main)/manage/vehicles/[id].tsx`
- `listOnSiteVehiclesForActor` — `app/(main)/duty/vehicles/index.tsx`
- `listParkingOccupanciesForActor` — `app/(main)/duty/parking/index.tsx`
- `listParkingViolationsForActor` — `app/(main)/manage/parking-violations/index.tsx`、`app/(main)/manage/parking-violations/[id].tsx`
- `listResidentVehiclesForActor` — `app/(main)/manage/vehicles/index.tsx`
- `occupyParkingSpaceForActor` — `app/(main)/duty/parking/index.tsx`
- `releaseParkingOccupancyForActor` — `app/(main)/duty/parking/index.tsx`
- `resolveParkingViolationForActor` — `app/(main)/manage/parking-violations/[id].tsx`
- `updateResidentVehicleForActor` — `app/(main)/manage/vehicles/[id].tsx`

### @/services/visitorService

- `cancelVisitorPass` — `app/(main)/manage/visitors/[id].tsx`
- `checkInVisitor` — `app/(main)/duty/visitors/[id].tsx`
- `checkOutVisitor` — `app/(main)/duty/visitors/[id].tsx`
- `getVisitorPassForActor` — `app/(main)/duty/visitors/[id].tsx`、`app/(main)/manage/visitors/[id].tsx`
- `listVisitorPassesForActor` — `app/(main)/duty/vehicles/index.tsx`、`app/(main)/duty/visitors/index.tsx`、`app/(main)/manage/visitors/index.tsx`
- `registerVisitorPass` — `app/(main)/duty/visitors/register.tsx`
- `voidVisitorMovement` — `app/(main)/manage/visitors/[id].tsx`

### @/services/workSessionService

- `ActiveSessionConflictError` — `app/(main)/duty/clock.tsx`
- `endWorkSession` — `app/(main)/duty/clock.tsx`
- `getActiveWorkSession` — `app/(main)/duty/clock.tsx`、`app/(main)/duty/index.tsx`
- `startWorkSession` — `app/(main)/duty/clock.tsx`

### @/services/workforceWarningService

- `evaluateScheduleWarnings` — `app/(main)/duty/schedule.tsx`、`app/(main)/manage/schedules/index.tsx`



