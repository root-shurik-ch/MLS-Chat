/* tslint:disable */
/* eslint-disable */

export class CommitOutput {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
}

export class MlsGroupState {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
}

/**
 * Add a member to the group
 */
export function add_member(group_id_hex: string, key_package_hex: string): string;

/**
 * Apply a commit to advance the group epoch
 */
export function apply_commit(group_id_hex: string, commit_hex: string): string;

/**
 * Create a new MLS group
 */
export function create_group(credential_identity: Uint8Array): string;

/**
 * Create an update proposal for forward secrecy
 */
export function create_update_proposal(group_id_hex: string): string;

/**
 * Decrypt a message from the group
 */
export function decrypt(group_id_hex: string, ciphertext_hex: string): string;

/**
 * Encrypt a message for the group
 */
export function encrypt(group_id_hex: string, plaintext: string): string;

/**
 * Generate a key package for joining groups
 */
export function generate_key_package(credential_identity: Uint8Array): any;

export function greet(name: string): void;

/**
 * Process a welcome message to join a group
 */
export function process_welcome(welcome_hex: string, key_package_ref_hex: string): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_commitoutput_free: (a: number, b: number) => void;
    readonly __wbg_mlsgroupstate_free: (a: number, b: number) => void;
    readonly add_member: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly apply_commit: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly create_group: (a: number, b: number) => [number, number, number, number];
    readonly create_update_proposal: (a: number, b: number) => [number, number, number, number];
    readonly decrypt: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly encrypt: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly generate_key_package: (a: number, b: number) => [number, number, number];
    readonly greet: (a: number, b: number) => void;
    readonly process_welcome: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
