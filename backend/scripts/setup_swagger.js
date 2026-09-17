/**
 * To enable API docs:
 * 1. npm install swagger-jsdoc swagger-ui-express
 * 2. Add to app.js:
 *    const { setupSwagger } = require('./scripts/setup_swagger');
 *    setupSwagger(app);
 * 3. Visit http://localhost:3002/api/docs
 */
function setupSwagger(app) {
  try {
    const swaggerJsdoc = require('swagger-jsdoc');
    const swaggerUi    = require('swagger-ui-express');

    const options = {
      definition: {
        openapi: '3.0.0',
        info: {
          title: 'Smart Nyumba Pro API',
          version: '2.0.0',
          description: 'Property Management System REST API',
          contact: { name: 'SmartNyumba Support' },
        },
        servers: [{ url: '/api', description: 'API Base' }],
        components: {
          securitySchemes: {
            bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
          },
        },
        security: [{ bearerAuth: [] }],
      },
      apis: ['./routes/*.js', './controllers/**/*.js'],
    };

    const spec = swaggerJsdoc(options);
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(spec, {
      customSiteTitle: 'SmartNyumba API Docs',
      customCss: '.swagger-ui .topbar { background: #0f172a; }',
    }));
    app.get('/api/docs.json', (req, res) => res.json(spec));
    global.logger?.info('📖 API docs available at /api/docs');
  } catch (e) {
    global.logger?.warn('Swagger not available (run: npm install swagger-jsdoc swagger-ui-express): ' + e.message);
  }
}

module.exports = { setupSwagger };
