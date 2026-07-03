(function() {
    if (typeof Mario === 'undefined') window.Mario = {};

    let currentQuestion = null;
    let activeBlock = null;
    let quizTimeoutId = null;
    let countdownIntervalId = null;
    let currentQuestionIndex = 0;
    
    // คลังคำถาม ICT สำรองในกรณีเล่น Standalone หรือดึงจากหลังบ้านไม่สำเร็จ
    const fallbackQuestions = [
        {
            text: "โปรแกรมเมอร์ใช้ภาษาอะไรในการสั่งงานคอมพิวเตอร์เพื่อความถูกต้อง?",
            options: ["A: ภาษาเครื่อง/โค้ด (เช่น Python, JavaScript)", "B: ภาษากาย / ภาษาพูดตามธรรมชาติ"],
            answer: 1
        },
        {
            text: "โครงสร้างแบบใดในภาษาคอมพิวเตอร์ที่ใช้สั่งงานวนซ้ำคำสั่งเดิมๆ?",
            options: ["A: โครงสร้างแบบเงื่อนไข (If-Else)", "B: โครงสร้างแบบลูป (Loop / For / While)"],
            answer: 2
        },
        {
            text: "การแชร์พาสเวิร์ดบัญชีการเรียนให้บุคคลอื่นบนอินเทอร์เน็ต ปลอดภัยหรือไม่?",
            options: ["A: ไม่ปลอดภัย (อาจถูกขโมยข้อมูลและประวัติการเรียน)", "B: ปลอดภัยมาก (สะดวกดีเพื่อนจะได้ช่วยทำใบงาน)"],
            answer: 1
        },
        {
            text: "เทคโนโลยีใดที่ช่วยให้เครื่องจักรเกิดปัญญาประดิษฐ์และเรียนรู้ได้คล้ายมนุษย์?",
            options: ["A: AI (Artificial Intelligence)", "B: UI (User Interface)"],
            answer: 1
        },
        {
            text: "เครือข่ายคอมพิวเตอร์ที่เชื่อมต่อกันทั่วโลกเรียกว่าอะไร?",
            options: ["A: ระบบอินทราเน็ต (Intranet)", "B: ระบบอินเทอร์เน็ต (Internet)"],
            answer: 2
        }
    ];

    const MarioQuiz = Mario.Quiz = {
        isQuizActive: false,
        
        // 🔮 ฟังก์ชันเตรียมระบบควิซเมื่อเปิดด่าน
        init: function() {
            console.log("🎮 [MarioQuiz] initializing...");
            this.isQuizActive = false;
            window.isMarioPaused = false;
            
            // ร้องขอคำถามจากหน้าแม่เผื่อมีการส่งมาแล้ว
            if (window.parent) {
                window.parent.postMessage({ action: 'getQuestionsRequest' }, '*');
            }
        },

        // 🔮 ฟังก์ชันเรียกเมื่อผู้เล่นกระโดดชนบล็อกปริศนา (Question Block)
        triggerQuiz: function(block) {
            if (this.isQuizActive) return;
            
            console.log("❓ [MarioQuiz] Quiz block triggered!");
            this.isQuizActive = true;
            window.isMarioPaused = true; // หยุดเวลาและฟิสิกส์ในเกมทั้งหมดทันที
            activeBlock = block;
            
            // ปล่อยคำสั่งเคลื่อนไหวในปุ่มกดค้างของมาริโอ้เพื่อความนิ่ง
            if (window.input && typeof window.input.clear === 'function') {
                window.input.clear();
            }

            // เลือกคำถามถัดไป
            const questions = window.marioQuestions || fallbackQuestions;
            if (currentQuestionIndex >= questions.length) {
                currentQuestionIndex = 0; // เล่นวนซ้ำถ้าหมดชุด
            }
            
            currentQuestion = questions[currentQuestionIndex];
            currentQuestionIndex++;

            // แสดงหน้าตา UI ควิซ 8-bit
            this.showQuizUI(currentQuestion);
        },

        // 🔮 แสดงหน้าต่างคำถามสไตล์ 8-bit เรโทรโมเดิร์น
        showQuizUI: function(q) {
            let container = document.getElementById('mario-quiz-overlay');
            if (!container) {
                // สร้างกล่อง Overlay ครอบจอ Canvas สไตล์นีออนเรโทร 8-bit
                container = document.createElement('div');
                container.id = 'mario-quiz-overlay';
                container.style.cssText = `
                    position: absolute;
                    inset: 10px;
                    background: rgba(15, 23, 42, 0.95);
                    border: 4px solid #f59e0b;
                    border-radius: 12px;
                    z-index: 8888;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: 16px;
                    box-sizing: border-box;
                    color: #fff;
                    font-family: 'Prompt', 'Mali', sans-serif;
                    box-shadow: 0 0 25px rgba(245, 158, 11, 0.6), inset 0 0 15px rgba(245, 158, 11, 0.2);
                    text-align: center;
                    overflow: hidden;
                `;
                document.body.appendChild(container);
            }
            
            container.style.display = 'flex';
            
            // หน้าตาเนื้อหาควิซสไตล์เก๋ๆ
            container.innerHTML = `
                <!-- หัวข้อระดับเกียรติยศ -->
                <div style="font-size: 14px; font-weight: 900; color: #fbbf24; text-shadow: 0 1px 4px rgba(0,0,0,0.8); margin-bottom: 6px; letter-spacing: 1px; font-family: monospace;">
                    ⚡ ICT CHALLENGE ? BLOCK ⚡
                </div>
                
                <!-- โจทย์คำถามขนาดเหมาะมืออ่านง่าย -->
                <div id="mario-quiz-question-text" style="font-size: 11px; font-weight: bold; line-height: 1.5; color: #f8fafc; margin-bottom: 12px; max-width: 100%; word-wrap: break-word; padding: 0 5px; min-height: 36px; display: flex; align-items: center; justify-content: center;">
                    ${q.text}
                </div>
                
                <!-- ตัวเลือกสำหรับเล่นและเคลื่อนไหว -->
                <div style="width: 100%; display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px;">
                    <!-- ตัวเลือก A: ท่ากระโดด -->
                    <div id="opt-btn-a" onclick="window.MarioQuiz.submitAnswer(1)" style="background: linear-gradient(135deg, #ef4444, #b91c1c); border: 2px solid #fff; border-radius: 8px; padding: 8px; font-size: 9px; font-weight: 800; text-align: left; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 8px; box-shadow: 0 3px 6px rgba(0,0,0,0.3);">
                        <span style="background: #fff; color: #ef4444; border-radius: 4px; padding: 1px 5px; font-weight: 900; font-family: monospace;">A</span>
                        <div style="flex: 1; white-space: normal; line-height: 1.3;">${q.options[0]}</div>
                        <span style="font-size: 7px; color: #fee2e2; border: 1px solid rgba(255,255,255,0.4); border-radius: 4px; padding: 1px 3px; font-family: sans-serif;">🦘 ท่ากระโดด</span>
                    </div>
                    
                    <!-- ตัวเลือก B: ท่าย่อเข่า -->
                    <div id="opt-btn-b" onclick="window.MarioQuiz.submitAnswer(2)" style="background: linear-gradient(135deg, #3b82f6, #1d4ed8); border: 2px solid #fff; border-radius: 8px; padding: 8px; font-size: 9px; font-weight: 800; text-align: left; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 8px; box-shadow: 0 3px 6px rgba(0,0,0,0.3);">
                        <span style="background: #fff; color: #3b82f6; border-radius: 4px; padding: 1px 5px; font-weight: 900; font-family: monospace;">B</span>
                        <div style="flex: 1; white-space: normal; line-height: 1.3;">${q.options[1]}</div>
                        <span style="font-size: 7px; color: #dbeafe; border: 1px solid rgba(255,255,255,0.4); border-radius: 4px; padding: 1px 3px; font-family: sans-serif;">🧘 ท่าย่อตัว</span>
                    </div>
                </div>

                <!-- แถบเวลาและตัวนำทางผู้ใช้ -->
                <div style="width: 100%; display: flex; align-items: center; justify-content: space-between; font-size: 8px; color: #94a3b8;">
                    <div>*ทำท่าทางหน้ากล้องควิซเพื่อส่งคำตอบ</div>
                    <div style="font-weight: 900; color: #f59e0b; display: flex; align-items: center; gap: 4px;">
                        ⏱️ TIME: <span id="mario-quiz-timer" style="color: #f43f5e; font-size: 10px; font-family: monospace; font-weight: 900;">15</span>s
                    </div>
                </div>
                <div id="mario-quiz-timer-bar" style="width: 100%; height: 3px; background-color: #1e293b; margin-top: 4px; border-radius: 2px; overflow: hidden;">
                    <div id="mario-quiz-timer-fill" style="width: 100%; height: 100%; background-color: #f43f5e; transition: width 1s linear;"></div>
                </div>
            `;

            // ตั้งเวลานับถอยหลัง 15 วินาที
            let timeLeft = 15;
            const timerEl = document.getElementById('mario-quiz-timer');
            const timerFillEl = document.getElementById('mario-quiz-timer-fill');
            
            if (countdownIntervalId) clearInterval(countdownIntervalId);
            if (quizTimeoutId) clearTimeout(quizTimeoutId);

            countdownIntervalId = setInterval(() => {
                timeLeft--;
                if (timerEl) timerEl.innerText = timeLeft;
                if (timerFillEl) {
                    timerFillEl.style.width = (timeLeft / 15 * 100) + '%';
                }
                
                if (timeLeft <= 0) {
                    clearInterval(countdownIntervalId);
                    this.submitAnswer(-1); // หมดเวลา
                }
            }, 1000);
        },

        // 🔮 ฟังก์ชันรับและประมวลผลคำตอบ (1=A, 2=B, -1=หมดเวลา)
        submitAnswer: function(selectedOpt) {
            if (!this.isQuizActive) return;
            
            // ล้างบิลจองเวลา
            if (countdownIntervalId) clearInterval(countdownIntervalId);
            if (quizTimeoutId) clearTimeout(quizTimeoutId);
            
            const isCorrect = (selectedOpt === currentQuestion.answer);
            const overlay = document.getElementById('mario-quiz-overlay');
            
            console.log(`📝 [MarioQuiz] Answer submitted: ${selectedOpt} (Correct answer: ${currentQuestion.answer}). Result: ${isCorrect}`);

            // เล่นเสียงแจ้งผล
            if (isCorrect) {
                if (typeof sounds !== 'undefined' && sounds.coin) {
                    sounds.coin.currentTime = 0;
                    sounds.coin.play();
                }
            } else {
                if (typeof sounds !== 'undefined' && sounds.bump) {
                    sounds.bump.currentTime = 0;
                    sounds.bump.play();
                }
            }

            // แสดงเอฟเฟกต์สีสันความสำเร็จ/ล้มเหลวชั่วครู่
            if (overlay) {
                overlay.style.borderColor = isCorrect ? '#22c55e' : '#ef4444';
                overlay.style.boxShadow = isCorrect ? '0 0 25px rgba(34, 197, 94, 0.8)' : '0 0 25px rgba(239, 68, 68, 0.8)';
                
                const qTextEl = document.getElementById('mario-quiz-question-text');
                if (qTextEl) {
                    qTextEl.innerHTML = isCorrect ? 
                        `<span style="color: #22c55e; font-size: 14px; font-weight: 900; animation: bounce 0.5s infinite;">🌟 สุดยอดมาก! ตอบคำถามถูกต้องครับ! 🌟</span>` : 
                        (selectedOpt === -1 ? 
                            `<span style="color: #ef4444; font-size: 13px; font-weight: 900;">⏱️ เสียใจด้วยจ้า! หมดเวลาตอบคำถาม!</span>` : 
                            `<span style="color: #ef4444; font-size: 13px; font-weight: 900;">💥 ตอบผิดแล้วจ้า! ลองใหม่อีกครั้งในบล็อกหน้า!</span>`
                        );
                }
                
                // ไฮไลต์ปุ่มคำตอบ
                const btnA = document.getElementById('opt-btn-a');
                const btnB = document.getElementById('opt-btn-b');
                
                if (btnA && btnB) {
                    btnA.style.opacity = (currentQuestion.answer === 1) ? '1' : '0.2';
                    btnB.style.opacity = (currentQuestion.answer === 2) ? '1' : '0.2';
                    
                    if (isCorrect) {
                        const correctBtn = (currentQuestion.answer === 1) ? btnA : btnB;
                        correctBtn.style.transform = 'scale(1.05)';
                        correctBtn.style.borderColor = '#22c55e';
                    } else {
                        const wrongBtn = (selectedOpt === 1) ? btnA : (selectedOpt === 2 ? btnB : null);
                        if (wrongBtn) {
                            wrongBtn.style.transform = 'scale(0.95)';
                            wrongBtn.style.borderColor = '#ef4444';
                        }
                    }
                }
            }

            // หน่วงเวลา 1.5 วินาทีเพื่อให้เห็นผลผลสัมฤทธิ์ ก่อนเล่นต่อ
            setTimeout(() => {
                this.closeQuiz(isCorrect);
            }, 1500);
        },

        // 🔮 ปิดควิซ มอบรางวัล/บทลงโทษ และเดินเกมต่อ
        closeQuiz: function(isCorrect) {
            this.isQuizActive = false;
            
            // ซ่อนหน้าจอ Overlay
            const overlay = document.getElementById('mario-quiz-overlay');
            if (overlay) overlay.style.display = 'none';

            // ส่งข้อมูลกลับไปยังหน้าแม่ worldboss.html
            if (window.parent) {
                if (isCorrect) {
                    window.parent.postMessage({ action: 'healPlayer' }, '*');
                    window.parent.postMessage({ action: 'addQuizCoin' }, '*');
                } else {
                    window.parent.postMessage({ action: 'damagePlayer' }, '*');
                }
            }

            // 🌟 รางวัล/บทลงโทษ ในเกมมาริโอ้
            if (isCorrect) {
                // 1. ปล่อยแอนิเมชันเหรียญทองยักษ์เด้งออกมาจากบล็อกปริศนา
                if (activeBlock) {
                    // สร้าง Bcoin เด้งลอยขึ้นมาจากบล็อกเพื่อให้แอนิเมชันสวยงาม
                    const coinX = activeBlock.pos[0];
                    const coinY = activeBlock.pos[1] - 16;
                    
                    if (typeof Mario !== 'undefined' && typeof Mario.Bcoin === 'function') {
                        const bounceCoin = new Mario.Bcoin([coinX, coinY]);
                        bounceCoin.spawn();
                    }
                    
                    // อัปเดตคะแนนมาริโอ้
                    if (typeof player !== 'undefined') {
                        player.coins = (player.coins || 0) + 1;
                        // เพิ่มจำนวนศัตรูที่ฆ่า (หรือ Rep) เพื่อกระตุ้นดาเมจบอส Bowser ในหน้าหลักด้วย
                        player.enemyKills = (player.enemyKills || 0) + 1;
                    }
                }
                
                // 2. อัปเกรดร่างมาริโอ้ (Super / Fire Mario) ทันทีเสมือนการเติมพลัง!
                if (typeof player !== 'undefined' && typeof player.powerUp === 'function') {
                    player.powerUp(-1); // ส่ง -1 เพื่อปลอดภัยไม่ทำลายไอเทมใดใน level.items
                }
            } else {
                // 3. มาริโอ้ได้รับความเสียหาย (Damage) ตัวหดลงหรือเสียพลัง
                if (typeof player !== 'undefined' && typeof player.damage === 'function') {
                    player.damage();
                }
            }

            // 4. บล็อกปริศนาเปลี่ยนสถานะกลายเป็นบล็อกว่าง (Used Block) เพื่อป้องกันสแปมชนซ้ำ
            if (activeBlock) {
                activeBlock.standing = false;
                activeBlock.item = null;
                if (activeBlock.bounceSprite) {
                    activeBlock.osprite = activeBlock.sprite;
                    activeBlock.sprite = activeBlock.bounceSprite;
                } else {
                    activeBlock.sprite = activeBlock.usedSprite;
                }
                activeBlock.vel[1] = -2;
            }

            activeBlock = null;
            currentQuestion = null;
            
            // รอสักครู่แล้วคลาย Pause เพื่อให้เกมมาริโอ้วิ่งต่อได้ลื่นไหล
            setTimeout(() => {
                window.isMarioPaused = false;
            }, 100);
        }
    };

    // ประกาศไว้ใน global scope เพื่อใช้ดักเรียก
    window.MarioQuiz = MarioQuiz;
    
    // ตั้งค่า onload เพื่อทำการ register API
    window.addEventListener('load', () => {
        window.MarioQuiz.init();
    });
})();
