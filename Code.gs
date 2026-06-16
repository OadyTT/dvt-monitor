// ============================================================
//  Happy HIP DVT — Google Apps Script Backend v3.1
//  Updated: รองรับ Web App Config Sync (adminPin, lineToken,
//           doctorId, nurseId, lineAlertOn, battAlertOn)
//           + pushConfig action (2-way sync)
// ============================================================

// ── Fallback constants (ใช้เมื่อยังไม่มีใน Config Sheet) ──────
const LINE_TOKEN_FALLBACK   = "PkfmS9jmReYjcP8992T/aeQYCth5RpwWnyyicLuVhrEQr39gpuVBED0zztB/6R3G/d8JvMWYKCIx1zGtErDF8JwT0dTOnQGrfDn8LIWamV1tDdH1da/OdLLXp52+Bifh9ws5nLzOo1OfuFMQdqOSaQdB04t89/1O/w1cDnyilFU=";

const SHEET_NAME_DATA    = "Data";
const SHEET_NAME_ALERTS  = "Alerts";
const SHEET_NAME_USERS   = "ApprovedUsers";
const SHEET_NAME_PENDING = "PendingUsers";
const SHEET_NAME_CONFIG  = "Config";

// ============================================================
//  ROUTER — POST
// ============================================================
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);

    // LINE Webhook (มี events array)
    if (body.events) return handleLineWebhook(body);

    const action = body.action || "";
    if (action === "logData")     return logData(body);
    if (action === "lineAlert")   return sendLineAlert(body);
    if (action === "saveConfig")  return saveConfig(body);   // from saveThresh() — thresholds only
    if (action === "pushConfig")  return pushConfig(body);   // from pushConfigToGAS() — full config
    if (action === "approveUser") return approveUser(body);  // from Admin Web App

    return ok({ status: "ok", message: "unknown action: " + action });

  } catch(err) {
    return errResp(err.toString());
  }
}

// ============================================================
//  ROUTER — GET
// ============================================================
function doGet(e) {
  const action = (e.parameter && e.parameter.action) || "";
  if (action === "getData")        return getLatestData();
  if (action === "getConfig")      return getConfig();
  if (action === "getPending")     return getPendingUsers();
  if (action === "getRecipients")  return getRecipientList();
  if (action === "saveUser")       return saveUser(e.parameter);  // LIFF ส่งผ่าน GET
  if (action === "getReport")      return getReport(e.parameter);

  return ok({ status: "ok", app: "Happy HIP DVT v3.1" });
}

// ============================================================
//  HELPER — ดึง LINE Token (Config Sheet > fallback constant)
// ============================================================
function getLineToken() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sh = ss.getSheetByName(SHEET_NAME_CONFIG);
    if (sh && sh.getLastRow() > 1) {
      const rows = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
      for (const r of rows) {
        if (String(r[0]).trim() === "lineToken" && r[1]) return String(r[1]).trim();
      }
    }
  } catch(e) { /* fall through */ }
  return LINE_TOKEN_FALLBACK;
}

// ============================================================
//  LOG DATA — บันทึกข้อมูล Sensor ลง Sheet
// ============================================================
function logData(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = getOrCreateSheet(ss, SHEET_NAME_DATA);

  if (sh.getLastRow() === 0) {
    sh.appendRow([
      "Timestamp",
      "HipAngleX", "HipAngleY",
      "AnkLAngleX", "AnkRAngleX",
      "FSR_L", "FSR_R",
      "PumpCountL", "PumpCountR", "PumpTotal",
      "BattVolt", "BattPct", "Charging",
      "Alert", "AlertLevel", "Boot", "BedID", "WebApp"
    ]);
  }

  const now = new Date();
  sh.appendRow([
    Utilities.formatDate(now, "Asia/Bangkok", "M/d/yyyy HH:mm:ss"),
    data.hipAngleX  || 0,
    data.hipAngleY  || 0,
    data.ankLAngleX || 0,
    data.ankRAngleX || 0,
    data.fsrL   || data.fsrHip   || 0,
    data.fsrR   || data.fsrAnkle || 0,
    data.pumpCountL || 0,
    data.pumpCountR || 0,
    data.pumpTotal  || 0,
    data.battVolt   || 0,
    data.battPct    || 0,
    data.charging   || false,
    data.alert      || false,
    data.alertLevel || 0,
    data.boot       || 0,
    data.bedId      || "B01",
    data.webApp     || "https://happy-hip.vercel.app/",
  ]);

  if (data.alert) logAlert(data);
  return ok({ status: "ok", message: "logged" });
}

