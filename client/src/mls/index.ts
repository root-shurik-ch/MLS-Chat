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
  add_member
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

    try {
      const result = generate_key_package(this.credentialIdentity)
      const keyPackage: KeyPackage = {
        data: result.data,
        signature: result.signature,
        hpkePublicKey: result.hpke_public_key,
        credential: result.credential,
        extensions: result.extensions
      }
      return keyPackage
    } catch (error) {
      console.error('Failed to generate key package:', error)
      throw new Error(`MLS key package generation failed: ${error}`)
    }
  }

  async addMember(group: MlsGroup, keyPackage: KeyPackage): Promise<Commit> {
    await this.init()

    try {
      // Call real WASM add_member function
      const result = add_member(group.groupId, keyPackage.data)
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

  async processWelcome(welcomeMessage: string, keyPackage: KeyPackage): Promise<MlsGroup> {
    await this.init()
    
    const result = process_welcome(welcomeMessage, keyPackage.data)
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
      console.error('MLS decryption failed:', error)
      throw new Error(`MLS decryption failed: ${error}`)
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
}