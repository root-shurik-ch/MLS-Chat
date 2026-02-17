import { MlsClient, MlsGroup } from './index';

export class GroupManager {
  private groups = new Map<string, MlsGroup>();

  constructor(private mlsClient: MlsClient) {}

  async createGroup(groupId: string): Promise<MlsGroup> {
    const group = this.mlsClient.createGroup(groupId);
    this.groups.set(groupId, group);
    return group;
  }

  async addMember(groupId: string, keyPackage: string): Promise<void> {
    // Propose add, commit
  }

  async sendMessage(groupId: string, message: string): Promise<string> {
    const group = this.groups.get(groupId);
    if (!group) throw new Error("Group not found");
    return this.mlsClient.encryptMessage(group, message);
  }

  async receiveMessage(groupId: string, ciphertext: string): Promise<string> {
    const group = this.groups.get(groupId);
    if (!group) throw new Error("Group not found");
    return this.mlsClient.decryptMessage(group, ciphertext);
  }
}