// ============================================================
//  LOG ALERT — บันทึก Alert แยก Sheet
// ============================================================
function logAlert(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = getOrCreateSheet(ss, SHEET_NAME_ALERTS);

  if (sh.getLastRow() === 0) {
    sh.appendRow(["Timestamp","BedID","AlertLevel","HipX","HipY","FSR_L","FSR_R","BattPct"]);
  }

  const now = new Date();
  sh.appendRow([
    Utilities.formatDate(now, "Asia/Bangkok", "M/d/yyyy HH:mm:ss"),
    data.bedId      || "B01",
    data.alertLevel || 1,
    data.hipAngleX  || 0,
    data.hipAngleY  || 0,
    data.fsrL       || 0,
    data.fsrR       || 0,
    data.battPct    || 0,
  ]);
}

// ============================================================
//  GET LATEST DATA — ส่งข้อมูล Sensor ล่าสุดให้ Web App
// ============================================================
function getLatestData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_NAME_DATA);
  if (!sh || sh.getLastRow() < 2) {
    return ok({ error: "no data", status: "ok" });
  }

  const last = sh.getRange(sh.getLastRow(), 1, 1, sh.getLastColumn()).getValues()[0];

  // Column order ตาม logData():
  // 0=Timestamp 1=HipX 2=HipY 3=AnkL 4=AnkR 5=FSR_L 6=FSR_R
  // 7=PumpL 8=PumpR 9=PumpTotal 10=BattVolt 11=BattPct 12=Charging
  // 13=Alert 14=AlertLevel 15=Boot 16=BedID 17=WebApp
  return ok({
    status:     "ok",
    timestamp:  last[0] ? last[0].toString() : "",
    hipAngleX:  parseFloat(last[1])  || 0,
    hipAngleY:  parseFloat(last[2])  || 0,
    ankLAngleX: parseFloat(last[3])  || 0,
    ankRAngleX: parseFloat(last[4])  || 0,
    fsrL:       parseInt(last[5])    || 0,
    fsrR:       parseInt(last[6])    || 0,
    fsrHip:     parseInt(last[5])    || 0,   // compat alias
    fsrAnkle:   parseInt(last[6])    || 0,   // compat alias
    pumpCountL: parseInt(last[7])    || 0,
    pumpCountR: parseInt(last[8])    || 0,
    pumpTotal:  parseInt(last[9])    || 0,
    battVolt:   parseFloat(last[10]) || 0,
    battPct:    parseFloat(last[11]) || 0,
    charging:   last[12] === true || last[12] === "TRUE" || last[12] === 1,
    alert:      last[13] === true || last[13] === "TRUE" || last[13] === 1,
    alertLevel: parseInt(last[14])   || 0,
    boot:       parseInt(last[15])   || 0,
    bedId:      last[16] || "B01",
    webApp:     last[17] || "https://happy-hip.vercel.app/",
  });
}

// ============================================================
//  CONFIG — ดึงค่า Config ทั้งหมด (GET /getConfig)
// ============================================================
// คืน plain object (ไม่ใช่ HTTP response) ใช้ภายใน GAS
function getConfigMap() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_NAME_CONFIG);
  const defaults = { lineAlertOn: "true", battAlertOn: "true" };
  if (!sh || sh.getLastRow() < 2) return defaults;
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
  const cfg  = { ...defaults };
  rows.forEach(r => {
    const k = String(r[0]).trim();
    if (k && r[1] !== "" && r[1] !== null) cfg[k] = String(r[1]);
  });
  return cfg;
}

