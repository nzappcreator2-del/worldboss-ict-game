// Fills a running Firestore + Auth emulator with a small but realistic school
// so the whole app can be exercised without touching the customer's live
// project.
//
// Safety: the Admin SDK routes *every* call to the emulator whenever
// FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST are set, and it needs
// no credentials in that mode. This script sets both to loopback before
// touching firebase-admin and then refuses to continue if either has been
// pointed anywhere else — so there is no configuration in which it can reach
// the live project.
//
// Usage (emulator must already be running):
//   npm run seed:emulator
const EMULATOR_HOSTS = {
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
}
const LOOPBACK = /^(127\.0\.0\.1|localhost|\[::1\]):\d+$/

for (const [name, fallback] of Object.entries(EMULATOR_HOSTS)) {
  process.env[name] ??= fallback
  if (!LOOPBACK.test(process.env[name])) {
    console.error(`Refusing to run: ${name}=${process.env[name]} is not a local emulator.`)
    process.exit(1)
  }
}
// A service-account key would be ignored while the emulator vars are set, but
// dropping it removes any doubt about which backend is being written to.
delete process.env.GOOGLE_APPLICATION_CREDENTIALS

const { initializeApp } = await import('firebase-admin/app')
const { getAuth } = await import('firebase-admin/auth')
const { getFirestore } = await import('firebase-admin/firestore')

const ADMIN_EMAIL = 'admin@nextgen-play.local'
const ADMIN_PASSWORD = 'emulator-admin-pass'
const PROJECT_ID = process.env.GCLOUD_PROJECT || 'nextgen-play-19dd2'

const CLASSES = ['ป.4/1', 'ป.5/1', 'ป.6/1']
const NAMES = [
  'ฟ้าใส', 'เมฆา', 'ต้นกล้า', 'ใบบุญ', 'ดาวเหนือ', 'ภูผา',
  'ลำธาร', 'พราวแสง', 'อรุณ', 'สายลม', 'ทะเลใส', 'ปูนปั้น',
]
const AVATARS = ['🧙‍♂️', '🧝‍♀️', '⚔️', '🏹', '🛡️', '🔮']

export function seedLessons() {
  return [
    {
      lessonId: 'L1', title: 'ด่านที่ 1 · รู้จักคอมพิวเตอร์', description: 'ส่วนประกอบและการทำงานเบื้องต้น',
      icon: '💻', isActive: true, enablePretest: true, mapStyle: 'stone-arch', lessonMapSet: 'grassland',
      content: '# คอมพิวเตอร์คืออะไร\n\nคอมพิวเตอร์คืออุปกรณ์อิเล็กทรอนิกส์ที่รับข้อมูล ประมวลผล และแสดงผลลัพธ์',
      videoUrl: '', worksheetUrl: '',
    },
    {
      lessonId: 'L2', title: 'ด่านที่ 2 · อัลกอริทึมในชีวิตประจำวัน', description: 'ลำดับขั้นตอนการแก้ปัญหา',
      icon: '🧩', isActive: true, enablePretest: false, mapStyle: 'crystal-gate', lessonMapSet: 'cavern',
      content: '# อัลกอริทึม\n\nอัลกอริทึมคือลำดับขั้นตอนที่ชัดเจนสำหรับแก้ปัญหาหนึ่ง ๆ',
      videoUrl: '', worksheetUrl: '',
    },
    {
      lessonId: 'L3', title: 'ด่านที่ 3 · ใช้อินเทอร์เน็ตอย่างปลอดภัย', description: 'รหัสผ่านและข่าวปลอม',
      icon: '🛡️', isActive: true, enablePretest: false, mapStyle: 'ruined-tower', lessonMapSet: 'volcano',
      content: '# ความปลอดภัยออนไลน์\n\nอย่าบอกรหัสผ่านกับใคร และตรวจสอบแหล่งที่มาของข่าวเสมอ',
      videoUrl: '', worksheetUrl: '',
    },
  ]
}

