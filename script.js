"use strict";

/* PADEL CLASH — compact game engine, pause menu and Web Audio */
const $ = (id) => document.getElementById(id);
const canvas = $("gameCanvas");
const ctx = canvas.getContext("2d", { alpha: false });

const levels = {
  easy: { label: "EASY MODE", speed: 3.0, accuracy: .72, reaction: .70, power: .17 },
  medium: { label: "MEDIUM MODE", speed: 3.8, accuracy: .82, reaction: .82, power: .19 },
  hard: { label: "HARD MODE", speed: 4.5, accuracy: .90, reaction: .91, power: .21 },
  extreme: { label: "EXTREME MODE", speed: 5.2, accuracy: .96, reaction: .97, power: .23 },
  impossible: { label: "IMPOSSIBLE MODE", speed: 6.0, accuracy: .995, reaction: 1, power: .25 }
};
let level = levels.easy, difficulty = "easy", running = false, isPaused = false;
let lastTime = 0, screenW = 900, screenH = 500, dpr = 1;
let playerScore = 0, cpuScore = 0, rallyCount = 0, bounceCount = 0;
let pointTimer = 0, bannerTimer = 0, shake = 0, lastHitTime = 0, cpuThink = 0;
let rafId = 0, endTimer = 0, trail = [];
const keys = Object.create(null);
const touchMove = { left: false, right: false, up: false, down: false };
const player = { x: 0, z: 7, targetX: 0, targetZ: 7, swing: 0, color: "#c8ff49", name: "PLAYER 1" };
const cpu = { x: 0, z: -7, targetX: 0, targetZ: -7, swing: 0, color: "#48e4ff", name: "CPU" };
const ball = { x: 0, z: 0, y: 1.8, vx: 0, vz: .15, vy: 0, radius: .12, active: false };

const audio = {
  context: null, master: .70, music: .35, ball: .80, ambience: .20, muted: false,
  musicTimer: 0, step: 0, ambienceTimer: 0
};

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  screenW = Math.max(1, rect.width); screenH = Math.max(1, rect.height);
  canvas.width = Math.round(screenW * dpr); canvas.height = Math.round(screenH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawScene();
}
window.addEventListener("resize", resizeCanvas);

function project(x, z, y = 0) {
  const depth = Math.max(0, Math.min(1, (z + 10) / 20));
  const horizon = screenH * .205, groundY = horizon + depth * screenH * .59;
  const halfWidth = screenW * (.115 + depth * .39), scale = .62 + depth * .42;
  return { x: screenW / 2 + (x / 5) * halfWidth, y: groundY - y * screenH * .043 * scale, groundY, scale, halfWidth };
}
function poly(points, fill, stroke = null, width = 1) {
  ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}
