/* ============================================================
   GHOST://PLAY — CORE LOGIC ENGINE (Zero DOM Dependencies)
   Autonomous Game Playtesting, Algorithmic Validation & Analytics
   ============================================================ */

const GhostCore = (() => {
  "use strict";

  // ---------- CONSTANTS & DEFAULTS ----------
  const DEFAULT_PARAMS = {
    cols: 13,
    rows: 9,
    loopChance: 0.08,
    collectibleCount: 3,
    seed: null
  };

  // ---------- SEEDABLE / STANDARD RNG ----------
  function createRng(seed) {
    if (seed === null || seed === undefined) {
      return {
        random: () => Math.random(),
        pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
        shuffle: (arr) => {
          const a = [...arr];
          for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
          }
          return a;
        }
      };
    }
    // Simple LCG PRNG for reproducible test seeds
    let s = (Math.abs(seed) % 2147483647) || 123456789;
    const next = () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
    return {
      random: next,
      pick: (arr) => arr[Math.floor(next() * arr.length)],
      shuffle: (arr) => {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(next() * (i + 1));
          [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
      }
    };
  }

  const defaultRng = createRng(null);

  // ============================================================
  // MAZE GENERATION (Recursive Backtracker + Braiding / Loops)
  // ============================================================
  function generateLevel(userParams = {}) {
    const params = { ...DEFAULT_PARAMS, ...userParams };
    const { cols, rows, loopChance, collectibleCount, seed } = params;
    const rng = createRng(seed);

    const tileCols = cols * 2 + 1;
    const tileRows = rows * 2 + 1;

    const cellVisited = Array.from({ length: rows }, () => Array(cols).fill(false));
    const walls = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => ({ N: true, S: true, E: true, W: true }))
    );

    const stack = [[0, 0]];
    cellVisited[0][0] = true;

    while (stack.length) {
      const [r, c] = stack[stack.length - 1];
      const neighbors = [];
      if (r > 0 && !cellVisited[r - 1][c]) neighbors.push(["N", r - 1, c]);
      if (r < rows - 1 && !cellVisited[r + 1][c]) neighbors.push(["S", r + 1, c]);
      if (c > 0 && !cellVisited[r][c - 1]) neighbors.push(["W", r, c - 1]);
      if (c < cols - 1 && !cellVisited[r][c + 1]) neighbors.push(["E", r, c + 1]);

      if (neighbors.length === 0) {
        stack.pop();
        continue;
      }

      const [dir, nr, nc] = rng.pick(neighbors);
      const opposite = { N: "S", S: "N", E: "W", W: "E" };
      walls[r][c][dir] = false;
      walls[nr][nc][opposite[dir]] = false;
      cellVisited[nr][nc] = true;
      stack.push([nr, nc]);
    }

    // Inject loops / braided paths for non-perfect maze variations
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (rng.random() < loopChance) {
          if (c < cols - 1 && walls[r][c].E) {
            walls[r][c].E = false;
            walls[r][c + 1].W = false;
          } else if (r < rows - 1 && walls[r][c].S) {
            walls[r][c].S = false;
            walls[r + 1][c].N = false;
          }
        }
      }
    }

    // Convert cell walls into tileGrid (0 = open path, 1 = solid wall)
    const tileGrid = Array.from({ length: tileRows }, () => Array(tileCols).fill(1));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tr = r * 2 + 1, tc = c * 2 + 1;
        tileGrid[tr][tc] = 0;
        if (!walls[r][c].N) tileGrid[tr - 1][tc] = 0;
        if (!walls[r][c].S) tileGrid[tr + 1][tc] = 0;
        if (!walls[r][c].W) tileGrid[tr][tc - 1] = 0;
        if (!walls[r][c].E) tileGrid[tr][tc + 1] = 0;
      }
    }

    const dims = { tileCols, tileRows };
    const start = { r: 1, c: 1 };
    const exit = farthestTile(tileGrid, dims, start);

    // Collectibles placement (spaced apart from start and exit)
    const openTiles = allOpenTiles(tileGrid, dims).filter(t =>
      manhattan(t, start) > 2 && !(t.r === exit.r && t.c === exit.c)
    );

    const collectibles = [];
    const pool = rng.shuffle(openTiles);
    for (const t of pool) {
      if (collectibles.length >= collectibleCount) break;
      if (!collectibles.some(c => manhattan(c, t) < 3)) {
        collectibles.push(t);
      }
    }
    while (collectibles.length < collectibleCount && pool.length) {
      const fallback = pool.pop();
      if (!collectibles.some(c => c.r === fallback.r && c.c === fallback.c)) {
        collectibles.push(fallback);
      }
    }

    // Calculate dead ends & branch junctions metadata
    const junctions = [];
    const deadEnds = [];
    for (let r = 0; r < dims.tileRows; r++) {
      for (let c = 0; c < dims.tileCols; c++) {
        if (tileGrid[r][c] === 0) {
          const n = neighborsOf(tileGrid, dims, { r, c });
          if (n.length === 1 && !(r === start.r && c === start.c) && !(r === exit.r && c === exit.c)) {
            deadEnds.push({ r, c });
          } else if (n.length >= 3) {
            junctions.push({ r, c, degree: n.length });
          }
        }
      }
    }

    return {
      tileGrid,
      dims,
      start,
      exit,
      collectibles,
      deadEnds,
      junctions,
      params: { cols, rows, loopChance, collectibleCount, seed }
    };
  }

  // ============================================================
  // GRID UTILITIES
  // ============================================================
  function isOpen(tileGrid, dims, r, c) {
    return r >= 0 && r < dims.tileRows && c >= 0 && c < dims.tileCols && tileGrid[r][c] === 0;
  }

  function allOpenTiles(tileGrid, dims) {
    const out = [];
    for (let r = 0; r < dims.tileRows; r++) {
      for (let c = 0; c < dims.tileCols; c++) {
        if (tileGrid[r][c] === 0) out.push({ r, c });
      }
    }
    return out;
  }

  function manhattan(a, b) {
    return Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
  }

  function euclidean(a, b) {
    return Math.hypot(a.r - b.r, a.c - b.c);
  }

  function neighborsOf(tileGrid, dims, cell) {
    const out = [];
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (let i = 0; i < dirs.length; i++) {
      const nr = cell.r + dirs[i][0];
      const nc = cell.c + dirs[i][1];
      if (isOpen(tileGrid, dims, nr, nc)) {
        out.push({ r: nr, c: nc });
      }
    }
    return out;
  }

  function bfsReachable(tileGrid, dims, start) {
    const key = (r, c) => r * dims.tileCols + c;
    const visited = new Set([key(start.r, start.c)]);
    const queue = [start];
    while (queue.length) {
      const cur = queue.shift();
      const nbs = neighborsOf(tileGrid, dims, cur);
      for (let i = 0; i < nbs.length; i++) {
        const n = nbs[i];
        const k = key(n.r, n.c);
        if (!visited.has(k)) {
          visited.add(k);
          queue.push(n);
        }
      }
    }
    return visited;
  }

  function farthestTile(tileGrid, dims, start) {
    const key = (r, c) => r * dims.tileCols + c;
    const visited = new Set([key(start.r, start.c)]);
    let queue = [{ ...start, dist: 0 }];
    let farthest = queue[0];
    while (queue.length) {
      const cur = queue.shift();
      if (cur.dist > farthest.dist) farthest = cur;
      const nbs = neighborsOf(tileGrid, dims, cur);
      for (let i = 0; i < nbs.length; i++) {
        const n = nbs[i];
        const k = key(n.r, n.c);
        if (!visited.has(k)) {
          visited.add(k);
          queue.push({ ...n, dist: cur.dist + 1 });
        }
      }
    }
    return farthest;
  }

  // ============================================================
  // A* PATHFINDER (Optimal Baseline)
  // ============================================================
  function astar(tileGrid, dims, start, goal) {
    const key = (r, c) => r * dims.tileCols + c;
    const open = new Map();
    const cameFrom = new Map();
    const gScore = new Map();
    const fScore = new Map();

    const startK = key(start.r, start.c);
    gScore.set(startK, 0);
    fScore.set(startK, manhattan(start, goal));
    open.set(startK, start);

    while (open.size > 0) {
      let currentKey = null;
      let current = null;
      let bestF = Infinity;

      for (const [k, pos] of open) {
        const f = fScore.get(k) ?? Infinity;
        if (f < bestF) {
          bestF = f;
          currentKey = k;
          current = pos;
        }
      }

      if (current.r === goal.r && current.c === goal.c) {
        const path = [current];
        let k = key(current.r, current.c);
        while (cameFrom.has(k)) {
          current = cameFrom.get(k);
          k = key(current.r, current.c);
          path.unshift(current);
        }
        return path;
      }

      open.delete(currentKey);
      const currentG = gScore.get(currentKey) ?? Infinity;
      const nbs = neighborsOf(tileGrid, dims, current);

      for (let i = 0; i < nbs.length; i++) {
        const n = nbs[i];
        const tentativeG = currentG + 1;
        const nKey = key(n.r, n.c);
        if (tentativeG < (gScore.get(nKey) ?? Infinity)) {
          cameFrom.set(nKey, current);
          gScore.set(nKey, tentativeG);
          fScore.set(nKey, tentativeG + manhattan(n, goal));
          if (!open.has(nKey)) open.set(nKey, n);
        }
      }
    }
    return [];
  }

  // Full optimal route visiting all collectibles then exit (checks all permutations for exact TSP optimal)
  function computeOptimalPath(tileGrid, dims, start, exit, collectibles) {
    if (!collectibles || collectibles.length === 0) {
      return astar(tileGrid, dims, start, exit);
    }

    // Permutations helper
    function permute(arr) {
      if (arr.length <= 1) return [arr];
      const result = [];
      for (let i = 0; i < arr.length; i++) {
        const current = arr[i];
        const rest = arr.slice(0, i).concat(arr.slice(i + 1));
        const subPerms = permute(rest);
        for (let j = 0; j < subPerms.length; j++) {
          result.push([current, ...subPerms[j]]);
        }
      }
      return result;
    }

    const permutations = permute(collectibles);
    let bestTotalPath = [];
    let bestTotalLength = Infinity;

    for (const order of permutations) {
      let cur = start;
      let fullPath = [start];
      let valid = true;

      for (let i = 0; i < order.length; i++) {
        const leg = astar(tileGrid, dims, cur, order[i]);
        if (leg.length === 0) { valid = false; break; }
        fullPath = fullPath.concat(leg.slice(1));
        cur = order[i];
      }

      if (valid) {
        const finalLeg = astar(tileGrid, dims, cur, exit);
        if (finalLeg.length > 0) {
          fullPath = fullPath.concat(finalLeg.slice(1));
          if (fullPath.length < bestTotalLength) {
            bestTotalLength = fullPath.length;
            bestTotalPath = fullPath;
          }
        }
      }
    }

    return bestTotalPath;
  }

  function baselineOptimalSteps(tileGrid, dims, start, exit, collectibles) {
    const path = computeOptimalPath(tileGrid, dims, start, exit, collectibles);
    return path.length > 0 ? path.length - 1 : 0;
  }

  // ============================================================
  // AI VALIDATOR (Automated QA Engine)
  // ============================================================
  function validateLevel(level) {
    const { tileGrid, dims, start, exit, collectibles } = level;
    const reachable = bfsReachable(tileGrid, dims, start);
    const key = (r, c) => r * dims.tileCols + c;
    const totalOpen = allOpenTiles(tileGrid, dims).length;

    const checks = [];
    
    // 1. Full Connectivity
    const fullConnect = reachable.size === totalOpen;
    checks.push({
      id: "connectivity",
      label: "All open paths fully reachable from start",
      detail: `${reachable.size}/${totalOpen} tiles accessible`,
      pass: fullConnect
    });

    // 2. Exit Reachable
    const exitPass = reachable.has(key(exit.r, exit.c));
    checks.push({
      id: "exit_reachable",
      label: "Exit extraction portal reachable",
      detail: `Exit at (${exit.r}, ${exit.c}) reachable: ${exitPass ? "YES" : "NO"}`,
      pass: exitPass
    });

    // 3. Energy Collectibles Reachable
    const cellsPass = collectibles.every(c => reachable.has(key(c.r, c.c)));
    checks.push({
      id: "items_reachable",
      label: `All energy cores (${collectibles.length}/${collectibles.length}) accessible`,
      detail: `${collectibles.filter(c => reachable.has(key(c.r, c.c))).length}/${collectibles.length} reachable`,
      pass: cellsPass
    });

    // 4. Overlap Check
    const distinctTiles = new Set([
      key(start.r, start.c),
      key(exit.r, exit.c),
      ...collectibles.map(c => key(c.r, c.c))
    ]);
    const overlapPass = distinctTiles.size === 2 + collectibles.length;
    checks.push({
      id: "no_overlaps",
      label: "Distinct spawn coordinates (No entity collisions)",
      detail: `${distinctTiles.size} distinct target cells`,
      pass: overlapPass
    });

    // 5. Minimum Solvability & Distance Check
    // Uses the actual walking distance through the maze's corridors (via A*),
    // not straight-line Manhattan distance — a maze routinely places its exit
    // spatially close to the start while still requiring a long winding walk
    // to reach it, so straight-line distance says nothing about difficulty.
    const walkingDist = astar(tileGrid, dims, start, exit).length - 1;
    const minExitDist = walkingDist >= 4;
    checks.push({
      id: "solvability_depth",
      label: "Adequate traversal depth (Distance >= 4)",
      detail: `Start-to-Exit walking distance = ${walkingDist} steps`,
      pass: minExitDist
    });

    return {
      checks,
      allPass: checks.every(c => c.pass),
      totalOpen,
      reachableCount: reachable.size
    };
  }

  // ============================================================
  // MULTI-ARCHETYPE PLAYTEST AGENTS
  // ============================================================
  // Archetypes:
  // 1. 'tremaux' / 'cautious' : Randomized DFS with systematic backtracking (Standard Explorer)
  // 2. 'greedy'               : Heuristic-biased towards closest undiscovered collectible / exit
  // 3. 'chaotic' / 'wanderer' : Higher randomness with short-term local memory
  // 4. 'optimal'              : A* Speedrunner (Perfect Knowledge)

  function simulateExplorer(level, options = {}) {
    const {
      persona = "tremaux",
      maxStepsOverride = null,
      seed = null
    } = typeof options === "string" ? { persona: options } : options;

    const rng = createRng(seed);
    const { tileGrid, dims, start, exit, collectibles } = level;
    const key = (cell) => cell.r * dims.tileCols + cell.c;

    const visitCounts = new Map();
    const bump = (cell) => {
      const k = key(cell);
      visitCounts.set(k, (visitCounts.get(k) || 0) + 1);
    };

    // If speedrunner archetype, return pure optimal A* execution
    if (persona === "optimal") {
      const path = computeOptimalPath(tileGrid, dims, start, exit, collectibles);
      const collectedAtStep = {};
      let reachedExitAtStep = null;
      path.forEach((pos, idx) => {
        bump(pos);
        collectibles.forEach((c, cIdx) => {
          if (c.r === pos.r && c.c === pos.c && collectedAtStep[cIdx] === undefined) {
            collectedAtStep[cIdx] = idx;
          }
        });
        if (pos.r === exit.r && pos.c === exit.c && Object.keys(collectedAtStep).length === collectibles.length && reachedExitAtStep === null) {
          reachedExitAtStep = idx;
        }
      });
      return {
        persona,
        path,
        steps: Math.max(0, path.length - 1),
        collectedAtStep,
        reachedExitAtStep: reachedExitAtStep ?? Math.max(0, path.length - 1),
        visitCounts,
        timedOut: false
      };
    }

    const visitedCells = new Set([key(start)]);
    const stack = [start];
    let current = start;
    const path = [current];
    bump(current);

    const collectedAtStep = {};
    const uncollectedIndices = new Set(collectibles.map((_, i) => i));

    // Check if spawn was right on a collectible
    collectibles.forEach((c, i) => {
      if (c.r === current.r && c.c === current.c) {
        collectedAtStep[i] = 0;
        uncollectedIndices.delete(i);
      }
    });

    let reachedExitAtStep = null;
    const totalOpen = allOpenTiles(tileGrid, dims).length;
    const maxSteps = maxStepsOverride || totalOpen * 4 + 40;

    let steps = 0;

    // Short-term memory for the Chaotic Wanderer (tile keys it stood on most
    // recently) and a counter tracking how long it's gone without finding new
    // ground, so it never oscillates between the same couple of tiles forever.
    const recentCells = [];
    const RECENT_MEMORY = 6;
    const CHAOTIC_STUCK_LIMIT = 45;
    let stagnantSteps = 0;

    // Guaranteed "find your way" fallback: walks the exact A* route to
    // whatever the explorer still needs (nearest uncollected core, then the
    // exit), recording every intermediate tile and firing pickup/exit checks
    // along the way. Used once an archetype's own exploration strategy has
    // nothing left to offer, so no persona can get permanently stuck.
    function routeToRemainingTarget() {
      const remainingTarget = uncollectedIndices.size > 0
        ? collectibles
            .filter((_, idx) => uncollectedIndices.has(idx))
            .sort((a, b) => manhattan(a, current) - manhattan(b, current))[0]
        : exit;
      const route = astar(tileGrid, dims, current, remainingTarget);

      for (let rIdx = 1; rIdx < route.length && steps < maxSteps; rIdx++) {
        steps++;
        current = route[rIdx];
        visitedCells.add(key(current));
        path.push(current);
        bump(current);
        collectibles.forEach((c, cIdx) => {
          if (uncollectedIndices.has(cIdx) && c.r === current.r && c.c === current.c) {
            collectedAtStep[cIdx] = steps;
            uncollectedIndices.delete(cIdx);
          }
        });
        if (uncollectedIndices.size === 0 && current.r === exit.r && current.c === exit.c) {
          reachedExitAtStep = steps;
          return true;
        }
      }

      // More than one target may still remain (e.g. another core, then the
      // exit) — keep chaining routes until everything is collected and the
      // explorer is standing on the exit, or the step budget runs out.
      if (steps < maxSteps && (uncollectedIndices.size > 0 || !(current.r === exit.r && current.c === exit.c))) {
        return routeToRemainingTarget();
      }
      return reachedExitAtStep !== null;
    }

    while (steps < maxSteps) {
      // Goal condition: ALL collectibles gathered AND currently standing on exit!
      if (uncollectedIndices.size === 0 && current.r === exit.r && current.c === exit.c) {
        reachedExitAtStep = steps;
        break;
      }

      const allNeighbors = neighborsOf(tileGrid, dims, current);
      const unvisitedNeighbors = allNeighbors.filter(n => !visitedCells.has(key(n)));

      if (persona === "chaotic") {
        // Chaotic Wanderer: a high-entropy random walk with short-term memory.
        // It leans (lightly) toward unexplored ground and strongly avoids
        // stepping straight back onto tiles it just left, so it wanders freely
        // without ever settling into a back-and-forth loop between two tiles.
        if (allNeighbors.length === 0) break;

        const weighted = allNeighbors.map(n => {
          const nk = key(n);
          let w = 1;
          if (!visitedCells.has(nk)) w += 2.2;
          const memIdx = recentCells.indexOf(nk);
          if (memIdx !== -1) w *= 0.1 + memIdx * 0.05; // most recently visited is least likely
          return { cell: n, w };
        });
        const totalW = weighted.reduce((sum, item) => sum + item.w, 0);
        let roll = rng.random() * totalW;
        current = weighted[weighted.length - 1].cell;
        for (const item of weighted) {
          roll -= item.w;
          if (roll <= 0) { current = item.cell; break; }
        }

        const discoveredNewTile = !visitedCells.has(key(current));
        visitedCells.add(key(current));
        recentCells.push(key(current));
        if (recentCells.length > RECENT_MEMORY) recentCells.shift();
        stagnantSteps = discoveredNewTile ? 0 : stagnantSteps + 1;

        // Safety valve: if pure wandering hasn't turned up new ground in a
        // while, let the wanderer "get its bearings" and head for its target.
        if (stagnantSteps > CHAOTIC_STUCK_LIMIT) {
          if (routeToRemainingTarget()) break;
          stagnantSteps = 0;
          continue;
        }
      } else if (persona === "greedy") {
        // Greedy Player: biased towards visible goals (closest item or exit if done)
        const targetGoal = uncollectedIndices.size > 0
          ? collectibles.filter((_, idx) => uncollectedIndices.has(idx)).sort((a, b) => manhattan(a, current) - manhattan(b, current))[0]
          : exit;

        if (unvisitedNeighbors.length > 0) {
          // Sort unvisited neighbors by proximity to target
          unvisitedNeighbors.sort((a, b) => {
            const distA = manhattan(a, targetGoal) + (rng.random() * 1.5);
            const distB = manhattan(b, targetGoal) + (rng.random() * 1.5);
            return distA - distB;
          });
          current = unvisitedNeighbors[0];
          visitedCells.add(key(current));
          stack.push(current);
        } else {
          stack.pop();
          if (stack.length === 0) {
            // Fully backtracked with nothing left nearby to explore — route
            // straight to whatever's still needed instead of wandering forever.
            if (routeToRemainingTarget()) break;
            continue;
          }
          current = stack[stack.length - 1];
        }
      } else {
        // Standard Tremaux / Cautious DFS Explorer
        if (unvisitedNeighbors.length > 0) {
          current = rng.pick(unvisitedNeighbors);
          visitedCells.add(key(current));
          stack.push(current);
        } else {
          stack.pop();
          if (stack.length === 0) {
            // Entire graph visited; if not finished, route to remaining targets
            if (routeToRemainingTarget()) break;
            continue;
          }
          current = stack[stack.length - 1];
        }
      }

      steps++;
      path.push(current);
      bump(current);

      // Check collectible pickup
      collectibles.forEach((c, i) => {
        if (uncollectedIndices.has(i) && c.r === current.r && c.c === current.c) {
          collectedAtStep[i] = steps;
          uncollectedIndices.delete(i);
        }
      });

      // Exit check after all items
      if (uncollectedIndices.size === 0 && current.r === exit.r && current.c === exit.c) {
        reachedExitAtStep = steps;
        break;
      }
    }

    return {
      persona,
      path,
      steps,
      collectedAtStep,
      reachedExitAtStep,
      visitCounts,
      timedOut: steps >= maxSteps && reachedExitAtStep === null
    };
  }

  // ============================================================
  // BATCH SIMULATION & STATISTICAL ANALYTICS
  // ============================================================
  function runBatch(level, n = 50, persona = "tremaux") {
    const runs = [];
    if (persona === "optimal") {
      // The Speedrunner archetype is a deterministic perfect-knowledge A* TSP
      // solve — it produces the exact same route every time, so re-running the
      // (expensive, permutation-based) TSP solver n times would be wasted work
      // that only ever recomputes an identical result. Solve once and reuse it.
      const singleRun = simulateExplorer(level, { persona });
      for (let i = 0; i < n; i++) runs.push(singleRun);
    } else {
      for (let i = 0; i < n; i++) {
        runs.push(simulateExplorer(level, { persona }));
      }
    }

    const stepsArr = runs.map(r => r.steps);
    const avgSteps = stepsArr.reduce((a, b) => a + b, 0) / runs.length;
    const minSteps = Math.min(...stepsArr);
    const maxSteps = Math.max(...stepsArr);
    const timeouts = runs.filter(r => r.timedOut).length;

    // Variance & Standard Deviation
    const variance = stepsArr.reduce((sum, s) => sum + Math.pow(s - avgSteps, 2), 0) / runs.length;
    const stdDev = Math.sqrt(variance);

    // Step Distribution Histogram (5 buckets)
    const bucketCount = 5;
    const range = Math.max(1, maxSteps - minSteps);
    const bucketSize = Math.ceil(range / bucketCount);
    const histogram = Array.from({ length: bucketCount }, (_, idx) => {
      const low = minSteps + idx * bucketSize;
      const high = idx === bucketCount - 1 ? maxSteps : low + bucketSize - 1;
      const count = stepsArr.filter(s => s >= low && (idx === bucketCount - 1 ? s <= high : s < low + bucketSize)).length;
      return { low, high, count, label: `${low}-${high}` };
    });

    // Aggregate Visits Matrix for Heatmap
    const aggregateVisits = new Map();
    runs.forEach(r => {
      r.visitCounts.forEach((count, key) => {
        aggregateVisits.set(key, (aggregateVisits.get(key) || 0) + count);
      });
    });

    const startKey = level.start.r * level.dims.tileCols + level.start.c;
    const stuckPoints = [...aggregateVisits.entries()]
      .filter(([k]) => k !== startKey)
      .map(([k, total]) => ({
        r: Math.floor(k / level.dims.tileCols),
        c: k % level.dims.tileCols,
        avgVisits: total / runs.length
      }))
      .sort((a, b) => b.avgVisits - a.avgVisits)
      .slice(0, 5);

    const optimalSteps = baselineOptimalSteps(level.tileGrid, level.dims, level.start, level.exit, level.collectibles);
    const inefficiencyRatio = optimalSteps > 0 ? avgSteps / optimalSteps : 1;

    let verdict;
    if (inefficiencyRatio < 1.7) {
      verdict = {
        label: "EASY / INTUITIVE",
        color: "#0aff9d",
        note: "Explorer navigates naturally with minimal backtracking. Clear sightlines and intuitive routing."
      };
    } else if (inefficiencyRatio < 2.9) {
      verdict = {
        label: "BALANCED / MODERATE",
        color: "#00d4ff",
        note: "Healthy challenge level. Meaningful branch exploration without punishing frustration."
      };
    } else if (inefficiencyRatio < 4.2) {
      verdict = {
        label: "HARD / MAZE-HEAVY",
        color: "#ffb020",
        note: "Significant dead-end revisiting. Junctions create disorientation for simulated players."
      };
    } else {
      verdict = {
        label: "PUNISHING / LABYRINTHINE",
        color: "#ff3b6e",
        note: "Extreme backtracking overhead. High player drop-off risk. Recommend adding loops or visual cues."
      };
    }

    return {
      persona,
      runs,
      avgSteps,
      minSteps,
      maxSteps,
      stdDev,
      histogram,
      timeouts,
      optimalSteps,
      inefficiencyRatio,
      verdict,
      stuckPoints,
      aggregateVisits,
      sampleRun: runs[0]
    };
  }

  // ============================================================
  // LEVEL IMPORT / EXPORT SERIALIZER
  // ============================================================
  function exportLevelJson(level) {
    return JSON.stringify({
      version: "2.0.0",
      generator: "GHOST://PLAY",
      timestamp: new Date().toISOString(),
      params: level.params,
      dims: level.dims,
      start: level.start,
      exit: level.exit,
      collectibles: level.collectibles,
      tileGrid: level.tileGrid
    }, null, 2);
  }

  function importLevelJson(jsonString) {
    const data = typeof jsonString === "string" ? JSON.parse(jsonString) : jsonString;
    if (!data.tileGrid || !data.dims || !data.start || !data.exit) {
      throw new Error("Invalid level schema format");
    }
    const openTiles = allOpenTiles(data.tileGrid, data.dims);
    return {
      tileGrid: data.tileGrid,
      dims: data.dims,
      start: data.start,
      exit: data.exit,
      collectibles: data.collectibles || [],
      deadEnds: [],
      junctions: [],
      params: data.params || { cols: (data.dims.tileCols - 1) / 2, rows: (data.dims.tileRows - 1) / 2 }
    };
  }

  return {
    generateLevel,
    validateLevel,
    astar,
    computeOptimalPath,
    baselineOptimalSteps,
    simulateExplorer,
    runBatch,
    exportLevelJson,
    importLevelJson,
    allOpenTiles,
    bfsReachable,
    manhattan,
    euclidean,
    neighborsOf,
    isOpen
  };
})();

if (typeof module !== "undefined") {
  module.exports = GhostCore;
}
