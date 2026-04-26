/**
 * client/src/hooks/useKeyboardControls.js
 *
 * Global keyboard shortcut handler for MeloStream.
 *
 * Keyboard map:
 *   Space          — play / pause
 *   ArrowRight     — seek forward 10s
 *   ArrowLeft      — seek backward 10s
 *   Shift+ArrowRight — next track
 *   Shift+ArrowLeft  — previous track
 *   ArrowUp        — volume up 10%
 *   ArrowDown      — volume down 10%
 *   M              — mute toggle
 *   S              — cycle shuffle mode
 *   R              — cycle repeat mode
 *   L              — like toggle (fires custom event — LikeButton listens)
 *
 * Production guards:
 *   1. INPUT GUARD — never intercepts when focus is on:
 *      input, textarea, select, [contenteditable], button, [role="slider"]
 *      This means typing in SearchBar, admin forms, and volume sliders all
 *      work normally. Without this guard, Space in a search box would
 *      play/pause instead of inserting a space.
 *
 *   2. MODIFIER GUARD — ignores Ctrl/Cmd/Alt combinations (except Shift
 *      which is intentionally used for next/prev). This prevents conflicts
 *      with browser shortcuts like Ctrl+R (reload) or Cmd+Left (back).
 *
 *   3. NO-SONG GUARD — all controls except volume/mute are no-ops when
 *      there is no currentSong. Avoids calling playNext() on an empty queue.
 *
 *   4. SEEK DEBOUNCE — ArrowLeft/Right seek is debounced at 80ms to prevent
 *      rapid repeated fires from a held-down key triggering dozens of seeks.
 *      The debounce is leading-edge (fires immediately on first press) so
 *      single presses feel instant.
 *
 *   5. VOLUME CLAMP — volume steps are clamped to [0, 1] before calling
 *      setVolume to prevent audio.volume from going out of range.
 *
 *   6. REPEAT CYCLE — cycles through 'none' → 'all' → 'one' → 'none'.
 *      Reads current repeatMode from store so it always cycles correctly
 *      regardless of how repeatMode was last set.
 *
 * Like integration:
 *   The L key dispatches a custom DOM event 'melostream:like-toggle' on
 *   window. LikeButton should listen for this event and call its own like
 *   handler. This keeps the keyboard hook decoupled from the like API —
 *   no direct import of useLikedSongs or auth state here.
 *
 * Mounting:
 *   Called once inside MusicPlayer which is mounted outside AppRoutes and
 *   never unmounts. The keydown listener is added once on mount and removed
 *   on unmount (which only happens if PlayerErrorBoundary catches a crash).
 *
 * Dependencies: playerStore only. No React state. No re-renders.
 */

import { useEffect, useRef } from "react";
import { usePlayerStore } from "../store/playerStore";

// ── Constants ─────────────────────────────────────────────────────────────────
const VOLUME_STEP = 0.1;
const SEEK_SECONDS = 10;
const SEEK_DEBOUNCE = 80; // ms

// Repeat mode cycle order
const REPEAT_CYCLE = ["none", "all", "one"];

// Tags where keyboard shortcuts must not fire
const BLOCKED_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

// ── Input focus guard ─────────────────────────────────────────────────────────
function isTypingTarget(element) {
  if (!element) return false;
  if (BLOCKED_TAGS.has(element.tagName)) return true;
  if (element.isContentEditable) return true;
  // Block sliders and buttons — arrow keys are used for their native behavior
  const role = element.getAttribute("role");
  if (role === "slider" || role === "spinbutton") return true;
  if (element.tagName === "BUTTON") return true;
  return false;
}

// ── useKeyboardControls ───────────────────────────────────────────────────────

