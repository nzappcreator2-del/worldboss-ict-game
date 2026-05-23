/**
 * Backend API สำหรับระบบ PVP (Pseudo-Real-time)
 * มีการทำ Database Range Read Optimization เพื่อความรวดเร็วระดับสูงสุด 🚀
 */

/**
 * 🛠️ ฟังก์ชันสร้างหรือเข้าร่วมห้อง PVP
 * - ถ้ามีห้องที่สถานะ 'WAITING' อยู่ จะจับคู่ให้ (Player2)
 * - ถ้าไม่มี จะสร้างห้องใหม่ (Player1)
 */
function createOrJoinMatch(userId, userName, userAvatar, roomCode) {
  const ss = getSpreadsheet();
  if (!ss) return { success: false, error: 'Database not found' };
  
  const sheet = ss.getSheetByName('PVP_Matches');
  if (!sheet) return { success: false, error: 'PVP sheet not found' };

  // เคลียร์ห้องที่ค้าง (WAITING เกิน 1 นาที) ให้เป็น CANCELLED
  cleanupStaleMatches(sheet);

  const lastRow = sheet.getLastRow();
  let data = [];
  let startRow = 2;
  
  if (lastRow > 1) {
    // โหลดเฉพาะ 50 ห้องล่าสุด เพื่อความรวดเร็วระดับมิลลิวินาทีแทนการโหลดชีตทั้งหมด
    startRow = Math.max(2, lastRow - 50);
    const numRows = lastRow - startRow + 1;
    data = sheet.getRange(startRow, 1, numRows, 13).getValues();
  }

  // 1. ลองหาห้องที่ยังว่าง (WAITING)
  for (let i = data.length - 1; i >= 0; i--) {
    const row = data[i];
    const matchId = String(row[0]);
    const p1Id = row[1];
    const status = row[11];
    
    if (status === 'WAITING' && p1Id !== userId) {
      let isMatch = false;
      if (roomCode) {
        // เจาะจงห้องส่วนตัว: MatchID ต้องตรงกับรหัสห้อง
        if (matchId === 'PRIVATE_' + roomCode) {
          isMatch = true;
        }
      } else {
        // สุ่มจับคู่ด่วน: ต้องไม่เป็นห้องส่วนตัว (ไม่ขึ้นต้นด้วย PRIVATE_)
        if (!matchId.startsWith('PRIVATE_')) {
          isMatch = true;
        }
      }

      if (isMatch) {
        const actualRow = startRow + i;
        // เจอห้องว่าง ให้เข้าไปเป็น Player2
        // Update Row
        sheet.getRange(actualRow, 3).setValue(userId); // Player2ID
        sheet.getRange(actualRow, 5).setValue(userName); // Player2Name
        sheet.getRange(actualRow, 7).setValue(userAvatar); // Player2Avatar
        sheet.getRange(actualRow, 11).setValue(false); // Player2Ready = false
        sheet.getRange(actualRow, 12).setValue('LOBBY'); // Status = LOBBY
        
        return {
          success: true,
          matchId: matchId,
          role: 'Player2',
          p1Id: p1Id,
          p1Name: row[3],
          p1Avatar: row[5],
          p1Ready: row[9] === true || row[9] === 'TRUE',
          p2Id: userId,
          p2Name: userName,
          p2Avatar: userAvatar,
          p2Ready: false,
          status: 'LOBBY'
        };
      }
    }
  }

  // 2. ถ้าไม่เจอห้องว่าง ให้สร้างห้องใหม่ (WAITING)
  let newMatchId;
  if (roomCode) {
    newMatchId = 'PRIVATE_' + roomCode;
  } else {
    newMatchId = 'M_' + new Date().getTime() + '_' + Math.floor(Math.random()*1000);
  }
  const now = new Date();
  
  // ['MatchID', 'Player1ID', 'Player2ID', 'Player1Name', 'Player2Name', 'Player1Avatar', 'Player2Avatar', 'Player1Score', 'Player2Score', 'Player1Ready', 'Player2Ready', 'Status', 'CreatedAt']
  sheet.appendRow([
    newMatchId, 
    userId, 
    '', // Player2ID 
    userName, 
    '', // Player2Name
    userAvatar, 
    '', // Player2Avatar
    100, // Player1Score (Start HP = 100)
    100, // Player2Score (Start HP = 100)
    false, // Player1Ready = false
    false, // Player2Ready = false
    'WAITING', 
    now
  ]);
  
  return {
    success: true,
    matchId: newMatchId,
    role: 'Player1',
    p1Id: userId,
    p1Name: userName,
    p1Avatar: userAvatar,
    p1Ready: false,
    p2Id: null,
    p2Name: '',
    p2Avatar: '',
    p2Ready: false,
    status: 'WAITING'
  };
}

