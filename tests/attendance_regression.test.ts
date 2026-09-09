import { clockIn, clockOut, startWorkSession, endWorkSession } from './support/operationalClock';
import assert from 'node:assert/strict';
import { requestAttendanceCorrection } from '@/services/attendanceService';
import { clockIn as productionClockIn, clockOut as productionClockOut } from '@/services/attendanceService';
import { startWorkSession as productionStart, endWorkSession as productionEnd } from '@/services/workSessionService';
import { withOperationalClockForTest } from '@/services/clockProvider';
import { issueSiteQr, deactivateQrAssetByActor } from '@/services/qrAssetService';
import { editSite } from '@/services/siteService';
import { listQrScanLogs } from '@/repositories/qrScanLogRepository';
import { resetQrScanCooldown } from '@/services/qrScannerService';
import { setMockLocationResult, setLocationProvider } from '@/services/locationProvider';
import { setAccountStatus } from '@/services/userService';
import { getOpenAttendance } from '@/repositories/attendanceRepository';
import { formatDateTimeZh, formatTimeZh } from '@/utils/datetime';
import { cancelSchedule } from '@/services/scheduleService';
import { createBetterSqliteDatabase } from '@/database/betterSqliteAdapter';
import { migrate } from '@/database/migrate';
import { setDatabase } from '@/database/runtime';
import { bootstrapSystem } from '@/services/bootstrapService';
import { registerAccount, reviewAccount, login, logout } from '@/services/authService';
import { systemActor } from '@/services/actor';
import { configureKvStore, MemoryKvStore } from '@/services/sessionStore';
import { listRoles } from '@/repositories/roleRepository';
import { listSites } from '@/repositories/siteRepository';
import { assignRoleToUser } from '@/services/roleService';
import { createSite, assignUserToSite } from '@/services/siteService';
import { createSchedule, createShiftTemplate } from '@/services/scheduleService';

import { getDashboardSnapshot } from '@/services/dashboardService';