export function useKeyboardControls() {
  // Seek debounce timer ref — persists across renders without causing re-renders
  const seekTimerRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      // ── Modifier guard ──────────────────────────────────────────────────────
      // Allow Shift (used for next/prev). Block Ctrl, Cmd, Alt.
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // ── Input focus guard ───────────────────────────────────────────────────
      if (isTypingTarget(document.activeElement)) return;

      // ── Read live store state ───────────────────────────────────────────────
      // Always via getState() — never closed over from a stale render.
      const store = usePlayerStore.getState();
      const {
        currentSong,
        volume,
        repeatMode,
        togglePlay,
        playNext,
        playPrev,
        setVolume,
        seekBy,
        toggleMute,
        cycleShuffleMode,
        setRepeatMode,
      } = store;

      const hasSong = !!currentSong;

      switch (e.key) {
        // ── Space — play / pause ──────────────────────────────────────────────
        case " ": {
          if (!hasSong) return;
          e.preventDefault(); // prevent page scroll
          togglePlay();
          break;
        }

        // ── ArrowRight — seek forward OR next track (with Shift) ──────────────
        case "ArrowRight": {
          e.preventDefault(); // prevent page scroll
          if (e.shiftKey) {
            if (!hasSong) return;
            if (seekTimerRef.current) return;
            seekBy(SEEK_SECONDS);
            seekTimerRef.current = setTimeout(() => {
              seekTimerRef.current = null;
            }, SEEK_DEBOUNCE);
          } else {
            if (!hasSong) return;
            playNext();
          }
          break;
        }

        // ── ArrowLeft — seek backward OR previous track (with Shift) ─────────
        case "ArrowLeft": {
          e.preventDefault();
          if (e.shiftKey) {
            if (!hasSong) return;
            if (seekTimerRef.current) return;
            seekBy(-SEEK_SECONDS);
            seekTimerRef.current = setTimeout(() => {
              seekTimerRef.current = null;
            }, SEEK_DEBOUNCE);
          } else {
            if (!hasSong) return;
            playPrev();
          }
          break;
        }

        // ── ArrowUp — volume up ───────────────────────────────────────────────
        case "ArrowUp": {
          e.preventDefault();
          const newVolUp = Math.min(
            1,
            parseFloat((volume + VOLUME_STEP).toFixed(2)),
          );
          setVolume(newVolUp);
          break;
        }

        // ── ArrowDown — volume down ───────────────────────────────────────────
        case "ArrowDown": {
          e.preventDefault();
          const newVolDown = Math.max(
            0,
            parseFloat((volume - VOLUME_STEP).toFixed(2)),
          );
          setVolume(newVolDown);
          break;
        }

        // ── M — mute toggle ───────────────────────────────────────────────────
        case "m":
        case "M": {
          toggleMute();
          break;
        }

        // ── S — cycle shuffle mode ────────────────────────────────────────────
        case "s":
        case "S": {
          if (!hasSong) return;
          cycleShuffleMode();
          break;
        }

        // ── R — cycle repeat mode ─────────────────────────────────────────────
        case "r":
        case "R": {
          if (!hasSong) return;
          const currentIdx = REPEAT_CYCLE.indexOf(repeatMode);
          const nextRepeat =
            REPEAT_CYCLE[(currentIdx + 1) % REPEAT_CYCLE.length];
          setRepeatMode(nextRepeat);
          break;
        }

        // ── L — like toggle (decoupled via DOM event) ─────────────────────────
        case "l":
        case "L": {
          if (!hasSong) return;
          // Dispatch a custom event — LikeButton listens and handles auth +
          // API call. This keeps keyboard controls decoupled from like logic.
          window.dispatchEvent(
            new CustomEvent("melostream:like-toggle", {
              detail: { songId: currentSong.id },
            }),
          );
          break;
        }

        default:
          return; // Unknown key — do nothing, do not call preventDefault
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      // Clear any pending debounce timer on unmount
      if (seekTimerRef.current) {
        clearTimeout(seekTimerRef.current);
        seekTimerRef.current = null;
      }
    };
  }, []); // Empty deps — getState() always reads live values, no closures needed
}
