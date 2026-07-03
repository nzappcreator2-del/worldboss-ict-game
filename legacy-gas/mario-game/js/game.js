// 🎵 ป้องกัน Autoplay Rejection พังการทำงานของเกมหลัก (Safe Audio Wrapper)
(function() {
  const originalPlay = Audio.prototype.play;
  Audio.prototype.play = function() {
    const promise = originalPlay.apply(this, arguments);
    if (promise !== undefined) {
      promise.catch(error => {
        console.warn("🔊 ระบบการเล่นเสียงถูกระงับชั่วคราวเนื่องจาก Autoplay Policy ของเบราว์เซอร์:", error);
      });
    }
    return promise;
  };
})();

var requestAnimFrame = (function(){
  return window.requestAnimationFrame       ||
    window.webkitRequestAnimationFrame ||
    window.mozRequestAnimationFrame    ||
    window.oRequestAnimationFrame      ||
    window.msRequestAnimationFrame     ||
    function(callback){
      window.setTimeout(callback, 1000 / 60);
    };
})();

//create the canvas
var canvas = document.createElement("canvas");
var ctx = canvas.getContext('2d');
var updateables = [];
var fireballs = [];
var player = new Mario.Player([0,0]);

//we might have to get the size and calculate the scaling
//but this method should let us make it however big.
//Cool!
//TODO: Automatically scale the game to work and look good on widescreen.
//TODO: fiddling with scaled sprites looks BETTER, but not perfect. Hmm.
canvas.width = 256;
canvas.height = 240;
// ctx.scale(3,3);
document.body.appendChild(canvas);

//viewport
var vX = 0,
    vY = 0,
    vWidth = 256,
    vHeight = 240;

//load our images
resources.load([
  'sprites/player.png',
  'sprites/enemy.png',
  'sprites/tiles.png',
  'sprites/playerl.png',
  'sprites/items.png',
  'sprites/enemyr.png',
]);

resources.onReady(function() {
  // แจ้งหน้าต่าง index.html ว่า Assets ทั้งหมดโหลดพร้อมใช้งาน
  if (typeof window.onMarioAssetsReady === 'function') {
    window.onMarioAssetsReady();
  }
  
  // แนบฟังก์ชันเริ่มต้น Emulator และลูปเกมลงใน window
  window.initMarioGameLoop = function() {
    init();
  };
});
var level;
var sounds;
var music;

//initialize
var lastTime;
var accumulator = 0.0;
var fixed_dt = 1.0 / 60.0; // Fixed Time Step ที่ 60Hz (~0.01667 วินาที)

// ฟังก์ชันสร้าง Mock/Dummy Audio Object เพื่อปิดเสียงมาริโอ้ 100% ตามความต้องการของผู้ใช้
function createDummyAudio() {
  return {
    play: function() { return Promise.resolve(); },
    pause: function() {},
    cloneNode: function() { return this; },
    addEventListener: function() {},
    removeEventListener: function() {},
    volume: 0,
    muted: true,
    currentTime: 0,
    paused: true
  };
}

function init() {
  // สร้าง Dummy Audio เพื่อปิดเสียงดนตรีประกอบทั้งหมดอย่างสะอาดสะอ้าน
  music = {
    overworld: createDummyAudio(),
    underground: createDummyAudio(),
    clear: createDummyAudio(),
    death: createDummyAudio()
  };
  window.music = music;

  // สร้าง Dummy Audio เพื่อปิดเสียงเอฟเฟกต์ทั้งหมดในเกม
  sounds = {
    smallJump: createDummyAudio(),
    bigJump: createDummyAudio(),
    breakBlock: createDummyAudio(),
    bump: createDummyAudio(),
    coin: createDummyAudio(),
    fireball: createDummyAudio(),
    flagpole: createDummyAudio(),
    kick: createDummyAudio(),
    pipe: createDummyAudio(),
    itemAppear: createDummyAudio(),
    powerup: createDummyAudio(),
    stomp: createDummyAudio()
  };
  window.sounds = sounds;
  
  Mario.oneone();
  lastTime = Date.now();
  accumulator = 0.0; // รีเซ็ตสะสมเวลา
  main();
}

var gameTime = 0;

