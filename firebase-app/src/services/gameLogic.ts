export type Inventory = Record<string, unknown>

const SERVER_PRICES: Record<string, number> = { potion: 100, magnifier: 150 }
const GACHA_POOL = [
  { emoji: '🐵', weight: 40, rarity: 'Common' },
  { emoji: '🦊', weight: 30, rarity: 'Common' },
  { emoji: '🐼', weight: 15, rarity: 'Rare' },
  { emoji: '🦄', weight: 8, rarity: 'Epic' },
  { emoji: '🐉', weight: 5, rarity: 'Legendary' },
  { emoji: '👽', weight: 2, rarity: 'Mythic' },
] as const

const strings = (value: unknown) => Array.isArray(value) ? value.map(String) : []
const progress = (value: unknown): Inventory => value && typeof value === 'object'
  ? { ...(value as Inventory), play1: Number((value as Inventory).play1) || 0, correct5: Number((value as Inventory).correct5) || 0 }
  : { play1: 0, correct5: 0 }

export function resetDailyState(raw: Inventory, today: string): Inventory {
  if (raw.dailyDate === today) {
    return { ...raw, dailyDone: strings(raw.dailyDone), dailyAnswers: strings(raw.dailyAnswers), dailyProgress: progress(raw.dailyProgress) }
  }
  return { ...raw, dailyDate: today, dailyDone: [], dailyProgress: { play1: 0, correct5: 0 }, dailyAnswers: [] }
}

export function applyDailyProgress(raw: Inventory, today: string, questId: string, increment: number, answerId?: string) {
  const inventory = resetDailyState(raw, today)
  const done = strings(inventory.dailyDone)
  const answers = strings(inventory.dailyAnswers)
  const dailyProgress = progress(inventory.dailyProgress)
  if (done.includes(questId)) return { inventory, status: 'already_done', newProgress: Number(dailyProgress[questId]) || 0 }
  if (questId === 'correct5' && answerId && answers.includes(answerId)) {
    return { inventory, status: 'duplicate_answer', newProgress: Number(dailyProgress[questId]) || 0 }
  }
  if (questId === 'correct5' && answerId) answers.push(answerId)
  dailyProgress[questId] = (Number(dailyProgress[questId]) || 0) + (Number(increment) || 0)
  return { inventory: { ...inventory, dailyAnswers: answers, dailyProgress }, newProgress: dailyProgress[questId] }
}

const dateNumber = (date: string) => Date.parse(`${date}T00:00:00Z`)

export function applyLoginBonus(user: Inventory, today: string) {
  const coins = Number(user.coins) || 0
  const streak = Number(user.streak) || 0
  const inventory = resetDailyState((user.inventory as Inventory) || {}, today)
  const dailyDone = strings(inventory.dailyDone)
  // user.lastLogin is a server Timestamp after every login, so the bonus gate
  // and the streak both rely on inventory.lastBonusDate (a Bangkok date string).
  const lastBonusDate = typeof inventory.lastBonusDate === 'string'
    ? inventory.lastBonusDate
    : typeof user.lastLogin === 'string' ? user.lastLogin : ''
  if (dailyDone.includes('login') || lastBonusDate === today) return { isNew: false, streak, coins, inventory }
  const consecutive = lastBonusDate !== '' && dateNumber(today) - dateNumber(lastBonusDate) === 86_400_000
  const newStreak = consecutive ? streak + 1 : 1
  dailyDone.push('login')
  const badges = strings(inventory.badges)
  if (newStreak >= 7 && !badges.includes('badge_streak_7')) badges.push('badge_streak_7')
  return {
    isNew: true,
    streak: newStreak,
    coinsGained: 20,
    totalCoins: coins + 20,
    inventory: { ...inventory, dailyDone, badges, lastBonusDate: today },
  }
}