function getConfig() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_NAME_CONFIG);

  // ค่า default ครบทุก key ที่ Web App ใช้
  const defaults = {
    adminPin:     "1234",
    angleThresh:  30,
    fsrThresh:    500,
    battLow:      15,
    pwmMotor:     200,
    pumpGoal:     100,
    pumpUpThresh: 20,
    bedId:        "B01",
    lineToken:    "",
    doctorId:     "",
    nurseId:      "",
    lineAlertOn:  "true",
    battAlertOn:  "true",
    webApp:       "https://happy-hip.vercel.app/",
    status:       "ok",
  };

  if (!sh || sh.getLastRow() < 2) return ok(defaults);

  // Keys ที่ต้องเก็บเป็น string (ไม่แปลงเป็น number)
  const STRING_KEYS = new Set([
    "adminPin","bedId","lineToken","doctorId","nurseId",
    "lineAlertOn","battAlertOn","webApp","updatedAt"
  ]);

  const rows   = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
  const config = { ...defaults };
  rows.forEach(r => {
    const key = String(r[0]).trim();
    const val = r[1];
    if (!key || val === "" || val === null) return;
    config[key] = STRING_KEYS.has(key) ? String(val) : (isNaN(val) ? val : Number(val));
  });
  config.status = "ok";

  return ok(config);
}

// ============================================================
//  SAVE CONFIG — อัปเดต Threshold จาก saveThresh() / ESP32
//  (รับเฉพาะ threshold fields — ใช้ pushConfig สำหรับ full sync)
// ============================================================
function saveConfig(data) {
  const fields = [
    "angleThresh","fsrThresh","battLow","pwmMotor",
    "pumpGoal","pumpUpThresh","bedId",
  ];
  const cfg = {};
  fields.forEach(k => { if (data[k] !== undefined) cfg[k] = data[k]; });
  if (Object.keys(cfg).length === 0) return ok({ status: "ok", message: "nothing to save" });
  return pushConfig({ config: cfg });
}

// ============================================================
//  PUSH CONFIG — sync ทุก key จาก Web App Admin Page
//  รับ { action:"pushConfig", config:{ key:value, ... } }
// ============================================================
function pushConfig(body) {
  const cfg = body.config;
  if (!cfg || typeof cfg !== "object") return errResp("No config object");

  const ss  = SpreadsheetApp.getActiveSpreadsheet();
  const sh  = getOrCreateSheet(ss, SHEET_NAME_CONFIG);
  const now = Utilities.formatDate(new Date(), "Asia/Bangkok", "M/d/yyyy HH:mm:ss");

  // สร้าง header ถ้ายังไม่มี
  if (sh.getLastRow() === 0) sh.appendRow(["Key", "Value", "UpdatedAt"]);

  // Build key → rowIndex map
  const rowMap = {};
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues()
      .forEach((r, i) => { if (r[0]) rowMap[String(r[0]).trim()] = i + 2; });
  }

  const saved = [];
  Object.entries(cfg).forEach(([key, val]) => {
    if (!key || val === undefined) return;
    if (rowMap[key]) {
      // อัปเดต row เดิม
      sh.getRange(rowMap[key], 2, 1, 2).setValues([[val, now]]);
    } else {
      // เพิ่ม row ใหม่
      sh.appendRow([key, val, now]);
      rowMap[key] = sh.getLastRow();
    }
    saved.push(key);
  });

  Logger.log("pushConfig saved: " + saved.join(", "));
  return ok({ status: "ok", saved: saved.length + " keys", keys: saved });
}

// ============================================================
//  SEND LINE ALERT — ส่งข้อความ LINE OA
// ============================================================
function sendLineAlert(body) {
  // ตรวจสอบ lineAlertOn จาก Config Sheet ก่อนส่ง
  const cfg = getConfigMap();
  const lineOn = (cfg["lineAlertOn"] || "true").toString().toLowerCase();
  if (lineOn === "false") {
    Logger.log("sendLineAlert: skipped — lineAlertOn=false");
    return ok({ status: "ok", sent: 0, skipped: true, reason: "lineAlertOn=false" });
  }

  const msg   = body.message || "Alert from Happy HIP";
  const token = getLineToken();

  if (!token) return errResp("LINE Token ยังไม่ได้ตั้งค่า (ใส่ใน Config Sheet หรือ Admin Page)");

  const users = getApprovedUsers();
  if (users.length === 0) return errResp("ไม่มี Approved Users");

  let sent = 0;
  users.forEach(uid => { if (uid) { pushLineMessage(token, uid, msg); sent++; } });
  return ok({ status: "ok", sent });
}

