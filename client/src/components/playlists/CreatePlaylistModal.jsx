import { useState } from 'react';
import { usePlaylistMutations } from '../../hooks/usePlaylists';
import { useNavigate } from 'react-router-dom';

const CreatePlaylistModal = ({ onClose, navigateOnCreate = true }) => {
  const { createPlaylist } = usePlaylistMutations();
  const navigate = useNavigate();
  const [name, setName]       = useState('');
  const [desc, setDesc]       = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return setError('Name is required.');
    setLoading(true);
    try {
      const id = await createPlaylist(name, desc);
      onClose();
      if (navigateOnCreate) navigate(`/playlists/${id}`);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <h2 style={styles.title}>New Playlist</h2>
        {error && <div style={styles.error}>{error}</div>}
        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>Name</label>
          <input autoFocus type="text" placeholder="My Playlist"
            value={name} onChange={e => setName(e.target.value)}
            style={styles.input} maxLength={80} />
          <label style={styles.label}>Description (optional)</label>
          <textarea placeholder="Describe your playlist…"
            value={desc} onChange={e => setDesc(e.target.value)}
            style={{ ...styles.input, height: 72, resize: 'none' }} maxLength={200} />
          <div style={styles.actions}>
            <button type="button" onClick={onClose} style={styles.cancelBtn}>Cancel</button>
            <button type="submit" disabled={loading}
              style={{ ...styles.createBtn, opacity: loading ? 0.6 : 1 }}>
              {loading ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const styles = {
  backdrop:  { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 },
  modal:     { background: '#1a1a1a', border: '1px solid #2d2d2d', borderRadius: 16, padding: 32, width: '100%', maxWidth: 400, fontFamily: "'Inter', sans-serif" },
  title:     { color: '#fff', fontSize: 18, fontWeight: 700, marginBottom: 20 },
  error:     { background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 },
  form:      { display: 'flex', flexDirection: 'column', gap: 12 },
  label:     { color: '#9ca3af', fontSize: 12, fontWeight: 500 },
  input:     { background: '#111', border: '1px solid #2d2d2d', borderRadius: 8, padding: '10px 12px', color: '#fff', fontSize: 14, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' },
  actions:   { display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 },
  cancelBtn: { background: '#2d2d2d', color: '#9ca3af', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' },
  createBtn: { background: '#22c55e', color: '#000', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
};

export default CreatePlaylistModal;