// Daily-quest catalog: the three progress counters the client actually
// tracks (login check-in, lesson entries, correct answers). The teacher can
// re-title / re-target / re-price each one from the Admin Panel (stored in
// the `dailyQuests` collection, doc id = quest id); these defaults apply
// whenever no admin override exists. New counter types require code, so the
// admin editor edits these three rather than creating arbitrary quests.
export type DailyQuestConfig = {
  id: 'login' | 'play1' | 'correct5'
  title: string
  description: string
  target: number
  coins: number
  xp: number
  isActive: boolean
}

export const DAILY_QUEST_REWARD_CAP = 500

export const DAILY_QUEST_DEFAULTS: DailyQuestConfig[] = [
  { id: 'login', title: 'เช็คอินประจำวัน', description: 'เข้าสู่ระบบผจญภัยวันนี้', target: 1, coins: 20, xp: 0, isActive: true },
  { id: 'play1', title: 'เริ่มการเดินทาง', description: 'ออกบุกโจมตีด่านต่าง ๆ 1 ครั้ง', target: 1, coins: 0, xp: 15, isActive: true },
  { id: 'correct5', title: 'ผู้เจนจัดความรู้', description: 'สะสมการตอบคำถามถูก 5 ข้อ', target: 5, coins: 30, xp: 0, isActive: true },
]

// Merge an admin-authored quest row over its default, clamping rewards well
// under the Firestore ±1000 coin/XP delta rule so a claim can never violate
// security rules.
export function mergeDailyQuestConfig(defaults: DailyQuestConfig, row: Record<string, unknown> | undefined): DailyQuestConfig {
  if (!row) return defaults
  const clampReward = (value: unknown, fallback: number) => {
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed < 0) return fallback
    return Math.min(DAILY_QUEST_REWARD_CAP, Math.round(parsed))
  }
  return {
    id: defaults.id,
    title: String(row.title || defaults.title),
    description: String(row.description || defaults.description),
    target: Math.max(1, Math.min(50, Math.round(Number(row.target)) || defaults.target)),
    coins: clampReward(row.coins, defaults.coins),
    xp: clampReward(row.xp, defaults.xp),
    isActive: row.isActive !== false,
  }
}

export function completeQuest(user: Inventory, today: string, questId: string, rewardCoins: number, rewardXp: number) {
  const inventory = resetDailyState((user.inventory as Inventory) || {}, today)
  const dailyDone = strings(inventory.dailyDone)
  if (dailyDone.includes(questId)) return { success: false as const, error: 'รางวัลถูกรับไปแล้ว' }
  dailyDone.push(questId)
  return {
    success: true as const,
    coins: (Number(user.coins) || 0) + (Number(rewardCoins) || 0),
    xp: (Number(user.xp) || 0) + (Number(rewardXp) || 0),
    inventory: { ...inventory, dailyDone },
  }
}

export function buyInventoryItem(rawCoins: number, rawInventory: Inventory, itemId: string) {
  const cost = SERVER_PRICES[itemId]
  const coins = Number(rawCoins) || 0
  if (cost === undefined) return { success: false, error: 'ไอเทมนี้ไม่มีขายในระบบ' }
  if (coins < cost) return { success: false, error: 'เหรียญไม่พอจ้า' }
  return { success: true, coins: coins - cost, inventory: { ...rawInventory, [itemId]: (Number(rawInventory[itemId]) || 0) + 1 } }
}

export function consumeInventoryItem(rawInventory: Inventory, itemId: string) {
  const count = Number(rawInventory[itemId]) || 0
  if (count <= 0) return { success: false, error: 'ไอเทมไม่เพียงพอ' }
  return { success: true, inventory: { ...rawInventory, [itemId]: count - 1 } }
}