/**
 * 🛠️ ตรวจสอบสถานะห้อง (Polling) - ดึงข้อมูลแบบมีประสิทธิภาพ
 */
function getMatchStatus(matchId) {
  const ss = getSpreadsheet();
  if (!ss) return { success: false, error: 'DB not found' };
  
  const sheet = ss.getSheetByName('PVP_Matches');
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { success: false, error: 'No matches found' };

  // ดึงเฉพาะ 30 แถวล่าสุด เพื่อไม่ให้หน่วงเมื่อข้อมูลสะสมเยอะขึ้น
  const startRow = Math.max(2, lastRow - 30);
  const numRows = lastRow - startRow + 1;
  const data = sheet.getRange(startRow, 1, numRows, 13).getValues();
  
  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i][0] === matchId) {
      return {
        success: true,
        matchId: matchId,
        p1Id: data[i][1],
        p2Id: data[i][2],
        p1Name: data[i][3],
        p2Name: data[i][4],
        p1Avatar: data[i][5],
        p2Avatar: data[i][6],
        p1Hp: data[i][7],
        p2Hp: data[i][8],
        p1Ready: data[i][9] === true || data[i][9] === 'TRUE' || data[i][9] === 'FINISHED',
        p2Ready: data[i][10] === true || data[i][10] === 'TRUE' || data[i][10] === 'FINISHED',
        status: data[i][11]
      };
    }
  }
  
  return { success: false, error: 'Match not found' };
}

/**
 * 🛠️ อัปเดตคะแนน/เลือดในห้อง PVP
 */
function updateMatchScore(matchId, userId, newHp) {
  const ss = getSpreadsheet();
  if (!ss) return { success: false, error: 'DB error' };
  
  const sheet = ss.getSheetByName('PVP_Matches');
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { success: false, error: 'No matches found' };

  const startRow = Math.max(2, lastRow - 30);
  const numRows = lastRow - startRow + 1;
  const data = sheet.getRange(startRow, 1, numRows, 13).getValues();
  
  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i][0] === matchId) {
      const actualRow = startRow + i;
      let isGameOver = false;
      let winner = null;
      let finalStatus = data[i][11];
      
      // Update HP
      if (data[i][1] === userId) {
        sheet.getRange(actualRow, 8).setValue(newHp); // Update P1 HP
        
        if (newHp <= 0) {
          isGameOver = true;
          winner = 'Player2';
          finalStatus = 'FINISHED';
        }
      } else if (data[i][2] === userId) {
        sheet.getRange(actualRow, 9).setValue(newHp); // Update P2 HP
        
        if (newHp <= 0) {
          isGameOver = true;
          winner = 'Player1';
          finalStatus = 'FINISHED';
        }
      }
      
      if (isGameOver) {
        sheet.getRange(actualRow, 12).setValue('FINISHED');
      }
      
      return { success: true, isGameOver: isGameOver, winner: winner, status: finalStatus };
    }
  }
  return { success: false, error: 'Match not found' };
}

/**
 * 🛠️ แจ้งว่าผู้เล่นตอบคำถามครบทั้งหมดแล้ว
 * และเปลี่ยนสถานะห้องเป็น FINISHED ทันทีหากเสร็จสิ้นทั้งสองฝ่าย
 */
function finishMatch(matchId, userId) {
  const ss = getSpreadsheet();
  if (!ss) return { success: false, error: 'DB error' };
  
  const sheet = ss.getSheetByName('PVP_Matches');
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { success: false, error: 'No matches found' };

  const startRow = Math.max(2, lastRow - 30);
  const numRows = lastRow - startRow + 1;
  const data = sheet.getRange(startRow, 1, numRows, 13).getValues();
  
  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i][0] === matchId) {
      const actualRow = startRow + i;
      
      if (data[i][1] === userId) {
        sheet.getRange(actualRow, 10).setValue('FINISHED'); // Player1Ready -> FINISHED
      } else if (data[i][2] === userId) {
        sheet.getRange(actualRow, 11).setValue('FINISHED'); // Player2Ready -> FINISHED
      }
      
      // ตรวจหาค่าความพร้อมล่าสุด
      const updatedRow = sheet.getRange(actualRow, 1, 1, 13).getValues()[0];
      const p1ReadyVal = String(updatedRow[9]);
      const p2ReadyVal = String(updatedRow[10]);
      const p1Hp = updatedRow[7];
      const p2Hp = updatedRow[8];
      let finalStatus = updatedRow[11];
      
      // ถ้าส่งข้อมูล FINISHED ครบทั้งคู่แล้ว ปรับคอลัมน์ Status เป็น FINISHED ทันที!
      if (p1ReadyVal === 'FINISHED' && p2ReadyVal === 'FINISHED') {
        finalStatus = 'FINISHED';
        sheet.getRange(actualRow, 12).setValue('FINISHED');
      }
      
      return { 
        success: true, 
        p1Ready: p1ReadyVal, 
        p2Ready: p2ReadyVal, 
        status: finalStatus,
        p1Hp: p1Hp,
        p2Hp: p2Hp
      };
    }
  }
  return { success: false, error: 'Match not found' };
}