// ============================================================
//  LINE — Push Message
// ============================================================
function pushLineMessage(token, userId, text) {
  try {
    const res = UrlFetchApp.fetch("https://api.line.me/v2/bot/message/push", {
      method: "post",
      headers: {
        "Authorization": "Bearer " + token,
        "Content-Type":  "application/json",
      },
      payload: JSON.stringify({ to: userId, messages: [{ type: "text", text: text }] }),
      muteHttpExceptions: true,
    });
    Logger.log("LINE push " + userId + " → " + res.getResponseCode());
    return res.getResponseCode();
  } catch(err) {
    Logger.log("LINE push error: " + err);
    return -1;
  }
}

// ============================================================
//  LINE — Reply Message
// ============================================================
function replyLineMessage(replyToken, text) {
  try {
    UrlFetchApp.fetch("https://api.line.me/v2/bot/message/reply", {
      method: "post",
      headers: {
        "Authorization": "Bearer " + getLineToken(),
        "Content-Type":  "application/json",
      },
      payload: JSON.stringify({ replyToken, messages: [{ type: "text", text }] }),
      muteHttpExceptions: true,
    });
  } catch(err) {
    Logger.log("LINE reply error: " + err);
  }
}

// ============================================================
//  LINE WEBHOOK — ผู้ใช้ส่งข้อความ / เพิ่มเพื่อน
// ============================================================
function handleLineWebhook(body) {
  const events = body.events || [];
  events.forEach(ev => {
    const uid = ev.source && ev.source.userId;
    if (!uid) return;
    if (ev.type === "follow") {
      autoRegisterUser(uid, ev.replyToken, "follow");
    } else if (ev.type === "message") {
      const text = (ev.message && ev.message.text) || "";
      autoRegisterUser(uid, ev.replyToken, text);
    }
  });
  return ok({ status: "ok" });
}

function autoRegisterUser(uid, replyToken, text) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // ── เช็ค ApprovedUsers ──
  const appSh   = getOrCreateSheet(ss, SHEET_NAME_USERS);
  const approved = appSh.getLastRow() > 1
    ? appSh.getRange(2, 1, appSh.getLastRow() - 1, 1).getValues().flat() : [];
  if (approved.includes(uid)) {
    replyLineMessage(replyToken,
      "✅ คุณได้รับการอนุมัติแล้ว!\nระบบจะแจ้งเตือนเมื่อตรวจพบความผิดปกติ\n\nUser ID ของคุณ:\n" + uid);
    return;
  }

  // ── เช็ค PendingUsers ──
  const pendSh = getOrCreateSheet(ss, SHEET_NAME_PENDING);
  if (pendSh.getLastRow() === 0)
    pendSh.appendRow(["UserID","DisplayName","PictureUrl","RequestedAt","Status"]);
  const pending = pendSh.getLastRow() > 1
    ? pendSh.getRange(2, 1, pendSh.getLastRow() - 1, 1).getValues().flat() : [];
  if (pending.includes(uid)) {
    replyLineMessage(replyToken,
      "⏳ คำขอของคุณรอการอนุมัติอยู่\nAdmin จะแจ้งกลับทาง LINE\n\nUser ID ของคุณ:\n" + uid);
    return;
  }

  // ── ลงทะเบียนใหม่ ──
  const keyword  = (text || "").trim().toLowerCase();
  const triggers = ["ลงทะเบียน","สมัคร","register","hello","สวัสดี","hi","เพิ่ม","แจ้งเตือน"];
  const isFollow = text === "follow";
  const hasKw    = triggers.some(w => keyword.includes(w));

  if (isFollow || hasKw) {
    const now = Utilities.formatDate(new Date(), "Asia/Bangkok", "M/d/yyyy HH:mm:ss");
    pendSh.appendRow([uid, "", "", now, "Pending"]);
    Logger.log("New pending: " + uid);
    replyLineMessage(replyToken,
      "📋 ส่งคำขอลงทะเบียนสำเร็จ!\nรอ Admin อนุมัติ จะแจ้งกลับทาง LINE\n\nUser ID ของคุณ:\n" + uid);
  } else {
    replyLineMessage(replyToken,
      "👋 สวัสดีจาก Happy HIP DVT\n\nพิมพ์ว่า 'ลงทะเบียน' เพื่อขอรับแจ้งเตือน\n\nหรือเปิดลิงก์:\nhttps://happy-hip.vercel.app/liff.html");
  }
}