// --- Cosmetic wardrobe (ระบบแต่งตัว paper-doll) ----------------------------
// Catalog prices are server-authoritative like SERVER_PRICES. Every price must
// stay ≤ 950 so a purchase never violates the Firestore ±1000 coin delta cap.
// Each item id maps to a real LPC sprite layer (see characterAssets.ts) that is
// drawn onto the walking/attacking character, so equipping visibly changes the
// hero everywhere. Price-0 items are starter gear: always owned, worn whenever
// the slot is empty (the hero is never bald or shirtless).
export type CosmeticSlot = 'hair' | 'outfit' | 'hat' | 'weapon' | 'accessory'
// 'unisex' items are visible/purchasable by any student. Hat/weapon/accessory
// art sits on top of the body without depending on its cut, so every item in
// those three slots is unisex. hair/outfit art was composed against a single
// LPC body (see CREDITS.md); it stays 'unisex' too until true male-cut and
// female-cut layers are composed — re-tag those specific ids 'male'/'female'
// once that art exists so PlayerEconomy's shop filter (see cosmeticsForTab)
// can split them by the student's own gender.
export type CosmeticGender = 'unisex' | 'male' | 'female'
export type CosmeticItem = { id: string; name: string; slot: CosmeticSlot; price: number; description: string; gender: CosmeticGender }

// Equipment "tiers": palette-swap recolors of the 5 hand-authored hat/weapon/
// accessory shapes (see scripts/recolor-cosmetic.mjs, which generated the
// actual PNGs — this table's ids/names/price math must stay in sync with that
// script's TIER_PALETTE/assignTiers by hand, since the script is a Node-only
// dev tool and can't be imported into this browser bundle).
const TIER_SUFFIX = (name: string, tier: string) => `${name} (${tier})`
const TIER_DESC = (description: string, flavor: string) => `${description} • ${flavor}`

