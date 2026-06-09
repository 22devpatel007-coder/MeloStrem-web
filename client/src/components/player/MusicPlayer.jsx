/**
 * client/src/components/player/MusicPlayer.jsx
 *
 * REWRITTEN: Orchestrator only — zero UI logic here.
 *
 * Manages:
 *   isExpanded  — whether FullScreenPlayer is open
 *   showQueue   — whether QueueDrawer is open (passed to MiniPlayerBar)
 *
 * Renders:
 *   <MiniPlayerBar />     — persistent bottom bar (all breakpoints)
 *   <FullScreenPlayer />  — full screen overlay (on expand)
 *
 * Preserved from original:
 *   - Returns null when no currentSong (no layout cost)
 *   - Mounted outside routes in App.jsx — never unmounts
 *
 * PRESERVED FIXES:
 *   BUG 2/3/4/5: All fixes live in playerStore.js and the sub-components.
 *   This orchestrator has no audio logic.
 */

import { useState, useCallback, memo } from 'react';
import { useMediaSession } from '../../hooks/useMediaSession';
import { useKeyboardControls } from '../../hooks/useKeyboardControls';
import { useListenTracker } from '../../hooks/useListenTracker';
import { usePlayerStore } from '../../store/playerStore';
import MiniPlayerBar from './MiniPlayerBar';
import FullScreenPlayer from './FullScreenPlayer';
import { useEffect } from "react";
import { usePlayTracker } from '../../hooks/usePlayTracker';

const MusicPlayer = memo(() => {
  const currentSong = usePlayerStore((s) => s.currentSong);
  
  const [isExpanded, setIsExpanded] = useState(false);
  const [showQueue,  setShowQueue]  = useState(false);
  useMediaSession();
  useListenTracker();
  useKeyboardControls();
  usePlayTracker();
  const handleExpand      = useCallback(() => setIsExpanded(true),  []);
  const handleCollapse    = useCallback(() => setIsExpanded(false), []);
  const handleToggleQueue = useCallback(() => setShowQueue((v) => !v), []);

  useEffect(() => {
  document.body.classList.add('has-player');
  return () => document.body.classList.remove('has-player');
}, []);
  // No song playing → render nothing
  if (!currentSong) return null;
   

  return (
    <>
      <MiniPlayerBar
        onExpand={handleExpand}
        showQueue={showQueue}
        onToggleQueue={handleToggleQueue}
      />
      <FullScreenPlayer
        isOpen={isExpanded}
        onClose={handleCollapse}
      />
    </>
  );
});

MusicPlayer.displayName = 'MusicPlayer';
export default MusicPlayer;