// ============================================================
//  APPROVED USERS
// ============================================================
function getApprovedUsers() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_NAME_USERS);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues()
    .map(r => r[0])
    .filter(uid => uid && String(uid).startsWith("U"));
}

function getRecipientList() {
  return ok(getApprovedUsers());
}

// ============================================================
//  SAVE USER — รับ LINE User ID จาก liff.html → PendingUsers
// ============================================================
function saveUser(data) {
  const uid  = data.userId      || "";
  const name = data.displayName || "";
  const pic  = data.pictureUrl  || "";

  if (!uid || !uid.startsWith("U")) return errResp("Invalid userId: " + uid);

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // เช็ค ApprovedUsers ก่อน
  const appSh = getOrCreateSheet(ss, SHEET_NAME_USERS);
  if (appSh.getLastRow() > 1) {
    const approved = appSh.getRange(2, 1, appSh.getLastRow() - 1, 1).getValues().flat();
    if (approved.includes(uid)) {
      return ok({ status: "approved", message: "คุณได้รับการอนุมัติแล้ว พร้อมรับแจ้งเตือน!", userId: uid, displayName: name });
    }
  }

  // เช็ค PendingUsers
  const pendSh = getOrCreateSheet(ss, SHEET_NAME_PENDING);
  if (pendSh.getLastRow() === 0)
    pendSh.appendRow(["UserID","DisplayName","PictureUrl","RequestedAt","Status"]);
  if (pendSh.getLastRow() > 1) {
    const pending = pendSh.getRange(2, 1, pendSh.getLastRow() - 1, 1).getValues().flat();
    if (pending.includes(uid)) {
      return ok({ status: "pending", message: "รอการอนุมัติจาก Admin", userId: uid, displayName: name });
    }
  }

  // บันทึกใหม่
  const now = Utilities.formatDate(new Date(), "Asia/Bangkok", "M/d/yyyy HH:mm:ss");
  pendSh.appendRow([uid, name, pic, now, "Pending"]);
  Logger.log("New pending user: " + uid + " (" + name + ")");
  return ok({ status: "pending", message: "ส่งคำขอสำเร็จ รอ Admin อนุมัติ", userId: uid, displayName: name, requestedAt: now });
}

// ============================================================
//  APPROVE USER — Admin อนุมัติจาก Web App
// ============================================================
function approveUser(body) {
  const uid = (body && body.userId) || "";
  if (!uid) return errResp("No userId");

  const ss     = SpreadsheetApp.getActiveSpreadsheet();
  const pendSh = getOrCreateSheet(ss, SHEET_NAME_PENDING);
  const appSh  = getOrCreateSheet(ss, SHEET_NAME_USERS);

  if (pendSh.getLastRow() < 2) return errResp("User not found: " + uid);

  const rows = pendSh.getRange(2, 1, pendSh.getLastRow() - 1, 5).getValues();
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] !== uid) continue;

    const name = rows[i][1];
    const pic  = rows[i][2];
    const now  = Utilities.formatDate(new Date(), "Asia/Bangkok", "M/d/yyyy HH:mm:ss");

    // เพิ่มใน ApprovedUsers
    if (appSh.getLastRow() === 0)
      appSh.appendRow(["UserID","DisplayName","PictureUrl","ApprovedAt","Source"]);
    appSh.appendRow([uid, name, pic, now, "Admin-Approved"]);

    // อัปเดตสถานะใน PendingUsers
    pendSh.getRange(i + 2, 5).setValue("Approved");

    // แจ้ง User ทาง LINE
    const token = getLineToken();
    if (token) {
      pushLineMessage(token, uid,
        "✅ คำขอของคุณได้รับการอนุมัติแล้ว!\nคุณจะได้รับแจ้งเตือนจากระบบ Happy HIP DVT เมื่อตรวจพบความผิดปกติโดยอัตโนมัติ");
    }

    Logger.log("Approved: " + uid + " (" + name + ")");
    return ok({ status: "ok", message: "อนุมัติสำเร็จ", userId: uid });
  }

  return errResp("User not found in PendingUsers: " + uid);
}