export const COSMETIC_CATALOG: Record<string, CosmeticItem> = {
  'hair-bangs': { id: 'hair-bangs', name: 'ผมหน้าม้าสีทอง', slot: 'hair', price: 0, description: 'ทรงผมเริ่มต้นของผู้กล้า', gender: 'unisex' },
  'hair-ponytail': { id: 'hair-ponytail', name: 'ผมหางม้าสีดำ', slot: 'hair', price: 150, description: 'มัดเป๊ะ พร้อมลุยทุกด่าน', gender: 'unisex' },
  'hair-bob': { id: 'hair-bob', name: 'ผมบ๊อบสีน้ำตาล', slot: 'hair', price: 150, description: 'สั้นเท่ คล่องตัวสุดๆ', gender: 'unisex' },
  'hair-curly': { id: 'hair-curly', name: 'ผมหยิกยาวสีส้ม', slot: 'hair', price: 200, description: 'ลอนสวยสะดุดตาทั้งกิลด์', gender: 'unisex' },
  'hair-xlong': { id: 'hair-xlong', name: 'ผมยาวพิเศษสีฟ้า', slot: 'hair', price: 250, description: 'สยายยาวดุจธารน้ำแข็ง', gender: 'unisex' },
  'outfit-tshirt': { id: 'outfit-tshirt', name: 'เสื้อยืดนักผจญภัย', slot: 'outfit', price: 0, description: 'ชุดเริ่มต้นใส่สบาย', gender: 'unisex' },
  'outfit-longsleeve': { id: 'outfit-longsleeve', name: 'เสื้อแขนยาวสีน้ำเงิน', slot: 'outfit', price: 200, description: 'อบอุ่นพร้อมเดินทางไกล', gender: 'unisex' },
  'outfit-tunic': { id: 'outfit-tunic', name: 'ชุดทูนิกป่าลึก', slot: 'outfit', price: 250, description: 'ชุดนักสำรวจสีเขียวป่า', gender: 'unisex' },
  'outfit-chainmail': { id: 'outfit-chainmail', name: 'เสื้อเกราะโซ่', slot: 'outfit', price: 450, description: 'เกราะโซ่ถักแน่นสไตล์นักรบ', gender: 'unisex' },
  'outfit-plate': { id: 'outfit-plate', name: 'เกราะเหล็กอัศวิน', slot: 'outfit', price: 800, description: 'เกราะเต็มยศแวววาวสุดอลังการ', gender: 'unisex' },
  'hat-bandana': { id: 'hat-bandana', name: 'ผ้าโพกหัวสีแดง', slot: 'hat', price: 150, description: 'สไตล์โจรสลัดจอมซน', gender: 'unisex' },
  'hat-bandana-bronze': { id: 'hat-bandana-bronze', name: TIER_SUFFIX('ผ้าโพกหัวสีแดง', 'บรอนซ์'), slot: 'hat', price: 200, description: TIER_DESC('สไตล์โจรสลัดจอมซน', 'ประกายบรอนซ์คลาสสิก'), gender: 'unisex' },
  'hat-bandana-iron': { id: 'hat-bandana-iron', name: TIER_SUFFIX('ผ้าโพกหัวสีแดง', 'เหล็กกล้า'), slot: 'hat', price: 230, description: TIER_DESC('สไตล์โจรสลัดจอมซน', 'แข็งแกร่งดุจเหล็กกล้า'), gender: 'unisex' },
  'hat-feather': { id: 'hat-feather', name: 'หมวกขนนกนักล่า', slot: 'hat', price: 250, description: 'หมวกเขียวประดับขนนกแดง', gender: 'unisex' },
  'hat-feather-silver': { id: 'hat-feather-silver', name: TIER_SUFFIX('หมวกขนนกนักล่า', 'เงิน'), slot: 'hat', price: 370, description: TIER_DESC('หมวกเขียวประดับขนนกแดง', 'เงางามสไตล์นักรบเงิน'), gender: 'unisex' },
  'hat-feather-gold': { id: 'hat-feather-gold', name: TIER_SUFFIX('หมวกขนนกนักล่า', 'ทองคำ'), slot: 'hat', price: 430, description: TIER_DESC('หมวกเขียวประดับขนนกแดง', 'หรูหราด้วยประกายทองคำ'), gender: 'unisex' },
  'hat-wizard': { id: 'hat-wizard', name: 'หมวกจอมเวทสีน้ำเงิน', slot: 'hat', price: 400, description: 'ปลายแหลมเต็มเปี่ยมพลังเวท', gender: 'unisex' },
  'hat-wizard-sapphire': { id: 'hat-wizard-sapphire', name: TIER_SUFFIX('หมวกจอมเวทสีน้ำเงิน', 'แซฟไฟร์'), slot: 'hat', price: 620, description: TIER_DESC('ปลายแหลมเต็มเปี่ยมพลังเวท', 'ประดับพลอยแซฟไฟร์สีน้ำเงินลึก'), gender: 'unisex' },
  'hat-wizard-emerald': { id: 'hat-wizard-emerald', name: TIER_SUFFIX('หมวกจอมเวทสีน้ำเงิน', 'มรกต'), slot: 'hat', price: 620, description: TIER_DESC('ปลายแหลมเต็มเปี่ยมพลังเวท', 'อัญมณีมรกตสดใส'), gender: 'unisex' },
  'hat-helmet': { id: 'hat-helmet', name: 'หมวกเกราะนอร์มัน', slot: 'hat', price: 500, description: 'หมวกเหล็กอัศวินของแท้', gender: 'unisex' },
  'hat-helmet-ruby': { id: 'hat-helmet-ruby', name: TIER_SUFFIX('หมวกเกราะนอร์มัน', 'ทับทิม'), slot: 'hat', price: 760, description: TIER_DESC('หมวกเหล็กอัศวินของแท้', 'ทับทิมแดงเข้มทรงพลัง'), gender: 'unisex' },
  'hat-helmet-amethyst': { id: 'hat-helmet-amethyst', name: TIER_SUFFIX('หมวกเกราะนอร์มัน', 'อเมทิสต์'), slot: 'hat', price: 760, description: TIER_DESC('หมวกเหล็กอัศวินของแท้', 'อเมทิสต์ม่วงลึกลับ'), gender: 'unisex' },
  'hat-crown': { id: 'hat-crown', name: 'มงกุฎราชาแห่งปัญญา', slot: 'hat', price: 950, description: 'เครื่องประดับสุดหรูของยอดนักเรียน', gender: 'unisex' },
  'hat-crown-obsidian': { id: 'hat-crown-obsidian', name: TIER_SUFFIX('มงกุฎราชาแห่งปัญญา', 'ออบซิเดียน'), slot: 'hat', price: 950, description: TIER_DESC('เครื่องประดับสุดหรูของยอดนักเรียน', 'หินออบซิเดียนดำสนิท'), gender: 'unisex' },
  'hat-crown-radiant': { id: 'hat-crown-radiant', name: TIER_SUFFIX('มงกุฎราชาแห่งปัญญา', 'รังสีทอง'), slot: 'hat', price: 950, description: TIER_DESC('เครื่องประดับสุดหรูของยอดนักเรียน', 'เปล่งประกายรังสีทองระยิบระยับ'), gender: 'unisex' },
  'weapon-dagger': { id: 'weapon-dagger', name: 'มีดสั้นจอมโจร', slot: 'weapon', price: 200, description: 'เบา ไว แทงทะลุทุกความลับ', gender: 'unisex' },
  'weapon-dagger-bronze': { id: 'weapon-dagger-bronze', name: TIER_SUFFIX('มีดสั้นจอมโจร', 'บรอนซ์'), slot: 'weapon', price: 250, description: TIER_DESC('เบา ไว แทงทะลุทุกความลับ', 'ประกายบรอนซ์คลาสสิก'), gender: 'unisex' },
  'weapon-dagger-iron': { id: 'weapon-dagger-iron', name: TIER_SUFFIX('มีดสั้นจอมโจร', 'เหล็กกล้า'), slot: 'weapon', price: 280, description: TIER_DESC('เบา ไว แทงทะลุทุกความลับ', 'แข็งแกร่งดุจเหล็กกล้า'), gender: 'unisex' },
  'weapon-saber': { id: 'weapon-saber', name: 'ดาบโค้งเซเบอร์', slot: 'weapon', price: 350, description: 'คมโค้งพลิ้วไหวดุจสายลม', gender: 'unisex' },
  'weapon-saber-silver': { id: 'weapon-saber-silver', name: TIER_SUFFIX('ดาบโค้งเซเบอร์', 'เงิน'), slot: 'weapon', price: 470, description: TIER_DESC('คมโค้งพลิ้วไหวดุจสายลม', 'เงางามสไตล์นักรบเงิน'), gender: 'unisex' },
  'weapon-saber-gold': { id: 'weapon-saber-gold', name: TIER_SUFFIX('ดาบโค้งเซเบอร์', 'ทองคำ'), slot: 'weapon', price: 530, description: TIER_DESC('คมโค้งพลิ้วไหวดุจสายลม', 'หรูหราด้วยประกายทองคำ'), gender: 'unisex' },
  'weapon-mace': { id: 'weapon-mace', name: 'กระบองศึก', slot: 'weapon', price: 400, description: 'หนักแน่นทุกการปะทะ', gender: 'unisex' },
  'weapon-mace-sapphire': { id: 'weapon-mace-sapphire', name: TIER_SUFFIX('กระบองศึก', 'แซฟไฟร์'), slot: 'weapon', price: 620, description: TIER_DESC('หนักแน่นทุกการปะทะ', 'ประดับพลอยแซฟไฟร์สีน้ำเงินลึก'), gender: 'unisex' },
  'weapon-mace-emerald': { id: 'weapon-mace-emerald', name: TIER_SUFFIX('กระบองศึก', 'มรกต'), slot: 'weapon', price: 620, description: TIER_DESC('หนักแน่นทุกการปะทะ', 'อัญมณีมรกตสดใส'), gender: 'unisex' },
  'weapon-longsword': { id: 'weapon-longsword', name: 'ดาบยาวอัศวิน', slot: 'weapon', price: 450, description: 'ดาบมาตรฐานผู้พิทักษ์', gender: 'unisex' },
  'weapon-longsword-ruby': { id: 'weapon-longsword-ruby', name: TIER_SUFFIX('ดาบยาวอัศวิน', 'ทับทิม'), slot: 'weapon', price: 710, description: TIER_DESC('ดาบมาตรฐานผู้พิทักษ์', 'ทับทิมแดงเข้มทรงพลัง'), gender: 'unisex' },
  'weapon-longsword-amethyst': { id: 'weapon-longsword-amethyst', name: TIER_SUFFIX('ดาบยาวอัศวิน', 'อเมทิสต์'), slot: 'weapon', price: 710, description: TIER_DESC('ดาบมาตรฐานผู้พิทักษ์', 'อเมทิสต์ม่วงลึกลับ'), gender: 'unisex' },
  'weapon-waraxe': { id: 'weapon-waraxe', name: 'ขวานสงคราม', slot: 'weapon', price: 550, description: 'ขวานใหญ่สายพลังทำลายล้าง', gender: 'unisex' },
  'weapon-waraxe-obsidian': { id: 'weapon-waraxe-obsidian', name: TIER_SUFFIX('ขวานสงคราม', 'ออบซิเดียน'), slot: 'weapon', price: 850, description: TIER_DESC('ขวานใหญ่สายพลังทำลายล้าง', 'หินออบซิเดียนดำสนิท'), gender: 'unisex' },
  'weapon-waraxe-radiant': { id: 'weapon-waraxe-radiant', name: TIER_SUFFIX('ขวานสงคราม', 'รังสีทอง'), slot: 'weapon', price: 900, description: TIER_DESC('ขวานใหญ่สายพลังทำลายล้าง', 'เปล่งประกายรังสีทองระยิบระยับ'), gender: 'unisex' },
  'acc-scarf': { id: 'acc-scarf', name: 'ผ้าพันคอสีแดง', slot: 'accessory', price: 150, description: 'พลิ้วเท่รับลมหนาว', gender: 'unisex' },
  'acc-scarf-bronze': { id: 'acc-scarf-bronze', name: TIER_SUFFIX('ผ้าพันคอสีแดง', 'บรอนซ์'), slot: 'accessory', price: 200, description: TIER_DESC('พลิ้วเท่รับลมหนาว', 'ประกายบรอนซ์คลาสสิก'), gender: 'unisex' },
  'acc-scarf-iron': { id: 'acc-scarf-iron', name: TIER_SUFFIX('ผ้าพันคอสีแดง', 'เหล็กกล้า'), slot: 'accessory', price: 230, description: TIER_DESC('พลิ้วเท่รับลมหนาว', 'แข็งแกร่งดุจเหล็กกล้า'), gender: 'unisex' },
  'acc-cravat': { id: 'acc-cravat', name: 'ผ้าผูกคอสุภาพชน', slot: 'accessory', price: 200, description: 'ลุคคุณหนูผู้ดีมีสกุล', gender: 'unisex' },
  'acc-cravat-silver': { id: 'acc-cravat-silver', name: TIER_SUFFIX('ผ้าผูกคอสุภาพชน', 'เงิน'), slot: 'accessory', price: 320, description: TIER_DESC('ลุคคุณหนูผู้ดีมีสกุล', 'เงางามสไตล์นักรบเงิน'), gender: 'unisex' },
  'acc-cravat-gold': { id: 'acc-cravat-gold', name: TIER_SUFFIX('ผ้าผูกคอสุภาพชน', 'ทองคำ'), slot: 'accessory', price: 380, description: TIER_DESC('ลุคคุณหนูผู้ดีมีสกุล', 'หรูหราด้วยประกายทองคำ'), gender: 'unisex' },
  'acc-necklace': { id: 'acc-necklace', name: 'สร้อยคอทองคำ', slot: 'accessory', price: 250, description: 'ประกายทองล้ำค่า', gender: 'unisex' },
  'acc-necklace-sapphire': { id: 'acc-necklace-sapphire', name: TIER_SUFFIX('สร้อยคอทองคำ', 'แซฟไฟร์'), slot: 'accessory', price: 470, description: TIER_DESC('ประกายทองล้ำค่า', 'ประดับพลอยแซฟไฟร์สีน้ำเงินลึก'), gender: 'unisex' },
  'acc-necklace-emerald': { id: 'acc-necklace-emerald', name: TIER_SUFFIX('สร้อยคอทองคำ', 'มรกต'), slot: 'accessory', price: 470, description: TIER_DESC('ประกายทองล้ำค่า', 'อัญมณีมรกตสดใส'), gender: 'unisex' },
  'acc-plumage': { id: 'acc-plumage', name: 'ขนนกประดับแดง', slot: 'accessory', price: 300, description: 'ปักเด่นเหนือหมวกทุกใบ', gender: 'unisex' },
  'acc-plumage-ruby': { id: 'acc-plumage-ruby', name: TIER_SUFFIX('ขนนกประดับแดง', 'ทับทิม'), slot: 'accessory', price: 560, description: TIER_DESC('ปักเด่นเหนือหมวกทุกใบ', 'ทับทิมแดงเข้มทรงพลัง'), gender: 'unisex' },
  'acc-plumage-amethyst': { id: 'acc-plumage-amethyst', name: TIER_SUFFIX('ขนนกประดับแดง', 'อเมทิสต์'), slot: 'accessory', price: 560, description: TIER_DESC('ปักเด่นเหนือหมวกทุกใบ', 'อเมทิสต์ม่วงลึกลับ'), gender: 'unisex' },
  'acc-gemnecklace': { id: 'acc-gemnecklace', name: 'สร้อยอัญมณีแดง', slot: 'accessory', price: 350, description: 'อัญมณีเม็ดโตส่องประกาย', gender: 'unisex' },
  'acc-gemnecklace-obsidian': { id: 'acc-gemnecklace-obsidian', name: TIER_SUFFIX('สร้อยอัญมณีแดง', 'ออบซิเดียน'), slot: 'accessory', price: 650, description: TIER_DESC('อัญมณีเม็ดโตส่องประกาย', 'หินออบซิเดียนดำสนิท'), gender: 'unisex' },
  'acc-gemnecklace-radiant': { id: 'acc-gemnecklace-radiant', name: TIER_SUFFIX('สร้อยอัญมณีแดง', 'รังสีทอง'), slot: 'accessory', price: 700, description: TIER_DESC('อัญมณีเม็ดโตส่องประกาย', 'เปล่งประกายรังสีทองระยิบระยับ'), gender: 'unisex' },
}

