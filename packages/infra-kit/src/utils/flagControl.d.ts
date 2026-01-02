export interface Flagged {
    flags: number;
}
export declare function editFlags(params: string[], target: Flagged): Promise<string>;