// ============================================================
//  GET PENDING USERS
// ============================================================
function getPendingUsers() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_NAME_PENDING);
  if (!sh || sh.getLastRow() < 2) return ok([]);

  const result = sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues()
    .filter(r => r[0] && r[4] !== "Approved")
    .map(r => ({
      userId:      r[0],
      displayName: r[1],
      pictureUrl:  r[2],
      requestedAt: r[3] ? r[3].toString() : "",
      status:      r[4],
    }));
  return ok(result);
}

// ============================================================
//  UTILS
// ============================================================
function getOrCreateSheet(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function ok(data) {
  const body = typeof data === "string" ? data : JSON.stringify(data);
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}

function errResp(msg) {
  return ContentService
    .createTextOutput(JSON.stringify({ error: msg, status: "error" }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
//  GET REPORT — สรุปข้อมูลรายวัน (pump count + alerts + battery)
// ============================================================
function getReport(params) {
  const days = Math.min(parseInt((params && params.days) || 7), 90);
  const ss   = SpreadsheetApp.getActiveSpreadsheet();
  const sh   = ss.getSheetByName(SHEET_NAME_DATA);
  if (!sh || sh.getLastRow() < 2) return ok({ rows: [], status: "ok" });

  const numCols = Math.min(sh.getLastColumn(), 18);
  const data    = sh.getRange(2, 1, sh.getLastRow() - 1, numCols).getValues();

  // Column index: 0=Timestamp 7=PumpL 8=PumpR 9=PumpTotal 11=BattPct 13=Alert
  const byDate = {};
  data.forEach(row => {
    if (!row[0]) return;
    let d;
    try { d = new Date(row[0]); } catch(e) { return; }
    if (isNaN(d.getTime())) return;

    const key = Utilities.formatDate(d, "Asia/Bangkok", "yyyy-MM-dd");
    if (!byDate[key]) byDate[key] = { date: key, pumpL: 0, pumpR: 0, pumpTotal: 0, alerts: 0, battSum: 0, battN: 0 };
    const e = byDate[key];

    // ใช้ MAX ของวัน เพราะ pump count สะสม (ค่าสุดท้ายของวัน = ยอดรวม)
    e.pumpL     = Math.max(e.pumpL,     parseInt(row[7])  || 0);
    e.pumpR     = Math.max(e.pumpR,     parseInt(row[8])  || 0);
    e.pumpTotal = Math.max(e.pumpTotal, parseInt(row[9])  || 0);
    if (row[13] === true || row[13] === "TRUE" || row[13] === 1) e.alerts++;
    const batt = parseFloat(row[11]);
    if (batt > 0) { e.battSum += batt; e.battN++; }
  });

  const rows = Object.values(byDate)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, days)
    .map(e => ({
      date:      e.date,
      pumpL:     e.pumpL,
      pumpR:     e.pumpR,
      pumpTotal: e.pumpTotal,
      alerts:    e.alerts,
      battAvg:   e.battN > 0 ? Math.round(e.battSum / e.battN) : 0,
    }));

  return ok({ rows, status: "ok" });
}

// ============================================================
//  SETUP — รัน 1 ครั้งเพื่อสร้าง Sheets ทั้งหมด
// ============================================================
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  [SHEET_NAME_DATA, SHEET_NAME_ALERTS, SHEET_NAME_USERS, SHEET_NAME_PENDING, SHEET_NAME_CONFIG]
    .forEach(name => getOrCreateSheet(ss, name));
  Logger.log("✅ All sheets ready");
}

// ============================================================
//  TEST — รัน Manual ใน GAS Editor
// ============================================================
function testLINE() {
  const token = getLineToken();
  Logger.log("Using token: " + (token ? token.substring(0,20) + "..." : "NONE"));
  const result = pushLineMessage(token, "Ub41fc0cdada0f290836a5b8258baccd1", "✅ Happy HIP DVT Test v3.1");
  Logger.log("Result: " + result);
}

function testGetConfig() {
  const result = getConfig();
  Logger.log(result.getContent());
}

function testGetLatestData() {
  const result = getLatestData();
  Logger.log(result.getContent());
}
