// src/mls/group.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GroupManager } from './group'
import { MlsClient } from './index'

// Mock MlsClient
vi.mock('./index', () => ({
  MlsClient: vi.fn().mockImplementation(() => ({
    createGroup: vi.fn((groupId: string) => ({
      id: groupId,
      groupId,
      epoch: 0,
      treeHash: '',
      epochAuthenticator: '',
    })),
    addMember: vi.fn(() => ({
      proposals: [],
      commit: 'dummy_commit',
      welcome: 'dummy_welcome',
      epochAuthenticator: 'dummy_auth',
    })),
    applyCommit: vi.fn((_group: { groupId: string; epoch: number }, _commit: { epochAuthenticator: string }) => ({
      id: 'group123',
      groupId: 'group123',
      epoch: 1,
      treeHash: '',
      epochAuthenticator: 'dummy_auth',
    })),
    encryptMessage: vi.fn(() => 'encrypted'),
    decryptMessage: vi.fn(() => 'decrypted'),
  })),
}))

describe('GroupManager', () => {
  let mlsClient: MlsClient
  let groupManager: GroupManager

  beforeEach(() => {
    mlsClient = new MlsClient(new Uint8Array(32), new Uint8Array(32))
    groupManager = new GroupManager(mlsClient)
  })

  it('should create a group', async () => {
    const groupId = 'group123'
    const group = await groupManager.createGroup(groupId)
    expect(group).toBeDefined()
    expect(group.id).toBe(groupId)
  })

  it('should add a member to a group', async () => {
    const groupId = 'group123'
    await groupManager.createGroup(groupId)
    const keyPackage = 'dummy'
    const result = await groupManager.addMember(groupId, keyPackage as never)
    expect(result.welcomeMessage).toBe('dummy_welcome')
    expect(result.commit).toBeDefined()
  })

  it('should throw error if group not found for addMember', async () => {
    await expect(groupManager.addMember('nonexistent', 'dummy')).rejects.toThrow('Group not found')
  })

  it('should send a message', async () => {
    const groupId = 'group123'
    await groupManager.createGroup(groupId)
    const message = 'hello'
    const result = await groupManager.sendMessage(groupId, message)
    expect(result).toBe('encrypted')
  })

  it('should throw error if group not found for sendMessage', async () => {
    await expect(groupManager.sendMessage('nonexistent', 'msg')).rejects.toThrow('Group not found')
  })

  it('should receive a message', async () => {
    const groupId = 'group123'
    await groupManager.createGroup(groupId)
    const ciphertext = 'cipher'
    const result = await groupManager.receiveMessage(groupId, ciphertext)
    expect(result).toBe('decrypted')
  })

  it('should throw error if group not found for receiveMessage', async () => {
    await expect(groupManager.receiveMessage('nonexistent', 'cipher')).rejects.toThrow('Group not found')
  })
})