async function main() {
 const db=createBetterSqliteDatabase(':memory:'); setDatabase(db); configureKvStore(new MemoryKvStore()); await migrate(db);
 const sys=systemActor('acceptance-device','1.0.0');
 const boot=await bootstrapSystem({admin:{fullName:'驗收董事長',phone:'0900000000',employeeNo:'QA-ADMIN',gender:'male',hireDate:'2026-01-01',jobTitle:'董事長',account:'qa.chairman',password:'Acceptance#2026',confirmPassword:'Acceptance#2026'},company:{officialName:'驗收保全公司',shortName:'驗收',taxId:'12345678',phone:'0200000000',industryType:'security'},site:{siteCode:'QA-SITE',name:'驗收案場',address:'虛構地址'},actor:sys});
 const admin={...sys,userId:boot.user.id,tenantId:boot.tenant.id,fullName:boot.user.fullName,account:boot.user.account};
 const person=await registerAccount(boot.tenant,{fullName:'驗收一般保全',phone:'0900000001',employeeNo:'QA-GUARD',gender:'male',hireDate:'2026-01-01',jobTitle:'保全員',account:'qa.guard',password:'GuardTest#2026',confirmPassword:'GuardTest#2026'},sys);
 await reviewAccount(admin,person.id,'active',null);
 const roles=await listRoles(boot.tenant.id); const staff=roles.find(r=>r.roleKey==='STAFF')!; 
 const grant=(actor:any, role:any)=>assignRoleToUser(actor,{tenantId:boot.tenant.id,userId:person.id,roleId:role.id,startsAt:null,expiresAt:null,isPermanent:true,targetName:person.fullName,roleName:role.name});
 await grant(admin,staff); const site=(await listSites(boot.tenant.id))[0]!;
 await assignUserToSite(admin,{tenantId:boot.tenant.id,userId:person.id,siteId:site.id,startsAt:null,expiresAt:null,isPermanent:true,targetName:person.fullName,siteName:site.name});
 await logout(admin); const signed=await login('qa.guard','GuardTest#2026',sys);
 const guard={...sys,userId:signed.id,tenantId:signed.tenantId,fullName:signed.fullName,account:signed.account,siteId:site.id,roleSnapshot:'一般勤務人員'};

 const shift=await createShiftTemplate(admin,{name:'日班',code:'DAY',startTime:'08:00',endTime:'16:00'});
 const own=await createSchedule(admin,{userId:person.id,siteId:site.id,workDate:'2026-09-09',shiftTemplateId:shift.id});
 const boss=await createSchedule(admin,{userId:boot.user.id,siteId:site.id,workDate:'2026-09-09',shiftTemplateId:shift.id});
 const other=await createSite(admin,{tenantId:boot.tenant.id,siteCode:'OTHER',name:'其他案場',address:'測試'});
 await assignUserToSite(admin,{tenantId:boot.tenant.id,userId:person.id,siteId:other.id,startsAt:null,expiresAt:null,isPermanent:true,targetName:person.fullName,siteName:other.name});
 await assert.rejects(()=>startWorkSession(guard,{siteId:site.id,scheduleId:boss.id}),/自己的|自己在/);
 await assert.rejects(()=>startWorkSession(guard,{siteId:other.id,scheduleId:own.id}),/目前案場/);
 await assert.rejects(()=>clockIn(guard,{siteId:other.id,scheduleId:own.id}),/案場不符/);
 const session=await startWorkSession(guard,{siteId:site.id,scheduleId:own.id});assert.equal(session.userId,person.id);await endWorkSession(guard);
 await cancelSchedule(admin,own.id,'測試取消');
 await assert.rejects(()=>startWorkSession(guard,{siteId:site.id,scheduleId:own.id}),/取消或完成/);
 await editSite(admin,site.id,{requireSiteQr:true});
 const qr=await issueSiteQr(admin,site.id);
 const wrongQr=await issueSiteQr(admin,other.id);
 setMockLocationResult({ok:false,code:'unavailable',message:'測試不提供GPS'});
 await assert.rejects(()=>clockIn(guard,{siteId:site.id}),/請掃描/);
 await assert.rejects(()=>clockIn(guard,{siteId:site.id,siteQrCode:'invalid'}),/QR/);
 await assert.rejects(()=>clockIn(guard,{siteId:site.id,siteQrCode:wrongQr.qrCode}),/目前案場/);
 const attendance=await clockIn(guard,{siteId:site.id,siteQrCode:qr.qrCode});assert.equal(attendance.clockInMethod,'qr');
 assert.ok((await listQrScanLogs(boot.tenant.id)).some(row=>row.scannerUserId===person.id&&row.qrAssetId===qr.id&&row.scanResult==='valid'));
 await assert.rejects(()=>clockOut(guard,{siteId:other.id,attendanceId:attendance.id}),/原出勤案場/);
 await assert.rejects(()=>requestAttendanceCorrection(admin,{siteId:site.id,attendanceId:attendance.id,requestType:'missing_out',reason:'測試'}),/自己/);
 await deactivateQrAssetByActor(admin,qr.id,'停用測試');resetQrScanCooldown();
 // Durable cooldown must not be bypassed by clearing only memory.
 await assert.rejects(()=>clockOut(guard,{siteId:site.id,siteQrCode:qr.qrCode}));
 const replacement=await issueSiteQr(admin,site.id,true);
 const ended=await clockOut(guard,{siteId:site.id,siteQrCode:replacement.qrCode});assert.equal(ended.clockOutMethod,'qr');
 const inactive=await issueSiteQr(admin,site.id,true);
 await deactivateQrAssetByActor(admin,inactive.id,'驗證停用');
 await assert.rejects(()=>clockIn(guard,{siteId:site.id,siteQrCode:inactive.qrCode}),/停用/);
 await editSite(admin,site.id,{requireGps:true,latitude:25.03,longitude:121.56,attendanceRadius:100});
 const deniedGpsQr=await issueSiteQr(admin,site.id,true);
 await assert.rejects(()=>clockIn(guard,{siteId:site.id,siteQrCode:deniedGpsQr.qrCode}),/不提供GPS/);
 // Keep presenting the same physical QR after GPS failure. Debounced frames
 // must not extend the cooldown indefinitely or require a newly issued QR.
 async function retrySameQr<T>(operation: () => Promise<T>): Promise<T> {
   for (let attempt=0; attempt<10; attempt++) {
     try { return await operation(); }
     catch (error) {
       if (!(error instanceof Error) || !error.message.includes('請稍候再掃描')) throw error;
       await new Promise(resolve=>setTimeout(resolve,500));
     }
   }
   throw new Error('Continuous camera scans starved the QR retry');
 }
 setMockLocationResult({ok:true,fix:{latitude:24,longitude:120}});
 await assert.rejects(()=>retrySameQr(()=>clockIn(guard,{siteId:site.id,siteQrCode:deniedGpsQr.qrCode})),/距離案場/);
 setMockLocationResult({ok:true,fix:{latitude:25.03,longitude:121.56}});
 const localMidnight=new Date(2026,8,10,0,30);
 const gpsAttendance=await retrySameQr(()=>clockIn(guard,{siteId:site.id,siteQrCode:deniedGpsQr.qrCode,at:localMidnight.toISOString()}));
 assert.equal(gpsAttendance.clockInMethod,'gps_qr');
 const snapshot=await getDashboardSnapshot(guard,{siteId:site.id,at:localMidnight});
 assert.equal(snapshot.primary?.attendance?.id,gpsAttendance.id,'local midnight must include attendance in the local day');
 const local=new Date(2026,8,9,8,0);assert.equal(formatTimeZh(local.toISOString()),'08:00');assert.match(formatDateTimeZh(local.toISOString()),/08:00$/);
 const midnight=new Date(2026,8,10,0,30);assert.match(formatDateTimeZh(midnight.toISOString()),/10日 00:30$/);
 assert.equal(formatTimeZh('invalid'),'—');
 await editSite(admin,site.id,{requireSiteQr:false,requireGps:false});
 await clockOut(guard,{siteId:site.id});
 const concurrent=await Promise.allSettled([clockIn(guard,{siteId:site.id}),clockIn(guard,{siteId:site.id})]);
 assert.equal(concurrent.filter(result=>result.status==='fulfilled').length,1,'double submit must create only one open attendance');
 assert.equal(concurrent.filter(result=>result.status==='rejected').length,1);
 await clockOut(guard,{siteId:site.id});
 await editSite(admin,site.id,{requireGps:true});
 setLocationProvider({async getCurrentPosition(){
   await setAccountStatus(admin,person.id,'suspended');
   return {ok:true,fix:{latitude:25.03,longitude:121.56}};
 }});
 await assert.rejects(()=>clockIn(guard,{siteId:site.id}),/停權/);
 assert.equal(await getOpenAttendance(boot.tenant.id,person.id,site.id),null,'suspension during GPS must not create attendance');
 await setAccountStatus(admin,person.id,'active');
 await editSite(admin,site.id,{requireGps:false});
 const forgedInput={siteId:site.id,at:'2020-01-01T00:00:00.000Z'};
 const began=Date.now();
 const realAttendance=await productionClockIn(guard,forgedInput);
 assert.ok(new Date(realAttendance.clockInAt!).getTime()>=began,'production clock ignores forged at field');
 const realEndAttendance=await productionClockOut(guard,forgedInput);
 assert.ok(new Date(realEndAttendance.clockOutAt!).getTime()>=began);
 const realSession=await productionStart(admin,{...forgedInput,unscheduled:true});
 assert.ok(new Date(realSession.startedAt).getTime()>=began);
 const realEndSession=await productionEnd(admin,{sessionId:realSession.id,...forgedInput});
 assert.ok(new Date(realEndSession.session.endedAt!).getTime()>=began);
 const oldEnvironment=process.env.NODE_ENV;
 process.env.NODE_ENV='production';
 await assert.rejects(()=>withOperationalClockForTest(forgedInput.at,async()=>undefined),/Node 測試環境/);
 process.env.NODE_ENV=oldEnvironment;
 db.close();console.log('Attendance regression passed: schedule owner/site/status, correction ownership, QR requirement/logs/deactivation, local time.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