//set up the game loop
function main() {
  var now = Date.now();
  var dt = (now - lastTime) / 1000.0;
  
  // 🛡️ ป้องกันปัญหา Spiral of Death และอาการเครื่องค้างชั่วขณะ (แคปเดลต้าไทม์สูงสุดที่ 0.15s)
  if (dt > 0.15) {
    dt = 0.15;
  }

  lastTime = now;
  accumulator += dt;

  // รันระบบฟิสิกส์และการเคลื่อนไหวให้ตรงกับเวลาจริงตาม Fixed Step 60Hz
  while (accumulator >= fixed_dt) {
    update(fixed_dt);
    accumulator -= fixed_dt;
  }

  // วาดเรนเดอร์ Canvas เพียง 1 ครั้งต่อเฟรมเพื่อประหยัดพลังงานการวาดหน้าจอสูงสุด!
  render();

  requestAnimFrame(main);
}

function update(dt) {
  // 🛡️ ป้องกันบั๊กการเคลื่อนไหวขณะทำควิซตอบคำถาม: ให้ข้ามฟิสิกส์ศัตรูและเวลานับถอยหลังของมาริโอ้
  if (window.isMarioPaused) {
    return;
  }

  gameTime += dt;

  handleInput(dt);
  updateEntities(dt, gameTime);

  checkCollisions();
}

function handleInput(dt) {
  if (player.piping || player.dying || player.noInput) return; //don't accept input

  if (input.isDown('RUN')){
    player.run();
  } else {
    player.noRun();
  }
  if (input.isDown('JUMP')) {
    player.jump();
  } else {
    //we need this to handle the timing for how long you hold it
    player.noJump();
  }

  if (input.isDown('DOWN')) {
    player.crouch();
  } else {
    player.noCrouch();
  }

  if (input.isDown('LEFT')) { // 'd' or left arrow
    player.moveLeft();
  }
  else if (input.isDown('RIGHT')) { // 'k' or right arrow
    player.moveRight();
  } else {
    player.noWalk();
  }
}

//update all the moving stuff
function updateEntities(dt, gameTime) {
  player.update(dt, vX);
  updateables.forEach (function(ent) {
    ent.update(dt, gameTime);
  });

  //This should stop the jump when he switches sides on the flag.
  if (player.exiting) {
    if (player.pos[0] > vX + 96)
      vX = player.pos[0] - 96;
  } else if (level.scrolling) {
    if (player.pos[0] > vX + 140) {
      vX = player.pos[0] - 140;
    } else if (player.pos[0] < vX + 80) {
      vX = player.pos[0] - 80;
    }
    if (vX < 0) {
      vX = 0;
    }
  }

  if (player.powering.length !== 0 || player.dying) { return; }
  level.items.forEach (function(ent) {
    ent.update(dt);
  });

  level.enemies.forEach (function(ent) {
    ent.update(dt, vX);
  });

  fireballs.forEach(function(fireball) {
    fireball.update(dt);
  });
  level.pipes.forEach (function(pipe) {
    pipe.update(dt);
  });
}

//scan for collisions
function checkCollisions() {
  if (player.powering.length !== 0 || player.dying) { return; }
  player.checkCollisions();

  //Apparently for each will just skip indices where things were deleted.
  level.items.forEach(function(item) {
    item.checkCollisions();
  });
  level.enemies.forEach (function(ent) {
    ent.checkCollisions();
  });
  fireballs.forEach(function(fireball){
    fireball.checkCollisions();
  });
  level.pipes.forEach (function(pipe) {
    pipe.checkCollisions();
  });
}

//draw the game!
function render() {
  updateables = [];
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = level.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  //scenery gets drawn first to get layering right.
  for(var i = 0; i < 15; i++) {
    for (var j = Math.floor(vX / 16) - 1; j < Math.floor(vX / 16) + 20; j++){
      if (level.scenery[i][j]) {
        renderEntity(level.scenery[i][j]);
      }
    }
  }

  //then items
  level.items.forEach (function (item) {
    renderEntity(item);
  });

  level.enemies.forEach (function(enemy) {
    renderEntity(enemy);
  });



  fireballs.forEach(function(fireball) {
    renderEntity(fireball);
  })

  //then we draw every static object.
  for(var i = 0; i < 15; i++) {
    for (var j = Math.floor(vX / 16) - 1; j < Math.floor(vX / 16) + 20; j++){
      if (level.statics[i][j]) {
        renderEntity(level.statics[i][j]);
      }
      if (level.blocks[i][j]) {
        renderEntity(level.blocks[i][j]);
        updateables.push(level.blocks[i][j]);
      }
    }
  }

  //then the player
  if (player.invincibility % 2 === 0) {
    renderEntity(player);
  }

  //Mario goes INTO pipes, so naturally they go after.
  level.pipes.forEach (function(pipe) {
    renderEntity(pipe);
  });
}

function renderEntity(entity) {
  entity.render(ctx, vX, vY);
}
