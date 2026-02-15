const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const hudPlayerHp = document.getElementById('player-hp');
const hudEnemyName = document.getElementById('enemy-name');
const hudEnemyHp = document.getElementById('enemy-hp');
const hudScore = document.getElementById('score');

const W = canvas.width, H = canvas.height;

let last = performance.now();
let score = 0;
let highScore = 0;

const startOverlay = document.getElementById('startOverlay');
const deathOverlay = document.getElementById('deathOverlay');
const restartBtn = document.getElementById('restartBtn');
let gameStarted = false;
let gameOver = false;

function rand(a,b){return Math.random()*(b-a)+a}

function showFloating(text,x,y,color='#fff'){
  floatingTexts.push({text,x,y,alpha:1,color,life:80});
}

const floatingTexts = [];

const player = {
  maxHp: 20,
  hp: 20,
  x: 120,
  y: H - 110, // place player lower so enemy is clearly above
  minX: 120,
  maxX: 680,
  radius: 22,
  speed: 200, // px/sec (increased)
  dir: 1 // 1 = right, -1 = left
};

// (removed reactive/deflect mechanic)

function makeEnemy(level=1){
  const names = ['Goblin','Skeleton','Bandit','Beast','Witch','Rogue','Brute','Imp'];
  const name = names[Math.floor(rand(0,names.length))];
  const hp = Math.floor(12 + level*4 + rand(0,6));
  return {
    name,
    maxHp: hp,
    hp: hp,
    x: W/2,
    y: 64, // enemy strikes from above (higher)
    radius: 30,
    fireTimer: 0,
    fireInterval: Math.max(0.6, 1.6 - level*0.05),
    damage: 2 + Math.floor(level/3),
    // pattern control
    patternCooldown: 0,
    pattern: 'aim'
    ,
    // horizontal movement
    moveTimer: 0,
    moveInterval: 2 + Math.random()*2,
    movePhase: 0,
    moveType: Math.random() < 0.5 ? 'sine' : 'patrol',
    moveAmp: 90 + Math.random()*60,
    moveSpeed: 1 + Math.random()*1.4,
    dir: Math.random() < 0.5 ? 1 : -1,
    targetX: W/2
  };
}

let level = 1;
let enemy = makeEnemy(level);

const playerBullets = [];
const enemyBullets = [];
const potions = [];
let nextPotionTime = rand(8,16);

let playerFireCooldown = 0.22; // seconds (faster auto-fire)
let playerFireTimer = 0;

// input: pressing space toggles direction
window.addEventListener('keydown', e => {
  if(e.code === 'Space'){
    if(gameOver){
      restartGame();
      return;
    }
    if(!gameStarted){
      gameStarted = true;
      if(startOverlay) startOverlay.style.display = 'none';
      return;
    }
    // toggle direction immediately
    player.dir *= -1;
  }
});

if(restartBtn){
  restartBtn.addEventListener('click', () => restartGame());
}

function restartGame(){
  // reset core state
  gameOver = false;
  gameStarted = true;
  if(deathOverlay) deathOverlay.style.display = 'none';
  if(startOverlay) startOverlay.style.display = 'none';
  score = 0;
  level = 1;
  player.hp = player.maxHp;
  player.x = player.minX;
  player.dir = 1;
  playerBullets.length = 0;
  enemyBullets.length = 0;
  enemy = makeEnemy(level);
}

// load high score from localStorage
try{ highScore = parseInt(localStorage.getItem('oba_highscore') || '0', 10) || 0; }catch(e){ highScore = 0; }
const highScoreEl = document.getElementById('highscore');
if(highScoreEl) highScoreEl.textContent = highScore;

function spawnPlayerBullet(){
  // fire straight upward (no auto-aim)
  const sx = player.x;
  const sy = player.y - player.radius - 6;
  const speed = 520;
  playerBullets.push({x: sx, y: sy, vx: 0, vy: -speed, r:6, dmg: 3});
}

function spawnEnemyBullet(){
  // choose pattern per shot (or keep recent pattern briefly)
  if(enemy.patternCooldown <= 0){
    enemy.pattern = Math.random() < 0.6 ? 'aim' : 'spray';
    enemy.patternCooldown = 0.6 + Math.random()*1.2; // keep pattern for a short burst
  }

  if(enemy.pattern === 'aim'){
    // single aimed shot toward player (from above)
    const angle = Math.atan2((player.y + rand(-18,18)) - (enemy.y + enemy.radius), (player.x) - enemy.x);
    const speed = 260 + rand(-20,20);
    enemyBullets.push({x: enemy.x, y: enemy.y + enemy.radius + 6, vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed, r:8, dmg: enemy.damage});
  } else {
    // spray pattern: several bullets in a downward arc
    const bullets = 7;
    const baseAngle = Math.PI/2; // straight down
    const spread = 0.9 + Math.min(1.2, 0.05 * level); // widen slightly with level
    for(let i=0;i<bullets;i++){
      const t = bullets===1?0:i/(bullets-1);
      const angle = baseAngle - spread/2 + t*spread + rand(-0.04,0.04);
      const speed = 200 + rand(-20,30);
      enemyBullets.push({x: enemy.x - (i - (bullets-1)/2)*6, y: enemy.y + enemy.radius + 6, vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed, r:7, dmg: Math.max(1, Math.floor(enemy.damage*0.8))});
    }
  }
}