// Starter gear worn automatically while its slot is empty.
export const COSMETIC_DEFAULTS: Partial<Record<CosmeticSlot, string>> = {
  hair: 'hair-bangs',
  outfit: 'outfit-tshirt',
}

export type CosmeticsState = { owned: string[]; equipped: Partial<Record<CosmeticSlot, string>> }

// Gendered student bases (see characterAssets.ts) ship with hair + school
// uniform baked into the spritesheet, so they skip the starter-gear fallback.
export function hasBakedBaseLook(gender: unknown): boolean {
  return gender === 'male' || gender === 'female'
}

export function cosmeticsState(rawInventory: unknown, gender?: unknown): CosmeticsState {
  const inventory = rawInventory && typeof rawInventory === 'object' ? rawInventory as Inventory : {}
  const raw = inventory.cosmetics && typeof inventory.cosmetics === 'object' ? inventory.cosmetics as Inventory : {}
  const bought = strings(raw.owned).filter((id) => id in COSMETIC_CATALOG)
  const freebies = Object.values(COSMETIC_CATALOG).filter((item) => item.price === 0).map((item) => item.id)
  const owned = [...new Set([...freebies, ...bought])]
  const equipped: CosmeticsState['equipped'] = {}
  const rawEquipped = raw.equipped && typeof raw.equipped === 'object' ? raw.equipped as Record<string, unknown> : {}
  for (const item of Object.values(COSMETIC_CATALOG)) {
    if (rawEquipped[item.slot] === item.id && owned.includes(item.id)) equipped[item.slot] = item.id
  }
  // Starter gear fills empty hair/outfit slots so the legacy hero always looks
  // dressed; gendered students already look dressed via their base sheet.
  if (!hasBakedBaseLook(gender)) {
    for (const [slot, defaultId] of Object.entries(COSMETIC_DEFAULTS) as [CosmeticSlot, string][]) {
      if (!equipped[slot]) equipped[slot] = defaultId
    }
  }
  return { owned, equipped }
}