/**
 * 🛠️ ยกเลิกห้อง หรือออกจากห้อง
 */
function leaveMatch(matchId) {
  const ss = getSpreadsheet();
  if (!ss) return { success: false };
  
  const sheet = ss.getSheetByName('PVP_Matches');
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { success: false };

  const startRow = Math.max(2, lastRow - 30);
  const numRows = lastRow - startRow + 1;
  const data = sheet.getRange(startRow, 1, numRows, 13).getValues();
  
  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i][0] === matchId) {
      const actualRow = startRow + i;
      if (data[i][11] !== 'FINISHED') {
        sheet.getRange(actualRow, 12).setValue('CANCELLED');
      }
      return { success: true };
    }
  }
  return { success: false };
}

/**
 * 🛠️ ล้างห้องที่ค้างไว้นานๆ (ป้องกันห้องค้าง)
 * และเคลียร์แถวประวัติเก่าๆ เมื่อมีปริมาณมากเกินไป เพื่อสุขอนามัยที่ดีของ Database 🚀
 */
function cleanupStaleMatches(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;
  
  const startRow = Math.max(2, lastRow - 20);
  const numRows = lastRow - startRow + 1;
  const data = sheet.getRange(startRow, 1, numRows, 13).getValues();
  const now = new Date().getTime();
  
  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i][11] === 'WAITING') {
      const actualRow = startRow + i;
      const createdAt = new Date(data[i][12]).getTime();
      // ถ้านานกว่า 1 นาที (60000ms) ให้ยกเลิก
      if (now - createdAt > 60000) {
        sheet.getRange(actualRow, 12).setValue('CANCELLED');
      }
    }
  }

  // 🌟 กลไก Auto-Cleanup ระดับ Enterprise
  // ถ้าในตารางมีข้อมูลสะสมเยอะกว่า 500 แถว ระบบจะทำการลบแถวประวัติเก่าๆ ด้านบน 250 แถวทิ้งอัตโนมัติ
  // ทำให้ขนาดของตารางหดกลับมาเบาหวิว คงที่ ไม่บวม และรักษาความเร็ว 100% ตลอดกาลครับ!
  if (lastRow > 500) {
    try {
      sheet.deleteRows(2, 250); // ลบแถวข้อมูลที่ 2 ถึงแถวที่ 251 ทิ้ง (เหลือ 250 แถวหลังสุดไว้)
    } catch(e) {
      Logger.log("Auto-cleanup matches error: " + e.toString());
    }
  }
}

/**
 * 🛠️ ตั้งค่าความพร้อมของผู้เล่น
 */
function setPlayerReady(matchId, userId, isReady) {
  const ss = getSpreadsheet();
  if (!ss) return { success: false, error: 'Database not found' };
  
  const sheet = ss.getSheetByName('PVP_Matches');
  if (!sheet) return { success: false, error: 'PVP sheet not found' };
  
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { success: false, error: 'No matches found' };

  const startRow = Math.max(2, lastRow - 30);
  const numRows = lastRow - startRow + 1;
  const data = sheet.getRange(startRow, 1, numRows, 13).getValues();
  
  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i][0] === matchId) {
      const actualRow = startRow + i;
      const p1Id = data[i][1];
      const p2Id = data[i][2];
      
      let p1Ready = data[i][9] === true || data[i][9] === 'TRUE';
      let p2Ready = data[i][10] === true || data[i][10] === 'TRUE';
      
      if (p1Id === userId) {
        p1Ready = isReady;
        sheet.getRange(actualRow, 10).setValue(isReady); // Player1Ready
      } else if (p2Id === userId) {
        p2Ready = isReady;
        sheet.getRange(actualRow, 11).setValue(isReady); // Player2Ready
      }
      
      // ถ้ายืนยันพร้อมทั้งคู่ เปลี่ยนสถานะเป็น PLAYING
      let finalStatus = data[i][11];
      if (p1Ready && p2Ready) {
        finalStatus = 'PLAYING';
        sheet.getRange(actualRow, 12).setValue('PLAYING'); // Status = PLAYING
      }
      
      return {
        success: true,
        matchId: matchId,
        p1Id: p1Id,
        p2Id: p2Id,
        p1Name: data[i][3],
        p2Name: data[i][4],
        p1Avatar: data[i][5],
        p2Avatar: data[i][6],
        p1Hp: data[i][7],
        p2Hp: data[i][8],
        p1Ready: p1Ready,
        p2Ready: p2Ready,
        status: finalStatus
      };
    }
  }
  
  return { success: false, error: 'Match not found' };
}
