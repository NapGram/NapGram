export function debounce(fn, dur = 100) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => {
            fn.apply(this, args);
        }, dur);
    };
}
export function throttle(fn, time = 500) {
    let timer;
    return function (...args) {
        if (timer == null) {
            fn.apply(this, args);
            timer = setTimeout(() => {
                timer = undefined;
            }, time);
        }
    };
}
export function consumer(fn, time = 100) {
    const tasks = [];
    let timer;
    const nextTask = () => {
        if (tasks.length === 0)
            return false;
        const task = tasks.shift();
        task?.();
        return true;
    };
    return function (...args) {
        tasks.push(fn.bind(this, ...args));
        if (timer == null) {
            nextTask();
            timer = setInterval(() => {
                if (!nextTask()) {
                    clearInterval(timer);
                    timer = undefined;
                }
            }, time);
        }
    };
}
