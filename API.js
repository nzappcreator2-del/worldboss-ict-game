
/**
 * ==========================================
 * API Functions สำหรับฝั่งผู้เล่น (Student/Player)
 * ==========================================
 */

/**
 * API: ตรวจสอบการเข้าสู่ระบบผู้เล่น
 * @param {string} name - ชื่อผู้เล่น
 * @param {string} className - ระดับชั้น
 * @param {string} avatar - ตัวละครที่เลือก
 * @returns {Object} ผลลัพธ์พร้อมข้อมูลผู้เล่นหรือข้อผิดพลาด
 */

/**
 * API: ตรวจสอบและมอบรางวัล Login รายวัน + จัดการ Streak
 */
function claimLoginBonus(userId) {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Users');
    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    // สร้าง Map ตำแหน่งคอลัมน์แบบ Dynamic
    const col = {};
    const requiredCols = ['UserID', 'Coins', 'Inventory', 'LastLogin', 'Streak'];
    requiredCols.forEach(c => col[c] = headers.indexOf(c));

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][col.UserID]) === String(userId)) {
        const now = new Date();
        const tz = ss.getSpreadsheetTimeZone();
        const todayStr = Utilities.formatDate(now, tz, "yyyy-MM-dd");
        
        // อ่านค่า LastLogin และแปลงให้เป็น String ฟอร์แมต yyyy-MM-dd เสมอเพื่อความแม่นยำในการเทียบ
        let lastLoginValue = data[i][col.LastLogin];
        let lastLogin = '';
        if (lastLoginValue instanceof Date) {
          lastLogin = Utilities.formatDate(lastLoginValue, tz, "yyyy-MM-dd");
        } else {
          lastLogin = String(lastLoginValue || '').trim();
          // ถ้าเป็น string ที่เป็น ISO Date หรือ Format อื่น ให้ลองแปลง (ถ้าทำได้)
          if (lastLogin && lastLogin.length > 10) {
             try { lastLogin = Utilities.formatDate(new Date(lastLogin), tz, "yyyy-MM-dd"); } catch(e) {}
          }
        }

        const currentStreak = Number(data[i][col.Streak]) || 0;
        const currentCoins = Number(data[i][col.Coins]) || 0;

        // ตรวจสอบเข้มงวด: ถ้าวันนี้ล็อกอินไปแล้ว คืนค่าเดิมทันที ห้ามแจกเพิ่ม
        if (lastLogin === todayStr) {
          console.log('User ' + userId + ' already claimed today. Skipping.');
          return { success: true, isNew: false, streak: currentStreak, coins: currentCoins };
        }

        // คำนวณ Streak
        let newStreak = 1;
        if (lastLogin && /^\d{4}-\d{2}-\d{2}$/.test(lastLogin)) {
          const parts = lastLogin.split('-');
          const lastDate = new Date(parts[0], parts[1] - 1, parts[2]);
          const diffTime = Math.abs(now.setHours(0, 0, 0, 0) - lastDate.setHours(0, 0, 0, 0));
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          if (diffDays === 1) {
            newStreak = currentStreak + 1;
          }
        }

        const loginReward = 20;
        const newCoins = currentCoins + loginReward;

        // อัปเดต Inventory ให้เควส login สำเร็จทันที
        let inv = {};
        try {
          const invData = data[i][col.Inventory];
          inv = (invData && typeof invData === 'string') ? JSON.parse(invData) : (invData || {});
        } catch (e) {
          console.error('Error parsing inventory in claimLoginBonus:', e);
          inv = {};
        }

        if (!inv.dailyDone) inv.dailyDone = [];
        if (!inv.dailyDone.includes('login')) inv.dailyDone.push('login');
        inv.dailyDate = todayStr;

        // ระบบ Badge: แจกตราผู้ไม่ย่อท้อ เมื่อ Streak >= 7 วัน
        if (!inv.badges) inv.badges = [];
        if (newStreak >= 7 && !inv.badges.includes('badge_streak_7')) {
          inv.badges.push('badge_streak_7');
        }

        // อัปเดตข้อมูลลง Sheet
        sheet.getRange(i + 1, col.Coins + 1).setValue(newCoins);
        sheet.getRange(i + 1, col.Inventory + 1).setValue(JSON.stringify(inv));
        sheet.getRange(i + 1, col.LastLogin + 1).setValue(todayStr);
        sheet.getRange(i + 1, col.Streak + 1).setValue(newStreak);

        return {
          success: true,
          isNew: true,
          streak: newStreak,
          coinsGained: loginReward,
          totalCoins: newCoins
        };
      }
    }
    return { success: false, error: 'User not found' };
  } catch (e) {
    console.error('Error in claimLoginBonus:', e);
    return { success: false, error: e.toString() };
  }
}

/**
 * API: ดึงสถานะเควสประจำวัน
 */
function getDailyQuestStatus(userId) {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Users');
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const invIdx = headers.indexOf('Inventory');
    const idIdx = headers.indexOf('UserID');

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idIdx]) === String(userId)) {
        let inv = {};
        try {
          const invData = data[i][invIdx];
          inv = (invData && typeof invData === 'string') ? JSON.parse(invData) : (invData || {});
        } catch (e) {
          console.error('Error parsing inventory in getDailyQuestStatus:', e);
          inv = {};
        }

        const todayStr = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), "yyyy-MM-dd");

        // ถ้าวันที่ในบันทึกเควสไม่ใช่ของวันนี้ ให้รีเซ็ต
        if (inv.dailyDate !== todayStr) {
          inv.dailyDate = todayStr;
          inv.dailyProgress = { play1: 0, correct5: 0 };
          inv.dailyAnswers = []; // ล้างประวัติข้อสอบที่ตอบแล้วของเมื่อวาน
          sheet.getRange(i + 1, invIdx + 1).setValue(JSON.stringify(inv));
        }

        return {
          success: true,
          progress: inv.dailyProgress || { play1: 0, correct5: 0 },
          done: inv.dailyDone || []
        };
      }
    }
    return { success: false, error: 'User not found' };
  } catch (e) {
    console.error('Error in getDailyQuestStatus:', e);
    return { success: false, error: e.toString() };
  }
}

/**
 * API: อัปเดตความคืบหน้าเควส
 */
function updateDailyProgress(userId, questId, increment, extraData) {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Users');
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const invIdx = headers.indexOf('Inventory');
    const idIdx = headers.indexOf('UserID');

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idIdx]) === String(userId)) {
        let inv = {};
        try {
          const invData = data[i][invIdx];
          inv = (invData && typeof invData === 'string') ? JSON.parse(invData) : (invData || {});
        } catch (e) {
          console.error('Error parsing inventory in updateDailyProgress:', e);
          inv = {};
        }

        const todayStr = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), "yyyy-MM-dd");

        if (inv.dailyDate !== todayStr) {
          inv.dailyDate = todayStr;
          inv.dailyDone = [];
          inv.dailyProgress = { play1: 0, correct5: 0 };
          inv.dailyAnswers = []; // ล้างประวัติข้อสอบรายวัน
        }

        if (!inv.dailyProgress) inv.dailyProgress = { play1: 0, correct5: 0 };
        if (!inv.dailyDone) inv.dailyDone = [];
        if (!inv.dailyAnswers) inv.dailyAnswers = [];

        // ถ้าเควสเสร็จแล้ว ไม่ต้องทำเพิ่ม
        if (inv.dailyDone.includes(questId)) return { success: true, status: 'already_done' };

        // 🛡️ ป้องกันการปั๊มข้อเดิม (Anti-Farming)
        if (questId === 'correct5' && extraData) {
          if (inv.dailyAnswers.includes(extraData)) {
            return { success: true, newProgress: inv.dailyProgress[questId], status: 'duplicate_answer' };
          }
          inv.dailyAnswers.push(extraData); // บันทึกว่าข้อนี้ตอบไปแล้ววันนี้
        }

        inv.dailyProgress[questId] = (inv.dailyProgress[questId] || 0) + increment;
        sheet.getRange(i + 1, invIdx + 1).setValue(JSON.stringify(inv));

        return { success: true, newProgress: inv.dailyProgress[questId] };
      }
    }
    return { success: false, error: 'User not found' };
  } catch (e) {
    console.error('Error in updateDailyProgress:', e);
    return { success: false, error: e.toString() };
  }
}

/**
 * API: ยืนยันว่าเควสสำเร็จและรับรางวัล
 */