function line(a, b, color, width = 1) {
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
}
function drawScene() {
  if (screenW <= 1 || screenH <= 1) return;
  ctx.clearRect(0, 0, screenW, screenH);
  const sky = ctx.createLinearGradient(0, 0, 0, screenH);
  sky.addColorStop(0, "#071526"); sky.addColorStop(.45, "#14384a"); sky.addColorStop(1, "#1c3440");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, screenW, screenH);
  drawLights(); drawWalls(); drawCourt(); drawNet(); drawCharacter(cpu, false); drawCharacter(player, true); drawTrail();
  if (ball.active) drawBall();
  const v = ctx.createRadialGradient(screenW / 2, screenH * .52, screenW * .1, screenW / 2, screenH * .52, screenW * .75);
  v.addColorStop(0, "transparent"); v.addColorStop(1, "#02081255"); ctx.fillStyle = v; ctx.fillRect(0, 0, screenW, screenH);
  if (isPaused) { ctx.fillStyle = "#0006"; ctx.fillRect(0, 0, screenW, screenH); }
}
function drawLights() {
  const y = screenH * .105;
  for (let i = 0; i < 5; i++) { const x = screenW * (.1 + i * .2); ctx.save(); ctx.shadowBlur = 20; ctx.shadowColor = "#c8f6ff"; ctx.fillStyle = "#e5fbff"; ctx.fillRect(x - 8, y, 16, 3); ctx.restore(); }
}
function drawWalls() {
  const bl = project(-5, -10), br = project(5, -10), fl = project(-5, 10), fr = project(5, 10);
  poly([{ x: bl.x, y: bl.y - screenH * .12 }, { x: fl.x, y: fl.y - screenH * .08 }, fl, bl], "#a3efff12", "#a9edff42");
  poly([{ x: br.x, y: br.y - screenH * .12 }, { x: fr.x, y: fr.y - screenH * .08 }, fr, br], "#9deeff10", "#a9edff42");
  poly([{ x: bl.x, y: bl.y - screenH * .12 }, { x: br.x, y: br.y - screenH * .12 }, br, bl], "#8be8ff0c", "#a9edff42");
  for (let i = 0; i <= 4; i++) { const z = -10 + i * 5; for (const x of [-5, 5]) { const p = project(x, z), h = screenH * (.12 + ((z + 10) / 20) * .08); line({ x: p.x, y: p.y - h }, p, "#a4eaff48"); } }
}
function drawCourt() {
  const bl = project(-5, -10), br = project(5, -10), fr = project(5, 10), fl = project(-5, 10);
  const g = ctx.createLinearGradient(0, bl.y, 0, fl.y); g.addColorStop(0, "#176f75"); g.addColorStop(.5, "#0c9a91"); g.addColorStop(1, "#08756f");
  poly([bl, br, fr, fl], g, "#d8fff2", 1.5);
  const cl = (x1, z1, x2, z2, w = 1.5) => line(project(x1, z1), project(x2, z2), "#edfff0d9", w);
  cl(-5, -10, 5, -10, 2); cl(-5, 10, 5, 10, 2); cl(-5, -10, -5, 10, 2); cl(5, -10, 5, 10, 2);
  cl(-3.3, -10, -3.3, 10); cl(3.3, -10, 3.3, 10); cl(-3.3, -5.5, 3.3, -5.5); cl(-3.3, 5.5, 3.3, 5.5); cl(0, -5.5, 0, 5.5, 1);
  ctx.save(); ctx.shadowColor = "#c8ff49"; ctx.shadowBlur = 9; cl(-5, 10, 5, 10, 1.3); ctx.restore();
}
function drawNet() {
  const l = project(-5, 0), r = project(5, 0), h = screenH * .055;
  poly([{ x: l.x, y: l.y - h }, { x: r.x, y: r.y - h }, r, l], "#b5c6c9", "#efffffaa", 1);
  ctx.save(); ctx.beginPath(); ctx.rect(l.x, l.y - h, r.x - l.x, h); ctx.clip(); ctx.strokeStyle = "#203b42a0"; ctx.lineWidth = .6;
  const step = Math.max(5, screenW * .009);
  for (let x = l.x; x <= r.x; x += step) { ctx.beginPath(); ctx.moveTo(x, l.y - h); ctx.lineTo(x, l.y); ctx.stroke(); }
  for (let y = l.y - h; y <= l.y; y += 5) { ctx.beginPath(); ctx.moveTo(l.x, y); ctx.lineTo(r.x, y); ctx.stroke(); } ctx.restore();
  line({ x: l.x, y: l.y - h }, { x: r.x, y: r.y - h }, "#fff", 2);
}
function drawCharacter(c, isPlayer) {
  const p = project(c.x, c.z), s = p.scale, size = isPlayer ? 1 : .84, bodyH = 39 * s * size, bodyW = 15 * s * size, headR = 7 * s * size, base = p.groundY;
  ctx.fillStyle = "#00141a66"; ctx.beginPath(); ctx.ellipse(p.x, base + 1, 18 * s * size, 6 * s * size, 0, 0, Math.PI * 2); ctx.fill();
  const moving = Math.abs(c.targetX - c.x) + Math.abs(c.targetZ - c.z) > .08, step = moving ? Math.sin(performance.now() * .018) * 4 * s : 0;
  const limb = (a, b, col, w) => line(a, b, col, w);
  limb({ x: p.x - 3 * s, y: base - 13 * s * size }, { x: p.x - 6 * s + step, y: base - 1 }, isPlayer ? "#d8e4e9" : "#8bb7c4", 4 * s * size);
  limb({ x: p.x + 3 * s, y: base - 13 * s * size }, { x: p.x + 6 * s - step, y: base - 1 }, isPlayer ? "#d8e4e9" : "#8bb7c4", 4 * s * size);
  limb({ x: p.x - 8 * s, y: base - 1 }, { x: p.x - 2 * s, y: base - 1 }, "#101d2b", 4 * s * size); limb({ x: p.x + 3 * s, y: base - 1 }, { x: p.x + 10 * s, y: base - 1 }, "#101d2b", 4 * s * size);
  ctx.fillStyle = isPlayer ? "#b7f33f" : "#32c9ec"; ctx.beginPath(); ctx.moveTo(p.x - bodyW / 2, base - 14 * s * size); ctx.lineTo(p.x - bodyW * .42, base - bodyH + 10 * s * size); ctx.quadraticCurveTo(p.x, base - bodyH + 3 * s * size, p.x + bodyW * .42, base - bodyH + 10 * s * size); ctx.lineTo(p.x + bodyW / 2, base - 14 * s * size); ctx.closePath(); ctx.fill();
  line({ x: p.x, y: base - bodyH + 10 * s * size }, { x: p.x, y: base - 15 * s * size }, isPlayer ? "#f0ffbf" : "#d6faff", 2 * s * size);
  ctx.fillStyle = "#e5b99a"; ctx.beginPath(); ctx.arc(p.x, base - bodyH - headR * .25, headR, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = isPlayer ? "#273242" : "#092c43"; ctx.beginPath(); ctx.arc(p.x, base - bodyH - headR * .65, headR * .95, Math.PI, Math.PI * 2); ctx.fill();
  const swing = c.swing > 0 ? Math.sin(c.swing * Math.PI) : 0, sy = base - bodyH + 12 * s * size, hand = { x: p.x + (13 + swing * 6) * s * size, y: sy + (10 - swing * 5) * s * size };
  limb({ x: p.x - bodyW * .35, y: sy }, { x: p.x - 12 * s * size, y: sy + 12 * s * size }, "#e5b99a", 4 * s * size); limb({ x: p.x + bodyW * .35, y: sy }, hand, "#e5b99a", 4 * s * size);
  ctx.save(); ctx.translate(hand.x, hand.y); ctx.rotate(isPlayer ? -.5 - swing * .7 : .5 + swing * .7); ctx.strokeStyle = isPlayer ? "#efffa9" : "#b9f7ff"; ctx.lineWidth = 2.4 * s * size; ctx.beginPath(); ctx.ellipse(4 * s, -9 * s, 6 * s, 9 * s, 0, 0, Math.PI * 2); ctx.stroke(); ctx.strokeStyle = "#d8e7ed"; ctx.lineWidth = s; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo((4 + i * 2) * s, -15 * s); ctx.lineTo((4 + i * 2) * s, -3 * s); ctx.stroke(); } line({ x: 4 * s, y: -1 * s }, { x: 0, y: 7 * s }, "#d8e7ed"); ctx.restore();
  ctx.font = `800 ${Math.max(8, 9 * s)}px Inter,Arial`; ctx.textAlign = "center"; ctx.fillStyle = isPlayer ? "#e9ffbb" : "#b5f4ff"; ctx.shadowColor = "#06111e"; ctx.shadowBlur = 5; ctx.fillText(c.name, p.x, base - bodyH - headR - 10 * s); ctx.shadowBlur = 0;
}
function drawTrail() { for (let i = 0; i < trail.length; i++) { const t = trail[i], p = project(t.x, t.z, t.y); ctx.globalAlpha = (i / trail.length) * .35; ctx.fillStyle = "#eaff77"; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1, p.scale * 3 * (i / trail.length)), 0, Math.PI * 2); ctx.fill(); } ctx.globalAlpha = 1; }
function drawBall() {
  const p = project(ball.x, ball.z, ball.y), g = project(ball.x, ball.z, 0), r = Math.max(3, p.scale * 5.3);
  ctx.fillStyle = "#00131755"; ctx.beginPath(); ctx.ellipse(g.x, g.groundY, r * 1.5, r * .55, 0, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.shadowColor = "#d9ff5a"; ctx.shadowBlur = 14; const grad = ctx.createRadialGradient(p.x - r * .35, p.y - r * .4, 1, p.x, p.y, r * 1.4); grad.addColorStop(0, "#fff"); grad.addColorStop(.35, "#f4ff9a"); grad.addColorStop(1, "#b8dc36"); ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  ctx.strokeStyle = "#8cae2d"; ctx.lineWidth = .8; ctx.beginPath(); ctx.arc(p.x, p.y, r * .65, -.8, 1.2); ctx.stroke();
}

/* Audio is synthesized locally with Web Audio; no external sound files required. */
function initAudio() {
  if (!audio.context) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; audio.context = new AC(); }
  if (audio.context.state === "suspended") audio.context.resume().catch(() => { });
  startMusic();
}
function tone(freq, duration, type = "sine", volume = .2) {
  if (!audio.context || audio.muted || audio.master <= 0) return;
  const c = audio.context, o = c.createOscillator(), g = c.createGain(), now = c.currentTime;
  o.type = type; o.frequency.setValueAtTime(freq, now);
  g.gain.setValueAtTime(Math.max(.0001, volume * audio.master), now);
  g.gain.exponentialRampToValueAtTime(.0001, now + duration);
  o.connect(g); g.connect(c.destination); o.start(now); o.stop(now + duration);
}
function startMusic() {
  if (audio.musicTimer) return;
  const melody = [261.63, 329.63, 392.00, 329.63, 293.66, 349.23, 440.00, 349.23, 261.63, 329.63, 392.00, 523.25, 440.00, 392.00, 349.23, 329.63];
  const bass = [130.81, 130.81, 164.81, 164.81, 146.83, 146.83, 174.61, 174.61];
  audio.musicTimer = window.setInterval(() => {
    if (!running || isPaused || audio.muted || audio.music <= 0) return;
    const i = audio.step % melody.length;
    tone(melody[i], .20, "triangle", audio.music * .20);
    if (i % 2 === 0) tone(melody[i] * 1.5, .14, "sine", audio.music * .055);
    if (i % 4 === 0) tone(bass[Math.floor(i / 2) % bass.length], .28, "triangle", audio.music * .12);
    audio.step++;
  }, 270);
  audio.ambienceTimer = window.setInterval(() => {
    if (running && !isPaused && !audio.muted && audio.ambience > 0) tone(82, .12, "sine", audio.ambience * .06);
  }, 1800);
}
function stopAudioTimers() { if (audio.musicTimer) clearInterval(audio.musicTimer); if (audio.ambienceTimer) clearInterval(audio.ambienceTimer); audio.musicTimer = audio.ambienceTimer = 0; }
function ballSound() { tone(220, .07, "square", audio.ball * .18); window.setTimeout(() => { if (!isPaused) tone(440, .05, "triangle", audio.ball * .12); }, 45); }
function winSound() { [523.25, 659.25, 783.99, 1046.5].forEach((n, i) => setTimeout(() => tone(n, .22, "triangle", .25), i * 150)); }
function loseSound() { [392, 330, 261.63].forEach((n, i) => setTimeout(() => tone(n, .25, "sawtooth", .10), i * 220)); }
function updateAudioUI() {
  $("masterValue").value = `${$("masterVolume").value}%`; $("masterValue").textContent = $("masterValue").value;
  $("musicValue").value = `${$("musicVolume").value}%`; $("musicValue").textContent = $("musicValue").value;
  $("ballValue").value = `${$("ballVolume").value}%`; $("ballValue").textContent = $("ballValue").value;
  $("ambienceValue").value = `${$("crowdVolume").value}%`; $("ambienceValue").textContent = $("ambienceValue").value;
}
function setRange(id, key) { audio[key] = Number($(id).value) / 100; updateAudioUI(); }
function toggleMute() { audio.muted = !audio.muted; $("muteBtn").textContent = audio.muted ? "🔊 UNMUTE ALL" : "🔇 MUTE ALL"; }

