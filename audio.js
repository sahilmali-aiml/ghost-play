/* ============================================================
   GHOST://PLAY — AUDIO ENGINE (Web Audio API Synthesizer)
   Zero external sound files; 100% procedural cyber soundscapes.
   ============================================================ */

const GhostAudio = (() => {
  "use strict";

  let audioCtx = null;
  let isMuted = true; // muted by default until user toggles or enables
  let masterGain = null;

  function initAudio() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
        masterGain = audioCtx.createGain();
        masterGain.gain.setValueAtTime(isMuted ? 0 : 0.15, audioCtx.currentTime);
        masterGain.connect(audioCtx.destination);
      }
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume();
    }
  }

  function setMuted(muted) {
    isMuted = muted;
    initAudio();
    if (masterGain && audioCtx) {
      masterGain.gain.setValueAtTime(isMuted ? 0 : 0.15, audioCtx.currentTime);
    }
    return isMuted;
  }

  function toggleMute() {
    return setMuted(!isMuted);
  }

  function getMuted() {
    return isMuted;
  }

  // Helper tone player
  function playTone(freq, type = "sine", duration = 0.08, gainVal = 0.2) {
    if (isMuted || !audioCtx) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(gainVal, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) {
      // ignore
    }
  }

  // Specific sound triggers
  const sfx = {
    click: () => {
      initAudio();
      playTone(800, "triangle", 0.04, 0.1);
    },
    step: () => {
      if (isMuted || !audioCtx) return;
      playTone(180 + Math.random() * 40, "sine", 0.03, 0.08);
    },
    pickup: () => {
      if (isMuted || !audioCtx) return;
      const now = audioCtx.currentTime;
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        setTimeout(() => playTone(f, "sine", 0.12, 0.2), i * 35);
      });
    },
    exitReached: () => {
      if (isMuted || !audioCtx) return;
      [440, 554.37, 659.25, 880, 1108.7].forEach((f, i) => {
        setTimeout(() => playTone(f, "triangle", 0.25, 0.25), i * 50);
      });
    },
    batchComplete: () => {
      if (isMuted || !audioCtx) return;
      playTone(440, "sine", 0.1, 0.15);
      setTimeout(() => playTone(880, "sine", 0.2, 0.2), 100);
    },
    generate: () => {
      if (isMuted || !audioCtx) return;
      playTone(300, "sawtooth", 0.08, 0.05);
      setTimeout(() => playTone(600, "sawtooth", 0.1, 0.05), 40);
    },
    wallBump: () => {
      if (isMuted || !audioCtx) return;
      playTone(90, "square", 0.06, 0.12);
    }
  };

  return {
    init: initAudio,
    setMuted,
    toggleMute,
    getMuted,
    sfx
  };
})();

if (typeof module !== "undefined") {
  module.exports = GhostAudio;
}
