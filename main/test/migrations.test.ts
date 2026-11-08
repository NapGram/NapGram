import { $ } from 'bun'
import { describe, expect, onTestFinished, test } from 'bun:test'

const toolsDir = new URL('../tools/', import.meta.url).pathname

async function createFixture() {
  const root = (await $`mktemp -d`.env(Bun.env).quiet().text()).trim()
  onTestFinished(async () => {
    await $`rm -rf ${root}`.env(Bun.env).quiet()
  })
  return root
}

describe('Drizzle migration configuration', () => {
  test.each([
    { layout: 'workspace', runtimeFiles: [], useRuntime: false, databaseUrl: undefined },
    {
      layout: 'release',
      runtimeFiles: ['database/index.js', 'permission-management/schema.js'],
      useRuntime: true,
      databaseUrl: 'postgresql://postgres@localhost/napgram_test',
    },
    {
      layout: 'incomplete release',
      runtimeFiles: ['database/index.js'],
      useRuntime: false,
      databaseUrl: 'postgresql://postgres@localhost/napgram_test',
    },
  ])('loads synchronously with the $layout schemas', async ({ runtimeFiles, useRuntime, databaseUrl }) => {
    const root = await createFixture()
    const tools = `${root}/main/tools`
    await Bun.write(`${tools}/drizzle.config.ts`, Bun.file(`${toolsDir}/drizzle.config.ts`))
    for (const file of runtimeFiles) {
      await Bun.write(`${tools}/runtime-schemas/${file}`, 'export {}')
    }

    const result = await $`${Bun.argv[0]} -e ${'console.log(JSON.stringify(require(Bun.argv[1]).default))'} ${tools}/drizzle.config.ts`
      .cwd(root).env({ ...Bun.env, DATABASE_URL: databaseUrl }).nothrow().quiet()

    expect(result.exitCode, result.stderr.toString()).toBe(0)
    const config = JSON.parse(result.stdout.toString())
    expect(config).toMatchObject({
      schema: useRuntime
        ? [
            `${tools}/runtime-schemas/database/index.js`,
            `${tools}/runtime-schemas/permission-management/schema.js`,
          ]
        : [
            `${root}/main/node_modules/@napgram/database/dist/schema/index.js`,
            `${root}/main/node_modules/@napgram/plugin-permission-management/dist/database/schema.js`,
          ],
      out: `${tools}/drizzle`,
      dialect: 'postgresql',
    })
    expect(config.dbCredentials).toEqual(databaseUrl ? { url: databaseUrl } : undefined)
  })
})

describe('Migration command exit status', () => {
  test.each([
    { outcome: 'success', fails: false },
    { outcome: 'failure', fails: true },
  ])('propagates migration $outcome', async ({ fails }) => {
    const root = await createFixture()
    const script = `${root}/main/tools/run-drizzle-migrations.sh`
    await Bun.write(script, Bun.file(`${toolsDir}/run-drizzle-migrations.sh`))
    await Bun.write(`${root}/main/tools/migrate.ts`, fails ? 'throw new Error("migration failed")' : '// successful migration')

    const result = await $`bash ${script}`.cwd('/tmp').env({
      ...Bun.env,
      DATABASE_URL: 'postgresql://postgres@localhost/napgram_test',
    }).nothrow().quiet()

    expect(result.exitCode).toBe(fails ? 1 : 0)
    if (fails)
      expect(result.stdout.toString()).not.toContain('completed successfully')
  })
})