/* Match logic */
function resetBall() {
  ball.x = (Math.random() - .5) * 2; ball.z = 1.5; ball.y = 1.8; ball.vx = (Math.random() - .5) * .09; ball.vz = .14; ball.vy = .025; ball.active = true;
  bounceCount = 0; trail = []; cpuThink = 0;
  Object.assign(player, { x: 0, z: 7, targetX: 0, targetZ: 7, swing: 0 });
  Object.assign(cpu, { x: 0, z: -7, targetX: 0, targetZ: -7, swing: 0 });
}
function setPlayerName() {
  const name = $("playerNameInput").value.trim().slice(0, 16) || "PLAYER 1";
  player.name = name.toUpperCase(); $("playerNameDisplay").textContent = player.name; $("playerNameDisplay").title = player.name;
  document.querySelector(".player-avatar").textContent = Array.from(name.trim())[0].toUpperCase();
}
function startMatch() {
  if (endTimer) { clearTimeout(endTimer); endTimer = 0; }
  initAudio(); setPlayerName();
  difficulty = $("difficulty").value; level = levels[difficulty]; $("levelLabel").textContent = level.label;
  playerScore = cpuScore = rallyCount = 0; $("playerScore").textContent = "0"; $("cpuScore").textContent = "0"; $("rallyCount").textContent = "0";
  pointTimer = 0; bannerTimer = 0; running = true; isPaused = false;
  $("pauseMenu").classList.add("hidden"); $("volumeSettings").classList.add("hidden"); $("pauseActions").classList.remove("hidden");
  $("pauseBtn").classList.remove("hidden"); $("messageOverlay").classList.add("hidden"); $("pointBanner").classList.remove("show");
  resetBall(); lastTime = performance.now(); drawScene();
}
function returnToMenu() {
  running = false; isPaused = false; pointTimer = 0; if (endTimer) { clearTimeout(endTimer); endTimer = 0; }
  $("pauseMenu").classList.add("hidden"); $("volumeSettings").classList.add("hidden"); $("pauseActions").classList.remove("hidden");
  $("pauseBtn").classList.add("hidden"); $("messageOverlay").classList.remove("hidden"); $("pointBanner").classList.remove("show");
  $("messageIcon").textContent = "🎾"; $("messageEyebrow").textContent = "WELCOME TO THE ARENA";
  $("messageTitle").innerHTML = 'READY TO<br><span>CLASH?</span>'; $("messageDescription").textContent = "Customize your player, choose a difficulty, and start the match.";
  $("startBtn").innerHTML = 'START MATCH <span>↗</span>'; stopAudioTimers(); resetBall(); drawScene();
}
function endMatch() {
  running = false; ball.active = false; isPaused = false; $("pauseBtn").classList.add("hidden"); $("pauseMenu").classList.add("hidden"); $("messageOverlay").classList.remove("hidden");
  const won = playerScore > cpuScore;
  $("messageIcon").textContent = won ? "🏆" : "🎾"; $("messageEyebrow").textContent = "MATCH COMPLETE";
  $("messageTitle").innerHTML = won ? 'YOU ARE THE<br><span>CHAMPION!</span>' : 'NICE TRY,<br><span>RIVAL!</span>';
  $("messageDescription").textContent = won ? `Amazing match! Final score: ${playerScore} - ${cpuScore}. Ready for a rematch?` : `Final score: ${playerScore} - ${cpuScore}. Choose a level and try again!`;
  $("startBtn").innerHTML = 'PLAY AGAIN <span>↗</span>';
  if (won) winSound(); else loseSound();
}
function awardPoint(toPlayer) {
  if (!running || pointTimer > 0) return;
  if (toPlayer) { playerScore++; $("playerScore").textContent = playerScore; } else { cpuScore++; $("cpuScore").textContent = cpuScore; }
  pointTimer = 1.5; bannerTimer = 1.1; $("pointBanner").textContent = toPlayer ? `${player.name} SCORES!` : "CPU SCORES!"; $("pointBanner").classList.add("show"); shake = 7; ball.active = false;
  if ((playerScore >= 7 || cpuScore >= 7) && Math.abs(playerScore - cpuScore) >= 2) { pointTimer = 2.2; }
}
function hitBall() {
  if (!running || isPaused || !ball.active || pointTimer > 0) return;
  const now = performance.now(); if (now - lastHitTime < 260) return; lastHitTime = now;
  const dx = ball.x - player.x, dz = ball.z - player.z;
  if (Math.abs(dx) < 1.65 && Math.abs(dz) < 2.25 && ball.y < 3.4) {
    player.swing = 1; rallyCount++; $("rallyCount").textContent = rallyCount;
    const aim = Math.max(-1, Math.min(1, dx * .65)); ball.vx = aim * (.12 + Math.random() * .045); ball.vz = -(.17 + Math.random() * .035); ball.vy = .19 + Math.random() * .07; ball.y = Math.max(ball.y, .55); ball.z = Math.min(ball.z, 8.8); bounceCount = 0; trail = []; ballSound();
  } else { $("pointBanner").textContent = "TOO FAR!"; $("pointBanner").classList.add("show"); bannerTimer = .45; }
}
function cpuHit() {
  cpu.swing = 1; rallyCount++; $("rallyCount").textContent = rallyCount;
  if (Math.random() < 1 - level.accuracy) { ball.vx = (Math.random() < .5 ? -1 : 1) * (.16 + Math.random() * .1); ball.vz = .08; ball.vy = .1; ballSound(); return; }
  const aim = Math.max(-1, Math.min(1, (player.x - ball.x) * .32)); ball.vx = aim * level.power + (Math.random() - .5) * (1 - level.accuracy) * .4; ball.vz = .17 + Math.random() * .035; ball.vy = .18 + Math.random() * .07; bounceCount = 0; ballSound();
}
function updateCharacter(c, isPlayer, dt) {
  if (isPlayer) {
    let dx = 0, dz = 0; if (keys.ArrowLeft || keys.KeyA || touchMove.left) dx--; if (keys.ArrowRight || keys.KeyD || touchMove.right) dx++; if (keys.ArrowUp || keys.KeyW || touchMove.up) dz--; if (keys.ArrowDown || keys.KeyS || touchMove.down) dz++;
    if (dx || dz) { const len = Math.hypot(dx, dz) || 1; c.targetX += (dx / len) * 4.6 * dt; c.targetZ += (dz / len) * 4.6 * dt; }
    c.targetX = Math.max(-4.3, Math.min(4.3, c.targetX)); c.targetZ = Math.max(2, Math.min(9, c.targetZ));
    c.x += (c.targetX - c.x) * Math.min(1, dt * 12); c.z += (c.targetZ - c.z) * Math.min(1, dt * 12);
  } else {
    if (ball.active && ball.z < 0) { c.targetX = Math.max(-4, Math.min(4, ball.x + ball.vx * 4)); if (ball.z < -2.5) c.targetZ = -7 + Math.max(-1.1, Math.min(1.1, ball.z * -.05)); }
    else { c.targetX *= .995; c.targetZ += (-7 - c.targetZ) * Math.min(1, dt * 2); }
    const dx = c.targetX - c.x, dz = c.targetZ - c.z, dist = Math.hypot(dx, dz), step = level.speed * dt * level.reaction;
    if (dist > step && dist > 0) { c.x += dx / dist * step; c.z += dz / dist * step; } else { c.x = c.targetX; c.z = c.targetZ; }
  }
  c.x = Math.max(-4.5, Math.min(4.5, c.x)); c.z = Math.max(isPlayer ? 1.5 : -9, Math.min(isPlayer ? 9.3 : -2, c.z)); c.swing = Math.max(0, c.swing - dt * 3.5);
}
function updateBall(dt) {
  if (!ball.active || pointTimer > 0) return;
  ball.x += ball.vx * dt * 60; ball.z += ball.vz * dt * 60; ball.y += ball.vy * dt * 60; ball.vy -= .0085 * dt * 60;
  trail.push({ x: ball.x, z: ball.z, y: ball.y }); if (trail.length > 8) trail.shift();
  if (ball.y <= .12) { ball.y = .12; ball.vy = Math.abs(ball.vy) * .65; if (Math.abs(ball.vy) < .055) ball.vy = 0; bounceCount++; if (bounceCount >= 2) { awardPoint(ball.z > 0); return; } }
  if (ball.x < -4.8 || ball.x > 4.8) { ball.x = Math.max(-4.8, Math.min(4.8, ball.x)); ball.vx *= -.78; }
  if (Math.abs(ball.z) < .18 && ball.y < 1) { ball.vz *= -.45; ball.vx *= .8; ball.y = Math.max(ball.y, .15); }
  if (ball.z < -2.3 && ball.vz < 0 && ball.y < 2.8) { const dx = Math.abs(ball.x - cpu.x), dz = Math.abs(ball.z - cpu.z); if (dx < 1.55 && dz < 2.2) { cpuThink += dt; if (cpuThink > .07) { cpuThink = 0; cpuHit(); } } }
  if (ball.z < -10.5) awardPoint(true); else if (ball.z > 10.5) awardPoint(false);
}
function update(dt) {
  if (shake > 0) shake = Math.max(0, shake - dt * 25);
  if (bannerTimer > 0) { bannerTimer -= dt; if (bannerTimer <= 0) $("pointBanner").classList.remove("show"); }
  if (!running || isPaused) return;
  if (pointTimer > 0) {
    pointTimer -= dt;
    if (pointTimer <= 0 && running) {
      if ((playerScore >= 7 || cpuScore >= 7) && Math.abs(playerScore - cpuScore) >= 2) { endMatch(); return; }
      resetBall();
    } return;
  }
  updateCharacter(player, true, dt); updateCharacter(cpu, false, dt); updateBall(dt);
}
function frame(timestamp) {
  const dt = Math.min((timestamp - (lastTime || timestamp)) / 1000, .033); lastTime = timestamp;
  if (!isPaused) { update(dt); }
  ctx.save(); if (!isPaused && shake > 0) ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake); drawScene(); ctx.restore();
  rafId = requestAnimationFrame(frame);
}

