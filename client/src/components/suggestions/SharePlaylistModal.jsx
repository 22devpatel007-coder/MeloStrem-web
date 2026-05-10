/**
 * client/src/components/suggestions/SharePlaylistModal.jsx
 *
 * Modal on desktop, bottom sheet on mobile.
 * Shows inline success state — no toast.
 * Platform auto-detection from URL (Spotify / YouTube).
 * Playlist name capped at 50 chars.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  XMarkIcon,
  LinkIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";
import { useSubmitSuggestion } from "../../hooks/useSuggestions";

// ── URL validation (client-side) ──────────────────────────────────────────────

const isValidUrl = (str) => {
  try {
    const url = new URL(str.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

// ── Component ─────────────────────────────────────────────────────────────────

const SharePlaylistModal = ({ isOpen, onClose }) => {
  const [link, setLink] = useState("");
  const [playlistName, setPlaylistName] = useState("");
  const [linkError, setLinkError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const { mutate, isPending } = useSubmitSuggestion();
  const linkInputRef = useRef(null);
  const firstFocusRef = useRef(null);

  // Focus link input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => linkInputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Trap focus inside modal / close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClose = useCallback(() => {
    if (isPending) return; // don't close while submitting
    setLink("");
    setPlaylistName("");
    setLinkError("");
    setSubmitted(false);
    onClose();
  }, [isPending, onClose]);

  const handleSubmit = () => {
    const trimmed = link.trim();

    // Client-side validation
    if (!trimmed) {
      setLinkError("Please paste a playlist link.");
      return;
    }
    if (!isValidUrl(trimmed)) {
      setLinkError(
        "Please enter a valid URL (must start with http:// or https://).",
      );
      return;
    }
    setLinkError("");

    mutate(
      { link: trimmed, playlistName: playlistName.trim() || null },
      {
        onSuccess: () => setSubmitted(true),
        onError: (err) => {
          if (err?.status === 429) {
            setLinkError(
              "You've already submitted a playlist today. Try again tomorrow.",
            );
          } else if (err?.status === 400) {
            setLinkError(
              err?.message || "Invalid submission. Please check the link.",
            );
          } else {
            setLinkError("Something went wrong. Please try again.");
          }
        },
      },
    );
  };

  if (!isOpen) return null;

  return (
    <>
      {/* ── Backdrop ── */}
      <div
        className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* ── Panel — modal on desktop, bottom sheet on mobile ── */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Share a playlist"
        ref={firstFocusRef}
        className={[
          "fixed z-[101] bg-[#181818] border border-[#2a2a2a]",
          // Mobile: bottom sheet
          "bottom-0 left-0 right-0 rounded-t-2xl px-5 pt-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]",
          // Desktop: centered modal
          "md:bottom-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2",
          "md:w-full md:max-w-md md:rounded-2xl md:px-6 md:py-6",
          "shadow-2xl",
        ].join(" ")}
      >
        {/* ── Handle (mobile only) ── */}
        <div className="flex justify-center mb-4 md:hidden" aria-hidden="true">
          <div className="w-10 h-1 rounded-full bg-[#3a3a3a]" />
        </div>

        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center shrink-0">
              <LinkIcon className="w-4 h-4 text-purple-400" />
            </span>
            <h2 className="text-white font-semibold text-base">
              Share a Playlist
            </h2>
          </div>
          <button
            onClick={handleClose}
            disabled={isPending}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#2a2a2a] transition-colors disabled:opacity-40"
            aria-label="Close"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* ── Success state ── */}
        {submitted ? (
          <div className="flex flex-col items-center text-center py-6 gap-3">
            <CheckCircleIcon className="w-12 h-12 text-emerald-400" />
            <p className="text-white font-semibold text-base">
              Thanks! We got it.
            </p>
            <p className="text-gray-400 text-sm">
              Your playlist link has been sent to the admin. We'll review it and
              add songs manually.
            </p>
            <button
              onClick={handleClose}
              className="mt-2 px-5 py-2 rounded-lg bg-[#2a2a2a] text-white text-sm font-medium hover:bg-[#333] transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          /* ── Form ── */
          <div className="flex flex-col gap-4">
            {/* Link field */}
            <div>
              <label
                htmlFor="suggestion-link"
                className="block text-xs font-medium text-gray-400 mb-1.5"
              >
                Playlist link <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <input
                  id="suggestion-link"
                  ref={linkInputRef}
                  type="url"
                  value={link}
                  onChange={(e) => {
                    setLink(e.target.value);
                    if (linkError) setLinkError("");
                  }}
                  placeholder="https://open.spotify.com/playlist/..."
                  disabled={isPending}
                  className={[
                    "w-full bg-[#111] border rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600",
                    "focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-colors",
                    "disabled:opacity-50",
                    "",
                    linkError
                      ? "border-red-500/60"
                      : "border-[#2a2a2a] focus:border-purple-500/60",
                  ].join(" ")}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              {linkError && (
                <p className="mt-1.5 text-xs text-red-400" role="alert">
                  {linkError}
                </p>
              )}
            </div>

            {/* Playlist name field */}
            <div>
              <label
                htmlFor="suggestion-name"
                className="block text-xs font-medium text-gray-400 mb-1.5"
              >
                Playlist name <span className="text-gray-600">(optional)</span>
              </label>
              <input
                id="suggestion-name"
                type="text"
                value={playlistName}
                onChange={(e) => {
                  if (e.target.value.length <= 50)
                    setPlaylistName(e.target.value);
                }}
                placeholder="e.g. Chill Vibes 2024"
                disabled={isPending}
                maxLength={50}
                className="w-full bg-[#111] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/60 transition-colors disabled:opacity-50"
              />
              <p className="mt-1 text-right text-[11px] text-gray-600">
                {playlistName.length}/50
              </p>
            </div>

            {/* Info note */}
            <p className="text-xs text-gray-500 bg-[#111] border border-[#222] rounded-lg px-3 py-2.5 leading-relaxed">
              Make sure your playlist is set to{" "}
              <span className="text-white font-medium">Public</span> before
              sharing — private links cannot be reviewed by the admin. No
              automatic import happens.
            </p>

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={isPending || !link.trim()}
              className="w-full py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
            >
              {isPending ? "Sending…" : "Send to Admin"}
            </button>
          </div>
        )}
      </div>
    </>
  );
};

export default SharePlaylistModal;