function spawnPotion(){
  // spawn a falling health potion at a random x near play area
  const margin = 80;
  const x = margin + Math.random() * (W - margin*2);
  const y = -18;
  const vy = 140 + Math.random()*60;
  const heal = 6 + Math.floor(Math.random()*4); // 6-9 HP
  potions.push({x,y,vy,r:10,heal});
}

// deflect mechanic removed

function update(dt){
  if(!gameStarted) return; // pause gameplay until player starts

  // no reactive window (player damage handled normally)

  // player movement
  player.x += player.speed * player.dir * dt;
  if(player.x < player.minX){ player.x = player.minX; player.dir = 1; }
  if(player.x > player.maxX){ player.x = player.maxX; player.dir = -1; }

  // enemy horizontal movement patterns (smoothed)
  enemy.moveTimer += dt;
  // slowly change movement parameters at intervals
  if(enemy.moveTimer >= enemy.moveInterval){
    enemy.moveTimer = 0;
    enemy.moveInterval = 1.2 + Math.random()*2.2;
    enemy.moveType = Math.random() < 0.6 ? 'sine' : 'patrol';
    enemy.moveAmp = 70 + Math.random()*90;
    enemy.moveSpeed = 0.9 + Math.random()*1.6;
    enemy.dir = Math.random() < 0.5 ? 1 : -1;
    // pick a new patrol target when switching to patrol
    const margin = 80;
    if(enemy.moveType === 'patrol'){
      enemy.targetX = margin + Math.random() * (W - margin*2);
    }
  }

  // movement update
  if(enemy.moveType === 'sine'){
    enemy.movePhase += enemy.moveSpeed * dt * 1.2;
    // keep phase bounded to avoid precision growth
    if(enemy.movePhase > Math.PI*1000) enemy.movePhase %= (Math.PI*2);
    // smooth sine motion around center
    const target = W/2 + Math.sin(enemy.movePhase) * enemy.moveAmp;
    // lerp to target for smoothing
    enemy.x += (target - enemy.x) * Math.min(1, 7 * dt);
  } else {
    // patrol: move toward targetX smoothly
    const speed = 80 * enemy.moveSpeed; // px/sec
    const dx = enemy.targetX - enemy.x;
    if(Math.abs(dx) < 6){
      // pick a new nearby target to keep motion
      const margin = 80;
      enemy.targetX = margin + Math.random() * (W - margin*2);
    } else {
      enemy.x += Math.sign(dx) * speed * dt;
    }
    // keep within bounds
    const margin = 60;
    enemy.x = Math.min(Math.max(enemy.x, margin), W - margin);
  }

  // decrement pattern cooldown smoothly
  enemy.patternCooldown = Math.max(0, enemy.patternCooldown - dt);

  // auto-fire player
  playerFireTimer -= dt;
  if(playerFireTimer <= 0){ spawnPlayerBullet(); playerFireTimer = playerFireCooldown; }

  // enemy fire
  enemy.fireTimer += dt;
  if(enemy.fireTimer >= enemy.fireInterval){ spawnEnemyBullet(); enemy.fireTimer = 0; enemy.fireInterval = Math.max(0.5, 1.6 - level*0.05 + rand(-0.2,0.2)); }

  // potion spawn timer
  nextPotionTime -= dt;
  if(nextPotionTime <= 0){
    // 50% chance to actually spawn a potion
    if(Math.random() < 0.5){ spawnPotion(); }
    nextPotionTime = rand(10,20);
  }

  // update bullets
  for(let i=playerBullets.length-1;i>=0;i--){
    const b = playerBullets[i]; b.x += b.vx*dt; b.y += b.vy*dt;
    // offscreen
    if(b.x > W + 50) playerBullets.splice(i,1);
    else {
      // collision with enemy
      const dx = b.x - enemy.x, dy = b.y - enemy.y;
      if(Math.hypot(dx,dy) < b.r + enemy.radius){ enemy.hp -= b.dmg; playerBullets.splice(i,1); showFloating('-' + b.dmg, enemy.x, enemy.y - 30, '#ffea00'); }
    }
  }

  for(let i=enemyBullets.length-1;i>=0;i--){
    const b = enemyBullets[i]; b.x += b.vx*dt; b.y += b.vy*dt;
    if(b.x < -50 || b.y < -50 || b.y > H + 50) enemyBullets.splice(i,1);
    else {
      const dx = b.x - player.x, dy = b.y - player.y;
      if(Math.hypot(dx,dy) < b.r + player.radius){
        player.hp -= b.dmg;
        enemyBullets.splice(i,1);
        showFloating('-' + b.dmg, player.x, player.y - 30, '#ff6b6b');
      }
    }
  }

  // update potions
  for(let i=potions.length-1;i>=0;i--){
    const p = potions[i];
    p.y += p.vy * dt;
    if(p.y > H + 40) potions.splice(i,1);
    else {
      const dx = p.x - player.x, dy = p.y - player.y;
      if(Math.hypot(dx,dy) < p.r + player.radius){
        // collect
        const healed = Math.min(player.maxHp - player.hp, p.heal);
        player.hp = Math.min(player.maxHp, player.hp + p.heal);
        showFloating('+' + (healed>0?healed:p.heal), player.x, player.y - 30, '#6da8ff');
        potions.splice(i,1);
      }
    }
  }

  // floating texts update
  for(let i=floatingTexts.length-1;i>=0;i--){
    const f = floatingTexts[i]; f.y -= dt*30; f.life -= dt*40; f.alpha = Math.max(0, f.life/80); if(f.life <= 0) floatingTexts.splice(i,1);
  }

  // check enemy death
  if(enemy.hp <= 0){ score += level*10; level++; showFloating('Enemy Down!', enemy.x, enemy.y - 40, '#ffd54f'); enemy = makeEnemy(level); }

  // update high score when score increases
  if(score > highScore){ highScore = score; try{ localStorage.setItem('oba_highscore', String(highScore)); }catch(e){} if(highScoreEl) highScoreEl.textContent = highScore; }

  // check player death
  if(player.hp <= 0 && !gameOver){
    showFloating('You Died', W/2, H/2, '#ff6666');
    gameOver = true;
    gameStarted = false;
    // show death overlay
    if(deathOverlay) deathOverlay.style.display = 'flex';
  }
}

