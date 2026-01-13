// Vercel serverless entrypoint — re-uses the Express app from server.js
const app = require('../server.js');

// Export a request handler that delegates to the Express app.
// Vercel expects a function with signature (req, res).
module.exports = (req, res) => app(req, res);
