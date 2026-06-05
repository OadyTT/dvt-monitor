# Happy HIP DVT Monitor
### หมอนหลังผ่าตัดสะโพกอัจฉริยะ — Smart IoT Recovery Cushion System

[![Web App](https://img.shields.io/badge/Web%20App-v4.10.0-2dd4bf?style=flat-square)](https://happy-hip.vercel.app/)
[![Firmware](https://img.shields.io/badge/Firmware-v3.4-58a6ff?style=flat-square)](#firmware)
[![Hardware](https://img.shields.io/badge/Hardware-v3.6-56d364?style=flat-square)](#hardware)
[![GAS](https://img.shields.io/badge/GAS%20Backend-Code__v4-e3b341?style=flat-square)](#backend)
[![License](https://img.shields.io/badge/License-Prototype-636e7b?style=flat-square)](#)

---

## 📋 Project Overview

ระบบ IoT สำหรับติดตามผู้ป่วยหลังผ่าตัดสะโพก เพื่อป้องกันภาวะแทรกซ้อน 2 อย่างพร้อมกัน:

| เป้าหมายทางคลินิก | กลไก |
|------------------|------|
| ป้องกันข้อสะโพกหลุด | ติดตามมุมสะโพก real-time ด้วย MPU6050 + FSR |
| ป้องกัน DVT (ลิ่มเลือด) | นับ Ankle Pump exercise + แจ้งเตือน LINE OA |

**Live URL:** https://happy-hip.vercel.app/

---

## 🏗 System Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        HARDWARE LAYER                        │
│  Anker Zolo A110D (Power Bank)                               │
│    └─ USB-C → INA219 → ESP32S DevKit V1 + Expansion Board   │
│         ├─ TCA9548A I2C MUX                                  │
│         │    ├─ CH0: MPU6050 (Hip)                           │
│         │    ├─ CH1: MPU6050 (Ankle L)                       │
│         │    ├─ CH2: MPU6050 (Ankle R)                       │
│         │    └─ CH3: INA219 (Current Monitor)                │
│         ├─ RFP-611 FSR ×2 (Hip L/R)                         │
│         ├─ OLED 128×64 0.96" (Local Display)                 │
│         ├─ AH024 Motor ×2 + Buzzer MH-FMD                   │
│         └─ LED ×3 + Button (GPIO4)                           │
└───────────────────────────┬──────────────────────────────────┘
                            │ WiFi HTTP POST
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                    BACKEND LAYER (GAS)                       │
│  Google Apps Script Code_v4                                  │
│  ├─ POST  logData()       ← ESP32 sensor data               │
│  ├─ GET   getConfig()     ← Web app / Firmware config        │
│  ├─ GET   getData()       ← Dashboard real-time data         │
│  ├─ GET   getReport()     ← Report generator (NEW v4)        │
│  ├─ POST  saveUser()      ← LIFF registration                │
│  └─ LINE OA push alerts   → Staff phones                    │
└───────────────────────┬──────────┬───────────────────────────┘
                        │          │
               ┌────────┘          └────────┐
               ▼                            ▼
┌─────────────────────┐      ┌──────────────────────────────┐
│   LINE OA / LIFF    │      │      FRONTEND (Vercel)        │
│   @531ewyor         │      │  happy-hip.vercel.app         │
│   Push Alerts       │      │  ├─ Dashboard                 │
│   Staff Register    │      │  ├─ Admin Panel               │
└─────────────────────┘      │  ├─ Report (report_v1.html)  │
                             │  └─ Hardware Spec             │
                             └──────────────────────────────┘
```

---

## 📦 Version Registry

| Layer | Version | File | Status |
|-------|---------|------|--------|
| Web App | **v4.10.0** | `webapp_v4.10.html` | ✅ Live |
| Firmware | **v3.4** | `DVT_HipPillow_v3_4.ino` | ✅ Deployed |
| Hardware | **v3.6** | `schematic_v3_6.html` | ✅ Current |
| GAS Backend | **Code_v4** | `Code_v4.gs` | ✅ Deploy needed |
| Report | **v1.0** | `report_v1.html` | ✅ Ready |

---

## 🔧 Hardware v3.6 — Power Bank Edition

### Main Board
| Component | Role | Pin/Address |
|-----------|------|-------------|
| ESP32S DevKit V1 Type-C | MCU | — |
| Expansion Board | Power + Breakout | DC port 6.5-12V (unused) |
| TCA9548A | I2C Multiplexer | 0x70 · GPIO21/22 |
| MPU6050 Hip | IMU สะโพก | CH0 · 0x68 |
| MPU6050 Ankle L | IMU ข้อเท้าซ้าย | CH1 · 0x68 |
| MPU6050 Ankle R | IMU ข้อเท้าขวา | CH2 · 0x68 |
| INA219 | Current Monitor (USB 5V) | CH3 · 0x40 |
| OLED 128×64 0.96" | Local Display | 0x3C · GPIO21/22 direct |
| RFP-611 FSR ×2 | Hip Pressure L/R | GPIO34 / GPIO35 |
| AH024 Motor ×2 | Haptic Vibration | GPIO25 / GPIO26 |
| Buzzer MH-FMD | Audio Alert 4 levels | GPIO27 |
| LED ×3 | Status (G/Y/R) | GPIO2 / 13 / 15 |
| Button | WiFi Reconfigure | GPIO4 |

### Power System v3.6 (Power Bank Edition)
```
Anker Zolo A110D (10,000mAh · 22.5W · Trickle-Charging mode)
  └─ Built-in USB-C cable
       └─ INA219 VIN+ → VIN− (inline current sensing)
            └─ ESP32S USB-C port
                 ├─ 5V pin → AH024 Motor ×2 + Buzzer
                 └─ 3V3 pin → All Sensors + OLED
```

**การใช้งาน Power Bank:**
- ใช้งานปกติ: เสียบ USB-C ตรงได้เลย
- ถ้า PB auto-shutdown: กดปุ่ม 2 ครั้งเร็ว → Trickle-Charging mode (<0.5A)
- ชาร์จ PB: ออกจาก Trickle mode → เสียบชาร์จผ่าน USB-C port หรือ built-in cable

### Protection Components (คงเดิม)
| Component | Purpose |
|-----------|---------|
| R100Ω ×5 | GPIO series protection |
| Zener 3.3V ×2 | ADC overvoltage (GPIO34/35) |
| 1N5819 ×2 | Motor flyback diode |
| Cap 100nF ×3 | Decoupling |
| Cap 100µF ×2 | Bulk capacitor |

### History: ตัดออกจาก v3.4/v3.5
| Removed | เหตุผล |
|---------|--------|
| MT3608 Boost | ไม่ต้องการ — Power bank จัดการเอง |
| TP4056 AA477 | ไม่มี LiPo แล้ว |
| AO3401 P-MOSFET | ไม่มี TP4056 แล้ว |
| Zener 5.1V/1W | ไม่มี MT3608 แล้ว |
| DE053 MP1584EN | ใช้ 3V3 pin จาก ESP32 LDO แทน |
| LiPo ×2 + BMS 2S | แทนด้วย Power Bank |
| Polyfuse + Switch | Power Bank มี protection ในตัว |

---

## 💻 Firmware v3.4

### GPIO Map
| GPIO | ต่อกับ | Mode |
|------|--------|------|
| 21 | SDA (TCA + OLED) | I2C |
| 22 | SCL (TCA + OLED) | I2C |
| 34 | FSR Hip Left | ADC Input |
| 35 | FSR Hip Right | ADC Input |
| 4  | Button WiFiManager | INPUT_PULLUP |
| 2  | LED Green | OUTPUT |
| 13 | LED Yellow | OUTPUT |
| 15 | LED Red | OUTPUT |
| 25 | Motor Left (AH024) | PWM |
| 26 | Motor Right (AH024) | PWM |
| 27 | Buzzer MH-FMD | OUTPUT |

### Key Firmware Patterns
```cpp
// TCA9548A channel select
void tcaSelect(uint8_t ch) {
  Wire.beginTransmission(0x70);
  Wire.write(1 << ch);
  Wire.endTransmission();
}

// millis() underflow protection (after deep sleep)
if (millis() > lastTime && (millis() - lastTime) > INTERVAL) { ... }

// GAS HTTP (always follow 302 redirect)
http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);

// Safe deep sleep
Serial.flush();
delay(500);
esp_deep_sleep_start();

// INA219 — v3.6 Power Bank (วัด USB current แทน battery)
float usbVoltage = ina219.getBusVoltage_V();   // ~4.8-5.1V
float currentMA  = ina219.getCurrent_mA();      // กระแสรวมระบบ
bool  pbLow      = (usbVoltage < 4.7f);         // PB ใกล้หมด
```

### Pending: Firmware v3.5 / v3.6 Updates
- [ ] เพิ่ม OLED SSD1306 display (`Adafruit_SSD1306`)
- [ ] เปลี่ยน INA219 logic → วัด USB voltage + current
- [ ] ลบ `isCharging` / `battPct` 2S calculation ออก
- [ ] System rename: `"Happy HIP Monitor"` → `"Happy HIP DVT Monitor"`
- [ ] OLED แสดง: Hip angle, Pump count, USB voltage, WiFi status

---

## ☁️ Backend — GAS Code_v4

**Endpoint:**
```
https://script.google.com/macros/s/AKfycbzsuSDNOCQZr9ocP7xoFnTzkY_IUN-7nve7ewlj0Wm0LKOFs6ubhZ-xkQuzx1bAUqK3Bw/exec
```

### API Routes
| Method | Action | Description |
|--------|--------|-------------|
| GET | `?action=ping` | Health check |
| GET | `?action=getConfig&bedId=` | Config per bed |
| GET | `?action=getData&bedId=` | Latest sensor data |
| GET | `?action=getAllBeds` | List all beds |
| GET | `?action=getAlerts&bedId=` | Alert log |
| GET | `?action=getReport&bedId=&from=&to=` | **NEW v4** Report data |
| GET | `?action=getPending` | Pending users |
| GET | `?action=approve&uid=` | Approve user |
| POST | `action: logData` | ESP32 sensor POST |
| POST | `action: saveUser` | LIFF registration |
| POST | `action: saveConfig` | Update config |

### Sheets Structure
| Sheet | Columns หลัก |
|-------|-------------|
| `Data` | Timestamp, PatientID, BedID, HipAngle_L/R, PumpCount_L/R, FSR_L/R, BatteryVoltage, CurrentMA, AlertLevel |
| `Alerts` | Timestamp, BedID, AlertType, AlertLevel, Message, Value, Status |
| `Config` | Key, Value, UpdatedAt |
| `ApprovedUsers` | UserID, DisplayName, BedID, ApprovedAt |
| `PendingUsers` | UserID, DisplayName, BedID, Status, RegisteredAt |

### การ Deploy Code_v4
```
GAS Editor → Deploy → Manage Deployments
→ ✏️ Edit → Version: New Version → Deploy
⚠️ URL ไม่เปลี่ยน — Firmware ไม่ต้อง reflash
```

---

## 🌐 Web App v4.10.0

**Live:** https://happy-hip.vercel.app/

### หน้าหลัก
| หน้า | คำอธิบาย |
|------|---------|
| Dashboard | Real-time sensor + chart |
| Admin Panel | จัดการ bed, users, config |
| Calibration | ปรับ sensor threshold |
| Alert Log | ประวัติ alert |
| Report | `report_v1.html` — Print/PDF A4 3 หน้า |
| Hardware Spec | `schematic_v3_6.html` |

### Pending: Web App v4.11
- [ ] เปลี่ยน field mapping ใหม่จาก Code_v4 (`HipAngle_L/R`, `PumpCount_L/R`)
- [ ] `fetchGASData()` ใช้ `data.latest` แทน `data.rows[last]`
- [ ] แสดง Hip L/R แยกซ้าย-ขวา
- [ ] แสดง USB voltage แทน Battery %
- [ ] เพิ่มปุ่ม "📄 รายงาน" ใน nav
- [ ] System rename: "Happy HIP Monitor" → "Happy HIP DVT Monitor"

---

## 📄 Report System (report_v1.html)

รายงาน A4 3 หน้า พร้อม Print/PDF:
- **หน้า 1:** ข้อมูลผู้ป่วย · Summary Stats · Hip Position · DVT Compliance
- **หน้า 2:** Alert Log · 24h Timeline · FSR · Battery Chart
- **หน้า 3:** สรุปผล · Device Info · Clinical Notes · ลงนาม 3 ช่อง

**ใช้งาน:** เปิดไฟล์ → เลือก Bed/Patient/Date → กด 🖨 Print / Save PDF

---

## 🔑 Credentials & IDs

| Item | Value |
|------|-------|
| LINE OA | @531ewyor |
| LIFF ID | `2010082083-BF6wSZyp` |
| GAS URL | (see Backend section) |
| Web App | https://happy-hip.vercel.app/ |

> ⚠️ LINE Channel Access Token เก็บใน project เท่านั้น ไม่แสดงใน README

---

## 📁 File Structure

```
project-root/
├── firmware/
│   └── DVT_HipPillow_v3_4.ino       # Active firmware (v3.5/v3.6 pending)
│
├── backend/
│   ├── Code_v3.gs                    # Previous
│   └── Code_v4.gs                   # Current — deploy needed
│
├── frontend/
│   ├── webapp_v4.10.html            # Active web app
│   ├── index.html                   # Vercel entrypoint
│   ├── liff.html                    # Staff LIFF registration
│   └── report_v1.html               # Report generator (Print/PDF)
│
├── hardware/
│   ├── schematic_v3_5.html          # Previous
│   ├── schematic_v3_6.html          # Current — Power Bank Edition
│   └── DVT_HipPillow_v3_4.fzz      # Fritzing (pending v3.6 update)
│
└── docs/
    ├── README.md                    # This file
    └── HappyHIP_DVT_MasterSummary.md
```

---

## 🗺 Roadmap

### ✅ Done
- Hardware v3.6: Power Bank Edition + OLED
- GAS Code_v4: เพิ่ม `getReport` endpoint
- Report v1.0: Print/PDF A4 3 หน้า
- Schematic v3.6: Interactive HTML

### 🔜 Next Sprint
- [ ] **Firmware v3.5/v3.6** — OLED + INA219 USB mode + rename
- [ ] **Web App v4.11** — field mapping + USB voltage + rename
- [ ] **Code_v4 Deploy** — deploy new version ใน GAS
- [ ] **Schematic v3.6 Fritzing** — อัปเดต .fzz

### 🔮 Future
- [ ] PIN hashing (SHA-256)
- [ ] Multi-bed dashboard
- [ ] Alert log persistence → GAS
- [ ] MAC-based Device ID
- [ ] OTA Firmware update

---

## 🧠 Key Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Power Source | Anker Zolo A110D Power Bank | ง่าย, ปลอดภัย, ชาร์จพร้อมใช้ได้ |
| 3.3V Source | ESP32 Internal LDO (3V3 pin) | ไม่ต้องการ DE053 แยก |
| I2C MUX | TCA9548A | MPU6050 มีแค่ 2 addr (0x68/0x69) |
| Local Display | OLED 128×64 I2C | แสดงสถานะ ณ จุดเตียง |
| Current Monitor | INA219 inline USB | ใช้ hardware เดิม เปลี่ยน role |
| Backend | GAS + Google Sheets | Free, เพียงพอสำหรับ prototype |
| Alerts | LINE OA push | Staff ใช้ LINE อยู่แล้ว |
| Auth | PIN-based roles | Simple, stateless |

---

## ⚠️ Known Constraints

- GAS free tier: ~288 req/day/bed (throttle 5 min)
- GAS HTTP 302 redirect → `HTTPC_STRICT_FOLLOW_REDIRECTS`
- `millis()` reset หลัง deep sleep → unsigned underflow check
- Separate MPU objects ต่อ ankle → ป้องกัน calibration overwrite
- Power Bank Trickle mode: output <0.5A (กดปุ่ม 2 ครั้ง)
- OLED I2C 0x3C ต่อตรง GPIO21/22 ไม่ผ่าน TCA

---

*Happy HIP DVT Monitor · Prototype Phase · Last updated: 2026-05-26*
