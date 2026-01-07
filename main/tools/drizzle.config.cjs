const path = require('path');

/** @type {import('drizzle-kit').Config} */
module.exports = {
  schema: path.resolve(__dirname, '../../node_modules/@napgram/database/dist/schema/index.js'),
  out: path.resolve(__dirname, './drizzle'),
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
};