export function buyCosmetic(rawCoins: number, rawInventory: Inventory, itemId: string, gender?: unknown):
  { success: true; coins: number; inventory: Inventory } | { success: false; error: string } {
  const item = COSMETIC_CATALOG[itemId]
  if (!item) return { success: false, error: 'ไอเทมนี้ไม่มีขายในระบบ' }
  const coins = Number(rawCoins) || 0
  const current = cosmeticsState(rawInventory, gender)
  if (current.owned.includes(itemId)) return { success: false, error: 'มีไอเทมชิ้นนี้อยู่แล้ว' }
  if (coins < item.price) return { success: false, error: 'เหรียญไม่พอจ้า' }
  // Buying auto-equips the new piece so the kid sees the outfit change instantly.
  const cosmetics: CosmeticsState = {
    owned: [...current.owned, itemId],
    equipped: { ...current.equipped, [item.slot]: itemId },
  }
  return { success: true, coins: coins - item.price, inventory: { ...rawInventory, cosmetics } }
}

export function toggleCosmetic(rawInventory: Inventory, itemId: string, gender?: unknown):
  { success: true; inventory: Inventory; equipped: boolean } | { success: false; error: string } {
  const item = COSMETIC_CATALOG[itemId]
  if (!item) return { success: false, error: 'ไม่พบไอเทมนี้' }
  const current = cosmeticsState(rawInventory, gender)
  if (!current.owned.includes(itemId)) return { success: false, error: 'ยังไม่มีไอเทมชิ้นนี้ ซื้อจากร้านค้าก่อนนะ' }
  const equipped = { ...current.equipped }
  const wearing = equipped[item.slot] === itemId
  if (wearing) delete equipped[item.slot]
  else equipped[item.slot] = itemId
  return {
    success: true,
    equipped: !wearing,
    inventory: { ...rawInventory, cosmetics: { owned: current.owned, equipped } },
  }
}

export function pickGachaAvatar(randomValue = Math.random()) {
  let cursor = Math.min(Math.max(randomValue, 0), 0.999999) * 100
  for (const item of GACHA_POOL) {
    if (cursor < item.weight) return { emoji: item.emoji, rarity: item.rarity }
    cursor -= item.weight
  }
  return GACHA_POOL[GACHA_POOL.length - 1]
}

export function worldBossResult(bossId: string, rawScore: number, previousBest?: number | null) {
  const cleanScore = Math.round((Number(rawScore) || 0) * 100) / 100
  const timeBased = bossId !== 'WB003' && (!bossId.startsWith('WB002') || bossId === 'WB002_SPEEDRUN')
  const noPrevious = previousBest === undefined || previousBest === null
  const isPersonalBest = noPrevious || (timeBased ? cleanScore < previousBest : cleanScore > previousBest)
  return { cleanScore, isPersonalBest, bestScore: isPersonalBest ? cleanScore : Number(previousBest) }
}
