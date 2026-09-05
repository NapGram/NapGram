import { resolvePath } from '../src/shared/utils/path.js'

const coveragePath = resolvePath(import.meta.dir, '../coverage/lcov.info')
const source = await Bun.file(coveragePath).text()

const excluded = [
  /^src\/index\.ts$/,
  /^src\/infrastructure\/temp\.ts$/,
  /MediaPreparer\.ts$/,
  /\/__tests__\//,
  /\.config\./,
  /\.test\./,
  /\.spec\./,
]

interface RecordData {
  file: string
  linesFound: number
  linesHit: number
  functionsFound: number
  functionsHit: number
  branchesFound: number
  branchesHit: number
}

const records: RecordData[] = []
let current: Partial<RecordData> | undefined

for (const line of source.split('\n')) {
  if (line.startsWith('SF:')) {
    current = { file: line.slice(3) }
  }
  else if (current && line.startsWith('LF:')) {
    current.linesFound = Number(line.slice(3))
  }
  else if (current && line.startsWith('LH:')) {
    current.linesHit = Number(line.slice(3))
  }
  else if (current && line.startsWith('FNF:')) {
    current.functionsFound = Number(line.slice(4))
  }
  else if (current && line.startsWith('FNH:')) {
    current.functionsHit = Number(line.slice(4))
  }
  else if (current && line.startsWith('BRF:')) {
    current.branchesFound = Number(line.slice(4))
  }
  else if (current && line.startsWith('BRH:')) {
    current.branchesHit = Number(line.slice(4))
  }
  else if (line === 'end_of_record' && current?.file) {
    records.push({
      file: current.file,
      linesFound: current.linesFound ?? 0,
      linesHit: current.linesHit ?? 0,
      functionsFound: current.functionsFound ?? 0,
      functionsHit: current.functionsHit ?? 0,
      branchesFound: current.branchesFound ?? 0,
      branchesHit: current.branchesHit ?? 0,
    })
    current = undefined
  }
}

const included = records.filter(({ file }) => file.startsWith('src/') && !excluded.some(pattern => pattern.test(file)))
if (included.length === 0) {
  throw new Error(`No main source coverage records found in ${coveragePath}`)
}

const total = included.reduce((result, record) => ({
  linesFound: result.linesFound + record.linesFound,
  linesHit: result.linesHit + record.linesHit,
  functionsFound: result.functionsFound + record.functionsFound,
  functionsHit: result.functionsHit + record.functionsHit,
  branchesFound: result.branchesFound + record.branchesFound,
  branchesHit: result.branchesHit + record.branchesHit,
}), {
  linesFound: 0,
  linesHit: 0,
  functionsFound: 0,
  functionsHit: 0,
  branchesFound: 0,
  branchesHit: 0,
})

const metrics = [
  { name: 'lines', found: total.linesFound, hit: total.linesHit, threshold: 90 },
  { name: 'functions', found: total.functionsFound, hit: total.functionsHit, threshold: 88 },
  { name: 'branches', found: total.branchesFound, hit: total.branchesHit, threshold: 78 },
]

let failed = false
for (const metric of metrics) {
  if (metric.found === 0) {
    console.warn(`[coverage] ${metric.name}: unavailable from Bun lcov output; delegated to Codecov where configured`)
    continue
  }

  const percentage = metric.hit / metric.found * 100
  console.log(`[coverage] ${metric.name}: ${percentage.toFixed(2)}% (minimum ${metric.threshold}%)`)
  if (percentage < metric.threshold) {
    failed = true
  }
}

if (failed) {
  throw new Error('Coverage quality gate failed')
}

console.log(`[coverage] quality gate passed for ${included.length} main source files`)
