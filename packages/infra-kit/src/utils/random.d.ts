declare const random: {
    int(min: number, max: number): number;
    hex(length: number): string;
    pick<T>(...array: T[]): T;
    fakeUuid(): string;
    imei(): string;
};
export default random;
