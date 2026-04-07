import { useState } from 'react';
import { usePlaylistMutations } from '../../hooks/usePlaylists';

const EditPlaylistModal = ({ playlist, onClose }) => {
  const { updatePlaylist } = usePlaylistMutations();
  const [name, setName]       = useState(playlist.name);
  const [desc, setDesc]       = useState(playlist.description || '');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setLoading(true);
    await updatePlaylist(playlist.id, { name: name.trim(), description: desc.trim() });
    setLoading(false);
    onClose();
  };

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <h2 style={styles.title}>Edit Playlist</h2>
        <div style={styles.form}>
          <label style={styles.label}>Name</label>
          <input value={name} onChange={e => setName(e.target.value)}
            style={styles.input} maxLength={80} autoFocus />
          <label style={styles.label}>Description</label>
          <textarea value={desc} onChange={e => setDesc(e.target.value)}
            style={{ ...styles.input, height: 72, resize: 'none' }} maxLength={200} />
          <div style={styles.actions}>
            <button onClick={onClose} style={styles.cancelBtn}>Cancel</button>
            <button onClick={handleSave} disabled={loading}
              style={{ ...styles.saveBtn, opacity: loading ? 0.6 : 1 }}>
              {loading ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const styles = {
  backdrop:  { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 },
  modal:     { background: '#1a1a1a', border: '1px solid #2d2d2d', borderRadius: 16, padding: 32, width: '100%', maxWidth: 400, fontFamily: "'Inter', sans-serif" },
  title:     { color: '#fff', fontSize: 18, fontWeight: 700, marginBottom: 20 },
  form:      { display: 'flex', flexDirection: 'column', gap: 12 },
  label:     { color: '#9ca3af', fontSize: 12, fontWeight: 500 },
  input:     { background: '#111', border: '1px solid #2d2d2d', borderRadius: 8, padding: '10px 12px', color: '#fff', fontSize: 14, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' },
  actions:   { display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 },
  cancelBtn: { background: '#2d2d2d', color: '#9ca3af', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' },
  saveBtn:   { background: '#22c55e', color: '#000', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
};

export default EditPlaylistModal;
