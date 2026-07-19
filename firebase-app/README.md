# NextGen Play — Firebase app

Vite + React frontend สำหรับย้ายระบบเดิมจาก Google Apps Script/Sheets ไปยัง Firebase Hosting และ Cloud Firestore โดยไม่ใช้ Cloud Functions

## เริ่มใช้งาน

1. เปิด Firebase Console ของโปรเจกต์ `nextgen-play-19dd2`
2. สร้าง Cloud Firestore database
3. เปิด Authentication > Sign-in method > Anonymous และ Email/Password
4. สร้างผู้ใช้ Email/Password ชื่อ `admin@nextgen-play.local` ด้วยรหัสผ่านที่คาดเดายากสำหรับ Admin Panel
5. จากโฟลเดอร์ `firebase-app` รัน `npm install` และ `npm run dev`
6. เมื่อพร้อม deploy ให้รัน `npm run build` แล้วรัน `firebase deploy --only hosting,firestore:rules` จาก root ของ repository

ก่อน deploy Rules ให้ติดตั้ง Java 21 ขึ้นไปและรัน `npm run test:rules` จาก root เพื่อทดสอบ Rules ผ่าน Firestore emulator จริง

## ย้ายข้อมูลจาก Google Sheets

1. เพิ่ม `legacy-gas/ExportForFirestore.js` เข้า Apps Script เดิม แล้วรัน `exportSheetsForFirestore()` หนึ่งครั้ง
2. ดาวน์โหลดไฟล์ JSON ที่สคริปต์สร้างใน Google Drive
3. สร้าง service-account key สำหรับงาน migration ในเครื่อง และตั้ง environment variable `GOOGLE_APPLICATION_CREDENTIALS` เป็น path ของไฟล์ key (ห้าม commit key)
4. ตรวจจำนวนเอกสารแบบไม่เขียนข้อมูลด้วย `npm run migrate -- path/to/sheet-export.json`
5. เมื่อจำนวนถูกต้องจึงเขียนจริงด้วย `npm run migrate -- path/to/sheet-export.json --commit`

Importer ใช้ Admin SDK เฉพาะบนเครื่องผู้ดูแล ไม่ถูก bundle ไปหน้าเว็บและไม่ใช่ Cloud Functions

Importer รองรับชีตหลักจากระบบเดิม: `Users`, `Lessons`, `Questions`, `Progress`, `Settings`, `News`, `PVP_Matches`, `WorldBoss_Config`, `WorldBoss_Scores` และ `CyberSafety_Scenarios` โดยแปลงชื่อ field เป็น camelCase ให้ตรงกับ React/Firestore service เช่น `LessonID` → `lessonId`, `QuestionText` → `questionText`, `Player1ID` → `p1Id`, `Player1Score` → `p1Hp` และตัด `AdminPIN`/`GeminiAPIKey` ออกจาก `settings/public`

The Admin Panel is now a React component backed by a separate Firebase Admin Auth session and direct Firestore CRUD. Legacy Admin markup, dialogs, and browser script are excluded from the Vite bundle.

Current implementation note: React now owns the visible app surfaces for landing/login, lobby, dashboard shell/HUD/navigation, dashboard home, map, profile, leaderboard, certificate, lesson, pretest, boss battle, worksheet, cyber safety, PVP, AI tutor, shop/inventory/gacha, World Boss lobby/leaderboard, login bonus overlay, lesson preview overlay, and Admin Panel. The remaining legacy script in the production bundle is a compatibility bridge for global navigation/state helpers and preserved styling/background behavior; it does not call GAS, `doGet`, `doPost`, Google Sheets, or Cloud Functions.

## Collections

