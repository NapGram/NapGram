import flags from '../flags.js'

export interface Flagged {
    flags: number
}

function displayFlag(flag: number) {
    const enabled = []
    for (const name in flags) {
        const value = (flags as any)[name] as number
        if (flag & value) {
            enabled.push(name)
        }
    }
    return [`0b${flag.toString(2)}`, ...enabled].join('\n')
}

export async function editFlags(params: string[], target: Flagged) {
    if (!params.length) {
        return displayFlag(target.flags)
    }
    if (params.length !== 2)
        return '参数格式错误'

    let operand = Number(params[1])
    if (Number.isNaN(operand)) {
        operand = (flags as unknown as Record<string, number>)[params[1].toUpperCase()]
    }
    if (Number.isNaN(operand) || operand === undefined)
        return 'flag 格式错误'

    switch (params[0]) {
        case 'add':
        case 'set':
            target.flags |= operand
            break
        case 'rm':
        case 'remove':
        case 'del':
        case 'delete':
            target.flags &= ~operand
            break
        case 'put':
            target.flags = operand
            break
    }

    return displayFlag(target.flags)
}
