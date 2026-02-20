// Wrapper for MLS WASM library
// RFC 9750 compliant MLS implementation
import init, {
  create_group,
  encrypt,
  decrypt,
  greet,
  generate_key_package,
  process_welcome,
  apply_commit,
  create_update_proposal,
  add_member,
  export_state,
  import_state,
  load_group,
} from './wasm/pkg/mls_wasm'
import { decodeBase64Url, encodeBase64Url } from '../utils/crypto'

export interface MlsGroup {
  id: string;
  epoch: number;
  groupId: string;
  treeHash: string;
  epochAuthenticator: string;
}

export interface KeyPackage {
  data: string; // hex
  signature: string; // hex
  hpkePublicKey: string; // hex
  credential: string; // hex
  extensions: Record<string, any>;
}

export interface Commit {
  proposals: string[];
  commit: string; // hex
  welcome?: string; // hex
  epochAuthenticator: string; // hex
}

export interface Proposal {
  type: 'add' | 'remove' | 'update' | 'psk' | 'reinit';
  data: string; // hex
}

export class MlsClient {
  private credentialIdentity: Uint8Array;
  private wasmInitialized = false;

  constructor(userId: string) {
    // Use userId as credential identity for MLS
    this.credentialIdentity = new TextEncoder().encode(userId);
  }

  async init(): Promise<void> {
    if (!this.wasmInitialized) {
      await init()
      this.wasmInitialized = true
    }
  }

  async createGroup(groupId: string): Promise<MlsGroup> {
    await this.init()

    const groupData = create_group(this.credentialIdentity)
    const groupState = JSON.parse(groupData)

    return {
      id: groupId,
      epoch: groupState.epoch,
      groupId: groupState.group_id,
      treeHash: groupState.tree_hash,
      epochAuthenticator: groupState.epoch_authenticator
    }
  }

  async generateKeyPackage(): Promise<KeyPackage> {
    await this.init()

    if (!this.credentialIdentity?.length) {
      throw new Error('MLS client credential identity not initialized')
    }

    try {
      const result = generate_key_package(this.credentialIdentity)
      if (!result || typeof result !== 'object') {
        throw new Error('Key package generation returned invalid result')
      }
      // serde_wasm_bindgen may return a Map instead of plain object
      const get = (key: string) =>
        (result as Map<string, unknown>).get?.(key) ?? (result as Record<string, unknown>)[key]
      const toObj = (v: unknown): Record<string, unknown> =>
        v == null ? {} : (v instanceof Map ? Object.fromEntries(v) : (v as Record<string, unknown>))
      const data = get('data')
      if (typeof data !== 'string' || data.length === 0) {
        const keys = result instanceof Map ? [...result.keys()] : Object.keys(result)
        throw new Error(
          `Key package generation returned missing or empty data (keys: ${keys.join(', ')})`
        )
      }
      const keyPackage: KeyPackage = {
        data,
        signature: (get('signature') as string) ?? '',
        hpkePublicKey: (get('hpke_public_key') as string) ?? '',
        credential: (get('credential') as string) ?? '',
        extensions: toObj(get('extensions'))
      }
      return keyPackage
    } catch (error) {
      console.error('Failed to generate key package:', error)
      throw new Error(`MLS key package generation failed: ${error}`)
    }
  }

  async addMember(group: MlsGroup, keyPackage: KeyPackage): Promise<Commit> {
    await this.init()

    const groupIdHex = group?.groupId
    const keyPackageData = keyPackage?.data
    if (typeof groupIdHex !== 'string' || groupIdHex.length === 0) {
      throw new Error('Invalid group: missing or empty groupId (MLS group id required)')
    }
    if (typeof keyPackageData !== 'string' || keyPackageData.length === 0) {
      throw new Error('Invalid key package: missing or empty data')
    }

    try {
      // Call real WASM add_member function
      const result = add_member(groupIdHex, keyPackageData)
      const commitData = JSON.parse(result)

      return {
        proposals: commitData.proposals || [],
        commit: commitData.commit,
        welcome: commitData.welcome,
        epochAuthenticator: commitData.epoch_authenticator
      }
    } catch (error) {
      console.error('Failed to add member:', error)
      throw new Error(`MLS add member failed: ${error}`)
    }
  }

  async processWelcome(welcomeMessage: string): Promise<MlsGroup> {
    await this.init()

    const result = process_welcome(welcomeMessage)
    const groupState = JSON.parse(result)
    
    return {
      id: groupState.group_id,
      epoch: groupState.epoch,
      groupId: groupState.group_id,
      treeHash: groupState.tree_hash,
      epochAuthenticator: groupState.epoch_authenticator
    }
  }

  async encryptMessage(group: MlsGroup, plaintext: string): Promise<string> {
    await this.init()

    return encrypt(group.groupId, plaintext)
  }

  async decryptMessage(group: MlsGroup, ciphertext: string): Promise<string> {
    await this.init()

    try {
      return decrypt(group.groupId, ciphertext)
    } catch (error) {
      throw new Error(`Decryption failed: ${error}`)
    }
  }

  async applyCommit(group: MlsGroup, commit: Commit): Promise<MlsGroup> {
    await this.init()

    const result = apply_commit(group.groupId, commit.commit)
    const groupState = JSON.parse(result)

    return {
      id: group.id,
      epoch: groupState.epoch,
      groupId: groupState.group_id,
      treeHash: groupState.tree_hash,
      epochAuthenticator: groupState.epoch_authenticator
    }
  }

  async updateKeyPackage(): Promise<KeyPackage> {
    await this.init()

    return this.generateKeyPackage()
  }

  async createUpdateProposal(group: MlsGroup): Promise<string> {
    await this.init()

    // Returns hex-encoded proposal
    const proposalHex = create_update_proposal(group.groupId)
    return proposalHex
  }

  /**
   * Export full WASM state (backend storage + signer) as a JSON string.
   * Save this to IndexedDB after important operations for cross-session persistence.
   */
  async exportState(): Promise<string> {
    await this.init()
    return export_state()
  }

  /**
   * Import previously exported WASM state.
   * Call this on app start before loadGroup to restore groups from storage.
   */
  async importState(stateJson: string): Promise<void> {
    await this.init()
    import_state(stateJson)
  }

  /**
   * Load a previously persisted MLS group from the shared backend's storage.
   * Call after importState. groupIdHex is the MLS group ID (hex) from the stored MlsGroup.
   */
  async loadGroup(groupIdHex: string, appGroupId: string): Promise<MlsGroup> {
    await this.init()
    const result = load_group(groupIdHex)
    const groupState = JSON.parse(result)
    return {
      id: appGroupId,
      epoch: groupState.epoch,
      groupId: groupState.group_id,
      treeHash: groupState.tree_hash,
      epochAuthenticator: groupState.epoch_authenticator,
    }
  }
}