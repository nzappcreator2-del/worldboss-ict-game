/**
 * ==========================================
 * API สำหรับ ADMIN PANEL (ระบบจัดการข้อมูลหลังบ้าน)
 * ==========================================
 */

/**
 * 📚 จัดการบทเรียน: บันทึกข้อมูลด่าน (เพิ่มหรือแก้ไข)
 */
function saveAdminLesson(data, pin) {
  if (!verifyAdminPinLock(pin)) return { success: false, error: 'Unauthorized: Invalid Admin PIN' };
  try {
    ensureDatabaseSetup();
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Lessons');
    const sheetData = sheet.getDataRange().getValues();
    
    // แบบแก้ไข: ถ้ามี ID เดิมส่งมาให้หาแถวแก้
    if (data.id) {
       for(let i=1; i<sheetData.length; i++){
          if(sheetData[i][0] === data.id) {
             sheet.getRange(i+1, 2).setValue(data.title);
             sheet.getRange(i+1, 3).setValue(data.description);
             sheet.getRange(i+1, 4).setValue(data.videoUrl);
             sheet.getRange(i+1, 5).setValue(data.icon);
             sheet.getRange(i+1, 6).setValue(data.isActive);
             sheet.getRange(i+1, 7).setValue(data.enablePretest || false);
             sheet.getRange(i+1, 8).setValue(data.worksheetUrl || '');
             sheet.getRange(i+1, 9).setValue(data.content || '');
             
             CacheService.getScriptCache().remove('CACHE_LESSONS_DATA');
             return { success: true, id: data.id, message: 'Updated successfully' };
          }
       }
    }

    // แบบเพิ่มใหม่: หา ID ล่าสุดแล้วบวก 1
    let maxNum = 0;
    for(let i=1; i<sheetData.length; i++){
       const match = sheetData[i][0].toString().match(/L(\d+)/);
       if(match){
          const num = parseInt(match[1]);
          if(num > maxNum) maxNum = num;
       }
    }
    const newId = 'L' + (maxNum + 1);
    
    sheet.appendRow([
       newId,
       data.title,
       data.description,
       data.videoUrl,
       data.icon,
       data.isActive,
       data.enablePretest || false,
       data.worksheetUrl || '',
       data.content || ''
    ]);

    CacheService.getScriptCache().remove('CACHE_LESSONS_DATA');
    return { success: true, id: newId, message: 'Created successfully' };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * 📚 จัดการบทเรียน: ลบด่าน และลบคำถามที่ผูกมัดไปด้วย
 */
function deleteAdminLesson(lessonId, pin) {
   if (!verifyAdminPinLock(pin)) return { success: false, error: 'Unauthorized: Invalid Admin PIN' };
   try {
    ensureDatabaseSetup();
    const ss = getSpreadsheet();
    const lessonSheet = ss.getSheetByName('Lessons');
    const qSheet = ss.getSheetByName('Questions');
    
    // ลบด่าน
    const lData = lessonSheet.getDataRange().getValues();
    for(let i=lData.length-1; i>=1; i--){
        if(lData[i][0] === lessonId) {
            lessonSheet.deleteRow(i+1);
            break;
        }
    }

    // ลบคำถามที่ผูกกับด่านนี้ทิ้งไปด้วย
    const qData = qSheet.getDataRange().getValues();
    for(let i=qData.length-1; i>=1; i--){
        if(qData[i][1] === lessonId) {
            qSheet.deleteRow(i+1);
        }
    }

    CacheService.getScriptCache().remove('CACHE_LESSONS_DATA');
    return { success: true };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * 📝 จัดการคำถาม: ดึงข้อสอบของแต่ละด่านและประเภท
 */
function getAdminQuestionsByLessonAndType(lessonId, type, pin) {
  if (!verifyAdminPinLock(pin)) return { success: false, error: 'Unauthorized: Invalid Admin PIN' };
  try {
    ensureDatabaseSetup();
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Questions');
    const data = sheet.getDataRange().getValues();
    const questions = [];

    // ค้นหาตามด่านและประเภท
    for (let i = 1; i < data.length; i++) {
        const qLessonId = String(data[i][1]);
        const qType = String(data[i][9] || 'posttest').toLowerCase();
        
        if (qLessonId === String(lessonId) && qType === String(type).toLowerCase()) {
            questions.push({
                id: data[i][0],
                lessonId: data[i][1],
                text: data[i][2],
                options: [data[i][3], data[i][4], data[i][5], data[i][6]],
                answer: parseInt(data[i][7]),
                explanation: data[i][8] || '',
                type: qType
            });
        }
    }

    return { success: true, data: questions };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * 📝 จัดการคำถาม: บันทึกข้อสอบแบบชุด (ลบของเก่าแล้วใส่ใหม่)
 */
function saveBatchQuestions(lessonId, type, questionsArray, pin) {
  if (!verifyAdminPinLock(pin)) return { success: false, error: 'Unauthorized: Invalid Admin PIN' };
  try {
    ensureDatabaseSetup();
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Questions');
    let data = sheet.getDataRange().getValues();
    
    // 1. ลบคำถามเก่าทั้งหมดที่หน้าตาตรงกับด่านและประเภทนี้ (จากล่างขึ้นบนกันแถวเลื่อน)
    for (let i = data.length - 1; i >= 1; i--) {
        const qLessonId = String(data[i][1]);
        const qType = String(data[i][9] || 'posttest').toLowerCase();
        
        if (qLessonId === String(lessonId) && qType === String(type).toLowerCase()) {
            sheet.deleteRow(i + 1);
        }
    }
    
    // 2. ถ้ามีคำถามใหม่เข้ามา ค่อย insert ลงไปใหม่ทั้งหมด
    if (questionsArray && questionsArray.length > 0) {
        // หา ID มากสุดในระบบปัจจุบันเพื่อสร้าง ID ลำดับถัดไป
        data = sheet.getDataRange().getValues(); // โหลดใหม่หลังลบ
        let maxNum = 0;
        for(let i=1; i<data.length; i++){
           const match = data[i][0].toString().match(/Q(\d+)/);
           if(match){
              const num = parseInt(match[1]);
              if(num > maxNum) maxNum = num;
           }
        }
        
        // วน Loop เขียนข้อมูลลงชีต
        for (let j = 0; j < questionsArray.length; j++) {
            const q = questionsArray[j];
            maxNum++;
            const newId = 'Q' + maxNum;
            
            sheet.appendRow([
               newId,
               lessonId,
               q.text,
               q.options[0],
               q.options[1],
               q.options[2],
               q.options[3],
               q.answer,
               q.explanation,
               String(type).toLowerCase()
            ]);
        }
    }

    return { success: true, message: 'บันทึกข้อสอบเสร็จสมบูรณ์' };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * 👥 จัดการผู้เล่น: ดึงรายชื่อนักเรียนพร้อมข้อมูลลึกขึ้น (Level, Progress)
 */
function getAdminStudents(pin) {
  if (!verifyAdminPinLock(pin)) return { success: false, error: 'Unauthorized: Invalid Admin PIN' };
  try {
    ensureDatabaseSetup();
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Users');
    const data = sheet.getDataRange().getValues();
    const students = [];

    // ข้อมูล Progress และ Lessons เพื่อหาว่าเรียนถึงไหนด่านไหน
    const pSheet = ss.getSheetByName('Progress');
    const pData = pSheet.getDataRange().getValues();
    
    const lSheet = ss.getSheetByName('Lessons');
    const lData = lSheet.getDataRange().getValues();
    
    let activeLessons = [];
    for(let i=1; i<lData.length; i++) {
       if(lData[i][0]) {
           activeLessons.push({id: String(lData[i][0]), title: String(lData[i][1])});
       }
    }

    let userProgressMap = {};
    for(let i=1; i<pData.length; i++) {
        let uId = String(pData[i][0]);
        let lId = String(pData[i][1]);
        let status = String(pData[i][2]);
        if (status === 'Passed') {
            if (!userProgressMap[uId]) userProgressMap[uId] = new Set();
            userProgressMap[uId].add(lId);
        }
    }

    // โครงสร้าง: UserID(0), Name(1), Class(2), XP(3), Rank(4), Level(5), Avatar(6)
    for (let i = 1; i < data.length; i++) {
      if (!data[i][0] || !data[i][1]) continue;
      
      let userId = String(data[i][0]);
      let passedLessons = userProgressMap[userId] || new Set();
      
      let currentLessonTitle = 'เริ่มต้น';
      let foundCurrent = false;
      for (let j=0; j<activeLessons.length; j++) {
          if (!passedLessons.has(activeLessons[j].id)) {
              currentLessonTitle = activeLessons[j].title;
              foundCurrent = true;
              break;
          }
      }
      
      if (!foundCurrent && activeLessons.length > 0) {
          currentLessonTitle = 'เคลียร์ทุกด่านแล้ว!';
      } else if (activeLessons.length === 0) {
          currentLessonTitle = 'ยังไม่มีด่าน';
      }

      students.push({
        id: data[i][0],
        name: data[i][1],
        class: data[i][2],
        xp: data[i][3] || 0,
        rank: data[i][4] || 'BRONZE',
        level: data[i][5] || 1,
        avatar: data[i][6] || '🧙‍♂️',
        currentLesson: currentLessonTitle
      });
    }
    return { success: true, data: students };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * 👥 จัดการผู้เล่น: รีเซ็ตความก้าวหน้าของผู้คนนั้นๆ ให้เริ่มใหม่ (XP=0, Level=1)
 */
function resetStudentData(userId, pin) {
  if (!verifyAdminPinLock(pin)) return { success: false, error: 'Unauthorized: Invalid Admin PIN' };
  try {
    ensureDatabaseSetup();
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Users');
    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    // สร้าง Map ตำแหน่งคอลัมน์แบบ Dynamic
    const col = {};
    const requiredCols = ['UserID', 'XP', 'Rank', 'Level', 'Coins', 'Inventory', 'LastLogin', 'Streak'];
    requiredCols.forEach(c => col[c] = headers.indexOf(c));

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][col.UserID]) === String(userId)) {
        // รีเซ็ตค่าสถิติหลัก
        sheet.getRange(i + 1, col.XP + 1).setValue(0);
        sheet.getRange(i + 1, col.Rank + 1).setValue('BRONZE');
        sheet.getRange(i + 1, col.Level + 1).setValue(1);
        sheet.getRange(i + 1, col.Coins + 1).setValue(0);
        
        // รีเซ็ต Inventory และระบบเควส
        const defaultInv = {
          "potion": 0,
          "magnifier": 0,
          "dailyDate": "",
          "dailyDone": [],
          "dailyProgress": { "play1": 0, "correct5": 0 },
          "dailyAnswers": []
        };
        sheet.getRange(i + 1, col.Inventory + 1).setValue(JSON.stringify(defaultInv));
        
        // รีเซ็ตข้อมูล Login & Streak
        if (col.LastLogin !== -1) sheet.getRange(i + 1, col.LastLogin + 1).setValue('');
        if (col.Streak !== -1) sheet.getRange(i + 1, col.Streak + 1).setValue(0);
        
        // ลบประวัติในชีต Progress 
        const progressSheet = ss.getSheetByName('Progress');
        if (progressSheet) {
          const pData = progressSheet.getDataRange().getValues();
          for (let j = pData.length - 1; j >= 1; j--) {
            if (String(pData[j][0]) === String(userId)) {
              progressSheet.deleteRow(j + 1);
            }
          }
        }

        const cache = CacheService.getScriptCache();
        cache.remove('CACHE_REGISTERED_USERS');
        cache.remove('CACHE_LEADERBOARD');
        
        return { success: true };
      }
    }
    return { success: false, error: 'ไม่พบผู้เล่น' };
  } catch (e) {
    console.error('Error in resetStudentData:', e);
    return { success: false, error: e.toString() };
  }
}

/**
 * 👥 จัดการผู้เล่น: ลบข้อมูลผู้ใช้ออกจากระบบถาวร
 */
function deleteStudentData(userId, pin) {
  if (!verifyAdminPinLock(pin)) return { success: false, error: 'Unauthorized: Invalid Admin PIN' };
  try {
    ensureDatabaseSetup();
    const ss = getSpreadsheet();
    const usersSheet = ss.getSheetByName('Users');
    const progressSheet = ss.getSheetByName('Progress');

    // ลบจากชีต Users
    const uData = usersSheet.getDataRange().getValues();
    for (let i = uData.length-1; i >= 1; i--) {
      if (uData[i][0] === userId) {
        usersSheet.deleteRow(i+1);
        break;
      }
    }

    // ลบประวัติจากชีต Progress
    const pData = progressSheet.getDataRange().getValues();
    for (let i = pData.length-1; i >= 1; i--) {
      if (pData[i][0] === userId) {
        progressSheet.deleteRow(i+1);
      }
    }

    const cache = CacheService.getScriptCache();
    cache.remove('CACHE_REGISTERED_USERS');
    cache.remove('CACHE_LEADERBOARD');

    return { success: true };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * 👥 จัดการผู้เล่น: รีเซ็ตข้อมูลทุกคนทั้งหมดในคราวเดียว
 */
function resetAllStudentData(classFilter, pin) {
  if (!verifyAdminPinLock(pin)) return { success: false, error: 'Unauthorized: Invalid Admin PIN' };
  try {
    ensureDatabaseSetup();
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Users');
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    // สร้าง Map ตำแหน่งคอลัมน์แบบ Dynamic
    const col = {};
    const requiredCols = ['UserID', 'Name', 'Class', 'XP', 'Rank', 'Level', 'Coins', 'Inventory', 'LastLogin', 'Streak'];
    requiredCols.forEach(c => col[c] = headers.indexOf(c));

    let count = 0;
    let targetUserIds = [];
    const defaultInv = JSON.stringify({
      "potion": 0,
      "magnifier": 0,
      "dailyDate": "",
      "dailyDone": [],
      "dailyProgress": { "play1": 0, "correct5": 0 },
      "dailyAnswers": []
    });

    for (let i = 1; i < data.length; i++) {
      if (!data[i][col.UserID]) continue;
      // ถ้ามี filter ชั้นเรียน ให้รีเซ็ตเฉพาะชั้นนั้น
      if (classFilter && String(data[i][col.Class]) !== String(classFilter)) continue;
      
      targetUserIds.push(String(data[i][col.UserID]));
      
      sheet.getRange(i + 1, col.XP + 1).setValue(0);
      sheet.getRange(i + 1, col.Rank + 1).setValue('BRONZE');
      sheet.getRange(i + 1, col.Level + 1).setValue(1);
      sheet.getRange(i + 1, col.Coins + 1).setValue(0);
      sheet.getRange(i + 1, col.Inventory + 1).setValue(defaultInv);
      
      if (col.LastLogin !== -1) sheet.getRange(i + 1, col.LastLogin + 1).setValue('');
      if (col.Streak !== -1) sheet.getRange(i + 1, col.Streak + 1).setValue(0);
      
      count++;
    }

    // ลบประวัติในชีต Progress ของผู้เล่นเหล่านี้
    const progressSheet = ss.getSheetByName('Progress');
    if (progressSheet && targetUserIds.length > 0) {
      const pData = progressSheet.getDataRange().getValues();
      for (let j = pData.length - 1; j >= 1; j--) {
        if (targetUserIds.includes(String(pData[j][0]))) {
          progressSheet.deleteRow(j + 1);
        }
      }
    }

    const cache = CacheService.getScriptCache();
    cache.remove('CACHE_REGISTERED_USERS');
    cache.remove('CACHE_LEADERBOARD');

    return { success: true, count: count };
  } catch (e) {
    console.error('Error in resetAllStudentData:', e);
    return { success: false, error: e.toString() };
  }
}

/**
 * ⚙️ ตั้งค่า: ดึงค่า Settings ระบบออกมา
 */
function getSettings() {
  try {
    const cache = CacheService.getScriptCache();
    const cachedSettings = cache.get('CACHE_SETTINGS');
    if (cachedSettings) return { success: true, data: JSON.parse(cachedSettings) };

    ensureDatabaseSetup();
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Settings');
    const data = sheet.getDataRange().getValues();
    const settings = {};

    for (let i = 1; i < data.length; i++) {
      if (data[i][0]) {
        let val = data[i][1];
        // ป้องกัน Google Sheets แปลงค่าเป็น Date object อัตโนมัติ
        if (val instanceof Date) {
          // ค่าที่เป็น Date ไม่ใช่สิ่งที่ต้องการในระบบ Settings — ใช้ค่าว่างแทน
          val = '';
        }
        settings[String(data[i][0])] = String(val);
      }
    }

    cache.put('CACHE_SETTINGS', JSON.stringify(settings), 600); // 10 minutes

    return { success: true, data: settings };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * ⚙️ ตั้งค่า: บันทึกข้อมูล Settings เข้าระบบ
 */
function saveSettings(settingsObj, pin) {
  if (!verifyAdminPinLock(pin)) return { success: false, error: 'Unauthorized: Invalid Admin PIN' };
  try {
    ensureDatabaseSetup();
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Settings');
    const data = sheet.getDataRange().getValues();

    // อัปเดตค่าที่มีอยู่ หรือเพิ่มใหม่
    for (const key in settingsObj) {
      let found = false;
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] === key) {
          data[i][1] = String(settingsObj[key]); // บังคับเป็น String เพื่อป้องกัน Auto-format
          found = true;
          break;
        }
      }
      if (!found) {
        data.push([String(key), String(settingsObj[key])]);
      }
    }

    // เขียนข้อมูลชุดใหม่ทับลงไปในทีเดียว (Batch Update) เร็วกว่าเดิมมาก
    const range = sheet.getRange(1, 1, data.length, 2);
    // บังคับ format คอลัมน์ Value เป็น Plain Text ก่อนเขียน ป้องกัน Sheets auto-convert เป็น Date
    sheet.getRange(1, 2, data.length, 1).setNumberFormat('@');
    range.setValues(data);

    CacheService.getScriptCache().remove('CACHE_SETTINGS');
    return { success: true, message: 'Settings saved' };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * ⚙️ ยืนยันรหัสเข้าสู่ Admin Panel
 */
function verifyAdminPin(pin) {
  try {
    ensureDatabaseSetup();
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Settings');
    const data = sheet.getDataRange().getValues();
    
    let dbPin = '1234'; // Fallback
    for (let i = 1; i < data.length; i++) {
        if (data[i][0] === 'AdminPIN') {
            dbPin = String(data[i][1]).trim();
            break;
        }
    }
    
    // คืนค่าแค่ true/false เท่านั้นเพื่อความปลอดภัย
    return { success: true, isValid: String(pin).trim() === dbPin };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * 🔒 ตรวจสอบ PIN สำหรับการทำรายการของ Admin (Server-side Auth)
 */
function verifyAdminPinLock(pinToCheck) {
  if (!pinToCheck) return false;
  const settingsRes = getSettings();
  const dbPin = settingsRes.success && settingsRes.data.AdminPIN ? String(settingsRes.data.AdminPIN).trim() : '1234';
  return String(pinToCheck).trim() === dbPin;
}

/**
 * ==========================================
 * ระบบจัดการกระดานข่าวสาร (News & Announcements)
 * ==========================================
 */

/**
 * 📢 ดึงข่าวสารทั้งหมด (สำหรับ Admin)
 */
function getAllNewsAdmin(pin) {
  if (!verifyAdminPinLock(pin)) return { success: false, error: 'Unauthorized: Invalid Admin PIN' };
  try {
    ensureDatabaseSetup();
    const sheet = getSpreadsheet().getSheetByName('News');
    if (!sheet) return { success: false, error: 'ไม่พบชีต News' };
    
    const data = sheet.getDataRange().getValues();
    const newsList = [];
    
    for (let i = 1; i < data.length; i++) {
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
            isActive: data[i][6] === true || data[i][6] === 'true' || data[i][6] === 'TRUE'
        });
    }
    
    // เรียงอันดับล่าสุดขึ้นก่อน
    newsList.reverse();
    return { success: true, data: newsList };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * 📢 บันทึกข่าวสาร (เพิ่มใหม่ / อัปเดต)
 */
function saveNewsItem(item, pin) {
  if (!verifyAdminPinLock(pin)) return { success: false, error: 'Unauthorized: Invalid Admin PIN' };
  try {
    ensureDatabaseSetup();
    const sheet = getSpreadsheet().getSheetByName('News');
    let data = sheet.getDataRange().getValues();
    
    // เคลียร์ Cache เพื่อให้ทางฝั่งผู้เล่นเห็นข้อมูลใหม่ทันที
    CacheService.getScriptCache().remove('CACHE_NEWS');
    
    const d = new Date();
    const currentDate = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear() + 543}`;
    
    if (item.id) {
        // อัปเดตข่าวเดิม
        for (let i = 1; i < data.length; i++) {
            if (data[i][0] == item.id) {
                // อัปเดต
                sheet.getRange(i + 1, 2, 1, 6).setValues([[
                    item.icon, item.type, item.title, item.content, item.date || currentDate, item.isActive
                ]]);
                return { success: true, message: 'บันทึกอัปเดตประกาศสำเร็จ' };
            }
        }
    }
    
    // ถ้าไม่เจอ ID หรือไม่มี ID แสดงว่าสร้างใหม่
    const newId = 'N' + new Date().getTime();
    sheet.appendRow([
        newId, 
        item.icon || '📌', 
        item.type || 'NEWS', 
        item.title, 
        item.content, 
        currentDate, 
        item.isActive !== undefined ? item.isActive : true
    ]);
    
    return { success: true, message: 'เพิ่มประกาศใหม่สำเร็จ' };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * 📢 ลบข่าวสาร
 */
function deleteNewsItem(id, pin) {
  if (!verifyAdminPinLock(pin)) return { success: false, error: 'Unauthorized: Invalid Admin PIN' };
  try {
    const sheet = getSpreadsheet().getSheetByName('News');
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
        if (data[i][0] == id) {
            sheet.deleteRow(i + 1);
            CacheService.getScriptCache().remove('CACHE_NEWS');
            return { success: true, message: 'ลบประกาศเรียบร้อยแล้ว' };
        }
    }
    return { success: false, error: 'ไม่พบ ID ข่าวที่จะลบ' };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * ==========================================
 * ระบบ AI Generator (Gemini Integration)
 * ==========================================
 */

/**
 * ✨ สร้างเนื้อหาและข้อสอบด้วย Gemini API ในคลิกเดียว
 * @param {string} topic - หัวข้อที่ต้องการให้ AI สร้าง
 * @param {number} numQuestions - จำนวนข้อสอบที่ต้องการ (1-10)
 */
function generateLessonAndQuizWithGemini(topic, numQuestions, pin) {
  if (!verifyAdminPinLock(pin)) return { success: false, error: 'Unauthorized: Invalid Admin PIN' };
  try {
    // 1. ดึง API Key จาก Settings
    const settingsRes = getSettings();
    if (!settingsRes.success || !settingsRes.data.GeminiAPIKey) {
        return { success: false, error: 'ไม่พบ Gemini API Key กรุณาระบุในหน้าตั้งค่าก่อนใช้งาน' };
    }
    const apiKey = settingsRes.data.GeminiAPIKey.trim();

    // 2. จัดเตรียม URL (ใช้ Gemini 2.5 Flash)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    
    // 3. จัดเตรียม Prompt แบบเจาะจงให้ตอบกลับเป็น JSON Structure เท่านั้น
    const systemInstruction = `คุณคือผู้เชี่ยวชาญด้านการออกแบบสื่อการเรียนการสอนสำหรับเด็กประถม
จงสรุปเนื้อหาบทเรียนและสร้างข้อสอบปรนัย (4 ตัวเลือก) ในหัวข้อ: "${topic}"

ข้อกำหนดเรื่องข้อสอบ:
- จำนวนข้อสอบที่ต้องการ: ${numQuestions} ข้อ
- ระดับความยาก: เหมาะสำหรับเด็กประถม (เรียงจากง่ายไปยาก)
- ตัวเลือกต้องสมเหตุสมผลและมีเฉลยพร้อมอธิบายชัดเจน
- สำคัญมาก: ต้องสุ่มตำแหน่งคำตอบที่ถูกต้อง (1, 2, 3, 4) ให้คละกันไป ห้ามให้เฉลยอยู่ตำแหน่งเดียวกันทุกข้อ

ข้อกำหนดเรื่องผลลัพธ์:
คุณต้องตอบกลับเป็น **รูปแบบ JSON Object ที่ถูกต้องเท่านั้น** ห้ามมีข้อความแบบ markdown (\`\`\`json) หรือข้อความเกริ่นนำใดๆ ทั้งสิ้น รูปแบบโครงสร้างตรงตามนี้เป๊ะๆ:

{
  "lessonContent": "เนื้อหาบทเรียนที่สรุปย่อแล้ว อ่านสนุก มีการใช้ Emoji ประกอบ และแบ่งหัวข้อย่อยชัดเจน ความยาวประมาณ 2-3 ย่อหน้า",
  "quizContent": [
    {
      "text": "โจทย์ข้อที่ 1...",
      "options": ["ก.", "ข.", "ค.", "ง."],
      "answer": 1,
      "explanation": "คำอธิบายเฉลย..."
    }
  ]
}

(หมายเหตุ: ตรง answer ให้ใส่ตัวเลข 1, 2, 3 หรือ 4 แทน ก, ข, ค, ง ตามลำดับ)`;

    const payload = {
      contents: [{ parts: [{ text: systemInstruction }] }],
      generationConfig: {
        temperature: 0.7, 
        response_mime_type: "application/json" // บังคับให้เป็น JSON เสมอ
      }
    };

    const options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true // อนุญาตให้อ่าน Error Message จาก API ได้ตรงๆ
    };

    // 4. ยิง Request ไปหา Google (พร้อมระบบ Retry หนี 503 High Demand)
    let responseCode = 0;
    let responseText = '';
    let maxRetries = 3;

    let response;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        response = UrlFetchApp.fetch(url, options);
        responseCode = response.getResponseCode();
        responseText = response.getContentText();
        
        if (responseCode === 200) break;
        if ((responseCode === 503 || responseCode === 429) && attempt < maxRetries) {
            Utilities.sleep(1500 * attempt);
        } else {
            break;
        }
    }
    
    if (responseCode !== 200) {
        return { success: false, error: `Gemini API Error (${responseCode}): ${responseText} (ลองอีกครั้ง)` };
    }

    const data = JSON.parse(responseText);
    
    if (!data.candidates || data.candidates.length === 0) {
         return { success: false, error: 'AI ไม่สามารถสร้างเนื้อหาได้ (Empty Response)' };
    }

    let aiText = data.candidates[0].content.parts[0].text;
    
    // 5. ทำความสะอาดข้อความ (กรณี AI แอบใส่ Markdown ครอบ JSON มา)
    aiText = aiText.replace(/```json/gi, '').replace(/```/g, '').trim();
    
    try {
        const parsedData = JSON.parse(aiText);
        // ตรวจสอบโครงสร้างพื้นฐานให้แน่ใจ
        if(!parsedData.lessonContent || !Array.isArray(parsedData.quizContent)) {
             return { success: false, error: "AI ส่งโครงสร้างข้อมูลกลับมาไม่ถูกต้อง กรุณาลองใหม่" };
        }
        return { success: true, data: parsedData };
    } catch(parsErr) {
        return { success: false, error: 'AI สร้างเนื้อหาได้แต่รูปแบบ JSON ไม่ถูกต้อง: ' + parsErr.message + '\n\n' + aiText};
    }

  } catch(e) {
    return { success: false, error: 'เชื่อมต่อ AI ล้มเหลว: ' + e.toString() };
  }
}

/**
 * 📊 รายงานผลสอบ: ดึงข้อมูลคะแนนจาก Progress sheet ตาม LessonID
 * @param {string} lessonId - ID ของบทเรียนที่ต้องการดูรายงาน
 * @param {string} pin - Admin PIN
 * @returns {Object} { success, data: [{ timestamp, name, class, totalQuestions, score }] }
 */
function getExamReports(lessonId, pin) {
  if (!verifyAdminPinLock(pin)) return { success: false, error: 'Unauthorized: Invalid Admin PIN' };
  try {
    ensureDatabaseSetup();
    const ss = getSpreadsheet();

    // 1. ดึงข้อมูล Users เพื่อ map UserID -> { name, class }
    const usersSheet = ss.getSheetByName('Users');
    const usersData = usersSheet.getDataRange().getValues();
    /** @type {Object<string, {name: string, class: string}>} */
    const userMap = {};
    for (let i = 1; i < usersData.length; i++) {
      const uid = String(usersData[i][0]).trim();
      if (uid) {
        userMap[uid] = {
          name: String(usersData[i][1] || ''),
          class: String(usersData[i][2] || '')
        };
      }
    }

    // 2. นับจำนวนข้อสอบ (posttest) ของบทเรียนนี้จาก Questions sheet
    const questionsSheet = ss.getSheetByName('Questions');
    const qData = questionsSheet.getDataRange().getValues();
    let totalQuestions = 0;
    for (let i = 1; i < qData.length; i++) {
      const qLessonId = String(qData[i][1]).trim();
      const qType = String(qData[i][9] || '').trim().toLowerCase();
      if (qLessonId === String(lessonId) && (qType === 'posttest' || qType === '')) {
        totalQuestions++;
      }
    }

    // 3. ดึง Progress records ที่ match กับ lessonId
    const progressSheet = ss.getSheetByName('Progress');
    const pData = progressSheet.getDataRange().getValues();
    const results = [];

    for (let i = 1; i < pData.length; i++) {
      const pUserId = String(pData[i][0]).trim();
      const pLessonId = String(pData[i][1]).trim();
      const pStatus = String(pData[i][2] || '');
      const pScore = Number(pData[i][3]) || 0;

      if (pLessonId !== String(lessonId)) continue;

      const userInfo = userMap[pUserId] || { name: pUserId, class: '-' };

      results.push({
        timestamp: '-',
        name: userInfo.name,
        class: userInfo.class,
        totalQuestions: totalQuestions,
        score: pScore,
        status: pStatus
      });
    }

    // เรียงจากคะแนนมากไปน้อย
    results.sort((a, b) => b.score - a.score);

    return { success: true, data: results };
  } catch (e) {
    return { success: false, error: 'ดึงรายงานผิดพลาด: ' + e.toString() };
  }
}
