import SongCard from './SongCard';

const SongList = ({ songs }) => {
  if (!songs || songs.length === 0) {
    return (
      <div style={styles.empty}>
        <div style={styles.emptyIcon}>♪</div>
        <p style={styles.emptyTitle}>No songs found</p>
        <p style={styles.emptySubtitle}>Try a different search or check back later.</p>
      </div>
    );
  }

  return (
    <>
      <style>{`
        .song-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 14px;
        }
        @media (min-width: 480px) {
          .song-grid { grid-template-columns: repeat(3, 1fr); }
        }
        @media (min-width: 768px) {
          .song-grid { grid-template-columns: repeat(4, 1fr); gap: 16px; }
        }
        @media (min-width: 1024px) {
          .song-grid { grid-template-columns: repeat(5, 1fr); }
        }
        @media (min-width: 1280px) {
          .song-grid { grid-template-columns: repeat(6, 1fr); }
        }
      `}</style>
      <div className="song-grid">
        {songs.map(song => (
          <SongCard key={song.id} song={song} songList={songs} />
        ))}
      </div>
    </>
  );
};

const styles = {
  empty: {
    textAlign: 'center',
    padding: '80px 20px',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  emptyIcon: {
    width: '56px',
    height: '56px',
    background: '#1a1a1a',
    border: '1px solid #2d2d2d',
    borderRadius: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '22px',
    margin: '0 auto 16px',
  },
  emptyTitle: {
    color: '#fff',
    fontSize: '16px',
    fontWeight: '600',
    marginBottom: '6px',
  },
  emptySubtitle: {
    color: '#6b7280',
    fontSize: '14px',
  },
};

export default SongList;
