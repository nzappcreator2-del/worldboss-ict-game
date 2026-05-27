// ⚡ pose-worker.js - เธรดแยกประมวลผลกล้อง AI (MediaPipe Pose Web Worker Thread)
// ออกแบบโดยประยุกต์ใช้ ImageBitmap Transferable เพื่อความลื่นไหลแบบสุดขีด 60 FPS ปราศจากความหน่วงบนหน้าจอหลัก!

importScripts('https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js');

let poseInstance = null;

// ฟังก์ชันเริ่มต้นโมเดล MediaPipe Pose ใน Worker
function initPoseInWorker() {
    if (poseInstance) return;
    
    poseInstance = new Pose({
        locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
        }
    });
    
    poseInstance.setOptions({
        modelComplexity: 0, // โมเดลแบบเบาสุดเพื่อสเปกเครื่องโรงเรียน
        smoothLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });
    
    poseInstance.onResults((results) => {
        // ส่งเฉพาะพิกัดกระดูกที่จำเป็นกลับไปที่เธรดหลักเท่านั้น เพื่อลดภาระและขนาดแพ็กเก็ตข้อมูล
        if (results.poseLandmarks) {
            self.postMessage({
                action: 'poseResults',
                poseLandmarks: results.poseLandmarks
            });
        } else {
            self.postMessage({
                action: 'poseResults',
                poseLandmarks: null
            });
        }
    });
}

// รับสัญญาณเฟรมกล้องข้ามเธรด
self.onmessage = async function(event) {
    const data = event.data;
    if (data.action === 'init') {
        initPoseInWorker();
        self.postMessage({ action: 'ready' });
    } else if (data.action === 'processFrame') {
        const imageBitmap = data.imageBitmap;
        if (!imageBitmap) return;
        
        try {
            if (!poseInstance) {
                initPoseInWorker();
            }
            // ส่งเฟรม ImageBitmap เข้าไปประมวลผลในตัวโมเดล MediaPipe
            await poseInstance.send({ image: imageBitmap });
        } catch(e) {
            self.postMessage({ action: 'error', error: e.toString() });
        } finally {
            // สำคัญที่สุด: ต้องปิด (close) ImageBitmap เพื่อเคลียร์แรมในระบบ ป้องกัน Memory Leak 100%
            imageBitmap.close();
        }
    }
};
