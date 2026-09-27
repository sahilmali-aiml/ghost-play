# GHOST://PLAY (v2.0 PRO)

**Autonomous AI Playtesting, Solvability Validation & Difficulty Telemetry for Procedural Games.**

Built as an advanced developer tool and interactive simulation lab. GHOST://PLAY acts as an autonomous AI co-pilot that plays, validates, benchmarks, and debugs procedurally generated levels before human players ever touch them.

---

## 🚀 Key Features

1. **Procedural Maze Generation (Parametric)**:
   - Configurable grid dimensions (Small 9×7, Standard 13×9, Large 19×13, Huge 25×17).
   - Adjustable loop injection (0% Strict Trees to 22% Braided labyrinths).
   - Parametric energy core counts (1 to 5) spaced with collision avoidance.

2. **Automated AI Validator (QA Matrix)**:
   - BFS reachability verifying full component connectivity.
   - Exit portal reachability validation.
   - Collectibles access and entity spawn non-collision checks.
   - Minimum traversal depth verification.

3. **Multi-Archetype Simulated AI Playtesters**:
   - **Cautious (Tremaux DFS)**: Randomized depth-first search with methodical backtracking.
   - **Greedy / Objective Rush**: Biased heuristic pathfinding toward nearest visible goals.
   - **Chaotic Wanderer**: High entropy exploration modeling disoriented or casual players.
   - **Speedrunner (A* Optimal TSP)**: Perfect global knowledge baseline calculating exact shortest multi-target route.

4. **Batch Analytics & Difficulty Telemetry (50× Simulation)**:
   - Average steps to solve vs. theoretical optimal baseline.
   - **Inefficiency Ratio**: Empirical difficulty multiplier.
   - Standard deviation & variance metrics.
   - Step distribution histogram bar chart.
   - Top 5 bottleneck / stuck-point junction identification.

5. **Interactive Heatmap Overlay**:
   - Multi-gradient density overlay (Cyan $\rightarrow$ Amber $\rightarrow$ Searing Neon Red).
   - Live tile hover inspector displaying coordinates, tile classification, and cumulative revisit counts.

6. **Interactive Ghost Playback**:
   - VCR-style scrubber: Play, Pause, Step Forward, Step Backward.
   - Variable speed slider (1× to 10×).
   - Glow trails, animated particle pulses, and responsive HiDPI rendering.

7. **🎮 Play as Human Mode**:
   - Direct WASD / Arrow key keyboard control.
   - HUD tracking collected cores and step count in real time.
   - Direct benchmark comparison of human runs against AI Ghost and Optimal A* baselines.

8. **Web Audio Procedural Synthesizer (`audio.js`)**:
   - Pure Web Audio API procedural sound engine (zero external audio files).
   - Cyber clicks, footsteps, core pickup arpeggios, portal hums, and batch completion sweeps.
   - Instant mute/unmute toggle.

9. **Export & Snapshot Tools**:
   - JSON level export format.
   - Direct PNG snapshot generation of level and heatmaps.

---

## 🛠️ File Structure

```
ghost-play/
├── index.html   # Main application dashboard & layout
├── style.css    # Cyber sci-fi glassmorphism styling & animations
├── core.js      # Pure algorithmic core (RNG, Generator, Solvers, Archetypes, QA Matrix, Analytics)
├── audio.js     # Web Audio API procedural cyber synthesizer
├── app.js       # UI layer, HiDPI canvas renderer, playback scrubber, human play loop
└── README.md    # System documentation
```

---

## 🏃 Running the Application

Open `index.html` directly in any modern web browser (Chrome, Edge, Firefox, Safari).
No installation, no npm packages, no API keys, and no build steps required!
