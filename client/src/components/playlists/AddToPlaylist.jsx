import { useState } from 'react';
import { useUserPlaylists, usePlaylistMutations } from '../../hooks/usePlaylists';
import CreatePlaylistModal from './CreatePlaylistModal';

const AddToPlaylist = ({ song, onClose }) => {
  const { playlists } = useUserPlaylists();
  const { addSongToPlaylist } = usePlaylistMutations();
  const [showCreate, setShowCreate] = useState(false);
  const [added, setAdded]           = useState({});
  // PERMANENT FIX: track per-playlist errors so the user knows
  // if a playlist was deleted and can no longer be updated.
  const [errors, setErrors]         = useState({});
  const [loading, setLoading]       = useState({});

  const handleAdd = async (playlistId) => {
    if (loading[playlistId]) return;
    setErrors(prev => ({ ...prev, [playlistId]: null }));
    setLoading(prev => ({ ...prev, [playlistId]: true }));
    try {
      await addSongToPlaylist(playlistId, song.id);
      setAdded(prev => ({ ...prev, [playlistId]: true }));
    } catch (err) {
      console.error('[AddToPlaylist] addSongToPlaylist failed:', err.message);
      // Show a human-readable error inline next to the playlist row
      setErrors(prev => ({
        ...prev,
        [playlistId]: err.message.includes('no longer exists')
          ? 'Playlist was deleted — please refresh.'
          : 'Failed to add. Try again.',
      }));
    } finally {
      setLoading(prev => ({ ...prev, [playlistId]: false }));
    }
  };

  if (showCreate) {
    return (
      <CreatePlaylistModal
        onClose={() => setShowCreate(false)}
        navigateOnCreate={false}
      />
    );
  }

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <h3 style={styles.title}>Add to playlist</h3>
          <button onClick={onClose} style={styles.closeBtn} aria-label="Close">✕</button>
        </div>

        <div style={styles.songRow}>
          <img
            src={song.coverUrl}
            alt={song.title}
            style={styles.songCover}
            onError={e => { e.target.src = 'https://placehold.co/40x40/111/555?text=♪'; }}
          />
          <div>
            <p style={styles.songTitle}>{song.title}</p>
            <p style={styles.songArtist}>{song.artist}</p>
          </div>
        </div>

        <div style={styles.divider} />

        <button style={styles.newBtn} onClick={() => setShowCreate(true)}>
          + New playlist
        </button>

        <div style={styles.list}>
          {playlists.length === 0 && (
            <p style={styles.empty}>No playlists yet.</p>
          )}
          {playlists.map(pl => {
            const alreadyIn = pl.songIds?.includes(song.id);
            const justAdded = added[pl.id];
            const isLoading = loading[pl.id];
            const rowError  = errors[pl.id];
            const disabled  = alreadyIn || justAdded || isLoading;

            return (
              <div key={pl.id} style={styles.plRow}>
                <div style={styles.plInfo}>
                  <p style={styles.plName}>{pl.name}</p>
                  <p style={styles.plCount}>{pl.songIds?.length || 0} songs</p>
                  {/* Inline error — shown only when this playlist's add failed */}
                  {rowError && (
                    <p style={styles.rowError}>{rowError}</p>
                  )}
                </div>
                <button
                  onClick={() => handleAdd(pl.id)}
                  disabled={disabled}
                  style={{
                    ...styles.addBtn,
                    opacity: disabled ? 0.5 : 1,
                    cursor: disabled ? 'default' : 'pointer',
                    color: justAdded ? '#22c55e' : rowError ? '#f87171' : '#4ade80',
                  }}
                >
                  {isLoading  ? '…'
                  : alreadyIn ? 'Added'
                  : justAdded ? '✓ Added'
                  : rowError  ? 'Retry'
                  : 'Add'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const styles = {
  backdrop:   { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 },
  modal:      { background: '#1a1a1a', border: '1px solid #2d2d2d', borderRadius: 16, padding: 24, width: '100%', maxWidth: 380, fontFamily: "'Inter', sans-serif" },
  header:     { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title:      { color: '#fff', fontSize: 16, fontWeight: 700 },
  closeBtn:   { background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 16, padding: 4 },
  songRow:    { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 },
  songCover:  { width: 40, height: 40, borderRadius: 6, objectFit: 'cover', flexShrink: 0 },
  songTitle:  { color: '#fff', fontSize: 13, fontWeight: 600, marginBottom: 2 },
  songArtist: { color: '#6b7280', fontSize: 11 },
  divider:    { height: 1, background: '#2d2d2d', marginBottom: 12 },
  newBtn:     { background: 'none', border: '1px dashed #2d2d2d', borderRadius: 8, color: '#9ca3af', fontSize: 13, padding: '8px 14px', cursor: 'pointer', width: '100%', textAlign: 'left', marginBottom: 8, fontFamily: 'inherit' },
  list:       { maxHeight: 260, overflowY: 'auto' },
  empty:      { color: '#6b7280', fontSize: 13, padding: '16px 0', textAlign: 'center' },
  plRow:      { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #1f1f1f', gap: 8 },
  plInfo:     { minWidth: 0, flex: 1 },
  plName:     { color: '#fff', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  plCount:    { color: '#6b7280', fontSize: 11 },
  rowError:   { color: '#f87171', fontSize: 11, marginTop: 2 },
  addBtn:     { background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 6, padding: '5px 12px', fontSize: 12, flexShrink: 0, fontFamily: 'inherit', fontWeight: 500 },
};

export default AddToPlaylist;