export function seedQuestions() {
  const rows = []
  for (const lessonId of ['L1', 'L2', 'L3']) {
    for (let index = 1; index <= 6; index += 1) {
      rows.push({
        questionId: `${lessonId}_Q${index}`,
        lessonId,
        type: 'posttest',
        pattern: 'choice',
        questionText: `[${lessonId}] ข้อ ${index}: ข้อใดถูกต้องที่สุด?`,
        opt1: 'ตัวเลือกที่หนึ่ง', opt2: 'ตัวเลือกที่สอง', opt3: 'ตัวเลือกที่สาม', opt4: 'ตัวเลือกที่สี่',
        answer: ((index - 1) % 4) + 1,
        explanation: 'เฉลย: อ่านทบทวนเนื้อหาในด่านนี้อีกครั้งนะ',
      })
    }
  }
  for (let index = 1; index <= 4; index += 1) {
    rows.push({
      questionId: `L1_PRE${index}`, lessonId: 'L1', type: 'pretest', pattern: 'choice',
      questionText: `[ก่อนเรียน] ข้อ ${index}: ลองเดาดูก่อนเรียน`,
      opt1: 'ก', opt2: 'ข', opt3: 'ค', opt4: 'ง', answer: 2, explanation: '',
    })
  }
  // PVP needs at least ten dedicated choice questions before a battle can start.
  for (let index = 1; index <= 12; index += 1) {
    rows.push({
      questionId: `PVP_Q${index}`, lessonId: 'PVP_MODE', type: 'posttest', pattern: 'choice',
      questionText: `[ประลอง] ข้อ ${index}: ใครตอบถูกก่อนได้โจมตี!`,
      opt1: 'คำตอบ A', opt2: 'คำตอบ B', opt3: 'คำตอบ C', opt4: 'คำตอบ D',
      answer: ((index - 1) % 4) + 1, explanation: '',
    })
  }
  return rows
}

// Seeded profiles carry no `ownerUid` so any browser can claim them on first
// login — that is the same path a student imported from the old Sheets system
// takes. The last student keeps a foreign owner on purpose, so the
// "already bound to another device" branch stays testable too.
export const LOCKED_STUDENT_NAME = NAMES[NAMES.length - 1]

export function seedStudents() {
  return NAMES.map((name, index) => {
    const xp = index * 137
    const level = 1 + Math.floor(xp / 120)
    const rank = xp > 1200 ? 'GOLD' : xp > 500 ? 'SILVER' : 'BRONZE'
    const locked = name === LOCKED_STUDENT_NAME
    return {
      id: `student-${index + 1}`,
      name,
      class: CLASSES[index % CLASSES.length],
      avatar: AVATARS[index % AVATARS.length],
      gender: index % 2 === 0 ? 'male' : 'female',
      xp, level, rank,
      coins: 120 + index * 40,
      streak: index % 5,
      inventory: { potion: 2, magnifier: 1 },
      ...(locked ? { ownerUid: 'seed-uid-other-device' } : {}),
    }
  })
}