- `users`: โปรไฟล์นักเรียนแบบเต็ม (มี `ownerUid`, เหรียญ, ไอเทม, และ `gender` ที่เลือกครั้งเดียวตอนสมัครสมาชิก — rules ห้ามแก้ภายหลัง) — **อ่านได้เฉพาะเจ้าของ session และ admin เท่านั้น**
- `directory`: โปรไฟล์สาธารณะแบบย่อ (`name`, `class`, `avatar`, `xp`, `level`, `rank`) ใช้กับหน้าเลือกชื่อตอนล็อกอินและ Leaderboard — ห้าม mirror เหรียญ/ไอเทม/ownerUid ลงที่นี่
- `lessons`, `questions`: บทเรียนและแบบทดสอบ
- `progress`: เอกสาร ID รูปแบบ `{userId}_{lessonId}`
- `settings/public`: ค่าระบบที่ผู้เล่นอ่านได้ เช่น `TimerPerQuestion`, `Classes`, `Rooms`
- `news`, `cyberSafetyScenarios`: ข่าวและสถานการณ์ความปลอดภัยไซเบอร์
- `pvpMatches`, `worldBossScores`, `dailyQuests`: ข้อมูลฟีเจอร์เกมที่ทยอยย้าย (ด่านมินิเกม AI Camera เป็นค่าคงที่ในโค้ดที่ `src/services/worldBossCatalog.ts` — collection `worldBossConfig` ถูกยกเลิกแล้ว)
- `pvpRooms`: ห้อง PVP โฉมใหม่ (ดวล 1v1 และทีม 2v2/3v3/4v4, ห้องสาธารณะ/ส่วนตัว `PRIVATE_<CODE>`) พร้อม subcollection `chat` และ `presence` (ตำแหน่งตัวละครใน lobby) — เฉพาะสมาชิกห้อง (ตรวจจาก `memberUids`) เท่านั้นที่แก้สถานะแมตช์ได้
- `pvpRankings`: อันดับ PVP หนึ่งเอกสารต่อนักเรียน (เขียนได้เฉพาะเจ้าของ, จำกัด delta ต่อแมตช์: ชนะ/แพ้ +1, rating เพิ่มได้ไม่เกิน 25 ต่อครั้ง)
- `clientErrors`: รายงาน error จากเบราว์เซอร์นักเรียน (เขียนโดยผู้เล่นแบบจำกัดขนาด อ่านได้เฉพาะ admin)

### สคริปต์ดูแลข้อมูล

- `npm run backup` — สำรองทุก collection เป็นไฟล์ JSON ใน `backups/` (ต้องตั้ง `GOOGLE_APPLICATION_CREDENTIALS`) ควรรันก่อนใช้ปุ่มรีเซ็ตทั้งหมดหรือ migration ทุกครั้ง
- `npm run backfill:directory` — สร้าง/ซ่อมเอกสาร `directory` จาก `users` (dry run โดยปริยาย, เพิ่ม `--commit` เพื่อเขียนจริง) ต้องรันก่อน deploy rules ที่ล็อกการอ่าน `users` เสมอ

ชื่อ field ใช้ camelCase เช่น `lessonId`, `questionText`, `isActive` และเก็บชนิดข้อมูลให้ตรงจริง (number/boolean/array/object) ไม่เก็บ JSON เป็น string แบบ Sheet

## สถานะ migration

หน้า Landing/Login, Lobby, Dashboard Home, Profile, Leaderboard, Certificate, แผนที่บทเรียน, เนื้อหาบทเรียน, Pre-test, Boss Battle, Worksheet และ Cyber Safety ถูกย้ายเป็น React components แล้ว โดยหน้าที่แปลงแล้วเรียก Firebase service โดยตรง ส่วนเกมที่เหลือยังประกอบ markup, CSS และ browser scripts จาก `../legacy-gas` เพื่อรักษาหน้าตาเดิมระหว่างทยอยแปลง component ภายใน การส่งผู้ใช้จาก React เข้า flow เกมเดิมใช้ bridge ขนาดเล็กเฉพาะ state และ navigation ที่ legacy ยังต้องใช้

Vite แทน landing, lobby, dashboard home, profile, leaderboard, certificate, map, lesson, pretest, boss-battle, worksheet และ cyber-safety sections ด้วย React mount points และแปลง backend calls ที่เหลือเป็น `firebaseServices` ตั้งแต่ build time ดังนั้น production bundle ไม่มี `google.script.run`

ย้ายแล้ว: bootstrap/login, settings/news, lessons/questions, progress, leaderboard, guild leaderboard, Daily Quest, inventory/shop/gacha, profile/stats/certificate, Cyber Safety, World Boss, PVP และ Admin CRUD/report

