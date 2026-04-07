import { useState } from 'react';
import api from '../../services/api';

/**
 * EditSongModal — permanently updates song metadata and/or cover image.
 *
 * PERMANENT SOLUTION NOTES:
 * - Uses axiosUpload (5-min timeout) because cover re-upload can be slow.
 * - Sends multipart/form-data only when a new cover is selected; otherwise
 *   sends JSON to avoid unnecessary Cloudinary calls.
 * - The backend PATCH /api/songs/:id handles both cases.
 * - Duration accepts both seconds (integer) and mm:ss string, normalised to seconds.
 */

const parseDuration = (raw) => {
  if (!raw && raw !== 0) return '';
  const str = String(raw).trim();
  // mm:ss format
  if (/^\d{1,3}:\d{2}$/.test(str)) {
    const [m, s] = str.split(':').map(Number);
    return String(m * 60 + s);
  }
  // plain seconds
  if (/^\d+$/.test(str)) return str;
  return str;
};

const fmtDuration = (secs) => {
  if (!secs && secs !== 0) return '';
  const n = Number(secs);
  if (isNaN(n)) return String(secs);
  const m = Math.floor(n / 60);
  const s = Math.floor(n % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

const EditSongModal = ({ song, onClose, onUpdated }) => {
  const [form, setForm] = useState({
    title:    song.title    || '',
    artist:   song.artist   || '',
    genre:    song.genre    || '',
    duration: fmtDuration(song.duration),
  });
  const [coverFile, setCoverFile]   = useState(null);
  const [coverPreview, setCoverPreview] = useState(song.coverUrl || '');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [progress, setProgress]     = useState(0);

  const handleChange = (e) =>
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const handleCoverChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    setProgress(0);

    try {
      const durationSecs = parseDuration(form.duration);

      if (coverFile) {
        // multipart upload — cover needs to be re-uploaded to Cloudinary
        const fd = new FormData();
        fd.append('title',    form.title.trim());
        fd.append('artist',   form.artist.trim());
        fd.append('genre',    form.genre.trim());
        fd.append('duration', durationSecs);
        fd.append('cover',    coverFile);

        const res = await api.patch(`/songs/${song.id}`, fd, {
          timeout: 300000,
          onUploadProgress: (ev) =>
            setProgress(Math.round((ev.loaded * 100) / ev.total)),
        });
        onUpdated(res.data);
      } else {
        // JSON-only — no file upload needed
        const res = await api.patch(`/songs/${song.id}`, {
          title:    form.title.trim(),
          artist:   form.artist.trim(),
          genre:    form.genre.trim(),
          duration: Number(durationSecs) || 0,
        });
        onUpdated(res.data);
      }

      onClose();
    } catch (err) {
      setError(
        err.response?.data?.error ||
        err.message ||
        'Update failed. Please try again.'
      );
    }
    setLoading(false);
    setProgress(0);
  };

  return (
    <div style={s.backdrop} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={s.header}>
          <h2 style={s.title}>Edit Song</h2>
          <button onClick={onClose} style={s.closeBtn} aria-label="Close">
            <XIcon />
          </button>
        </div>

        {error && <div style={s.errorBox}>{error}</div>}

        <form onSubmit={handleSubmit} style={s.form}>
          {/* Cover preview + file picker */}
          <div style={s.coverRow}>
            <div style={s.coverWrap}>
              <img
                src={coverPreview || 'https://placehold.co/80x80/111/555?text=♪'}
                alt="cover"
                style={s.coverImg}
                onError={(e) => { e.target.src = 'https://placehold.co/80x80/111/555?text=♪'; }}
              />
            </div>
            <div>
              <label style={s.fileLabel}>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleCoverChange}
                  style={{ display: 'none' }}
                />
                <span style={s.fileBrowse}>
                  {coverFile ? '✓ ' + coverFile.name.slice(0, 22) + (coverFile.name.length > 22 ? '…' : '') : 'Change Cover'}
                </span>
              </label>
              <p style={s.fileHint}>JPG, PNG, WEBP · optional</p>
            </div>
          </div>

          {/* Fields */}
          <div style={s.grid}>
            <Field label="Title"  name="title"  value={form.title}  onChange={handleChange} required />
            <Field label="Artist" name="artist" value={form.artist} onChange={handleChange} required />
            <Field label="Genre"  name="genre"  value={form.genre}  onChange={handleChange} required />
            <Field
              label="Duration (mm:ss or seconds)"
              name="duration"
              value={form.duration}
              onChange={handleChange}
              placeholder="e.g. 3:54 or 234"
            />
          </div>

          {/* Progress */}
          {progress > 0 && (
            <div style={s.progressWrap}>
              <div style={s.progressBar}>
                <div style={{ ...s.progressFill, width: `${progress}%` }} />
              </div>
              <span style={s.progressLabel}>{progress}%</span>
            </div>
          )}

          {/* Actions */}
          <div style={s.actions}>
            <button type="button" onClick={onClose} style={s.cancelBtn}>Cancel</button>
            <button
              type="submit"
              disabled={loading}
              style={{ ...s.saveBtn, opacity: loading ? 0.6 : 1 }}
            >
              {loading ? `Saving… ${progress ? progress + '%' : ''}` : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* ── Reusable field ─────────────────────────────────────────────────────────── */
const Field = ({ label, name, value, onChange, required, placeholder }) => {
  const [focused, setFocused] = useState(false);
  return (
    <div style={s.fieldGroup}>
      <label style={s.label}>{label}</label>
      <input
        type="text"
        name={name}
        value={value}
        onChange={onChange}
        required={required}
        placeholder={placeholder || ''}
        style={{ ...s.input, borderColor: focused ? '#22c55e' : '#2d2d2d' }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </div>
  );
};

const XIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const s = {
  backdrop:      { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 20 },
  modal:         { background: '#1a1a1a', border: '1px solid #2d2d2d', borderRadius: 16, padding: 28, width: '100%', maxWidth: 480, fontFamily: "'Inter', sans-serif" },
  header:        { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title:         { color: '#fff', fontSize: 18, fontWeight: 700 },
  closeBtn:      { background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: 4, display: 'flex' },
  errorBox:      { background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 },
  form:          { display: 'flex', flexDirection: 'column', gap: 16 },
  coverRow:      { display: 'flex', alignItems: 'center', gap: 16 },
  coverWrap:     { flexShrink: 0 },
  coverImg:      { width: 80, height: 80, borderRadius: 10, objectFit: 'cover', background: '#111', display: 'block' },
  fileLabel:     { cursor: 'pointer', display: 'inline-block', marginBottom: 4 },
  fileBrowse:    { background: '#2d2d2d', color: '#e5e7eb', borderRadius: 6, padding: '7px 14px', fontSize: 12, fontWeight: 500 },
  fileHint:      { color: '#4b5563', fontSize: 11, marginTop: 4 },
  grid:          { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  fieldGroup:    { display: 'flex', flexDirection: 'column', gap: 5 },
  label:         { color: '#9ca3af', fontSize: 12, fontWeight: 500 },
  input:         { background: '#111', border: '1px solid #2d2d2d', borderRadius: 8, padding: '9px 12px', color: '#fff', fontSize: 14, outline: 'none', transition: 'border-color 0.2s', fontFamily: 'inherit', boxSizing: 'border-box' },
  progressWrap:  { display: 'flex', alignItems: 'center', gap: 10 },
  progressBar:   { flex: 1, height: 4, background: '#2d2d2d', borderRadius: 2, overflow: 'hidden' },
  progressFill:  { height: '100%', background: '#22c55e', borderRadius: 2, transition: 'width 0.2s' },
  progressLabel: { color: '#22c55e', fontSize: 12, fontWeight: 600, minWidth: 34, textAlign: 'right' },
  actions:       { display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 },
  cancelBtn:     { background: '#2d2d2d', color: '#9ca3af', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' },
  saveBtn:       { background: '#22c55e', color: '#000', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
};

export default EditSongModal;