async function main() {
  console.log(`Seeding emulator at ${process.env.FIRESTORE_EMULATOR_HOST} (project ${PROJECT_ID}).`)
  const app = initializeApp({ projectId: PROJECT_ID })
  const db = getFirestore(app)
  const auth = getAuth(app)

  const write = async (collection, rows, idOf) => {
    const batch = db.batch()
    rows.forEach((row, index) => batch.set(db.collection(collection).doc(idOf(row, index)), row))
    await batch.commit()
    console.log(`Seeded ${rows.length} document(s) into ${collection}.`)
  }

  await write('lessons', seedLessons(), (row) => row.lessonId)
  await write('questions', seedQuestions(), (row) => row.questionId)

  const students = seedStudents()
  await write('users', students, (row) => row.id)
  await write('directory', students.map((student) => ({
    name: student.name, class: student.class, avatar: student.avatar,
    xp: student.xp, level: student.level, rank: student.rank,
  })), (_row, index) => students[index].id)

  await write('settings', [
    {
      id: 'public',
      Classes: 'ป.4,ป.5,ป.6',
      Rooms: '1, 2, 3',
      TimerPerQuestion: 40,
      CertHeader: 'โรงเรียนทดสอบระบบ (Emulator)',
      CertFooter: 'โรงเรียนทดสอบระบบ (Emulator)',
    },
  ], (row) => row.id)

  await write('news', [
    { id: 'N1', title: 'ยินดีต้อนรับสู่สนามทดสอบ', content: 'นี่คือข้อมูลจำลองบน emulator ไม่กระทบข้อมูลจริง', icon: '📢', type: 'NEWS', date: '2026-07-29', isActive: true },
    { id: 'N2', title: 'ด่านใหม่เปิดแล้ว!', content: 'ลองเข้าด่านที่ 3 เรื่องความปลอดภัยออนไลน์', icon: '🎉', type: 'EVENT', date: '2026-07-28', isActive: true },
  ], (row) => row.id)

  await write('cyberSafetyScenarios', [
    { id: 'CS1', timeOfDay: 'เช้า', title: 'ข้อความจากคนแปลกหน้า', text: 'มีคนไม่รู้จักทักมาขอรูปและที่อยู่บ้าน ควรทำอย่างไร?', opt1: 'บล็อกและบอกผู้ปกครอง', opt2: 'ส่งรูปให้เพราะเขาขอดี ๆ', answerIdx: 0, feedbackRight: 'ถูกต้อง! บอกผู้ใหญ่เสมอ', feedbackWrong: 'อันตรายมาก อย่าให้ข้อมูลส่วนตัวกับคนแปลกหน้า' },
    { id: 'CS2', timeOfDay: 'กลางวัน', title: 'ลิงก์แจกไอเทมฟรี', text: 'เพื่อนส่งลิงก์บอกว่ากรอกรหัสผ่านแล้วได้ไอเทมเกมฟรี', opt1: 'กรอกเลย เพื่อนส่งมาน่าเชื่อถือ', opt2: 'ไม่กรอก เพราะเป็นการหลอกเอารหัสผ่าน', answerIdx: 1, feedbackRight: 'เก่งมาก! นี่คือฟิชชิง', feedbackWrong: 'ระวังนะ ไม่มีใครแจกของฟรีแลกรหัสผ่าน' },
    { id: 'CS3', timeOfDay: 'เย็น', title: 'ข่าวที่แชร์ต่อกันมา', text: 'เห็นข่าวน่าตกใจในกลุ่มไลน์ ควรทำอย่างไรก่อนแชร์ต่อ?', opt1: 'ตรวจสอบแหล่งที่มาก่อน', opt2: 'รีบแชร์ให้เพื่อนรู้ทันที', answerIdx: 0, feedbackRight: 'ถูกต้อง! ตรวจก่อนแชร์เสมอ', feedbackWrong: 'การแชร์ข่าวปลอมทำให้คนอื่นเข้าใจผิด' },
  ], (row) => row.id)

  await write('teacherQuests', [
    {
      questId: 'TQ1', lessonId: 'L1', lessonTitle: 'ด่านที่ 1 · รู้จักคอมพิวเตอร์', status: 'active',
      title: 'ภารกิจจากครูวีรภัทร์: พิชิตด่านที่ 1',
      npcMessage: 'ศึกษาบทเรียนด่านที่ 1 แล้วสอบผ่านให้ได้นะ',
      classes: CLASSES,
      // objectives is a list of keys (see OBJECTIVE_KEYS in teacherQuestLogic),
      // not a flag object — a wrong shape silently normalizes to [] and the
      // quest can then never become turn-in-able.
      objectives: ['study', 'posttest'],
      rewards: { xp: 120, coins: 80 }, dueAt: '',
    },
  ], (row) => row.questId)

  await write('dailyQuests', [
    { questId: 'login', title: 'เช็คอินประจำวัน', target: 1, coins: 20, xp: 0, isActive: true },
    { questId: 'play1', title: 'เริ่มการเดินทาง', target: 1, coins: 0, xp: 15, isActive: true },
    { questId: 'correct5', title: 'ผู้เจนจัดความรู้', target: 5, coins: 30, xp: 0, isActive: true },
  ], (row) => row.questId)

  const existing = await auth.getUserByEmail(ADMIN_EMAIL).catch(() => null)
  if (!existing) {
    await auth.createUser({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
    console.log(`Created emulator admin ${ADMIN_EMAIL} (password: ${ADMIN_PASSWORD}).`)
  } else {
    await auth.updateUser(existing.uid, { password: ADMIN_PASSWORD })
    console.log(`Reset emulator admin password for ${ADMIN_EMAIL} (password: ${ADMIN_PASSWORD}).`)
  }

  console.log('\nEmulator seeded. Run `npm run dev:emulator` and open the printed URL.')
}

const invokedDirectly = process.argv[1]?.replace(/\\/g, '/').endsWith('seed-emulator.mjs')
if (invokedDirectly) await main()
