import process from 'node:process'

export function readBoolEnv(keys: string[]): boolean {
    for (const key of keys) {
        const raw = String((process.env as any)[key] || '').trim()
        if (!raw)
            continue
        const v = raw.toLowerCase()
        return v === '1' || v === 'true' || v === 'yes' || v === 'on'
    }
    return false
}

export function readStringEnv(keys: string[]): string {
    for (const key of keys) {
        const raw = String((process.env as any)[key] || '').trim()
        if (raw)
            return raw
    }
    return ''
}