function draw(){
  ctx.clearRect(0,0,W,H);
  // background
  ctx.fillStyle = '#202020'; ctx.fillRect(0,0,W,H);

  // draw enemy (red)
  ctx.save(); ctx.translate(enemy.x, enemy.y);
  ctx.fillStyle = '#e74c3c'; ctx.beginPath(); ctx.arc(0,0,enemy.radius,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.font='16px system-ui'; ctx.textAlign='center'; ctx.fillText(enemy.name,0,-enemy.radius-12);
  ctx.restore();

  // draw player
  ctx.save(); ctx.translate(player.x, player.y);
  ctx.fillStyle = '#3498db'; ctx.beginPath(); ctx.arc(0,0,player.radius,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.font='14px system-ui'; ctx.textAlign='center'; ctx.fillText('You',0,-player.radius-10);
  ctx.restore();

  // draw bullets
  for(const b of playerBullets){ ctx.fillStyle = '#ffd54f'; ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,Math.PI*2); ctx.fill(); }
  for(const b of enemyBullets){ ctx.fillStyle = '#ff6b6b'; ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,Math.PI*2); ctx.fill(); }

  // draw potions
  for(const p of potions){
    ctx.save();
    ctx.beginPath(); ctx.fillStyle = '#6da8ff'; ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = '#000000'; ctx.font = '12px system-ui'; ctx.textAlign='center'; ctx.fillText('HP', p.x, p.y+4);
    ctx.restore();
  }

  // draw line bounds
  ctx.strokeStyle = '#444'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(player.minX, player.y+player.radius+14); ctx.lineTo(player.maxX, player.y+player.radius+14); ctx.stroke();

  // HUD bars
  drawBar(40, 320, 260, 16, player.hp/player.maxHp, '#3498db');
  ctx.fillStyle='#ddd'; ctx.font='14px system-ui'; ctx.fillText('Player',170,310);
  drawBar(540, 320, 260, 16, Math.max(0,enemy.hp/enemy.maxHp), '#e74c3c');
  ctx.fillStyle='#ddd'; ctx.font='14px system-ui'; ctx.fillText(enemy.name,670,310);

  // floating texts
  for(const f of floatingTexts){ ctx.globalAlpha = f.alpha; ctx.fillStyle = f.color; ctx.font='18px system-ui'; ctx.textAlign='center'; ctx.fillText(f.text, f.x, f.y); ctx.globalAlpha = 1; }

  // HUD values
  hudPlayerHp.textContent = `${player.hp}/${player.maxHp}`;
  hudEnemyName.textContent = enemy.name;
  hudEnemyHp.textContent = `${Math.max(0,enemy.hp)}/${enemy.maxHp}`;
  hudScore.textContent = score;
}

function drawBar(x,y,w,h,frac,color){ ctx.fillStyle='#444'; ctx.fillRect(x,y,w,h); ctx.fillStyle=color; ctx.fillRect(x,y,w*frac,h); ctx.strokeStyle='#000'; ctx.strokeRect(x,y,w,h); }

function loop(now){ const dt = (now - last)/1000; last = now; update(dt); draw(); requestAnimationFrame(loop); }

requestAnimationFrame(loop);
