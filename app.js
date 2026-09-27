/* ============================================================
   GHOST://PLAY — UI & INTERACTION LAYER (v2.0 PRO)
   HiDPI Canvas Rendering, Ghost Animation, Interactive Playback,
   Heatmap Overlay, Human Play Mode, Audio FX & Telemetry.
   ============================================================ */

(() => {
  "use strict";

  // Canvas & Core UI Elements
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");
  const tooltip = document.getElementById("canvas-tooltip");

  // Topbar & Badges
  const levelTagEl = document.getElementById("level-tag");
  const runStatusEl = document.getElementById("run-status");
  const agentBadgeEl = document.getElementById("agent-badge");
  const btnAudio = document.getElementById("btn-audio");
  const btnExport = document.getElementById("btn-export");
  const btnScreenshot = document.getElementById("btn-screenshot");

  // Primary Action Buttons
  const btnGenerate = document.getElementById("btn-generate");
  const btnGhostRun = document.getElementById("btn-ghost-run");
  const btnBatchRun = document.getElementById("btn-batch-run");
  const btnHeatmap = document.getElementById("btn-heatmap");
  const btnPlayHuman = document.getElementById("btn-play-human");

  // Parameter Selectors
  const paramSize = document.getElementById("param-size");
  const paramLoops = document.getElementById("param-loops");
  const paramItems = document.getElementById("param-items");
  const paramPersona = document.getElementById("param-persona");

  // Playback Controls
  const btnPlayPause = document.getElementById("btn-play-pause");
  const btnStepBack = document.getElementById("btn-step-back");
  const btnStepFwd = document.getElementById("btn-step-fwd");
  const stepCounterEl = document.getElementById("step-counter");
  const speedSlider = document.getElementById("speed-slider");
  const speedValEl = document.getElementById("speed-val");

  // Human Mode HUD & D-Pad Elements
  const humanHud = document.getElementById("human-hud");
  const humanCoresEl = document.getElementById("human-cores");
  const humanStepsEl = document.getElementById("human-steps");
  const btnHumanQuit = document.getElementById("btn-human-quit");
  const dpadUp = document.getElementById("dpad-up");
  const dpadDown = document.getElementById("dpad-down");
  const dpadLeft = document.getElementById("dpad-left");
  const dpadRight = document.getElementById("dpad-right");

  // Tab Panels
  const tabBtns = document.querySelectorAll(".tab-btn");
  const tabContents = {
    "validator-tab": document.getElementById("validator-tab"),
    "analyst-tab": document.getElementById("analyst-tab"),
    "log-tab": document.getElementById("log-tab")
  };
  const validatorListEl = document.getElementById("validator-list");
  const analystBodyEl = document.getElementById("analyst-body");
  const logFeedEl = document.getElementById("log-feed");

  // Telemetry Widget
  const teleDimsEl = document.getElementById("tele-dims");
  const teleOptimalEl = document.getElementById("tele-optimal");
  const teleDeadendsEl = document.getElementById("tele-deadends");
  const teleHumanEl = document.getElementById("tele-human");

  // State Variables
  let currentLevel = null;
  let levelCount = 0;
  let logCount = 0;
  let lastBatchResult = null;
  let heatmapOn = false;
  let tileSize = 24;

  // Animation State
  let animTimer = null;
  let isPlaying = false;
  let animStep = 0;
  let animPath = null;
  let animPersona = "tremaux";
  let animReachedExit = true;

  // Human Play State
  let humanMode = false;
  let humanPos = { r: 1, c: 1 };
  let humanPath = [];
  let humanCollected = new Set();
  let humanSteps = 0;

  // Pulse & Particle Animation Loop
  let pulseTime = 0;
  let renderLoopHandle = null;

  // ============================================================
  // LOGGING SYSTEM
  // ============================================================
  function log(msg, type = "") {
    logCount++;
    const entry = document.createElement("div");
    entry.className = `entry ${type}`;
    const timeStr = new Date().toLocaleTimeString().split(" ")[0];
    entry.innerHTML = `<span class="ts">[${timeStr} #${String(logCount).padStart(3, "0")}]</span>${msg}`;
    logFeedEl.appendChild(entry);
    logFeedEl.scrollTop = logFeedEl.scrollHeight;
  }

  // ============================================================
  // TABS LOGIC
  // ============================================================
  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      tabBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const target = btn.dataset.tab;
      Object.entries(tabContents).forEach(([id, el]) => {
        if (el) el.style.display = (id === target) ? "block" : "none";
      });
      GhostAudio.sfx.click();
    });
  });

  function switchToTab(tabId) {
    const btn = document.querySelector(`[data-tab="${tabId}"]`);
    if (btn) btn.click();
  }

  // ============================================================
  // LEVEL GENERATION
  // ============================================================
  function generateNewLevel() {
    stopPlayback();
    exitHumanMode();
    levelCount++;

    const [colsStr, rowsStr] = paramSize.value.split(",");
    const cols = parseInt(colsStr, 10);
    const rows = parseInt(rowsStr, 10);
    const loopChance = parseFloat(paramLoops.value);
    const collectibleCount = parseInt(paramItems.value, 10);

    currentLevel = GhostCore.generateLevel({
      cols,
      rows,
      loopChance,
      collectibleCount
    });

    lastBatchResult = null;
    heatmapOn = false;
    btnHeatmap.disabled = true;
    btnHeatmap.textContent = "🔥 TOGGLE HEATMAP";
    btnHeatmap.classList.remove("active");

    btnPlayPause.disabled = true;
    btnStepBack.disabled = true;
    btnStepFwd.disabled = true;
    stepCounterEl.textContent = "Step: 0/0";
    animPath = null;
    animStep = 0;

    levelTagEl.textContent = `LEVEL #${levelCount}`;
    runStatusEl.textContent = "READY";
    agentBadgeEl.textContent = "";

    // Run automated validation
    const validation = GhostCore.validateLevel(currentLevel);
    renderValidator(validation);

    // Compute baseline optimal TSP path length
    const optimalSteps = GhostCore.baselineOptimalSteps(
      currentLevel.tileGrid,
      currentLevel.dims,
      currentLevel.start,
      currentLevel.exit,
      currentLevel.collectibles
    );

    // Update Telemetry Panel
    teleDimsEl.textContent = `${currentLevel.dims.tileCols} × ${currentLevel.dims.tileRows}`;
    teleOptimalEl.textContent = `${optimalSteps} steps (A* TSP)`;
    teleDeadendsEl.textContent = `${currentLevel.deadEnds.length} dead ends / ${currentLevel.junctions.length} junctions`;
    teleHumanEl.textContent = "No run yet";

    log(`Generated Level #${levelCount} [${cols}×${rows} cells, ${Math.round(loopChance * 100)}% loops]. Validation: ${validation.allPass ? "PASSED (100%)" : "FAILED"}.`, validation.allPass ? "ok" : "warn");
    GhostAudio.sfx.generate();

    analystBodyEl.innerHTML = '<p class="hint">Run a batch analysis (50×) to see difficulty metrics, variance, step distribution histogram, and bottleneck heatmaps.</p>';

    resizeCanvas();
    render();
  }

  function renderValidator(validation) {
    validatorListEl.innerHTML = "";
    validation.checks.forEach(c => {
      const item = document.createElement("div");
      item.className = "v-item";
      item.innerHTML = `
        <div class="v-header">
          <span class="v-icon ${c.pass ? "pass" : "fail"}">${c.pass ? "✓" : "✗"}</span>
          <span>${c.label}</span>
        </div>
        <div class="v-detail">${c.detail}</div>
      `;
      validatorListEl.appendChild(item);
    });
  }

  // ============================================================
  // GHOST PLAYTEST (Single Animated Run)
  // ============================================================
  function runGhostPlaytest() {
    if (!currentLevel) return;
    exitHumanMode();
    stopPlayback();

    const persona = paramPersona.value;
    animPersona = persona;

    const run = GhostCore.simulateExplorer(currentLevel, { persona });
    animPath = run.path;
    animStep = 0;
    animReachedExit = run.reachedExitAtStep !== null;

    btnPlayPause.disabled = false;
    btnStepBack.disabled = false;
    btnStepFwd.disabled = false;
    btnPlayPause.textContent = "⏸";
    isPlaying = true;

    runStatusEl.textContent = `RUNNING (${persona.toUpperCase()})`;
    log(`Ghost playtest started with archetype: ${persona.toUpperCase()}. Steps: ${run.steps}.`, "info");
    GhostAudio.sfx.click();

    updateStepCounter();
    startPlaybackTimer();
  }

  function startPlaybackTimer() {
    stopPlaybackTimer();
    const speedMult = parseInt(speedSlider.value, 10);
    const interval = Math.max(10, Math.floor(130 / speedMult));

    animTimer = setInterval(() => {
      if (animStep < animPath.length - 1) {
        animStep++;
        updateStepCounter();
        GhostAudio.sfx.step();
        render();
      } else {
        stopPlayback();
        if (animReachedExit) {
          runStatusEl.textContent = `COMPLETED — ${animPath.length - 1} STEPS`;
          GhostAudio.sfx.exitReached();
          log(`Ghost run completed in ${animPath.length - 1} steps.`, "ok");
        } else {
          runStatusEl.textContent = `TIMED OUT — DID NOT REACH EXIT`;
          GhostAudio.sfx.wallBump();
          log(`Ghost run timed out after ${animPath.length - 1} steps without reaching the exit.`, "warn");
        }
      }
    }, interval);
  }

  function stopPlaybackTimer() {
    if (animTimer) {
      clearInterval(animTimer);
      animTimer = null;
    }
  }

  function stopPlayback() {
    stopPlaybackTimer();
    isPlaying = false;
    btnPlayPause.textContent = "▶";
  }

  function togglePlayPause() {
    if (!animPath || animPath.length === 0) return;
    if (isPlaying) {
      stopPlayback();
      runStatusEl.textContent = "PAUSED";
    } else {
      if (animStep >= animPath.length - 1) {
        animStep = 0;
      }
      isPlaying = true;
      btnPlayPause.textContent = "⏸";
      runStatusEl.textContent = "RUNNING";
      startPlaybackTimer();
    }
  }

  function stepForward() {
    if (!animPath) return;
    stopPlayback();
    if (animStep < animPath.length - 1) {
      animStep++;
      updateStepCounter();
      GhostAudio.sfx.step();
      render();
    }
  }

  function stepBackward() {
    if (!animPath) return;
    stopPlayback();
    if (animStep > 0) {
      animStep--;
      updateStepCounter();
      GhostAudio.sfx.step();
      render();
    }
  }

  function updateStepCounter() {
    if (!animPath) {
      stepCounterEl.textContent = "Step: 0/0";
    } else {
      stepCounterEl.textContent = `Step: ${animStep}/${animPath.length - 1}`;
    }
  }

  speedSlider.addEventListener("input", () => {
    speedValEl.textContent = `${speedSlider.value}×`;
    if (isPlaying) {
      startPlaybackTimer();
    }
  });

  // ============================================================
  // BATCH ANALYSIS (50× Simulation & Statistics)
  // ============================================================
  function runBatchAnalysis() {
    if (!currentLevel) return;
    exitHumanMode();
    stopPlayback();

    runStatusEl.textContent = "ANALYZING (50×)…";
    const persona = paramPersona.value;
    log(`Batch analysis queued: 50 runs with ${persona.toUpperCase()} archetype.`);
    GhostAudio.sfx.click();

    setTimeout(() => {
      const result = GhostCore.runBatch(currentLevel, 50, persona);
      lastBatchResult = result;
      renderAnalyst(result);
      btnHeatmap.disabled = false;
      btnHeatmap.classList.add("ctrl-amber");
      runStatusEl.textContent = `ANALYSIS COMPLETE (${result.verdict.label})`;
      GhostAudio.sfx.batchComplete();
      log(`Batch analysis done: Avg ${Math.round(result.avgSteps)} steps (±${result.stdDev.toFixed(1)}), Inefficiency ${result.inefficiencyRatio.toFixed(2)}×. Verdict: ${result.verdict.label}.`, "ok");
      switchToTab("analyst-tab");
      render();
    }, 40);
  }

  function renderAnalyst(result) {
    const maxHist = Math.max(...result.histogram.map(h => h.count), 1);

    let html = `
      <div class="stat-grid">
        <div class="stat-card">
          <span class="label">Average Traversal</span>
          <span class="val">${Math.round(result.avgSteps)} <small style="font-size:0.65rem; color:var(--muted)">steps</small></span>
        </div>
        <div class="stat-card">
          <span class="label">A* Optimal TSP</span>
          <span class="val" style="color:var(--cyan-bright)">${result.optimalSteps} <small style="font-size:0.65rem; color:var(--muted)">steps</small></span>
        </div>
        <div class="stat-card">
          <span class="label">Inefficiency Factor</span>
          <span class="val" style="color:${result.verdict.color}">${result.inefficiencyRatio.toFixed(2)}×</span>
        </div>
        <div class="stat-card">
          <span class="label">Variance / Spread</span>
          <span class="val">±${result.stdDev.toFixed(1)} <small style="font-size:0.65rem; color:var(--muted)">std</small></span>
        </div>
      </div>

      <div class="verdict-box" style="border-left-color: ${result.verdict.color}">
        <div class="verdict-title" style="color:${result.verdict.color}">VERDICT: ${result.verdict.label}</div>
        <div class="verdict-desc">${result.verdict.note}</div>
      </div>

      <div class="histogram-section">
        <div class="hist-title">Step Distribution Histogram (50 Runs)</div>
        <div class="hist-bars">
          ${result.histogram.map(b => `
            <div class="hist-row">
              <span class="hist-label">${b.label}</span>
              <div class="hist-track">
                <div class="hist-fill" style="width: ${(b.count / maxHist) * 100}%"></div>
              </div>
              <span class="hist-val">${b.count}</span>
            </div>
          `).join("")}
        </div>
      </div>

      <div class="stuck-list-box">
        <strong style="color:var(--amber)">Top 5 Bottleneck / Stuck Points:</strong>
        <ul>
          ${result.stuckPoints.map((s, idx) => `
            <li>
              <span>#${idx + 1} Tile (${s.r}, ${s.c})</span>
              <span style="color:var(--text-bright)">${s.avgVisits.toFixed(1)} avg revisits</span>
            </li>
          `).join("")}
        </ul>
      </div>
    `;

    analystBodyEl.innerHTML = html;
  }

  function toggleHeatmap() {
    if (!lastBatchResult) return;
    heatmapOn = !heatmapOn;
    btnHeatmap.textContent = heatmapOn ? "🔥 HIDE HEATMAP" : "🔥 TOGGLE HEATMAP";
    btnHeatmap.classList.toggle("active", heatmapOn);
    GhostAudio.sfx.click();
    log(`Heatmap overlay ${heatmapOn ? "enabled" : "disabled"}.`);
    render();
  }

  // ============================================================
  // HUMAN PLAY MODE (Manual Keyboard & Touch Play)
  // ============================================================
  function toggleHumanMode() {
    if (!currentLevel) return;
    if (humanMode) {
      exitHumanMode();
    } else {
      enterHumanMode();
    }
  }

  function enterHumanMode() {
    stopPlayback();
    humanMode = true;
    humanPos = { r: currentLevel.start.r, c: currentLevel.start.c };
    humanPath = [{ ...humanPos }];
    humanCollected = new Set();
    humanSteps = 0;

    btnPlayHuman.classList.add("active");
    btnPlayHuman.textContent = "⏹ EXIT HUMAN MODE";
    humanHud.style.display = "flex";
    updateHumanHud();

    runStatusEl.textContent = "HUMAN PLAY ACTIVE";
    log("🎮 Human play mode active! Use WASD, Arrow keys, or the on-screen D-Pad to move.", "info");
    GhostAudio.sfx.click();

    // Focus canvas to capture keys immediately
    if (canvas) canvas.focus();

    render();
  }

  function exitHumanMode() {
    if (!humanMode) return;
    humanMode = false;
    btnPlayHuman.classList.remove("active");
    btnPlayHuman.textContent = "🎮 PLAY AS HUMAN";
    humanHud.style.display = "none";
    runStatusEl.textContent = "READY";
    render();
  }

  function updateHumanHud() {
    humanCoresEl.textContent = `${humanCollected.size}/${currentLevel.collectibles.length}`;
    humanStepsEl.textContent = String(humanSteps);
  }

  function handleHumanMove(dr, dc) {
    if (!humanMode || !currentLevel) return;
    const nr = humanPos.r + dr;
    const nc = humanPos.c + dc;

    if (GhostCore.isOpen(currentLevel.tileGrid, currentLevel.dims, nr, nc)) {
      humanPos = { r: nr, c: nc };
      humanSteps++;
      humanPath.push({ ...humanPos });
      GhostAudio.sfx.step();

      // Check collectible pickup
      currentLevel.collectibles.forEach((c, idx) => {
        if (!humanCollected.has(idx) && c.r === nr && c.c === nc) {
          humanCollected.add(idx);
          GhostAudio.sfx.pickup();
          log(`[Human] Collected Energy Core #${idx + 1} at step ${humanSteps}!`, "ok");
        }
      });

      updateHumanHud();

      // Check Exit Reached (all items + standing on exit)
      if (humanCollected.size === currentLevel.collectibles.length && nr === currentLevel.exit.r && nc === currentLevel.exit.c) {
        GhostAudio.sfx.exitReached();
        const optimal = GhostCore.baselineOptimalSteps(currentLevel.tileGrid, currentLevel.dims, currentLevel.start, currentLevel.exit, currentLevel.collectibles);
        teleHumanEl.textContent = `${humanSteps} steps (Solved!)`;
        log(`[Human Victory] Solved in ${humanSteps} steps! (Optimal was ${optimal} steps)`, "ok");
        alert(`🎉 LEVEL SOLVED!\nYou reached the exit with all cores in ${humanSteps} steps!\n(Optimal A* baseline was ${optimal} steps)`);
        exitHumanMode();
      }

      render();
    } else {
      GhostAudio.sfx.wallBump();
    }
  }

  // D-Pad Button Listeners
  if (dpadUp) dpadUp.addEventListener("click", () => handleHumanMove(-1, 0));
  if (dpadDown) dpadDown.addEventListener("click", () => handleHumanMove(1, 0));
  if (dpadLeft) dpadLeft.addEventListener("click", () => handleHumanMove(0, -1));
  if (dpadRight) dpadRight.addEventListener("click", () => handleHumanMove(0, 1));
  if (btnHumanQuit) btnHumanQuit.addEventListener("click", exitHumanMode);

  // Global Keyboard Listener
  window.addEventListener("keydown", (e) => {
    if (humanMode) {
      const key = e.key.toLowerCase();
      if (e.key === "ArrowUp" || key === "w") {
        e.preventDefault();
        handleHumanMove(-1, 0);
      } else if (e.key === "ArrowDown" || key === "s") {
        e.preventDefault();
        handleHumanMove(1, 0);
      } else if (e.key === "ArrowLeft" || key === "a") {
        e.preventDefault();
        handleHumanMove(0, -1);
      } else if (e.key === "ArrowRight" || key === "d") {
        e.preventDefault();
        handleHumanMove(0, 1);
      } else if (e.key === "Escape") {
        e.preventDefault();
        exitHumanMode();
      }
    } else {
      // Spacebar toggles playback if animated run loaded
      if (e.key === " " && animPath && document.activeElement.tagName !== "BUTTON" && document.activeElement.tagName !== "SELECT") {
        e.preventDefault();
        togglePlayPause();
      }
    }
  });

  // Click on adjacent canvas tile to move in Human Mode
  canvas.addEventListener("click", (e) => {
    if (!humanMode || !currentLevel) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const scaleX = canvas.width / (rect.width * (window.devicePixelRatio || 1));
    const scaleY = canvas.height / (rect.height * (window.devicePixelRatio || 1));

    const clickC = Math.floor((x * scaleX) / tileSize);
    const clickR = Math.floor((y * scaleY) / tileSize);

    const dr = clickR - humanPos.r;
    const dc = clickC - humanPos.c;

    // If clicked adjacent tile, move there
    if (Math.abs(dr) + Math.abs(dc) === 1) {
      handleHumanMove(dr, dc);
    }
  });

  // ============================================================
  // EXPORT & SNAPSHOT UTILITIES
  // ============================================================
  btnExport.addEventListener("click", () => {
    if (!currentLevel) return;
    const jsonStr = GhostCore.exportLevelJson(currentLevel);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ghost_level_${levelCount}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    log(`Exported Level #${levelCount} JSON file.`, "ok");
    GhostAudio.sfx.click();
  });

  btnScreenshot.addEventListener("click", () => {
    if (!canvas) return;
    const image = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = image;
    a.download = `ghost_play_heatmap_lvl${levelCount}.png`;
    a.click();
    log(`Saved level snapshot image.`, "ok");
    GhostAudio.sfx.click();
  });

  btnAudio.addEventListener("click", () => {
    const isMuted = GhostAudio.toggleMute();
    btnAudio.textContent = isMuted ? "🔇 SOUND OFF" : "🔊 SOUND ON";
    btnAudio.classList.toggle("ctrl-cyan", !isMuted);
    log(`Audio sound effects ${isMuted ? "muted" : "enabled"}.`);
  });

  // ============================================================
  // CANVAS RENDERING ENGINE (HiDPI + Cyber Visuals)
  // ============================================================
  function resizeCanvas() {
    if (!currentLevel) return;
    const dpr = window.devicePixelRatio || 1;
    const { tileCols, tileRows } = currentLevel.dims;

    tileSize = Math.max(16, Math.min(32, Math.floor(720 / tileCols)));

    const displayWidth = tileCols * tileSize;
    const displayHeight = tileRows * tileSize;

    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;

    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function render() {
    if (!currentLevel) return;
    const { tileGrid, dims, start, exit, collectibles } = currentLevel;

    ctx.clearRect(0, 0, dims.tileCols * tileSize, dims.tileRows * tileSize);

    // Deep void background
    ctx.fillStyle = "#06080f";
    ctx.fillRect(0, 0, dims.tileCols * tileSize, dims.tileRows * tileSize);

    // Heatmap normalization
    let maxVisits = 1;
    if (heatmapOn && lastBatchResult) {
      lastBatchResult.aggregateVisits.forEach(v => {
        if (v > maxVisits) maxVisits = v;
      });
    }

    // Pass 1: Render Walls & Paths
    for (let r = 0; r < dims.tileRows; r++) {
      for (let c = 0; c < dims.tileCols; c++) {
        const x = c * tileSize;
        const y = r * tileSize;

        if (tileGrid[r][c] === 1) {
          // Solid Wall
          ctx.fillStyle = "#111728";
          ctx.fillRect(x, y, tileSize, tileSize);

          // Subtle neon bevel
          ctx.fillStyle = "rgba(45, 58, 86, 0.4)";
          ctx.fillRect(x, y, tileSize, 1);
          ctx.fillRect(x, y, 1, tileSize);
        } else {
          // Open Path floor
          ctx.fillStyle = "#090d18";
          ctx.fillRect(x, y, tileSize, tileSize);

          // Heatmap Overlay
          if (heatmapOn && lastBatchResult) {
            const key = r * dims.tileCols + c;
            const visits = lastBatchResult.aggregateVisits.get(key) || 0;
            if (visits > 0) {
              const intensity = Math.min(1, visits / maxVisits);
              ctx.fillStyle = getHeatmapColor(intensity);
              ctx.fillRect(x, y, tileSize, tileSize);
            }
          }

          // Subtle floor subgrid lines
          ctx.strokeStyle = "rgba(30, 41, 65, 0.35)";
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 0.5, y + 0.5, tileSize - 1, tileSize - 1);
        }
      }
    }

    // Pass 2: Render Start & Exit Portals
    drawStartTile(start.c, start.r);
    drawExitPortal(exit.c, exit.r);

    // Pass 3: Render Collectibles
    collectibles.forEach((cell, idx) => {
      let isCollected = false;
      if (humanMode && humanCollected.has(idx)) isCollected = true;
      if (!humanMode && animPath && animStep > 0) {
        for (let i = 0; i <= animStep; i++) {
          if (animPath[i].r === cell.r && animPath[i].c === cell.c) {
            isCollected = true;
            break;
          }
        }
      }
      drawEnergyCore(cell.c, cell.r, isCollected);
    });

    // Pass 4: Ghost Trail & Head
    if (!humanMode && animPath && animStep > 0) {
      const activePath = animPath.slice(0, animStep + 1);

      // Trail Glow
      ctx.strokeStyle = "rgba(167, 139, 250, 0.3)";
      ctx.lineWidth = 6;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      activePath.forEach((cell, i) => {
        const cx = cell.c * tileSize + tileSize / 2;
        const cy = cell.r * tileSize + tileSize / 2;
        if (i === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
      });
      ctx.stroke();

      // Core Trail Line
      ctx.strokeStyle = "#a78bfa";
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Ghost Head
      const head = activePath[activePath.length - 1];
      const hx = head.c * tileSize + tileSize / 2;
      const hy = head.r * tileSize + tileSize / 2;

      ctx.fillStyle = "rgba(167, 139, 250, 0.35)";
      ctx.beginPath();
      ctx.arc(hx, hy, tileSize * 0.45, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(hx, hy, tileSize * 0.28, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#a78bfa";
      ctx.beginPath();
      ctx.arc(hx, hy, tileSize * 0.18, 0, Math.PI * 2);
      ctx.fill();
    }

    // Pass 5: Human Player Representation
    if (humanMode) {
      const activeHumanPath = humanPath;
      if (activeHumanPath.length > 1) {
        ctx.strokeStyle = "rgba(52, 211, 153, 0.4)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        activeHumanPath.forEach((cell, i) => {
          const cx = cell.c * tileSize + tileSize / 2;
          const cy = cell.r * tileSize + tileSize / 2;
          if (i === 0) ctx.moveTo(cx, cy);
          else ctx.lineTo(cx, cy);
        });
        ctx.stroke();
      }

      const hx = humanPos.c * tileSize + tileSize / 2;
      const hy = humanPos.r * tileSize + tileSize / 2;

      // Glow halo
      ctx.fillStyle = "rgba(52, 211, 153, 0.35)";
      ctx.beginPath();
      ctx.arc(hx, hy, tileSize * 0.48, 0, Math.PI * 2);
      ctx.fill();

      // Body core
      ctx.fillStyle = "#34d399";
      ctx.beginPath();
      ctx.arc(hx, hy, tileSize * 0.3, 0, Math.PI * 2);
      ctx.fill();

      // Center spark
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(hx, hy, tileSize * 0.14, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawStartTile(c, r) {
    const x = c * tileSize + tileSize / 2;
    const y = r * tileSize + tileSize / 2;
    const s = tileSize * 0.34;

    ctx.fillStyle = "rgba(56, 189, 248, 0.2)";
    ctx.beginPath();
    ctx.arc(x, y, tileSize * 0.44, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#38bdf8";
    ctx.beginPath();
    ctx.moveTo(x, y - s);
    ctx.lineTo(x + s, y);
    ctx.lineTo(x, y + s);
    ctx.lineTo(x - s, y);
    ctx.closePath();
    ctx.fill();
  }

  function drawExitPortal(c, r) {
    const x = c * tileSize + tileSize / 2;
    const y = r * tileSize + tileSize / 2;
    const rad = tileSize * 0.38 + Math.sin(pulseTime * 0.05) * 1.5;

    ctx.fillStyle = "rgba(52, 211, 153, 0.25)";
    ctx.beginPath();
    ctx.arc(x, y, rad + 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#34d399";
    ctx.beginPath();
    ctx.arc(x, y, rad * 0.65, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - rad * 0.4, y - rad * 0.4, rad * 0.8, rad * 0.8);
  }

  function drawEnergyCore(c, r, isCollected) {
    const x = c * tileSize + tileSize / 2;
    const y = r * tileSize + tileSize / 2;

    if (isCollected) {
      ctx.fillStyle = "rgba(251, 191, 36, 0.15)";
      ctx.beginPath();
      ctx.arc(x, y, tileSize * 0.2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    const rad = tileSize * 0.26 + Math.sin(pulseTime * 0.08) * 1;

    ctx.fillStyle = "rgba(251, 191, 36, 0.35)";
    ctx.beginPath();
    ctx.arc(x, y, rad + 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#fbbf24";
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(x - 1.5, y - 1.5, rad * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  function getHeatmapColor(intensity) {
    let r, g, b;
    if (intensity < 0.5) {
      const t = intensity * 2;
      r = Math.round(56 + t * (251 - 56));
      g = Math.round(189 + t * (191 - 189));
      b = Math.round(248 + t * (36 - 248));
    } else {
      const t = (intensity - 0.5) * 2;
      r = Math.round(251 + t * (244 - 251));
      g = Math.round(191 + t * (63 - 191));
      b = Math.round(36 + t * (94 - 36));
    }
    const alpha = (0.35 + intensity * 0.45).toFixed(2);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  // ============================================================
  // INTERACTIVE CANVAS TOOLTIP
  // ============================================================
  canvas.addEventListener("mousemove", (e) => {
    if (!currentLevel) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const scaleX = canvas.width / (rect.width * (window.devicePixelRatio || 1));
    const scaleY = canvas.height / (rect.height * (window.devicePixelRatio || 1));

    const c = Math.floor((x * scaleX) / tileSize);
    const r = Math.floor((y * scaleY) / tileSize);

    if (r >= 0 && r < currentLevel.dims.tileRows && c >= 0 && c < currentLevel.dims.tileCols) {
      const isWall = currentLevel.tileGrid[r][c] === 1;
      const isStart = currentLevel.start.r === r && currentLevel.start.c === c;
      const isExit = currentLevel.exit.r === r && currentLevel.exit.c === c;
      const isCore = currentLevel.collectibles.some(item => item.r === r && item.c === c);

      let tileType = isWall ? "SOLID WALL" : "OPEN PATH";
      if (isStart) tileType = "START SPAWN";
      if (isExit) tileType = "EXTRACTION PORTAL";
      if (isCore) tileType = "ENERGY CORE";

      let visitsInfo = "";
      if (lastBatchResult) {
        const key = r * currentLevel.dims.tileCols + c;
        const v = lastBatchResult.aggregateVisits.get(key) || 0;
        visitsInfo = ` | Visits: ${v}`;
      }

      tooltip.style.display = "block";
      tooltip.style.left = `${e.clientX + 14}px`;
      tooltip.style.top = `${e.clientY + 14}px`;
      tooltip.innerHTML = `<strong>(${r}, ${c})</strong> ${tileType}${visitsInfo}`;
    } else {
      tooltip.style.display = "none";
    }
  });

  canvas.addEventListener("mouseleave", () => {
    tooltip.style.display = "none";
  });

  // Continuous subtle pulse animation loop for glowing objects
  function animLoop() {
    pulseTime++;
    if (currentLevel) {
      render();
    }
    renderLoopHandle = requestAnimationFrame(animLoop);
  }

  // ============================================================
  // EVENT WIRING
  // ============================================================
  btnGenerate.addEventListener("click", generateNewLevel);
  btnGhostRun.addEventListener("click", runGhostPlaytest);
  btnBatchRun.addEventListener("click", runBatchAnalysis);
  btnHeatmap.addEventListener("click", toggleHeatmap);
  btnPlayHuman.addEventListener("click", toggleHumanMode);

  btnPlayPause.addEventListener("click", togglePlayPause);
  btnStepBack.addEventListener("click", stepBackward);
  btnStepFwd.addEventListener("click", stepForward);

  paramSize.addEventListener("change", generateNewLevel);
  paramLoops.addEventListener("change", generateNewLevel);
  paramItems.addEventListener("change", generateNewLevel);

  window.addEventListener("resize", () => {
    resizeCanvas();
    render();
  });

  // INITIAL BOOT
  generateNewLevel();
  animLoop();
})();
