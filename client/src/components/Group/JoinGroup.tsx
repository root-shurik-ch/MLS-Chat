// Component for joining a group using a Welcome message
import React, { useState } from 'react';
import { MlsClient } from '../../mls/index';
import { useToastContext } from '../../contexts/ToastContext';
import { saveMlsGroup } from '../../utils/mlsGroupStorage';

interface JoinGroupProps {
  mlsClient: MlsClient;
  onJoinSuccess: (groupId: string) => void;
}

export const JoinGroup: React.FC<JoinGroupProps> = ({ mlsClient, onJoinSuccess }) => {
  const [welcomeCode, setWelcomeCode] = useState('');
  const [loading, setLoading] = useState(false);
  const toast = useToastContext();

  const handleJoin = async () => {
    if (!welcomeCode.trim()) {
      toast.warning('Please enter an invitation code');
      return;
    }

    try {
      setLoading(true);

      // Generate KeyPackage for this device
      // Note: In production, this KeyPackage should have been generated
      // beforehand and sent to the person creating the invitation
      const keyPackage = await mlsClient.generateKeyPackage();

      // Process the Welcome message to join the group
      console.log('Processing Welcome message...');
      const mlsGroup = await mlsClient.processWelcome(
        welcomeCode.trim(),
        keyPackage.ref
      );

      // Save the group to IndexedDB
      await saveMlsGroup(mlsGroup);

      toast.success(`Successfully joined group!`);

      // Clear input
      setWelcomeCode('');

      // Notify parent component
      onJoinSuccess(mlsGroup.groupId);
    } catch (error) {
      console.error('Failed to join group:', error);
      toast.error('Failed to join group. Please check the invitation code and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      padding: '20px',
      border: '1px solid #e0e0e0',
      borderRadius: '8px',
      marginBottom: '20px'
    }}>
      <h3 style={{ marginTop: 0 }}>Join Group</h3>
      <p style={{ fontSize: '14px', color: '#666' }}>
        Enter the invitation code someone shared with you
      </p>

      <textarea
        value={welcomeCode}
        onChange={(e) => setWelcomeCode(e.target.value)}
        placeholder="Paste invitation code here..."
        style={{
          width: '100%',
          minHeight: '120px',
          padding: '10px',
          border: '1px solid #ccc',
          borderRadius: '4px',
          fontSize: '12px',
          fontFamily: 'monospace',
          marginBottom: '10px',
          resize: 'vertical',
        }}
      />

      <button
        onClick={handleJoin}
        disabled={loading || !welcomeCode.trim()}
        style={{
          padding: '10px 20px',
          background: loading || !welcomeCode.trim() ? '#ccc' : '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: loading || !welcomeCode.trim() ? 'not-allowed' : 'pointer',
          fontSize: '14px',
          fontWeight: 600,
          width: '100%',
        }}
      >
        {loading ? 'Joining...' : 'Join Group'}
      </button>
    </div>
  );
};

export default JoinGroup;