function completeDailyQuest(userId, questId, rewardCoins, rewardXp) {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Users');
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    // สร้าง Map ตำแหน่งคอลัมน์แบบ Dynamic
    const col = {};
    const requiredCols = ['UserID', 'XP', 'Coins', 'Inventory'];
    requiredCols.forEach(c => col[c] = headers.indexOf(c));

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][col.UserID]) === String(userId)) {
        let inv = {};
        try {
          const invData = data[i][col.Inventory];
          inv = (invData && typeof invData === 'string') ? JSON.parse(invData) : (invData || {});
        } catch (e) {
          console.error('Error parsing inventory in completeDailyQuest:', e);
          inv = {};
        }

        if (!inv.dailyDone) inv.dailyDone = [];

        if (inv.dailyDone.includes(questId)) return { success: false, error: 'รางวัลถูกรับไปแล้ว' };

        inv.dailyDone.push(questId);

        const currentCoins = Number(data[i][col.Coins]) || 0;
        const currentXp = Number(data[i][col.XP]) || 0;
        const newCoins = currentCoins + (rewardCoins || 0);
        const newXp = currentXp + (rewardXp || 0);

        sheet.getRange(i + 1, col.Coins + 1).setValue(newCoins);
        sheet.getRange(i + 1, col.XP + 1).setValue(newXp);
        sheet.getRange(i + 1, col.Inventory + 1).setValue(JSON.stringify(inv));

        return { success: true, coins: newCoins, xp: newXp };
      }
    }
    return { success: false, error: 'User not found' };
  } catch (e) {
    console.error('Error in completeDailyQuest:', e);
    return { success: false, error: e.toString() };
  }
}

function loginStudent(name, className, avatar) {
  try {
    ensureDatabaseSetup();
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Users');
    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    // สร้าง Map ตำแหน่งคอลัมน์แบบ Dynamic
    const col = {};
    const requiredCols = ['UserID', 'Name', 'Class', 'XP', 'Rank', 'Level', 'Avatar', 'Coins', 'Inventory', 'LastLogin', 'Streak'];
    requiredCols.forEach(c => col[c] = headers.indexOf(c));

    // ค้นหาผู้ใช้ (ข้าม Header อิงตามชื่อและชั้นเรียน)
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][col.Name] || '') === String(name || '') && 
          String(data[i][col.Class] || '') === String(className || '')) {
        
        // หากผู้ใช้เดิมยังไม่มี Avatar ให้บันทึกตัวที่เลือกมา
        if (!data[i][col.Avatar] && avatar) {
          sheet.getRange(i + 1, col.Avatar + 1).setValue(avatar);
          data[i][col.Avatar] = avatar;
        }

        // จัดการข้อมูล Inventory ให้เป็น Object เสมอ
        let invObj = { "potion": 0, "magnifier": 0 };
        try {
          const invData = data[i][col.Inventory];
          if (invData) {
            invObj = (typeof invData === 'string') ? JSON.parse(invData) : invData;
          }
        } catch (e) {
          console.error('Error parsing inventory for user:', name, e);
        }

        return {
          success: true,
          user: {
            id: String(data[i][col.UserID] || ''),
            name: String(data[i][col.Name] || ''),
            class: String(data[i][col.Class] || ''),
            xp: Number(data[i][col.XP]) || 0,
            rank: String(data[i][col.Rank] || 'BRONZE'),
            level: Number(data[i][col.Level]) || 1,
            avatar: String(data[i][col.Avatar] || '🧙‍♂️'),
            coins: Number(data[i][col.Coins]) || 0,
            inventory: invObj,
            lastLogin: String(data[i][col.LastLogin] || ''),
            streak: Number(data[i][col.Streak]) || 0
          }
        };
      }
    }

    // ถ้าไม่พบ ให้สร้างผู้ใช้ใหม่
    const newUserId = 'U' + new Date().getTime();
    const safeName = (name && /^[=+\-@]/.test(name)) ? "'" + name : name;
    const safeClass = (className && /^[=+\-@]/.test(className)) ? "'" + className : className;
    const initInventory = { "potion": 0, "magnifier": 0 };
    
    // เรียงข้อมูลตาม Header จริงในชีต
    const newRow = new Array(headers.length).fill('');
    newRow[col.UserID] = newUserId;
    newRow[col.Name] = safeName;
    newRow[col.Class] = safeClass;
    newRow[col.XP] = 0;
    newRow[col.Rank] = 'BRONZE';
    newRow[col.Level] = 1;
    newRow[col.Avatar] = avatar || '🧙‍♂️';
    newRow[col.Coins] = 0;
    newRow[col.Inventory] = JSON.stringify(initInventory);

    sheet.appendRow(newRow);
    CacheService.getScriptCache().remove('CACHE_REGISTERED_USERS');

    return {
      success: true,
      user: {
        id: newUserId,
        name: name,
        class: className,
        xp: 0,
        rank: 'BRONZE',
        level: 1,
        avatar: avatar || '🧙‍♂️',
        coins: 0,
        inventory: initInventory,
        lastLogin: '',
        streak: 0
      },
      isNew: true
    };
  } catch (e) {
    console.error('Error in loginStudent:', e);
    return { success: false, error: e.toString() };
  }
}

/**
 * API: ดึงรายชื่อผู้เล่นทั้งหมดเพื่อจัดกลุ่มตามชั้นเรียน (ใช้ในหน้า Login)
 * @returns {Object} อาเรย์รายชื่อผู้ใช้ที่ลงทะเบียนแล้ว
 */
/**
 * API: ดึงข้อมูลตั้งต้นทั้งหมดในการเปิดเว็บ 1 ครั้ง (Batch Request)
 */
