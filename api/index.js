// Vercel serverless entrypoint — re-uses the Express app from server.js
const app = require('../server.js');

module.exports = app;