/* Pause menu */
function pauseMatch() {
  if (!running || isPaused) return;
  isPaused = true; Object.keys(keys).forEach(k => keys[k] = false); Object.keys(touchMove).forEach(k => touchMove[k] = false);
  $("pauseMenu").classList.remove("hidden"); $("volumeSettings").classList.add("hidden"); $("pauseActions").classList.remove("hidden");
}
function resumeMatch() {
  $("pauseMenu").classList.add("hidden"); $("volumeSettings").classList.add("hidden"); $("pauseActions").classList.remove("hidden");
  isPaused = false; lastTime = performance.now();
}
function restartMatch() { startMatch(); }
$("startBtn").addEventListener("click", startMatch);
$("pauseBtn").addEventListener("click", pauseMatch);
$("resumeBtn").addEventListener("click", resumeMatch);
$("pauseRestartBtn").addEventListener("click", restartMatch);
$("volumeBtn").addEventListener("click", () => { $("pauseActions").classList.add("hidden"); $("volumeSettings").classList.remove("hidden"); });
$("backToPauseBtn").addEventListener("click", () => { $("volumeSettings").classList.add("hidden"); $("pauseActions").classList.remove("hidden"); });
$("exitBtn").addEventListener("click", returnToMenu);
$("muteBtn").addEventListener("click", toggleMute);
$("masterVolume").addEventListener("input", () => setRange("masterVolume", "master"));
$("musicVolume").addEventListener("input", () => setRange("musicVolume", "music"));
$("ballVolume").addEventListener("input", () => setRange("ballVolume", "ball"));
$("crowdVolume").addEventListener("input", () => setRange("crowdVolume", "ambience"));
["masterVolume", "musicVolume", "ballVolume", "crowdVolume"].forEach(id => $(id).addEventListener("input", () => { if (audio.context && audio.context.state === "suspended") audio.context.resume().catch(() => { }); }));
updateAudioUI();
$("restartBtn").addEventListener("click", () => { if (running) restartMatch(); else returnToMenu(); });
$("playerNameInput").addEventListener("input", () => { const n = $("playerNameInput").value.trim() || "PLAYER 1"; $("playerNameDisplay").textContent = n.toUpperCase().slice(0, 16); });
window.addEventListener("keydown", e => {
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(e.code)) e.preventDefault();
  if (e.code === "Escape") { if (isPaused) resumeMatch(); else pauseMatch(); return; }
  keys[e.code] = true; if (e.code === "Space" && !e.repeat) hitBall();
});
window.addEventListener("keyup", e => { keys[e.code] = false; });
window.addEventListener("blur", () => { Object.keys(keys).forEach(k => keys[k] = false); Object.keys(touchMove).forEach(k => touchMove[k] = false); });
document.querySelectorAll("[data-move]").forEach(btn => {
  const dir = btn.dataset.move;
  btn.addEventListener("pointerdown", e => { e.preventDefault(); if (!isPaused) touchMove[dir] = true; try { btn.setPointerCapture(e.pointerId); } catch (_) { } });
  const release = () => touchMove[dir] = false;
  ["pointerup", "pointercancel", "lostpointercapture"].forEach(ev => btn.addEventListener(ev, release));
});
$("hitBtn").addEventListener("pointerdown", e => { e.preventDefault(); hitBall(); });
resetBall(); resizeCanvas(); rafId = requestAnimationFrame(t => { lastTime = t; rafId = requestAnimationFrame(frame); });
