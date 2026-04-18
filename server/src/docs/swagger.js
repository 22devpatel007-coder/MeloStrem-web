/**
 * Swagger spec stub.
 * STATUS: Unstarted. Not mounted — swagger-ui-express is not installed and
 * no /docs route exists. Safe to ignore until API documentation is scoped
 * as a formal work item. See CONTEXT.md for confirmed API contracts.
 */

const swaggerSpec = {
  openapi: "3.0.0",
  info: {
    title: "MeloStream API",
    version: "1.0.0",
    description: "API documentation for MeloStream backend"
  },
  servers: [
    {
      url: "http://localhost:5000",
      description: "Development server"
    }
  ],
  paths: {}
};

module.exports = swaggerSpec;
