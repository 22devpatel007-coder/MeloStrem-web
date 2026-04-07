const { getUser } = require('../services/firebase.service');
const logger = require('../utils/logger');

exports.verifyUser = async (req, res) => {
  try {
    const user = await getUser(req.user.uid);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ uid: req.user.uid, ...user });
  } catch (err) {
    logger.error('verifyUser error:', { error: err.message });
    res.status(500).json({ error: err.message });
  }
};
