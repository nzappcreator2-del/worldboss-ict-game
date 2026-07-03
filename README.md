# NextGen Play

โปรเจกต์นี้ย้ายจาก Google Apps Script + Google Sheets ไปเป็น Vite + React + Cloud Firestore สำหรับ deploy ด้วย Firebase Hosting โดยไม่ใช้ Cloud Functions

## โครงสร้างหลัก

- `firebase-app/` — แอปใหม่ Vite + React + Firebase SDK และชุด tests
- `legacy-gas/` — snapshot ของระบบ Google Apps Script เดิม รวมถึง assets ที่ยังใช้เป็น legacy/static source ระหว่าง build
- `firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json` — config สำหรับ Firebase Hosting และ Firestore

## คำสั่งหลัก

```bash
npm install
npm run dev
npm test
npm run test:rules
npm run audit:prod
npm run preflight
npm run build
npm run verify
```

คำสั่ง `npm install` ที่ root จะติดตั้ง dependencies ของ `firebase-app/` ให้ด้วย และคำสั่ง root ข้างบนจะ delegate ไปที่ `firebase-app/` ให้เอง หากต้องการทำงานในโฟลเดอร์แอปโดยตรงก็ใช้คำสั่งเดียวกันหลัง `cd firebase-app`

เมื่อต้อง deploy ให้ build ก่อน แล้วรันจาก root repository:

```bash
firebase deploy --only hosting,firestore:rules,firestore:indexes
```

Deployment and migration runbook: `DEPLOYMENT.md`

รายละเอียด migration, collections, security notes และข้อจำกัดอยู่ใน `firebase-app/README.md`
