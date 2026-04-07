const { searchSongs } = require('../services/firebase.service');
const logger = require('../utils/logger');

exports.searchSongs = async (req, res) => {
  try {
    const raw = (req.query.q || '').trim();
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50); // cap at 50

    if (!raw || raw.length < 1) {
      return res.json({ songs: [], total: 0, query: raw });
    }

    const { songs, total, query } = await searchSongs(raw, limit);

    // Re-apply sorting for exact exact-match precedence
    const sorted = [...songs].sort((a, b) => {
      const q = query.toLowerCase();
      const aTitle = (a.titleLower || '').startsWith(q);
      const bTitle = (b.titleLower || '').startsWith(q);
      if (aTitle && !bTitle) return -1;
      if (!aTitle && bTitle) return 1;
      return (a.titleLower || '').localeCompare(b.titleLower || '');
    });

    return res.json({
      songs: sorted,
      total,
      query: raw,
    });
  } catch (err) {
    logger.error('[search] Error:', { error: err.message });
    return res.status(500).json({ error: 'Search failed. Please try again.', code: 'SEARCH_ERROR' });
  }
};