- PVP Arena ย้ายเป็น React component และใช้ Firestore realtime listener (`onSnapshot`) แทน polling เพื่อลดจำนวน reads บนแผนฟรี
- AI Tutor ย้ายเป็น React component แล้ว เชื่อม Gemini API จริงเมื่อผู้ดูแลตั้งค่าคีย์ในแท็บ "ตั้งค่า" และถอยกลับเป็น local fallback อัตโนมัติเมื่อไม่มีคีย์หรือเครือข่ายล่ม
- Shop, Inventory และ Gacha ย้ายเป็น React components แล้ว และใช้ Firestore service ที่กำหนดราคาไอเทมฝั่ง logic กลางแทนค่าราคาจากหน้าเว็บ
- World Boss lobby/leaderboard ย้ายเป็น React แล้ว ส่วนเกมกล้องและ Mario engine ถูกเสิร์ฟเป็น static assets จาก Vite/Firebase Hosting origin เดียวกัน และส่งผลกลับ React ผ่าน `postMessage` เพื่อบันทึก Firestore โดยไม่ใช้ `doPost` หรือ Cloud Functions

ระบบ AI ทั้งสาม (แชทบอทติวเตอร์นักเรียน, AI วิเคราะห์นักเรียน, AI สร้างบทเรียน/ข้อสอบทั้งด่าน) เรียก Gemini REST API ตรงจาก browser โดยโหลดคีย์จากเอกสาร `settings/ai` ตอน runtime (`src/services/aiApi.ts` + `src/services/geminiLogic.ts`) — คีย์ไม่ถูก bundle ลง frontend และแก้ไขได้เฉพาะ admin ทุกฟีเจอร์ถอยกลับเป็น local fallback เมื่อยังไม่ตั้งค่าคีย์ ส่วนการวิเคราะห์นักเรียนจะกรอง `id`/`ownerUid`/`deviceId` ออกก่อนส่งให้โมเดลเสมอ

## ข้อจำกัดด้านความปลอดภัย

- เอกสาร `users` ถูกล็อกให้อ่านได้เฉพาะเจ้าของและ admin แล้ว; ข้อมูลที่จำเป็นต่อ UI สาธารณะอยู่ใน `directory` เท่านั้น และ Rules จำกัดเพดานการเพิ่ม XP/Coins ต่อการเขียน (±1000) เพื่อยกระดับความยากของการโกงผ่าน console
- Firebase Hosting ส่ง Content-Security-Policy, `X-Frame-Options`, `Referrer-Policy` และ `Permissions-Policy` จาก `firebase.json`; ถ้าเพิ่ม CDN/embed ใหม่ต้องอัปเดต CSP ด้วย
- Firebase web config และ API key เป็นข้อมูล public ตามรูปแบบ Firebase; ห้ามใส่ service-account key หรือ Gemini key ใน frontend
- Admin UI ตรวจรหัสผ่านด้วยบัญชี Firebase Auth `admin@nextgen-play.local` บน auth session แยกจากนักเรียน และ Rules อนุญาตการเขียนเฉพาะ email นี้
- `AdminPIN` และ `GeminiAPIKey` จะถูกตัดออกจากไฟล์ migration และไม่ถูกบันทึกใน `settings/public`; Rules ปิดการอ่านเอกสาร settings อื่นจากผู้เล่น หากเคย import รุ่นก่อนให้ลบ `settings/game` จาก Firestore Console
- Gemini API key เก็บใน `settings/ai` (เขียนได้เฉพาะ admin, อ่านได้เฉพาะผู้ใช้ที่ signed-in) เพราะไม่มี trusted backend ให้ซ่อนคีย์ — ผู้ใช้ที่ล็อกอินแอปสามารถเห็นคีย์ได้ทางเทคนิค จึงควรตั้ง Application restrictions (HTTP referrers) ให้คีย์ใช้ได้เฉพาะโดเมนของเว็บนี้ และจำกัด API restrictions เป็น Generative Language API เท่านั้น
- Logic รางวัล ราคาไอเทม กาชา และคะแนนรันใน browser จึงป้องกันการดัดแปลงแบบ server-authoritative ไม่ได้ 100% แม้ Rules จะจำกัดให้แก้ได้เฉพาะโปรไฟล์และห้องของตนเอง หากต้องการการแข่งขันที่ป้องกันโกงจริงจำเป็นต้องมี trusted backend
- Anonymous Auth รักษา session ใน browser เดิม แต่ไม่ใช่บัญชีนักเรียนถาวร หากต้องใช้งานข้ามเครื่องควรเปลี่ยนเป็น Email/Password, Google หรือบัญชีที่โรงเรียนจัดการ
