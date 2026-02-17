import { MlsClient, MlsGroup, KeyPackage, Commit, Proposal } from './index';

export interface GroupState {
  group: MlsGroup;
  pendingProposals: Proposal[];
  members: string[]; // user IDs
  epochAuthenticators: Map<number, string>; // epoch -> authenticator
}

export class GroupManager {
  private groups = new Map<string, GroupState>();

  constructor(private mlsClient: MlsClient) {}

  async createGroup(groupId: string): Promise<MlsGroup> {
    const group = await this.mlsClient.createGroup(groupId);
    this.groups.set(groupId, {
      group,
      pendingProposals: [],
      members: [groupId], // Creator is first member
      epochAuthenticators: new Map([[group.epoch, group.epochAuthenticator]])
    });
    return group;
  }

  async addMember(groupId: string, keyPackage: KeyPackage): Promise<{
    commit: Commit;
    welcomeMessage: string;
  }> {
    const state = this.groups.get(groupId);
    if (!state) throw new Error("Group not found");

    const commit = await this.mlsClient.addMember(state.group, keyPackage);

    if (!commit.welcome) {
      throw new Error("No welcome message generated");
    }

    // Apply commit locally to advance epoch
    const newGroup = await this.mlsClient.applyCommit(state.group, commit);

    // Verify epoch authenticator from commit matches the applied group state
    if (commit.epochAuthenticator !== newGroup.epochAuthenticator) {
      throw new Error(
        `Epoch authenticator mismatch after adding member. ` +
        `Commit auth: ${commit.epochAuthenticator}, Group auth: ${newGroup.epochAuthenticator}. ` +
        `Possible inconsistency in MLS state.`
      );
    }

    // Update state
    state.group = newGroup;
    state.epochAuthenticators.set(newGroup.epoch, newGroup.epochAuthenticator);
    state.pendingProposals = []; // Clear proposals after commit

    return {
      commit,
      welcomeMessage: commit.welcome
    };
  }

  async processWelcome(welcomeMessage: string, keyPackage: KeyPackage): Promise<MlsGroup> {
    const group = await this.mlsClient.processWelcome(welcomeMessage, keyPackage);
    
    this.groups.set(group.groupId, {
      group,
      pendingProposals: [],
      members: [group.groupId], // TODO: Extract members from welcome
      epochAuthenticators: new Map([[group.epoch, group.epochAuthenticator]])
    });
    
    return group;
  }

  async sendMessage(groupId: string, message: string): Promise<string> {
    const state = this.groups.get(groupId);
    if (!state) throw new Error("Group not found");
    
    return await this.mlsClient.encryptMessage(state.group, message);
  }

  async receiveMessage(groupId: string, ciphertext: string): Promise<string> {
    const state = this.groups.get(groupId);
    if (!state) throw new Error("Group not found");
    
    return await this.mlsClient.decryptMessage(state.group, ciphertext);
  }

  async updateKeys(groupId: string): Promise<Proposal> {
    const state = this.groups.get(groupId);
    if (!state) throw new Error("Group not found");

    // Create update proposal for forward secrecy
    const proposal = await this.mlsClient.createUpdateProposal(state.group);
    state.pendingProposals.push(proposal);
    
    return proposal;
  }

  async commitProposals(groupId: string): Promise<Commit> {
    const state = this.groups.get(groupId);
    if (!state) throw new Error("Group not found");

    if (state.pendingProposals.length === 0) {
      throw new Error("No pending proposals to commit");
    }

    // Create commit from pending proposals
    const commit: Commit = {
      proposals: state.pendingProposals.map(p => JSON.stringify(p)),
      commit: "generated-commit-data", // TODO: Generate from proposals
      epochAuthenticator: "new-epoch-auth-after-commit"
    };

    // Apply commit
    const newGroup = await this.mlsClient.applyCommit(state.group, commit);

    // Verify epoch authenticator matches expected value
    const expectedAuth = state.epochAuthenticators.get(newGroup.epoch);
    if (expectedAuth && expectedAuth !== newGroup.epochAuthenticator) {
      throw new Error(
        `Epoch authenticator mismatch for epoch ${newGroup.epoch}. ` +
        `Expected: ${expectedAuth}, Got: ${newGroup.epochAuthenticator}. ` +
        `Possible tampering or out-of-order commit.`
      );
    }

    // Store new epoch authenticator
    state.epochAuthenticators.set(newGroup.epoch, newGroup.epochAuthenticator);

    // Update state
    state.group = newGroup;
    state.pendingProposals = [];

    return commit;
  }

  async getKeyPackage(): Promise<KeyPackage> {
    return await this.mlsClient.generateKeyPackage();
  }

  async rotateKeyPackage(): Promise<KeyPackage> {
    // Rotate key package for post-compromise security
    return await this.mlsClient.updateKeyPackage();
  }

  getGroupState(groupId: string): GroupState | undefined {
    return this.groups.get(groupId);
  }
}