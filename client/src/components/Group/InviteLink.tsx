// Component for generating group invitation (Welcome message)
import React, { useState } from 'react';
import { MlsClient, MlsGroup } from '../../mls/index';
import { useToastContext } from '../../contexts/ToastContext';

interface InviteLinkProps {
  groupId: string;
  mlsGroup: MlsGroup;
  mlsClient: MlsClient;
  onInviteGenerated?: (welcomeMessage: string) => void;
}

export const InviteLink: React.FC<InviteLinkProps> = ({
  groupId,
  mlsGroup,
  mlsClient,
  onInviteGenerated
}) => {
  const [loading, setLoading] = useState(false);
  const [welcomeMessage, setWelcomeMessage] = useState<string | null>(null); // JSON: { groupId, welcome }
  const toast = useToastContext();

  const handleGenerateInvite = async () => {
    try {
      setLoading(true);

      // For MVP: Generate a temporary KeyPackage for the invitee
      // In production, this would come from the invitee's device
      const tempKeyPackage = await mlsClient.generateKeyPackage();

      // Add member and get Welcome message
      const result = await mlsClient.addMember(mlsGroup, tempKeyPackage);

      if (result.welcome) {
        const payload = JSON.stringify({ groupId, welcome: result.welcome });
        setWelcomeMessage(payload);
        onInviteGenerated?.(payload);
        toast.success('Invitation generated! Share the code below.');
      } else {
        throw new Error('Welcome message not generated');
      }
    } catch (error) {
      console.error('Failed to generate invitation:', error);
      toast.error('Failed to generate invitation. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyToClipboard = () => {
    if (welcomeMessage) {
      navigator.clipboard.writeText(welcomeMessage);
      toast.success('Invitation code copied to clipboard!');
    }
  };

  return (
    <div style={{
      padding: '20px',
      border: '1px solid #e0e0e0',
      borderRadius: '8px',
      marginTop: '20px'
    }}>
      <h3 style={{ marginTop: 0 }}>Invite New Member</h3>
      <p style={{ fontSize: '14px', color: '#666' }}>
        Generate an invitation code to share with others
      </p>

      {!welcomeMessage ? (
        <button
          onClick={handleGenerateInvite}
          disabled={loading}
          style={{
            padding: '10px 20px',
            background: loading ? '#ccc' : '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            fontWeight: 600,
          }}
        >
          {loading ? 'Generating...' : 'Generate Invitation'}
        </button>
      ) : (
        <div>
          <div style={{
            background: '#f5f5f5',
            padding: '15px',
            borderRadius: '4px',
            marginBottom: '10px',
            wordBreak: 'break-all',
            fontFamily: 'monospace',
            fontSize: '12px',
            maxHeight: '150px',
            overflowY: 'auto'
          }}>
            {welcomeMessage}
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={handleCopyToClipboard}
              style={{
                padding: '8px 16px',
                background: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              📋 Copy Code
            </button>

            <button
              onClick={() => setWelcomeMessage(null)}
              style={{
                padding: '8px 16px',
                background: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              Generate New
            </button>
          </div>

          <p style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>
            Share this code with the person you want to invite. They can use it to join the group.
          </p>
        </div>
      )}
    </div>
  );
};

export default InviteLink;