function getInitialData() {
  try {
    const usersRes = getRegisteredUsers();
    // สมมติว่าใน Admin.gs มีการอัปเดต getSettings ให้ใช้ Cache แล้ว
    const settingsRes = getSettings();
    const newsRes = getActiveNews();
    return {
      success: true,
      users: usersRes.success ? usersRes.data : [],
      settings: settingsRes.success ? settingsRes.data : {},
      news: newsRes
    };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function getRegisteredUsers() {
  try {
    const cache = CacheService.getScriptCache();
    const cachedUsers = cache.get('CACHE_REGISTERED_USERS');
    if (cachedUsers) return { success: true, data: JSON.parse(cachedUsers) };

    ensureDatabaseSetup();
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Users');
    const data = sheet.getDataRange().getValues();
    const users = [];

    // ข้าม Header
    for (let i = 1; i < data.length; i++) {
      if (data[i][1] && data[i][2]) {
        users.push({
          name: data[i][1],
          class: data[i][2],
          avatar: data[i][6] || '🧙‍♂️'
        });
      }
    }
    cache.put('CACHE_REGISTERED_USERS', JSON.stringify(users), 600);
    return { success: true, data: users };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * 🛠️ API: ใช้งานไอเทม
 * @param {string} userId - ID ของผู้ใช้
 * @param {string} itemId - ID ของไอเทม (potion, magnifier)
 * @returns {object} { success, inventory }
 */
function useItem(userId, itemId) {
  try {
    ensureDatabaseSetup();
    const ss = getSpreadsheet();
    const usersSheet = ss.getSheetByName('Users');
    const data = usersSheet.getDataRange().getValues();
    const headers = data[0];

    const idIdx = headers.indexOf('UserID');
    const invIdx = headers.indexOf('Inventory');

    if (idIdx === -1 || invIdx === -1) {
      return { success: false, error: 'ไม่พบคอลัมน์ที่จำเป็น (UserID หรือ Inventory) ในฐานข้อมูล' };
    }

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idIdx]) === String(userId)) {
        let invStr = data[i][invIdx];
        let inventory = invStr ? (typeof invStr === 'object' ? invStr : JSON.parse(invStr)) : { potion: 0, magnifier: 0 };

        if (!inventory[itemId] || inventory[itemId] <= 0) {
          return { success: false, error: 'ไอเทมไม่เพียงพอ' };
        }

        inventory[itemId] -= 1;
        usersSheet.getRange(i + 1, invIdx + 1).setValue(JSON.stringify(inventory));

        return { success: true, inventory: inventory };
      }
    }
    return { success: false, error: 'ไม่พบผู้ใช้' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * API: ดึงข่าวสารประกาศที่เปิดใช้งานอยู่
 */
function getActiveNews() {
  try {
    const cache = CacheService.getScriptCache();
    const cachedNews = cache.get('CACHE_NEWS');
    if (cachedNews) return JSON.parse(cachedNews);

    ensureDatabaseSetup();
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('News');
    if (!sheet) return [];

    const data = sheet.getDataRange().getValues();
    const newsList = [];

    // Header คือ data[0] = ['NewsID', 'Icon', 'Type', 'Title', 'Content', 'Date', 'IsActive']
    for (let i = 1; i < data.length; i++) {
      if (data[i][6] === true || (typeof data[i][6] === 'string' && data[i][6].toLowerCase() === 'true')) {
        let rawDate = data[i][5];
        let dateStr = '';
        if (rawDate instanceof Date) {
          let y = rawDate.getFullYear();
          if (y < 2500) y += 543;
          dateStr = `${rawDate.getDate()}/${rawDate.getMonth() + 1}/${y}`;
        } else {
          dateStr = String(rawDate || '');
        }

        newsList.push({
          id: data[i][0],
          icon: data[i][1],
          type: data[i][2],
          title: data[i][3],
          content: data[i][4],
          date: dateStr,
          isActive: true
        });
      }
    }
    // เรียงข่าวล่าสุดขึ้นก่อน (สมมติ ID รันตามเวลา หรือเรียงแค่ย้อนกลับ)
    newsList.reverse();
    cache.put('CACHE_NEWS', JSON.stringify(newsList), 600);
    return newsList;
  } catch (e) {
    console.error("Error getActiveNews:", e);
    return [];
  }
}

/**
 * API: ดึงข้อมูลบทเรียนทั้งหมด (พร้อมประวัติการผ่านด่านถ้าส่ง userId มา)
 * @param {string} userId - รหัสผู้ใช้ (Optional)
 * @returns {Object} รายการบทเรียนที่เปิดให้เล่น
 */
function getLessons(userId = null) {
  try {
    ensureDatabaseSetup(); // Ensure setup is done regardless of cache hit
    const ss = getSpreadsheet(); // Get spreadsheet object once

    const cache = CacheService.getScriptCache();
    const cachedLessons = cache.get('CACHE_LESSONS_DATA');
    let lessons = [];

    if (cachedLessons) {
      lessons = JSON.parse(cachedLessons);
    } else {
      const sheet = ss.getSheetByName('Lessons');
      const data = sheet.getDataRange().getValues();

      // ดึงจำนวนข้อสอบมาใช้นับล่วงหน้า
      const qSheet = ss.getSheetByName('Questions');
      const qData = qSheet.getDataRange().getValues();
      const questionCounts = {};

      for (let j = 1; j < qData.length; j++) {
        const lId = String(qData[j][1]); // LessonID
        if (lId) {
          questionCounts[lId] = (questionCounts[lId] || 0) + 1;
        }
      }

      // โครงสร้างชีท: LessonID(0), Title(1), Description(2), VideoURL(3), Icon(4), IsActive(5), EnablePretest(6), WorksheetURL(7)
      for (let i = 1; i < data.length; i++) {
        if (!data[i][0] || !data[i][1]) continue; // ข้ามแถวว่าง

        const isActive = data[i][5];
        const active = (isActive === true || isActive === 'TRUE' || isActive === 'true' || isActive === 1 || isActive === '1' || isActive === '' || isActive === undefined || isActive === null);

        const enablePre = data[i][6];
        const pretest = (enablePre === true || enablePre === 'TRUE' || enablePre === 'true' || enablePre === 1 || enablePre === '1');

        lessons.push({
          id: data[i][0],
          title: data[i][1],
          description: data[i][2],
          videoUrl: data[i][3],
          icon: data[i][4] || '🗺️',
          isActive: active,
          enablePretest: pretest,
          worksheetUrl: data[i][7] || '',
          content: data[i][8] || '',
          questionCount: questionCounts[data[i][0]] || 0
        });
      }
      cache.put('CACHE_LESSONS_DATA', JSON.stringify(lessons), 600); // 10 minutes
    }

    // 🛡️ หากมีการส่ง userId เข้ามา ให้ดึงประวัติการผ่านด่านไปด้วยรวดเดียวเลยเพื่อลด Delay
    const passedLessons = [];
    if (userId) {
      const progressSheet = ss.getSheetByName('Progress');
      if (progressSheet) {
        const pData = progressSheet.getDataRange().getValues();
        for (let i = 1; i < pData.length; i++) {
          if (String(pData[i][0]) === String(userId) && String(pData[i][2]) === 'Passed') {
            passedLessons.push(String(pData[i][1]));
          }
        }
      }
    }

    return { success: true, data: lessons, passedLessons: passedLessons };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * API: ดึงข้อมูลคำถาม (Post-test) ของแต่ละด่าน
 * @param {string} lessonId - รหัสบทเรียน
 * @returns {Object} รายการคำถามแบบปรนัย
 */
function getQuestions(lessonId) {
  try {
    ensureDatabaseSetup();
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Questions');
    const data = sheet.getDataRange().getValues();
    const questions = [];

    if (String(lessonId) === 'PVP_MODE') {
      let pvpQs = [];
      let otherQs = [];
      
      for (let i = 1; i < data.length; i++) {
        const qType = String(data[i][9] || 'posttest').toLowerCase();
        if (qType !== 'pretest' && data[i][2]) {
          const qObj = {
            qId: data[i][0],
            text: data[i][2],
            options: [data[i][3], data[i][4], data[i][5], data[i][6]],
            answer: parseInt(data[i][7] || 1) - 1,
            explanation: data[i][8]
          };
          if (String(data[i][1]) === 'PVP_MODE') {
            pvpQs.push(qObj);
          } else {
            otherQs.push(qObj);
          }
        }
      }
      
      // Shuffle other questions to make it random
      otherQs.sort(() => Math.random() - 0.5);
      
      // Combine specific PVP questions with other questions as fallback
      let finalQuestions = pvpQs.concat(otherQs);
      
      // Slice to 10 questions to keep the game exciting and fast-paced
      return { success: true, data: finalQuestions.slice(0, 10) };
    }

    // โครงสร้างชีท: QuestionID, LessonID, QuestionText, Opt1, Opt2, Opt3, Opt4, Answer, Explanation, Type
    for (let i = 1; i < data.length; i++) {
      // หาคำถามที่รหัส LessonID ตรงกัน และเป็น posttest (หรือไม่ได้ระบุ type)
      const qType = String(data[i][9] || 'posttest').toLowerCase();
      if (String(data[i][1]) === String(lessonId) && qType !== 'pretest') {
        questions.push({
          qId: data[i][0],
          text: data[i][2],
          options: [data[i][3], data[i][4], data[i][5], data[i][6]],
          answer: parseInt(data[i][7] || 1) - 1,
          explanation: data[i][8]
        });
      }
    }
    return { success: true, data: questions };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * API: ดึงข้อมูลคำถาม (Pre-test)
 * @param {string} lessonId - รหัสบทเรียน
 * @returns {Object} อาเรย์ของข้อมูลคำถามก่อนเรียน
 */
function getPreTestQuestions(lessonId) {
  try {
    ensureDatabaseSetup();
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Questions');
    const data = sheet.getDataRange().getValues();
    const questions = [];

    for (let i = 1; i < data.length; i++) {
      const qType = String(data[i][9] || 'posttest').toLowerCase();
      if (String(data[i][1]) === String(lessonId) && qType === 'pretest') {
        questions.push({
          qId: data[i][0],
          text: data[i][2],
          options: [data[i][3], data[i][4], data[i][5], data[i][6]],
          answer: parseInt(data[i][7]) - 1,
          explanation: data[i][8]
        });
      }
    }

    return { success: true, data: questions };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * API: บันทึกความก้าวหน้าของผู้เล่นหลังสู้บอสเสร็จ (เซฟ XP และระดับแบบ Server-Authoritative)
 * @param {string} userId - รหัสผู้ใช้
 * @param {string} lessonId - รหัสบทเรียน
 * @param {string} status - สถานะ (เช่น 'Passed')
 * @param {number} score - คะแนนที่ได้
 * @param {number} maxScore - คะแนนเต็ม (จำนวนข้อสอบ)
 * @param {number} combo - โบนัสคอมโบ
 * @returns {Object} การยืนยันความสำเร็จ และสถิติใหม่
 */
function saveStudentProgress(userId, lessonId, status, score, maxScore, combo) {
  try {
    ensureDatabaseSetup();
    const ss = getSpreadsheet();

    // 0. ตรวจสอบประวัติว่าเคยผ่านด่านนี้แล้วหรือยัง (ป้องกันปั๊ม XP)
    const progressSheet = ss.getSheetByName('Progress');
    const pData = progressSheet.getDataRange().getValues();
    let alreadyPassed = false;

    // เริ่มเช็คจากแถว 1 (ข้าม Header)
    for (let i = 1; i < pData.length; i++) {
      if (String(pData[i][0]) === String(userId) && String(pData[i][1]) === String(lessonId) && pData[i][2] === 'Passed') {
        alreadyPassed = true;
        break;
      }
    }

    // 1. บันทึกประวัติการเล่นลงชีต Progress (บันทึกทุกรอบการเล่น ไม่ว่าจะผ่านเกณฑ์หรือไม่)
    progressSheet.appendRow([userId, lessonId, status, score]);

    // 2. คำนวณ XP และจัดการข้อมูลผู้ใช้ในชีต Users
    const usersSheet = ss.getSheetByName('Users');
    const usersData = usersSheet.getDataRange().getValues();

    // Anti-Cheat Clamping
    const safeScore = Math.max(0, Math.min(Number(score) || 0, Number(maxScore) || 0));
    const safeMaxScore = Math.max(1, Number(maxScore) || 1);
    const safeCombo = Math.max(1, Math.min(Number(combo) || 1, 30)); // Max x30 combo

    let gainedXp = 0;

    // คำนวณ XP จากคะแนนที่ได้ x คอมโบ
    if (status === 'Passed') {
      if (alreadyPassed) {
        gainedXp = 0; // ถ้าเคยผ่านไปแล้ว จะไม่ได้ XP เพิ่ม
      } else {
        let pct = (safeScore / safeMaxScore) * 100;
        gainedXp = Math.floor(pct * safeCombo);
      }
    } else {
      gainedXp = 10; // ปลอบใจเวลาแพ้
    }

    let updatedStats = null;

    for (let i = 1; i < usersData.length; i++) {
      if (String(usersData[i][0]) === String(userId)) { // หาแถวของ user

        let currentXp = Number(usersData[i][3]) || 0;
        let newTotalXp = currentXp + gainedXp;
        let currentCoins = Number(usersData[i][7]) || 0;
        let newCoins = currentCoins + gainedXp;

        // ลอจิกเลเวล (1 เลเวล = 100 XP)
        let newLevel = Math.floor(newTotalXp / 100) + 1;

        // คำนวณ Rank ตาม XP (ตามเงื่อนไขใน Readme.md)
        let newRank = 'BRONZE';
        if (newTotalXp >= 300) newRank = 'SILVER';
        if (newTotalXp >= 600) newRank = 'GOLD';
        if (newTotalXp >= 1200) newRank = 'PLATINUM';
        if (newTotalXp >= 2500) newRank = 'DIAMOND';
        if (newTotalXp >= 5000) newRank = 'MASTER';
        if (newTotalXp >= 10000) newRank = 'GRANDMASTER';

        // ระบบ Badge: อัปเดตคอลัมน์ Inventory (ช่อง 9 = Index 8 ของอาเรย์)
        let inv = {};
        try {
          const invStr = usersData[i][8];
          inv = invStr ? (typeof invStr === 'object' ? invStr : JSON.parse(invStr)) : {};
        } catch (e) {
          inv = {};
        }
        if (!inv.badges) inv.badges = [];
        
        let newBadgesAdded = false;

        // เงื่อนไข: ผ่านด่าน และ คะแนนเต็ม
        if (status === 'Passed') {
          const lessonBadgeId = 'badge_lesson_' + lessonId;
          if (!inv.badges.includes(lessonBadgeId)) {
            inv.badges.push(lessonBadgeId);
            newBadgesAdded = true;
          }
          if (safeScore === safeMaxScore && safeMaxScore > 0) {
            if (!inv.badges.includes('badge_perfect')) {
              inv.badges.push('badge_perfect');
              newBadgesAdded = true;
            }
          }
        }

        // เงื่อนไข: ระดับเลเวล
        if (newLevel >= 5 && !inv.badges.includes('badge_lvl_5')) { inv.badges.push('badge_lvl_5'); newBadgesAdded = true; }
        if (newLevel >= 10 && !inv.badges.includes('badge_lvl_10')) { inv.badges.push('badge_lvl_10'); newBadgesAdded = true; }
        if (newLevel >= 20 && !inv.badges.includes('badge_lvl_20')) { inv.badges.push('badge_lvl_20'); newBadgesAdded = true; }

        // อัปเดตข้อมูลลงชีต Users
        usersSheet.getRange(i + 1, 4).setValue(newTotalXp); // XP
        usersSheet.getRange(i + 1, 5).setValue(newRank); // Rank
        usersSheet.getRange(i + 1, 6).setValue(newLevel); // Level
        usersSheet.getRange(i + 1, 8).setValue(newCoins); // Coins
        
        // ถ้าได้ Badge ใหม่ ให้บันทึก Inventory ทับของเดิม
        if (newBadgesAdded || !usersData[i][8]) {
          usersSheet.getRange(i + 1, 9).setValue(JSON.stringify(inv)); 
        }

        updatedStats = {
          xp: newTotalXp,
          level: newLevel,
          rank: newRank,
          gainedXp: gainedXp,
          alreadyPassed: alreadyPassed,
          coins: newCoins
        };

        break;
      }
    }

    const cache = CacheService.getScriptCache();
    cache.remove('CACHE_LEADERBOARD');
    cache.remove('CACHE_REGISTERED_USERS');
    cache.remove('CACHE_GUILD_LEADERBOARD');

    return { success: true, stats: updatedStats };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * API: ประวัติการเรียนรู้ของผู้เล่น (Student Progress สำหรับ Map unlock)
 * @param {string} userId - รหัสผู้ใช้
 * @returns {Object} รายการด่านที่ผ่านแล้ว
 */
function getStudentProgress(userId) {
  try {
    ensureDatabaseSetup();
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Progress');
    const data = sheet.getDataRange().getValues();
    const passedLessons = [];

    // โครงสร้างชีต: UserID(0), LessonID(1), Status(2), Score(3)
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(userId) && String(data[i][2]) === 'Passed') {
        passedLessons.push(String(data[i][1]));
      }
    }

    return { success: true, data: passedLessons };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * API: ตรวจสอบสิทธิ์รับเกียรติบัตร (ถ้าครบจะแจก Badge ถาวร)
 * @param {string} userId - รหัสผู้ใช้
 */
function checkCertificateEligibility(userId) {
  try {
    ensureDatabaseSetup();
    const ss = getSpreadsheet();
    
    // 1. นับด่านที่ Active ทั้งหมด
    const lessonsSheet = ss.getSheetByName('Lessons');
    const lData = lessonsSheet.getDataRange().getValues();
    const activeLessonIds = [];
    for (let i = 1; i < lData.length; i++) {
        if (!lData[i][0]) continue;
        const isActive = lData[i][5];
        const active = (isActive === true || isActive === 'TRUE' || isActive === 'true' || isActive === 1 || isActive === '1' || isActive === '' || isActive === undefined || isActive === null);
        if (active) activeLessonIds.push(String(lData[i][0]));
    }
    const totalActiveCount = activeLessonIds.length;

    // 2. ดึงด่านที่ผ่านแล้ว
    const progressSheet = ss.getSheetByName('Progress');
    const pData = progressSheet.getDataRange().getValues();
    const passedSet = new Set();
    for (let i = 1; i < pData.length; i++) {
        if (String(pData[i][0]) === String(userId) && (String(pData[i][2]) === 'Passed' || String(pData[i][2]) === 'Completed')) {
            passedSet.add(String(pData[i][1]));
        }
    }
    const passedCount = activeLessonIds.filter(id => passedSet.has(id)).length;

    // 3. ตรวจสอบเงื่อนไขว่าผ่านครบทั้งหมดหรือไม่
    let isEligible = (totalActiveCount > 0 && passedCount >= totalActiveCount);

    const userSheet = ss.getSheetByName('Users');
    const uData = userSheet.getDataRange().getValues();

    for (let i = 1; i < uData.length; i++) {
        if (String(uData[i][0]) === String(userId)) {
            let inv = {};
            try {
                const invStr = uData[i][8];
                inv = invStr ? (typeof invStr === 'object' ? invStr : JSON.parse(invStr)) : {};
            } catch (e) { inv = {}; }
            
            if (!inv.badges) inv.badges = [];
            
            if (isEligible) {
                // ถ้ามีสิทธิ์แล้ว แต่ยังไม่มี Badge ให้แจกเหรียญ
                if (!inv.badges.includes('badge_cert')) {
                    inv.badges.push('badge_cert');
                    userSheet.getRange(i + 1, 9).setValue(JSON.stringify(inv));
                }
            } else {
                // ถ้ายังไม่ครบ (เช่น ครูแอบเพิ่มด่าน) ให้ริบเหรียญคืนอัติโนมัติ
                if (inv.badges.includes('badge_cert')) {
                    inv.badges = inv.badges.filter(b => b !== 'badge_cert');
                    userSheet.getRange(i + 1, 9).setValue(JSON.stringify(inv));
                }
            }
            break;
        }
    }
    return { 
        success: true, 
        isEligible: isEligible, 
        passedCount: passedCount, 
        totalActiveCount: totalActiveCount 
    };

  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * API: ข้อมูลสถิติส่วนบุคคล (Player Stats - ใช้ใน Dashboard)
 * @param {string} userId - รหัสผู้ใช้
 * @returns {Object} อันดับ (Rank Position) และด่านปัจจุบัน
 */
function getUserStats(userId) {
  try {
    ensureDatabaseSetup();
    const ss = getSpreadsheet();

    // 1. Calculate Leaderboard Position
    const userSheet = ss.getSheetByName('Users');
    const uData = userSheet.getDataRange().getValues();
    let usersList = [];
    for (let i = 1; i < uData.length; i++) {
      if (uData[i][0]) { // Check if UserID exists
        usersList.push({ id: uData[i][0], xp: parseInt(uData[i][3]) || 0 });
      }
    }
    // Sort by XP descending
    usersList.sort((a, b) => b.xp - a.xp);
    // Find rank (1-based index)
    let position = usersList.findIndex(u => u.id === userId) + 1;
    if (position === 0) position = '-';

    // 2. Find Current Lesson
    const pSheet = ss.getSheetByName('Progress');
    const pData = pSheet.getDataRange().getValues();
    let passedLessons = new Set();
    for (let i = 1; i < pData.length; i++) {
      if (String(pData[i][0]) === String(userId) && String(pData[i][2]) === 'Passed') {
        passedLessons.add(String(pData[i][1]));
      }
    }

    const lSheet = ss.getSheetByName('Lessons');
    const lData = lSheet.getDataRange().getValues();
    let currentLessonTitle = 'เริ่มต้น';

    let activeLessons = [];
    for (let i = 1; i < lData.length; i++) {
      if (lData[i][0]) {
        activeLessons.push({ id: String(lData[i][0]), title: String(lData[i][1]) });
      }
    }

    // Look for the first active lesson that is NOT in passedLessons
    let foundCurrent = false;
    for (let i = 0; i < activeLessons.length; i++) {
      if (!passedLessons.has(activeLessons[i].id)) {
        currentLessonTitle = activeLessons[i].title;
        foundCurrent = true;
        break;
      }
    }

    if (!foundCurrent && activeLessons.length > 0) {
      // If all active lessons are passed
      currentLessonTitle = 'เคลียร์ทุกด่านแล้ว!';
    } else if (activeLessons.length === 0) {
      currentLessonTitle = 'ยังไม่มีด่าน';
    }

    return { success: true, sequence: position, currentLesson: currentLessonTitle };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * API: ข้อมูลกระดานผู้นำ (Leaderboard) ระดับท็อป 20
 * @returns {Object} รายชื่อนักเรียนลำดับสูงสุด 20 คนแรก
 */
function getLeaderboard() {
  try {
    const cache = CacheService.getScriptCache();
    const cachedLB = cache.get('CACHE_LEADERBOARD');
    if (cachedLB) return { success: true, data: JSON.parse(cachedLB) };

    ensureDatabaseSetup();
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Users');
    const data = sheet.getDataRange().getValues();
    const students = [];

    for (let i = 1; i < data.length; i++) {
      if (!data[i][0] || !data[i][1]) continue;
      
      let badges = [];
      try {
        const invStr = data[i][8];
        const inv = invStr ? (typeof invStr === 'object' ? invStr : JSON.parse(invStr)) : {};
        if (inv.badges) badges = inv.badges;
      } catch (e) {}

      students.push({
        id: data[i][0],
        name: data[i][1],
        class: data[i][2],
        xp: data[i][3] || 0,
        rank: data[i][4] || 'BRONZE',
        level: data[i][5] || 1,
        avatar: data[i][6] || '🧙‍♂️',
        coins: data[i][7] || 0,
        badges: badges
      });
    }

    // เรียงจาก XP มากไปน้อย
    students.sort((a, b) => b.xp - a.xp);
    const top20 = students.slice(0, 20);

    cache.put('CACHE_LEADERBOARD', JSON.stringify(top20), 600); // 10 minutes

    // คืนค่า Top 20
    return { success: true, data: top20 };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * API: NPC AI Tutor ถาม-ตอบ (Gemini Integration)
 * @param {string} question - คำถามจากนักเรียน
 * @param {string} context - บริบทรอบข้าง (เช่น อยู่ด่านไหน ชื่ออะไร เพื่อความสมจริง)
 * @returns {Object} คำตอบจาก AI หรือข้อผิดพลาด
 */
function askNPCAi(question, context) {
  try {
    const settingsRes = getSettings();
    if (!settingsRes.success || !settingsRes.data.GeminiAPIKey) {
      return { success: false, error: 'ไม่พบ Gemini API Key กรุณาให้ครูตั้งค่าในระบบหลังบ้านก่อนใช้งาน' };
    }

    const apiKey = settingsRes.data.GeminiAPIKey.trim();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    // ตั้งค่า System Prompt ให้สวมบทบาท
    const systemInstruction =
      "คุณคือ 'หุ่นยนต์ผู้พิทักษ์ความรู้' (AI Robot) ในโลกแห่ง RPG คุณมีหน้าที่คอยตอบคำถามและให้คำแนะนำแก่นักเรียนประถม\n" +
      "กติกาการตอบ:\n" +
      "1. ใช้ภาษาที่เป็นกันเอง สนุกสนาน และให้กำลังใจน้องๆ เหมือนหุ่นยนต์คู่หูการผจญภัย\n" +
      "2. สรรพนามแทนตัวเองคือ 'ซิงค์' (Sync) หรือ 'ผม/ฉัน' และเรียกเขาว่า 'ผู้กล้า' หรือ 'เจ้า'\n" +
      "3. อธิบายแบบสั้น กระชับ เข้าใจง่าย ความยาวพอดีเพราะเด็กประถมจะเข้าใจง่ายๆถ้าไม่ยาวเกินไป\n" +
      "4. ใช้ Emoji ประกอบให้ดูมีสีสัน เข้ากับหุ่นยนต์และโลก RPG\n" +
      "5. หากผู้กล้าถามนอกเรื่องเรียน ให้พยายามดึงกลับเข้าสู่การผจญภัยและการเรียนรู้";

    const payload = {
      "system_instruction": {
        "parts": [{ "text": systemInstruction }]
      },
      "contents": [{
        "parts": [{
          "text": `บริบทผู้เล่น: ${context || 'ไม่มีข้อมูลบรรยากาศ'}\n\nคำถามจากผู้กล้า: ${question}`
        }]
      }],
      "generationConfig": {
        "temperature": 0.7,
        "maxOutputTokens": 4096
      }
    };

    const options = {
      'method': 'post',
      'contentType': 'application/json',
      'payload': JSON.stringify(payload),
      'muteHttpExceptions': true
    };

    let responseCode = 0;
    let responseText = '';
    let maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const response = UrlFetchApp.fetch(url, options);
      responseCode = response.getResponseCode();
      responseText = response.getContentText();

      if (responseCode === 200) break;
      if ((responseCode === 503 || responseCode === 429) && attempt < maxRetries) {
        Utilities.sleep(1500 * attempt); // รอ 1.5วิ, 3วิ แล้วลองใหม่ (หนีช่วงคนแย่งกันใช้)
      } else {
        break;
      }
    }

    if (responseCode === 200) {
      const json = JSON.parse(responseText);
      if (json.candidates && json.candidates.length > 0) {
        const aiText = json.candidates[0].content.parts[0].text;
        return { success: true, answer: aiText };
      } else {
        return { success: false, error: 'ไม่มีคำตอบกลับมาจากผู้พิทักษ์' };
      }
    } else {
      return { success: false, error: `Gemini API Error (${responseCode}): ${responseText} (ลองโหลดหน้านี้ใหม่หรือกดอีกครั้ง)` };
    }
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * วิเคราะห์ผู้เรียนด้วย AI (Admin ใช้ตรวจสอบ)
 * @param {Object} studentData ข้อมูลผู้เรียน
 * @param {string} caller ผู้ที่เรียกฟังก์ชัน ("teacher")
 * @returns {Object} 
 */
function generateAIProgressReport(studentData, caller = "teacher") {
  try {
    const settingsRes = getSettings();
    if (!settingsRes.success || !settingsRes.data.GeminiAPIKey) {
      return { success: false, error: 'ไม่พบ Gemini API Key ระบบไม่สามารถเรียกใช้ AI ได้ กรุณาให้ครูตั้งค่าในระบบหลังบ้านก่อนใช้งาน' };
    }

    const apiKey = settingsRes.data.GeminiAPIKey.trim();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    let systemInstruction = "คุณคือผู้ช่วยครูวิเคราะห์พฤติกรรมและความก้าวหน้าของนักเรียนจากข้อมูลดิบ\n" +
      "จงให้คำแนะนำครูเพื่อนำไปปรับใช้ในการสอนนักเรียนคนนี้\n" +
      "วิเคราะห์เป็นภาษาไทย ใช้คำสุภาพ เป็นทางการแต่อ่านง่าย ใช้ Bullet points";

    let promptText = `ข้อมูลผู้เรียน:\n` +
      `- ชื่อ: ${studentData.name}\n` +
      `- ระดับชั้น: ${studentData.class}\n` +
      `- เลเวล: ${studentData.level} (${studentData.rank})\n` +
      `- XP รวม: ${studentData.xp}\n` +
      `- บทเรียนล่าสุดที่เข้าเรียน: ${studentData.currentLesson || 'ยังไม่เคยเข้าเรียน'}\n\n` +
      `จงวิเคราะห์ความก้าวหน้า จุดแข็ง จุดอ่อนที่อาจเกิดขึ้น และข้อเสนอแนะสำหรับครูผู้สอน`;

    const payload = {
      "system_instruction": {
        "parts": [{ "text": systemInstruction }]
      },
      "contents": [{
        "parts": [{
          "text": promptText
        }]
      }],
      "generationConfig": {
        "temperature": 0.5,
        "maxOutputTokens": 8192
      }
    };

    const options = {
      'method': 'post',
      'contentType': 'application/json',
      'payload': JSON.stringify(payload),
      'muteHttpExceptions': true
    };

    let responseCode = 0;
    let responseText = '';
    let maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const response = UrlFetchApp.fetch(url, options);
      responseCode = response.getResponseCode();
      responseText = response.getContentText();

      if (responseCode === 200) break;
      if ((responseCode === 503 || responseCode === 429) && attempt < maxRetries) {
        Utilities.sleep(1500 * attempt);
      } else {
        break;
      }
    }

    if (responseCode === 200) {
      const json = JSON.parse(responseText);
      if (json.candidates && json.candidates.length > 0) {
        const aiText = json.candidates[0].content.parts.map(p => p.text || '').join('');
        return { success: true, answer: aiText };
      } else {
        return { success: false, error: 'ไม่มีผลวิเคราะห์ส่งกลับมาจาก AI' };
      }
    } else {
      return { success: false, error: `Gemini API Error (${responseCode}): ${responseText} (พยายามเชื่อมต่อ 3 ครั้งแล้ว กรุณาลองใหม่)` };
    }
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * 🛒 API: ซื้อไอเทม
 * @param {string} userId - ไอดีผู้ผลิต
 * @param {string} itemId - ไอดีของสินค้า (potion, magnifier)
 * @param {number} cost - ราคา
 */
function buyItem(userId, itemId, cost) {
  try {
    ensureDatabaseSetup();
    // Anti-Cheat: Validate item cost on Server-Side
    const SERVER_PRICES = {
      'potion': 100,
      'magnifier': 150
    };

    const actualCost = SERVER_PRICES[itemId];
    if (actualCost === undefined) {
      return { success: false, error: 'ไอเทมนี้ไม่มีขายในระบบ' };
    }

    const ss = getSpreadsheet();
    const usersSheet = ss.getSheetByName('Users');
    const data = usersSheet.getDataRange().getValues();

    const headers = data[0];
    const idIdx = headers.indexOf('UserID');
    const coinIdx = headers.indexOf('Coins');
    const invIdx = headers.indexOf('Inventory');

    if (idIdx === -1 || coinIdx === -1 || invIdx === -1) {
      return { success: false, error: 'โครงสร้างตาราง Users ไม่ถูกต้อง (ขาด UserID/Coins/Inventory)' };
    }

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idIdx]) === String(userId)) {
        let currentCoins = Number(data[i][coinIdx]) || 0;
        if (currentCoins < actualCost) {
          return { success: false, error: 'เหรียญไม่พอจ้า' };
        }

        let inventoryStr = data[i][invIdx];
        let inventory = {};
        if (inventoryStr && typeof inventoryStr === 'string') {
          try { inventory = JSON.parse(inventoryStr); } catch (e) { }
        } else if (typeof inventoryStr === 'object') {
          inventory = inventoryStr;
        }

        // หักเงิน
        let newCoins = currentCoins - actualCost;
        usersSheet.getRange(i + 1, coinIdx + 1).setValue(newCoins);

        // เพิ่มไอเทม
        if (!inventory[itemId]) inventory[itemId] = 0;
        inventory[itemId] += 1;

        usersSheet.getRange(i + 1, invIdx + 1).setValue(JSON.stringify(inventory));

        return {
          success: true,
          coins: newCoins,
          inventory: inventory,
          message: 'ซื้อไอเทมสำเร็จ!'
        };
      }
    }
    return { success: false, error: 'ไม่พบผู้ใช้งาน' };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * 🎁 API: สุ่มกาชาอวาตาร์
 * @param {string} userId - ไอดีผู้เล่น
 * @param {number} cost - ราคาการสุ่ม (Default 500)
 */
function gachaAvatar(userId, cost = 500) {
  try {
    // Anti-Cheat: Hardcoded server cost
    const actualCost = 500;
    ensureDatabaseSetup();
    const ss = getSpreadsheet();
    const usersSheet = ss.getSheetByName('Users');
    const data = usersSheet.getDataRange().getValues();

    // ชุดอวาตาร์กาชา
    const gachaPool = [
      { emoji: '🐵', weight: 40, rarity: 'Common' },
      { emoji: '🦊', weight: 30, rarity: 'Common' },
      { emoji: '🐼', weight: 15, rarity: 'Rare' },
      { emoji: '🦄', weight: 8, rarity: 'Epic' },
      { emoji: '🐉', weight: 5, rarity: 'Legendary' },
      { emoji: '👽', weight: 2, rarity: 'Mythic' }
    ];

    const headers = data[0];
    const idIdx = headers.indexOf('UserID');
    const coinIdx = headers.indexOf('Coins');
    const avatarIdx = headers.indexOf('Avatar');

    if (idIdx === -1 || coinIdx === -1 || avatarIdx === -1) {
      return { success: false, error: 'โครงสร้างตาราง Users ไม่ถูกต้อง' };
    }

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idIdx]) === String(userId)) {
        let currentCoins = Number(data[i][coinIdx]) || 0;
        if (currentCoins < actualCost) {
          return { success: false, error: 'เหรียญไม่พอสุ่มกาชา!' };
        }

        // สุ่มหาอวาตาร์จาก weight
        let sumWeight = gachaPool.reduce((sum, item) => sum + item.weight, 0);
        let rand = Math.random() * sumWeight;
        let selectedAvatar = gachaPool[0];

        for (let j = 0; j < gachaPool.length; j++) {
          if (rand < gachaPool[j].weight) {
            selectedAvatar = gachaPool[j];
            break;
          }
          rand -= gachaPool[j].weight;
        }

        // หักเงิน และเปลี่ยน Avatar
        let newCoins = currentCoins - actualCost;
        usersSheet.getRange(i + 1, coinIdx + 1).setValue(newCoins);
        usersSheet.getRange(i + 1, avatarIdx + 1).setValue(selectedAvatar.emoji);

        // ล้าง LB แคชเพื่อให้แสดง Avatar ใหม่
        CacheService.getScriptCache().remove('CACHE_LEADERBOARD');

        return {
          success: true,
          coins: newCoins,
          avatar: selectedAvatar.emoji,
          rarity: selectedAvatar.rarity,
          message: 'ได้ตัวละครใหม่แล้ว!'
        };
      }
    }
    return { success: false, error: 'ไม่พบผู้ใช้งาน' };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * 🏆 API: ข้อมูลกระดานผู้นำแบบกิลด์ (Guild Leaderboard) จัดอันดับตามชั้นเรียน
 */
function getGuildLeaderboard() {
  try {
    const cache = CacheService.getScriptCache();
    const cachedLB = cache.get('CACHE_GUILD_LEADERBOARD');
    if (cachedLB) return { success: true, data: JSON.parse(cachedLB) };

    ensureDatabaseSetup();
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Users');
    const data = sheet.getDataRange().getValues();

    // Group XP by Class
    const classMap = {};

    for (let i = 1; i < data.length; i++) {
      if (!data[i][0] || !data[i][2]) continue; // ไม่มี ID หรือ ไม่มี Class
      const clsName = String(data[i][2]).trim();
      const xp = Number(data[i][3]) || 0;

      if (!classMap[clsName]) {
        classMap[clsName] = { className: clsName, totalXp: 0, memberCount: 0 };
      }
      classMap[clsName].totalXp += xp;
      classMap[clsName].memberCount++;
    }

    // แปลง Object ไปเป็น Array
    const guilds = Object.values(classMap);

    // ข้ามชั้นที่คะแนนเป็น 0
    const filteredGuilds = guilds.filter(g => g.totalXp > 0);

    // เรียงคะแนนจากมากไปน้อย
    filteredGuilds.sort((a, b) => b.totalXp - a.totalXp);

    // คืนค่า Top 20 Classes
    const top20Guilds = filteredGuilds.slice(0, 20);

    cache.put('CACHE_GUILD_LEADERBOARD', JSON.stringify(top20Guilds), 600);
    return { success: true, data: top20Guilds };

  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * 👤 API: ดึงข้อมูลโปรไฟล์และสถิติของผู้เล่น
 * @param {string} userId - ไอดีผู้เล่น
 */
function getStudentProfileData(userId) {
  const tStart = new Date().getTime();
  const cleanUserId = String(userId || '').trim();
  console.log('SERVER TRACE: [getStudentProfileData] starting for userId:', cleanUserId);
  
  try {
    if (!cleanUserId) {
      console.warn('SERVER TRACE: userId is missing');
      return { success: false, error: 'ไม่พบไอดีผู้เล่น' };
    }
    
    // 1. ตรวจสอบการเชื่อมต่อ
    ensureDatabaseSetup();
    const ss = getSpreadsheet();
    if (!ss) {
      console.error('SERVER TRACE: Spreadsheet not found');
      return { success: false, error: 'ไม่สามารถเชื่อมต่อฐานข้อมูลได้' };
    }
    
    const usersSheet = ss.getSheetByName('Users');
    if (!usersSheet) {
      console.error('SERVER TRACE: Users sheet not found');
      return { success: false, error: 'ไม่พบตารางรายชื่อผู้ใช้ (Users)' };
    }
    
    const uData = usersSheet.getDataRange().getValues();
    console.log('SERVER TRACE: uData length:', uData.length);
    
    if (uData.length < 1) return { success: false, error: 'ตารางรายชื่อผู้ใช้ยังไม่มีข้อมูล' };
    
    // Clean headers and find mapping
    const uHeaders = uData[0].map(h => String(h || '').trim());
    const uidIdx = uHeaders.indexOf('UserID');
    if (uidIdx === -1) {
      console.error('SERVER TRACE: UserID column not found in Users sheet headers:', uHeaders);
      return { success: false, error: 'โครงสร้างตาราง Users ผิดพลาด (ไม่พบ UserID)' };
    }
    
    // 2. หาข้อมูลผู้ใช้หลัก
    let user = null;
    for (let i = 1; i < uData.length; i++) {
      if (String(uData[i][uidIdx]).trim() === cleanUserId) {
        user = {};
        uHeaders.forEach((h, idx) => {
          if (h) {
            const key = h.toLowerCase();
            let val = uData[i][idx];
            
            // CRITICAL FIX: Parse Inventory if it's a JSON string
            if (key === 'inventory' && typeof val === 'string' && val.startsWith('{')) {
              try {
                val = JSON.parse(val);
              } catch(e) {
                console.error('Error parsing inventory:', e);
                val = { potion: 0, magnifier: 0 };
              }
            }
            user[key] = val;
          }
        });
        break;
      }
    }
    
    if (!user) {
      console.warn('SERVER TRACE: user not found for id:', cleanUserId);
      return { success: false, error: 'ไม่พบข้อมูลผู้ใช้ในระบบ' };
    }
    
    console.log('SERVER TRACE: User found:', user.name);
    
    // 3. ดึงข้อมูล Progress เพื่อคำนวณสถิติ
    const progressSheet = ss.getSheetByName('Progress');
    let completedLessons = 0;
    let totalScore = 0;
    const uniquePassedLessons = new Set();
    
    if (progressSheet) {
      const pData = progressSheet.getDataRange().getValues();
      console.log('SERVER TRACE: pData length:', pData.length);
      
      if (pData.length > 1) {
        const pHeaders = pData[0].map(h => String(h || '').trim());
        const pUidIdx = pHeaders.indexOf('UserID');
        const pLessonIdx = pHeaders.indexOf('LessonID');
        const pStatusIdx = pHeaders.indexOf('Status');
        const pScoreIdx = pHeaders.indexOf('Score');
        
        if (pUidIdx !== -1 && pStatusIdx !== -1 && pScoreIdx !== -1) {
          for (let i = 1; i < pData.length; i++) {
            if (String(pData[i][pUidIdx]).trim() === cleanUserId) {
              const status = String(pData[i][pStatusIdx] || '');
              const lessonId = String(pData[i][pLessonIdx] || '');
              
              if (status === 'Passed' || status === 'Completed') {
                if (lessonId) uniquePassedLessons.add(lessonId);
              }
              totalScore += (Number(pData[i][pScoreIdx]) || 0);
            }
          }
        }
      }
    }
    completedLessons = uniquePassedLessons.size;
    
    // 4. ดึงจำนวนบทเรียนทั้งหมด
    const lessonsSheet = ss.getSheetByName('Lessons');
    let totalLessons = 0;
    if (lessonsSheet) {
      totalLessons = Math.max(0, lessonsSheet.getLastRow() - 1);
    }
    
    console.log('SERVER TRACE: completedLessons:', completedLessons, 'totalLessons:', totalLessons);
    console.log('SERVER TRACE: Execution time:', (new Date().getTime() - tStart), 'ms');
    
    const result = {
      success: true,
      profile: {
        ...user,
        stats: {
          completedLessons: completedLessons,
          totalLessons: totalLessons,
          totalScore: totalScore,
          completionRate: totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0
        }
      }
    };

    // CRITICAL: Sanitize data for Google Apps Script Serialization
    // ป้องกันการส่ง Objects แปลกๆ ที่ GAS เผลออ่านจาก Sheet กลับไปบ้านแล้วทำให้หน้าบ้านได้รับค่า null
    return JSON.parse(JSON.stringify(result));

  } catch (e) {
    console.error('CRITICAL SERVER ERROR in getStudentProfileData:', e.toString());
    return { success: false, error: 'เกิดข้อผิดพลาดฉุกเฉินบนเซิร์ฟเวอร์: ' + e.toString() };
  }
}

/**
 * ==========================================
 * World Boss (Motion-Based Learning) API Functions
 * ==========================================
 */

/**
 * API: ดึงรายชื่อเวิลด์บอสที่เปิดใช้งานทั้งหมด
 */
function getWorldBossConfig() {
  try {
    ensureDatabaseSetup();
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('WorldBoss_Config');
    if (!sheet) return { success: false, error: 'ไม่พบตาราง WorldBoss_Config' };
    
    const data = sheet.getDataRange().getValues();
    const bosses = [];
    const headers = data[0];
    
    const col = {};
    headers.forEach((h, idx) => col[h] = idx);
    
    for (let i = 1; i < data.length; i++) {
      const isActive = data[i][col.IsActive];
      if (isActive === true || String(isActive).toUpperCase() === 'TRUE' || isActive === 1) {
        bosses.push({
          id: String(data[i][col.BossID]),
          name: String(data[i][col.BossName]),
          poseType: String(data[i][col.PoseType]),
          targetReps: Number(data[i][col.TargetReps]) || 10,
          maxHp: Number(data[i][col.BossMaxHP]) || 100,
          rewardCoins: Number(data[i][col.RewardCoins]) || 100,
          rewardXp: Number(data[i][col.RewardXP]) || 100
        });
      }
    }
    return { success: true, data: bosses };
  } catch (e) {
    console.error('Error in getWorldBossConfig:', e);
    return { success: false, error: e.toString() };
  }
}

/**
 * API: บันทึกคะแนนสถิติเวลาสู้บอส (บันทึกทับเฉพาะเมื่อเวลาใหม่เร็วกว่าสถิติเดิมของผู้เล่น)
 * และคำนวณการแจก Coins / XP พร้อมเช็คการเพิ่มเลเวลและจัดแรงก์แบบ Server-Authoritative
 */
function submitWorldBossScore(userId, bossId, timeSeconds, bonusCoins) {
  try {
    ensureDatabaseSetup();
    const ss = getSpreadsheet();
    
    // 1. ตรวจสอบข้อมูลผู้เล่นในตาราง Users
    const usersSheet = ss.getSheetByName('Users');
    const uData = usersSheet.getDataRange().getValues();
    const uHeaders = uData[0];
    const uCol = {};
    uHeaders.forEach((h, idx) => uCol[h] = idx);
    
    let userRowIdx = -1;
    let name = '';
    let className = '';
    let coins = 0;
    let xp = 0;
    
    for (let i = 1; i < uData.length; i++) {
      if (String(uData[i][uCol.UserID]) === String(userId)) {
        userRowIdx = i + 1;
        name = String(uData[i][uCol.Name]);
        className = String(uData[i][uCol.Class]);
        coins = Number(uData[i][uCol.Coins]) || 0;
        xp = Number(uData[i][uCol.XP]) || 0;
        break;
      }
    }
    
    if (userRowIdx === -1) {
      return { success: false, error: 'ไม่พบข้อมูลผู้เล่น' };
    }
    
    // 2. ตรวจสอบตั้งค่าบอสในตาราง WorldBoss_Config
    const configSheet = ss.getSheetByName('WorldBoss_Config');
    const cData = configSheet.getDataRange().getValues();
    const cHeaders = cData[0];
    const cCol = {};
    cHeaders.forEach((h, idx) => cCol[h] = idx);
    
    let rewardCoins = 50;
    let rewardXp = 50;
    let bossName = 'World Boss';
    for (let i = 1; i < cData.length; i++) {
      if (String(cData[i][cCol.BossID]) === String(bossId)) {
        bossName = String(cData[i][cCol.BossName]);
        rewardCoins = Number(cData[i][cCol.RewardCoins]) || 50;
        rewardXp = Number(cData[i][cCol.RewardXP]) || 50;
        break;
      }
    }
    
    // 3. ตรวจสอบ/บันทึกคะแนนในตาราง WorldBoss_Scores
    const scoresSheet = ss.getSheetByName('WorldBoss_Scores');
    const sData = scoresSheet.getDataRange().getValues();
    const sHeaders = sData[0];
    const sCol = {};
    sHeaders.forEach((h, idx) => sCol[h] = idx);
    
    let scoreRowIdx = -1;
    const isWb002 = String(bossId).indexOf('WB002') === 0;
    let previousBest = isWb002 ? 0 : Infinity;
    
    for (let i = 1; i < sData.length; i++) {
      if (String(sData[i][sCol.UserID]) === String(userId) && String(sData[i][sCol.BossID]) === String(bossId)) {
        scoreRowIdx = i + 1;
        previousBest = Number(sData[i][sCol.BestTimeSeconds]) || (isWb002 ? 0 : Infinity);
        break;
      }
    }
    
    const now = new Date();
    const tz = ss.getSpreadsheetTimeZone();
    const todayStr = Utilities.formatDate(now, tz, "yyyy-MM-dd");
    const cleanTime = Math.round(Number(timeSeconds) * 100) / 100; // ตัดทศนิยม 2 ตำแหน่งเพื่อความแม่นยำและสวยงาม
    
    let isPersonalBest = false;
    
    if (scoreRowIdx === -1) {
      // ยังไม่เคยมีประวัติเล่นบอสตัวนี้ ให้บันทึกแถวใหม่
      scoresSheet.appendRow([userId, name, className, bossId, cleanTime, todayStr]);
      isPersonalBest = true;
    } else {
      const condition = isWb002 ? (cleanTime > previousBest) : (cleanTime < previousBest);
      if (condition) {
      // ทำเวลาได้เร็วขึ้น (ค่าเวลาน้อยลง = เร็วขึ้น) ให้ทำการเขียนทับ
      scoresSheet.getRange(scoreRowIdx, sCol.BestTimeSeconds + 1).setValue(cleanTime);
      scoresSheet.getRange(scoreRowIdx, sCol.Date + 1).setValue(todayStr);
      scoresSheet.getRange(scoreRowIdx, sCol.Name + 1).setValue(name); // อัปเดตเผื่อเปลี่ยนชื่อในภายหลัง
      scoresSheet.getRange(scoreRowIdx, sCol.Class + 1).setValue(className); // อัปเดตเผื่อเลื่อนชั้น/ย้ายห้องเรียน
      isPersonalBest = true;
      }
    }
    
    // 4. มอบรางวัลลงตารางผู้ใช้งาน (Users)
    const cleanBonus = Number(bonusCoins) || 0;
    const finalCoins = coins + rewardCoins + cleanBonus;
    const finalXp = xp + rewardXp;
    
    // คำนวณเลเวลใหม่จาก XP (1 เลเวลต่อ 100 XP)
    const newLevel = Math.floor(finalXp / 100) + 1;
    
    // คำนวณ Rank ตามเกณฑ์ XP ในระบบเดิม
    let newRank = 'BRONZE';
    if (finalXp >= 300) newRank = 'SILVER';
    if (finalXp >= 600) newRank = 'GOLD';
    if (finalXp >= 1200) newRank = 'PLATINUM';
    if (finalXp >= 2500) newRank = 'DIAMOND';
    if (finalXp >= 5000) newRank = 'MASTER';
    if (finalXp >= 10000) newRank = 'GRANDMASTER';
    
    usersSheet.getRange(userRowIdx, uCol.Coins + 1).setValue(finalCoins);
    usersSheet.getRange(userRowIdx, uCol.XP + 1).setValue(finalXp);
    usersSheet.getRange(userRowIdx, uCol.Level + 1).setValue(newLevel);
    usersSheet.getRange(userRowIdx, uCol.Rank + 1).setValue(newRank);
    
    return {
      success: true,
      isPersonalBest: isPersonalBest,
      previousBest: previousBest === Infinity ? null : previousBest,
      bestTime: isPersonalBest ? cleanTime : previousBest,
      rewardCoins: rewardCoins,
      rewardXp: rewardXp,
      newCoins: finalCoins,
      newXp: finalXp,
      bossName: bossName
    };
  } catch (e) {
    console.error('Error in submitWorldBossScore:', e);
    return { success: false, error: e.toString() };
  }
}

/**
 * API: ดึงอันดับ Top 10 ที่เอาชนะบอสได้เร็วที่สุด (เวลาน้อยที่สุด)
 */
function getWorldBossLeaderboard(bossId) {
  try {
    ensureDatabaseSetup();
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('WorldBoss_Scores');
    if (!sheet) return { success: false, error: 'ไม่พบตารางอันดับสถิติ' };
    
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return { success: true, data: [] };
    
    const headers = data[0];
    const col = {};
    headers.forEach((h, idx) => col[h] = idx);
    
    const isWb002 = String(bossId).indexOf('WB002') === 0;
    const leaderboard = [];
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][col.BossID]) === String(bossId)) {
        leaderboard.push({
          userId: String(data[i][col.UserID]),
          name: String(data[i][col.Name]),
          className: String(data[i][col.Class]),
          bestTime: Number(data[i][col.BestTimeSeconds]) || (isWb002 ? 0 : 9999),
          date: String(data[i][col.Date])
        });
      }
    }
    
    // เรียงตามเวลาที่ดีที่สุด จากน้อยไปมาก (เวลาทำได้น้อยสุด = เร็วสุด = อันดับ 1)
    if (isWb002) {
      leaderboard.sort((a, b) => b.bestTime - a.bestTime);
    } else {
      leaderboard.sort((a, b) => a.bestTime - b.bestTime);
    }
    
    // เอาเฉพาะสิบคนแรก
    const top10 = leaderboard.slice(0, 10);
    return { success: true, data: top10 };
  } catch (e) {
    console.error('Error in getWorldBossLeaderboard:', e);
    return { success: false, error: e.toString() };
  }
}

/**
 * Utility: ค้นหาไอดีบทเรียนล่าสุดที่ผู้ใช้ยังไม่ผ่าน เพื่อนำคำถามมาสุ่มออกในมาริโอ้ควิซ
 * @param {string} userId - รหัสผู้ใช้
 * @returns {string|null} ไอดีบทเรียน หรือ null
 */
function getUserCurrentLessonId(userId) {
  try {
    ensureDatabaseSetup();
    const ss = getSpreadsheet();
    
    const pSheet = ss.getSheetByName('Progress');
    const pData = pSheet.getDataRange().getValues();
    let passedLessons = new Set();
    for (let i = 1; i < pData.length; i++) {
      if (String(pData[i][0]) === String(userId) && String(pData[i][2]) === 'Passed') {
        passedLessons.add(String(pData[i][1]));
      }
    }

    const lSheet = ss.getSheetByName('Lessons');
    const lData = lSheet.getDataRange().getValues();
    
    let activeLessons = [];
    for (let i = 1; i < lData.length; i++) {
      if (lData[i][0]) {
        activeLessons.push(String(lData[i][0]));
      }
    }

    for (let i = 0; i < activeLessons.length; i++) {
      if (!passedLessons.has(activeLessons[i])) {
        return activeLessons[i];
      }
    }
    
    if (activeLessons.length > 0) {
      return activeLessons[activeLessons.length - 1];
    }
    return null;
  } catch (e) {
    console.error('Error in getUserCurrentLessonId:', e);
    return null;
  }
}
