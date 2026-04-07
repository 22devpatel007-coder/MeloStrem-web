const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const config = require('./config/index');
const logger = require('./utils/logger');
const routes = require('./routes/index');
const errorHandler = require('./middleware/errorHandler');
const { generalLimiter } = require('./middleware/rateLimiter');

const app = express();

app.use(helmet());
app.use(cors({
  origin: config.clientOrigin,
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(generalLimiter);
app.use('/api', routes);
app.use(errorHandler);

app.listen(config.port, () => {
  logger.info(`MeloStream server running on port ${config.port} [${config.nodeEnv}]`);
});

module.exports = app;