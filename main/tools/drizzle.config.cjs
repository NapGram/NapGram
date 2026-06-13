const fs = require('node:fs')
const path = require('node:path')
const process = require('node:process')

const runtimeSchemas = [
  path.resolve(__dirname, './runtime-schemas/database/index.js'),
  path.resolve(__dirname, './runtime-schemas/permission-management/schema.js'),
]

const workspaceSchemas = [
  path.resolve(__dirname, '../node_modules/@napgram/database/dist/schema/index.js'),
  path.resolve(__dirname, '../node_modules/@napgram/plugin-permission-management/dist/database/schema.js'),
]

const schema = [runtimeSchemas, workspaceSchemas]
  .find(candidateSet => candidateSet.every(candidate => fs.existsSync(candidate)))
  ?? workspaceSchemas

/** @type {import('drizzle-kit').Config} */
module.exports = {
  schema,
  out: path.resolve(__dirname, './drizzle'),
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
}
