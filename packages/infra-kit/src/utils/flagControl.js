import flags from '../flags';
function displayFlag(flag) {
    const enabled = [];
    for (const name in flags) {
        const value = flags[name];
        if (flag & value) {
            enabled.push(name);
        }
    }
    return [`0b${flag.toString(2)}`, ...enabled].join('\n');
}
export async function editFlags(params, target) {
    if (!params.length) {
        return displayFlag(target.flags);
    }
    if (params.length !== 2)
        return '参数格式错误';
    let operand = Number(params[1]);
    if (Number.isNaN(operand)) {
        operand = flags[params[1].toUpperCase()];
    }
    if (Number.isNaN(operand) || operand === undefined)
        return 'flag 格式错误';
    switch (params[0]) {
        case 'add':
        case 'set':
            target.flags |= operand;
            break;
        case 'rm':
        case 'remove':
        case 'del':
        case 'delete':
            target.flags &= ~operand;
            break;
        case 'put':
            target.flags = operand;
            break;
    }
    return displayFlag(target.flags);
}
