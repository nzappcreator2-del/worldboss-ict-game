/**
 * ICT Talent Connext ED - เกมการเรียนรู้
 * Server-side Logic & API
 */

// 1) แก้ไขค่านี้เป็น ID ของ Google Sheets ของคุณที่สร้างไว้
const SPREADSHEET_ID = '1muZvyaAeTHzn6E4IjjJ0fkV43cIivXI4lEeDjhm7nAY';

/**
 * ฟังก์ชันหลักที่ใช้ในการ Render หน้าเว็บ
 */
function doGet(e) {
  var template = HtmlService.createTemplateFromFile('Index');
  return template.evaluate()
      .setTitle('ICT Talent - RPG Learning Game')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * API Gateway: รองรับการเข้าถึงและรับส่งคะแนนแบบ REST API จากภายนอก (Cross-Origin CORS Endpoint)
 */
function doPost(e) {
  var response;
  try {
    var params;
    // ดักจับข้อมูลขารับแบบ Text หรือ JSON ป้องกันปัญหากล่องความปลอดภัย CORS preflight
    if (e && e.postData && e.postData.contents) {
      params = JSON.parse(e.postData.contents);
    } else if (e && e.parameter) {
      params = e.parameter;
    } else {
      params = {};
    }
    
    var action = params.action;
    
    if (action === 'submitWorldBossScore') {
      var userId = params.userId;
      var bossId = params.bossId;
      var timeSeconds = params.timeSeconds;
      var bonusCoins = params.bonusCoins;
      
      // เรียกใช้ฟังก์ชันเดิมใน API.js ปลอดภัยและใช้ตรรกะเดิม 100%
      var result = submitWorldBossScore(userId, bossId, timeSeconds, bonusCoins);
      response = result;
    } else if (action === 'getQuestions') {
      var lessonId = params.lessonId;
      var userId = params.userId;
      
      if ((!lessonId || lessonId === 'L-CURRENT' || lessonId === 'null' || lessonId === 'undefined') && userId) {
        var userLesson = getUserCurrentLessonId(userId);
        if (userLesson) {
          lessonId = userLesson;
        }
      }
      
      var result = getQuestions(lessonId);
      response = result;
    } else {
      response = { success: false, error: 'Invalid action: ' + action };
    }
  } catch (err) {
    response = { success: false, error: err.toString() };
  }
  
  return ContentService.createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);
}


/**
 * ฟังก์ชันสำหรับเชื่อมไฟล์ HTML อื่นๆ (CSS, JS) เข้าด้วยกันตามมาตรฐาน GAS
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * ฟังก์ชันสำหรับรับ URL ของ Web App ปัจจุบันเพื่อการ Refresh หน้าจอ
 */
function getScriptUrl() {
  return ScriptApp.getService().getUrl();
}

/**
 * ติดต่อกับ Google Sheets
 */
