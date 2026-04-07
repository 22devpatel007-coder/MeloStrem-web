import api from '../services/api';
/**
 * checkDuplicateSong — calls the server to check if a song already exists.
 *
 * Returns:
 *   { duplicate: false }
 *   { duplicate: true, existing: { id, title, artist, createdAt } }
 *
 * Used by both UploadMusic (single) and UploadPlaylistZip (per song).
 */
export async function checkDuplicateSong(title, artist, excludeId = null) {
  try {
    const res = await api.post('/api/songs/check-duplicate', {
      title,
      artist,
      ...(excludeId ? { excludeId } : {}),
    });
    return res.data;
  } catch (err) {
    // If the check itself fails, don't block the upload — let the server
    // catch the duplicate on the actual upload request instead.
    console.warn('[checkDuplicateSong] Check failed, proceeding:', err.message);
    return { duplicate: false };
  }
}

/**
 * formatDuplicateMessage — builds a human-readable string for duplicate errors.
 */
export function formatDuplicateMessage(existing) {
  if (!existing) return 'This song already exists in the library.';
  const date = existing.createdAt
    ? new Date(existing.createdAt).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
      })
    : null;
  return `"${existing.title}" by ${existing.artist} already exists in the library${date ? ` (uploaded ${date})` : ''}.`;
}