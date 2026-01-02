export declare function debounce<TArgs extends any[], TRet, TThis>(fn: (this: TThis, ...originArgs: TArgs) => TRet, dur?: number): (this: TThis, ...args: TArgs) => void;
export declare function throttle<TArgs extends any[], TRet, TThis>(fn: (this: TThis, ...originArgs: TArgs) => TRet, time?: number): (this: TThis, ...args: TArgs) => void;
export declare function consumer<TArgs extends any[], TRet, TThis>(fn: (this: TThis, ...originArgs: TArgs) => TRet, time?: number): (this: TThis, ...args: TArgs) => void;