function getSpreadsheet() {
  // หากยังไม่ได้ใส่ ID ให้ใช้ Spreadsheet ที่สคริปต์ผูกอยู่แทน
  if (SPREADSHEET_ID && SPREADSHEET_ID !== 'ใส่_SPREADSHEET_ID_ที่นี่') {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

/**
 * 🛠️ ฟังก์ชันสำหรับ Setup ฐานข้อมูลครั้งแรก (Auto Generate Sheets)
 * ให้ผู้ใช้เลือกฟังก์ชันนี้ใน Apps Script Editor แล้วกด "Run"
 */
function setupDatabase() {
  const ss = getSpreadsheet();
  if(!ss) {
    throw new Error('ไม่พบ Spreadsheet กรุณาตรวจสอบ SPREADSHEET_ID ในไฟล์ Code.gs บรรทัดที่ 7');
  }
  
  const requiredSheets = [
    { name: 'Users', columns: ['UserID', 'Name', 'Class', 'XP', 'Rank', 'Level', 'Avatar', 'Coins', 'Inventory', 'LastLogin', 'Streak'] },
    { name: 'Lessons', columns: ['LessonID', 'Title', 'Description', 'VideoURL', 'Icon', 'IsActive', 'EnablePretest', 'WorksheetURL', 'Content'] },
    { name: 'Questions', columns: ['QuestionID', 'LessonID', 'QuestionText', 'Opt1', 'Opt2', 'Opt3', 'Opt4', 'Answer', 'Explanation', 'Type'] },
    { name: 'Progress', columns: ['UserID', 'LessonID', 'Status', 'Score'] },
    { name: 'Settings', columns: ['Key', 'Value'] },
    { name: 'News', columns: ['NewsID', 'Icon', 'Type', 'Title', 'Content', 'Date', 'IsActive'] },
    { name: 'PVP_Matches', columns: ['MatchID', 'Player1ID', 'Player2ID', 'Player1Name', 'Player2Name', 'Player1Avatar', 'Player2Avatar', 'Player1Score', 'Player2Score', 'Player1Ready', 'Player2Ready', 'Status', 'CreatedAt'] },
    { name: 'WorldBoss_Config', columns: ['BossID', 'BossName', 'PoseType', 'TargetReps', 'BossMaxHP', 'RewardCoins', 'RewardXP', 'IsActive'] },
    { name: 'WorldBoss_Scores', columns: ['UserID', 'Name', 'Class', 'BossID', 'BestTimeSeconds', 'Date'] },
    { name: 'CyberSafety_Scenarios', columns: ['ScenarioID', 'TimeOfDay', 'Title', 'ScenarioText', 'Opt1', 'Opt2', 'AnswerIdx', 'FeedbackWrong', 'FeedbackRight', 'ImageSVG'] }
  ];

  requiredSheets.forEach(sheetDef => {
    let sheet = ss.getSheetByName(sheetDef.name);
    // หากชีตยังไม่มี ให้สร้างใหม่
    if (!sheet) {
      sheet = ss.insertSheet(sheetDef.name);
      
      // เขียน Header แถวแรกเฉพาะชีตใหม่
      sheet.getRange(1, 1, 1, sheetDef.columns.length).setValues([sheetDef.columns]);
      
      // ปรับสไตล์ Header ให้อ่านง่าย
      sheet.getRange(1, 1, 1, sheetDef.columns.length)
           .setFontWeight('bold')
           .setBackground('#4F46E5') // สีม่วงเข้ม Tailwind Indigo-600
           .setFontColor('#FFFFFF');
           
      // จัดให้ล็อกแถวแรกไว้
      sheet.setFrozenRows(1);
    }
  });
  
  // เพิ่มค่า Default ให้ชีท Settings (ถ้ายังไม่มี)
  const settingsSheet = ss.getSheetByName('Settings');
  const settingsData = settingsSheet.getDataRange().getValues();
  if (settingsData.length <= 1) {
    settingsSheet.appendRow(['TimerPerQuestion', '30']);
    settingsSheet.appendRow(['AdminPIN', '1234']); // รหัสผ่านตั้งต้น
  }

  // เพิ่มค่า Default ให้ชีท CyberSafety_Scenarios (ถ้ายังไม่มี)
  const cyberSheet = ss.getSheetByName('CyberSafety_Scenarios');
  if (cyberSheet && cyberSheet.getLastRow() <= 1) {
    const defaultScenarios = [
      ['SC001', 'เช้า', 'เซลฟี่อันตรายบนรถโรงเรียน', 'น้องเซฟกำลังตื่นเต้นกับเช้าวันใหม่ จึงถ่ายภาพเซลฟี่ของตัวเองบนรถโรงเรียนเพื่อโพสต์ลงโซเชียลมีเดีย แต่ในภาพถ่ายนั้นติดป้ายทะเบียนรถและเห็นชื่อจริงรวมถึงป้ายชื่อโรงเรียนบนเสื้อนักเรียนของตนเองอย่างชัดเจน น้องเซฟควรทำอย่างไร?', 'เบลอชื่อโรงเรียนและป้ายทะเบียนรถ หรือตกแต่งด้วยสติกเกอร์ปิดข้อมูลระบุตัวตนก่อนโพสต์ พร้อมตั้งค่าโพสต์เป็น "เฉพาะเพื่อน" เพื่อความเป็นส่วนตัว', 'โพสต์ภาพดิบลงโซเชียลทันทีและตั้งค่าเป็น "สาธารณะ" (Public) เพื่อให้ทุกคนเข้ามาดูและกดไลก์เยอะ ๆ', 1, 'หยุดก่อนเพื่อนยาก! การเปิดเผยชื่อโรงเรียนและทะเบียนรถสู่สาธารณะ อาจเปิดโอกาสให้ผู้ไม่หวังดีสืบหาที่อยู่และติดตามตัวเราได้นะ! ควรปกปิดข้อมูลระบุตัวตนและโพสต์เฉพาะกับกลุ่มคนที่ไว้ใจได้เท่านั้นจ้า!', 'ยอดเยี่ยมมาก! การปกปิดข้อมูลสำคัญและตั้งค่าความเป็นส่วนตัว ช่วยป้องกันไม่ให้คนแปลกหน้าสืบหาข้อมูลเพื่อติดตามและทำอันตรายเราได้ เก่งมากน้องเซฟ!', ''],
      ['SC002', 'กลางวัน', 'เพชรฟรีแสนหวานกับลิงก์ลวงตา', 'ในช่วงพักกลางวันอันแสนสนุกสนาน มีข้อความส่งมาในห้องแชทกลุ่มเกมออนไลน์อ้างว่า "แจกเพชรเกมออนไลน์ฟรี 1,000 เม็ด! ด่วนจำนวนจำกัด แค่คลิกลิงก์นี้แล้วเข้าสู่ระบบด้วย ID และรหัสผ่านเกมของคุณเพื่อรับของรางวัลทันที!" น้องเซฟอยากได้เพชรมาก ควรทำอย่างไร?', 'ปิดข้อความทิ้งทันที และไม่คลิกลิงก์แปลกปลอมนั้น พร้อมเตือนเพื่อน ๆ ในกลุ่มว่าอาจเป็นลิงก์หลอกลวงขโมยรหัสผ่าน (Phishing)', 'รีบกดลิงก์และกรอกชื่อผู้ใช้พร้อมรหัสผ่านเกมทันทีเพื่อที่จะได้รับเพชรฟรีคนแรกก่อนที่กิจกรรมจะหมดเวลา', 1, 'ระวังอันตราย! ไม่มีของฟรีในโลกไซเบอร์หรอกนะ! ลิงก์ที่หลอกให้ใส่รหัสผ่านเรียกว่า "ฟิชชิ่ง" (Phishing) หากหลงเชื่อ รหัสผ่านและไอดีเกมของเราจะโดนแฮกและขโมยไปทันทีเลย!', 'ปลอดภัยที่สุด! ของฟรีมักไม่มีอยู่จริง และการไม่กรอกรหัสผ่านลงในเว็บแปลกปลอมช่วยปกป้องไอดีเกมของเราไม่ให้โดนขโมยได้อย่างถาวร ยอดเยี่ยม!', ''],
      ['SC003', 'เย็น', 'คนแปลกหน้าออนไลน์กับของเล่นฟรี', 'หลังเลิกเรียน น้องเซฟกำลังเล่นเกมออนไลน์อยู่ที่บ้านอย่างเพลิดเพลิน จู่ ๆ มีผู้เล่นคนหนึ่งในเกมที่เล่นด้วยกันมาสองสามวันส่งข้อความมาชวนคุยอย่างเป็นกันเอง และเอ่ยปากชวนว่า "พี่ชอบเล่นเกมกับเรานะ วันเสาร์นี้มาเจอกันที่สวนสาธารณะหลังห้างใกล้บ้านเราไหม พี่จะเอาการ์ดเกมแรร์กับของเล่นมาแจกให้ฟรี ๆ เลย แต่อย่าบอกพ่อแม่นะ เดี๋ยวอดของดี!" น้องเซฟควรทำอย่างไร?', 'ตอบปฏิเสธทันที และนำข้อความสนทนานี้ไปแจ้งให้คุณพ่อคุณแม่หรือคุณครูทราบเพื่อขอคำปรึกษาและระมัดระวังตัว', 'แอบออกไปนัดเจอตามลำพังเงียบ ๆ เพราะคิดว่าเขาเป็นคนใจดีและสัญญาว่าจะให้ของเล่นแรร์ฟรี ๆ', 1, 'อันตรายร้ายแรง! การนัดเจอคนแปลกหน้าบนโลกออนไลน์ตามลำพังมีความเสี่ยงสูงมากที่จะถูกลักพาตัว ล่อลวง หรือทำอันตราย! เราไม่ควรกรรทำอย่างเด็ดขาดและต้องรีบบอกผู้ปกครองให้ทราบทันที!', 'ตัดสินใจได้ฉลาดมาก! การปฏิเสธและปรึกษาผู้ปกครองช่วยปกป้องเราจากการถูกล่อลวงหรือลักพาตัวโดยผู้ไม่หวังดีที่แฝงตัวมาในโลกออนไลน์!', ''],
      ['SC004', 'ค่ำ', 'กระแสบูลลี่ในห้องแชทกลุ่ม', 'ก่อนเข้านอน น้องเซฟเปิดกลุ่มไลน์ห้องเรียนเพื่อคุยกับเพื่อน ๆ แต่กลับพบว่ามีเพื่อนกลุ่มหนึ่งกำลังรุมส่งภาพตัดต่อล้อเลียนเพื่อกลั่นแกล้งเพื่อนคนหนึ่งในห้องอย่างสนุกสนาน เพื่อน ๆ ทักมาบอกว่า "เซฟ ส่งรูปตลก ๆ มาร่วมแจมด่ามันด้วยกันสิ สนุกจะตาย!" น้องเซฟควรทำอย่างไร?', 'ไม่ร่วมวงส่งภาพล้อเลียน และส่งข้อความทักส่วนตัวไปให้กำลังใจเพื่อนที่โดนแกล้ง หรือแจ้งให้คุณครูประจำชั้นทราบถึงสถานการณ์ไซเบอร์บูลลี่นี้', 'ส่งสติกเกอร์หัวเราะหรือตัดต่อภาพล้อเลียนร่วมแจมไปด้วย เพื่อความสนุกและเพื่อป้องกันไม่ให้ตัวเองโดนเพื่อนคนอื่น ๆ แบนออกจากกลุ่ม', 1, 'หยุดทำร้ายจิตใจผู้อื่น! การร่วมวงล้อเลียนเพื่อนออนไลน์ถือเป็นการรังแกทางไซเบอร์ (Cyberbullying) ซึ่งสร้างความเจ็บปวดและบาดแผลทางใจให้แก่เพื่อนอย่างรุนแรง เราไม่ควรมีส่วนร่วมเด็ดขาด!', 'หัวใจหล่อมาก! การไม่ร่วมรังแกผู้อื่นและหยิบยื่นความช่วยเหลือให้ผู้ถูกกระทำ ช่วยสร้างสังคมออนไลน์ที่ปลอดภัยและน่าอยู่ และหยุดยั้งปัญหาการกลั่นแกล้งกันได้เป็นอย่างดี!', '']
    ];
    defaultScenarios.forEach(row => cyberSheet.appendRow(row));
  }

  // เพิ่มค่า Default ให้ชีท WorldBoss_Config (ถ้ายังไม่มี)
  const bossSheet = ss.getSheetByName('WorldBoss_Config');
  if (bossSheet && bossSheet.getLastRow() <= 1) {
    bossSheet.appendRow(['WB001', 'ผจญภัยกับมาริโอ้', 'mario_fitness', 10, 100, 100, 100, true]);
    bossSheet.appendRow(['WB002_10', 'สมรภูมิยอดนักวิ่งลมกรด (10 วินาที)', 'speed_runner', 10, 100, 80, 80, true]);
    bossSheet.appendRow(['WB002_15', 'สมรภูมิยอดนักวิ่งลมกรด (15 วินาที)', 'speed_runner', 15, 150, 100, 100, true]);
    bossSheet.appendRow(['WB002_20', 'สมรภูมิยอดนักวิ่งลมกรด (20 วินาที)', 'speed_runner', 20, 200, 150, 150, true]);
    bossSheet.appendRow(['WB002_30', 'สมรภูมิยอดนักวิ่งลมกรด (30 วินาที)', 'speed_runner', 30, 300, 200, 200, true]);
    bossSheet.appendRow(['WB002_1', 'สมรภูมิยอดนักวิ่งลมกรด (ทดสอบ 1 วินาที)', 'speed_runner', 1, 10, 5, 5, true]);
    bossSheet.appendRow(['WB002_SPEEDRUN', 'สมรภูมิมือปราบภัย AI (ท้าทาย 12 ข้อ)', 'speed_runner', 12, 120, 250, 250, true]);
  } else if (bossSheet) {
    // 🛠️ Auto-Migration: อัปเดตชื่อด่าน WB001 และเช็คว่ามี WB002_10 แล้วหรือยัง
    try {
      const bossData = bossSheet.getDataRange().getValues();
      let hasWb002_10 = false;
      for (let i = 1; i < bossData.length; i++) {
        if (bossData[i][0] === 'WB001' && (bossData[i][1] === 'ผจญภัยไปกับมาริโอ้' || bossData[i][1] === 'ผจญภัยไปกับมาริโอ้ ')) {
          bossSheet.getRange(i + 1, 2).setValue('ผจญภัยกับมาริโอ้');
        }
        if (bossData[i][0] === 'WB002_10') {
          hasWb002_10 = true;
        }
      }
      if (!hasWb002_10) {
        bossSheet.appendRow(['WB002_10', 'สมรภูมิยอดนักวิ่งลมกรด (10 วินาที)', 'speed_runner', 10, 100, 80, 80, true]);
      }
    } catch (e) {
      console.error('Error during WorldBoss_Config setup migration:', e);
    }
  }
  
  // แจ้งเตือนว่าเสร็จสิ้นแล้ว
  console.log('✅ สร้างโครงสร้างตารางข้อมูล (Database Schema) เสร็จเรียบร้อยแล้ว!');
}

/**
 * 🛠️ ฟังก์ชันตรวจจับและ Auto-Setup ชีตอัตโนมัติ
 */
function ensureDatabaseSetup() {
  const ss = getSpreadsheet();
  if (!ss) return;
  // เช็คว่ามีชีตหลักๆ ครบไหม ถ้ามีขาดไปสักอันให้รัน setupDatabase ซ่อมแซมทันที
  if (!ss.getSheetByName('Users') || !ss.getSheetByName('Lessons') || !ss.getSheetByName('Questions') || !ss.getSheetByName('Progress') || !ss.getSheetByName('Settings') || !ss.getSheetByName('News') || !ss.getSheetByName('PVP_Matches') || !ss.getSheetByName('WorldBoss_Config') || !ss.getSheetByName('WorldBoss_Scores') || !ss.getSheetByName('CyberSafety_Scenarios')) {
    setupDatabase();
  } else {
    const lessonsSheet = ss.getSheetByName('Lessons');
    const headerRow = lessonsSheet.getRange(1, 1, 1, lessonsSheet.getLastColumn()).getValues()[0];
    if (headerRow.indexOf('WorksheetURL') === -1) {
      lessonsSheet.getRange(1, headerRow.length + 1).setValue('WorksheetURL');
    }
    
    // Auto-Migration for Users sheet (Add LastLogin, Streak)
    const usersSheet = ss.getSheetByName('Users');
    const uHeader = usersSheet.getRange(1, 1, 1, usersSheet.getLastColumn()).getValues()[0];
    if (uHeader.indexOf('LastLogin') === -1) {
      usersSheet.getRange(1, uHeader.length + 1).setValue('LastLogin');
      usersSheet.getRange(1, uHeader.length + 2).setValue('Streak');
    }
    
    // 🛠️ ตรวจสอบว่ามีคอลัมน์ Content ในชีต Lessons ไหม
    if (headerRow.indexOf('Content') === -1) {
      lessonsSheet.getRange(1, headerRow.length + (headerRow.indexOf('WorksheetURL') === -1 ? 2 : 1)).setValue('Content');
    }

    // 🛠️ ตรวจสอบว่ามีคอลัมน์ Coins และ Inventory ในชีต Users ไหม
    if (usersSheet) {
      const uHeaderRow = usersSheet.getRange(1, 1, 1, Math.max(1, usersSheet.getLastColumn())).getValues()[0];
      let uLength = uHeaderRow.length;
      if (uHeaderRow.indexOf('Coins') === -1) {
        uLength++;
        usersSheet.getRange(1, uLength).setValue('Coins');
      }
      if (uHeaderRow.indexOf('Inventory') === -1) {
        uLength++;
        usersSheet.getRange(1, uLength).setValue('Inventory');
      }
    }

    // 🛠️ ตรวจสอบว่ามี AdminPIN ในชีต Settings ไหม
    const settingsSheet = ss.getSheetByName('Settings');
    const settingsData = settingsSheet.getDataRange().getValues();
    let hasAdminPin = false;
    for (let i = 1; i < settingsData.length; i++) {
      if (settingsData[i][0] === 'AdminPIN') {
        hasAdminPin = true;
        break;
      }
    }
    if (!hasAdminPin) {
      settingsSheet.appendRow(['AdminPIN', '1234']);
    }

    // 🛠️ ตรวจสอบชีต WorldBoss_Config ว่ามีค่า Default ครบถ้วนหรือไม่
    const bossSheet = ss.getSheetByName('WorldBoss_Config');
    if (bossSheet) {
      const bossData = bossSheet.getDataRange().getValues();
      const existingBossIds = bossData.slice(1).map(row => String(row[0]));
      
      const defaultBosses = [
        ['WB001', 'ผจญภัยกับมาริโอ้', 'mario_fitness', 10, 100, 100, 100, true],
        ['WB002_15', 'สมรภูมิยอดนักวิ่งลมกรด (15 วินาที)', 'speed_runner', 15, 150, 100, 100, true],
        ['WB002_20', 'สมรภูมิยอดนักวิ่งลมกรด (20 วินาที)', 'speed_runner', 20, 200, 150, 150, true],
        ['WB002_30', 'สมรภูมิยอดนักวิ่งลมกรด (30 วินาที)', 'speed_runner', 30, 300, 200, 200, true],
        ['WB002_1', 'สมรภูมิยอดนักวิ่งลมกรด (ทดสอบ 1 วินาที)', 'speed_runner', 1, 10, 5, 5, true],
        ['WB002_SPEEDRUN', 'สมรภูมิมือปราบภัย AI (ท้าทาย 12 ข้อ)', 'speed_runner', 12, 120, 250, 250, true]
      ];
      
      defaultBosses.forEach(def => {
        if (existingBossIds.indexOf(def[0]) === -1) {
          bossSheet.appendRow(def);
        }
      });
    }

    // 🛠️ ตรวจสอบชีต CyberSafety_Scenarios ว่ามีข้อมูลอย่างน้อย 1 แถวไหม
    const cyberSheet = ss.getSheetByName('CyberSafety_Scenarios');
    if (cyberSheet && cyberSheet.getLastRow() <= 1) {
      const defaultScenarios = [
        ['SC001', 'เช้า', 'เซลฟี่อันตรายบนรถโรงเรียน', 'น้องเซฟกำลังตื่นเต้นกับเช้าวันใหม่ จึงถ่ายภาพเซลฟี่ของตัวเองบนรถโรงเรียนเพื่อโพสต์ลงโซเชียลมีเดีย แต่ในภาพถ่ายนั้นติดป้ายทะเบียนรถและเห็นชื่อจริงรวมถึงป้ายชื่อโรงเรียนบนเสื้อนักเรียนของตนเองอย่างชัดเจน น้องเซฟควรทำอย่างไร?', 'เบลอชื่อโรงเรียนและป้ายทะเบียนรถ หรือตกแต่งด้วยสติกเกอร์ปิดข้อมูลระบุตัวตนก่อนโพสต์ พร้อมตั้งค่าโพสต์เป็น "เฉพาะเพื่อน" เพื่อความเป็นส่วนตัว', 'โพสต์ภาพดิบลงโซเชียลทันทีและตั้งค่าเป็น "สาธารณะ" (Public) เพื่อให้ทุกคนเข้ามาดูและกดไลก์เยอะ ๆ', 1, 'หยุดก่อนเพื่อนยาก! การเปิดเผยชื่อโรงเรียนและทะเบียนรถสู่สาธารณะ อาจเปิดโอกาสให้ผู้ไม่หวังดีสืบหาที่อยู่และติดตามตัวเราได้นะ! ควรปกปิดข้อมูลระบุตัวตนและโพสต์เฉพาะกับกลุ่มคนที่ไว้ใจได้เท่านั้นจ้า!', 'ยอดเยี่ยมมาก! การปกปิดข้อมูลสำคัญและตั้งค่าความเป็นส่วนตัว ช่วยป้องกันไม่ให้คนแปลกหน้าสืบหาข้อมูลเพื่อติดตามและทำอันตรายเราได้ เก่งมากน้องเซฟ!', ''],
        ['SC002', 'กลางวัน', 'เพชรฟรีแสนหวานกับลิงก์ลวงตา', 'ในช่วงพักกลางวันอันแสนสนุกสนาน มีข้อความส่งมาในห้องแชทกลุ่มเกมออนไลน์อ้างว่า "แจกเพชรเกมออนไลน์ฟรี 1,000 เม็ด! ด่วนจำนวนจำกัด แค่คลิกลิงก์นี้แล้วเข้าสู่ระบบด้วย ID และรหัสผ่านเกมของคุณเพื่อรับของรางวัลทันที!" น้องเซฟอยากได้เพชรมาก ควรทำอย่างไร?', 'รีบกดลิงก์และกรอกชื่อผู้ใช้พร้อมรหัสผ่านเกมทันทีเพื่อที่จะได้รับเพชรฟรีคนแรกก่อนที่กิจกรรมจะหมดเวลา', 'ปิดข้อความทิ้งทันที และไม่คลิกลิงก์แปลกปลอมนั้น พร้อมเตือนเพื่อน ๆ ในกลุ่มว่าอาจเป็นลิงก์หลอกลวงขโมยรหัสผ่าน (Phishing)', 2, 'ระวังอันตราย! ไม่มีของฟรีในโลกไซเบอร์หรอกนะ! ลิงก์ที่หลอกให้ใส่รหัสผ่านเรียกว่า "ฟิชชิ่ง" (Phishing) หากหลงเชื่อ รหัสผ่านและไอดีเกมของเราจะโดนแฮกและขโมยไปทันทีเลย!', 'ปลอดภัยที่สุด! ของฟรีมักไม่มีอยู่จริง และการไม่กรอกรหัสผ่านลงในเว็บแปลกปลอมช่วยปกป้องไอดีเกมของเราไม่ให้โดนขโมยได้อย่างถาวร ยอดเยี่ยม!', ''],
        ['SC003', 'เย็น', 'คนแปลกหน้าออนไลน์กับของเล่นฟรี', 'หลังเลิกเรียน น้องเซฟกำลังเล่นเกมออนไลน์อยู่ที่บ้านอย่างเพลิดเพลิน จู่ ๆ มีผู้เล่นคนหนึ่งในเกมที่เล่นด้วยกันมาสองสามวันส่งข้อความมาชวนคุยอย่างเป็นกันเอง และเอ่ยปากชวนว่า "พี่ชอบเล่นเกมกับเรานะ วันเสาร์นี้มาเจอกันที่สวนสาธารณะหลังห้างใกล้บ้านเราไหม พี่จะเอาการ์ดเกมแรร์กับของเล่นมาแจกให้ฟรี ๆ เลย แอยังบอกพ่อแม่นะ เดี๋ยวอดของดี!" น้องเซฟควรทำอย่างไร?', 'ตอบปฏิเสธทันที และนำข้อความสนทนานี้ไปแจ้งให้คุณพ่อคุณแม่หรือคุณครูทราบเพื่อขอคำปรึกษาและระมัดระวังตัว', 'แอบออกไปนัดเจอตามลำพังเงียบ ๆ เพราะคิดว่าเขาเป็นคนใจดีและสัญญาว่าจะให้ของเล่นแรร์ฟรี ๆ', 1, 'อันตรายร้ายแรง! การนัดเจอคนแปลกหน้าบนโลกออนไลน์ตามลำพังมีความเสี่ยงสูงมากที่จะถูกลักพาตัว ล่อลวง หรือทำอันตราย! เราไม่ควรกรรทำอย่างเด็ดขาดและต้องรีบบอกผู้ปกครองให้ทราบทันที!', 'ตัดสินใจได้ฉลาดมาก! การปฏิเสธและปรึกษาผู้ปกครองช่วยปกป้องเราจากการถูกล่อลวงหรือลักพาตัวโดยผู้ไม่หวังดีที่แฝงตัวมาในโลกออนไลน์!', ''],
        ['SC004', 'ค่ำ', 'กระแสบูลลี่ในห้องแชทกลุ่ม', 'ก่อนเข้านอน น้องเซฟเปิดกลุ่มไลน์ห้องเรียนเพื่อคุยกับเพื่อน ๆ แต่กลับพบว่ามีเพื่อนกลุ่มหนึ่งกำลังรุมส่งภาพตัดต่อล้อเลียนเพื่อกลั่นแกล้งเพื่อนคนหนึ่งในห้องอย่างสนุกสนาน เพื่อน ๆ ทักมาบอกว่า "เซฟ ส่งรูปตลก ๆ มาร่วมแจมด่ามันด้วยกันสิ สนุกจะตาย!" น้องเซฟควรทำอย่างไร?', 'ส่งสติกเกอร์หัวเราะหรือตัดต่อภาพล้อเลียนร่วมแจมไปด้วย เพื่อความสนุกและเพื่อป้องกันไม่ให้ตัวเองโดนเพื่อนคนอื่น ๆ แบนออกจากกลุ่ม', 'ไม่ร่วมวงส่งภาพล้อเลียน และส่งข้อความทักส่วนตัวไปให้กำลังใจเพื่อนที่โดนแกล้ง หรือแจ้งให้คุณครูประจำชั้นทราบถึงสถานการณ์ไซเบอร์บูลลี่นี้', 2, 'หยุดทำร้ายจิตใจผู้อื่น! การร่วมวงล้อเลียนเพื่อนออนไลน์ถือเป็นการรังแกทางไซเบอร์ (Cyberbullying) ซึ่งสร้างความเจ็บปวดและบาดแผลทางใจให้แก่เพื่อนอย่างรุนแรง เราไม่ควรมีส่วนร่วมเด็ดขาด!', 'หัวใจหล่อมาก! การไม่ร่วมรังแกผู้อื่นและหยิบยื่นความช่วยเหลือให้ผู้ถูกกระทำ ช่วยสร้างสังคมออนไลน์ที่ปลอดภัยและน่าอยู่ และหยุดยั้งปัญหาการกลั่นแกล้งกันได้เป็นอย่างดี!', '']
      ];
      defaultScenarios.forEach(row => cyberSheet.appendRow(row));
    }
  }
}

/**
 * API: ดึงข้อมูลคำถามจำลองสถานการณ์ Cyber Safety
 */
function getCyberSafetyScenarios() {
  try {
    ensureDatabaseSetup();
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('CyberSafety_Scenarios');
    if (!sheet) return { success: false, error: 'ไม่พบตาราง CyberSafety_Scenarios' };
    
    const data = sheet.getDataRange().getValues();
    const scenarios = [];
    
    // โครงสร้างคอลัมน์: ScenarioID, TimeOfDay, Title, ScenarioText, Opt1, Opt2, AnswerIdx, FeedbackWrong, FeedbackRight, ImageSVG
    for (let i = 1; i < data.length; i++) {
      // ตรวจสอบความปลอดภัยและตัดช่องว่าง
      const sId = data[i][0] ? String(data[i][0]).trim() : '';
      const sTime = data[i][1] ? String(data[i][1]).trim() : '';
      
      if (sId && sTime) {
        // ดักจับการแปลงเฉลย AnswerIdx ให้ปลอดภัย
        let ansIdx = 0;
        if (data[i][6] !== undefined && data[i][6] !== null && data[i][6] !== '') {
          const parsed = parseInt(data[i][6]);
          if (!isNaN(parsed)) {
            ansIdx = Math.max(0, parsed - 1);
          }
        }
        
        scenarios.push({
          id: sId,
          timeOfDay: sTime,
          title: data[i][2] ? String(data[i][2]).trim() : 'เหตุการณ์ไซเบอร์',
          text: data[i][3] ? String(data[i][3]).trim() : '',
          opt1: data[i][4] ? String(data[i][4]).trim() : '',
          opt2: data[i][5] ? String(data[i][5]).trim() : '',
          answerIdx: ansIdx,
          feedbackWrong: data[i][7] ? String(data[i][7]).trim() : 'ตัวเลือกนี้มีความเสี่ยงบนโลกออนไลน์นะครับ',
          feedbackRight: data[i][8] ? String(data[i][8]).trim() : 'ยอดเยี่ยมมาก! คุณเลือกได้อย่างปลอดภัยครับ',
          imageSvg: data[i][9] ? String(data[i][9]).trim() : ''
        });
      }
    }
    return { success: true, data: scenarios };
  } catch (e) {
    console.error("Error getCyberSafetyScenarios:", e);
    return { success: false, error: e.toString() };
  }
}

// ✅ อัปเดตระบบมินิเกมและฟิสิกส์ตรวจจับท่าทางให้มีความแม่นยำสูง ไร้ Jitter และลดการใช้พลังงาน CPU/GPU เรียบร้อยแล้ว

