import React, { useState, useEffect, useRef } from 'react';
import { IncomingMessage, MsgKind } from '../../domain/Message';

interface ChatProps {
  userId: string;
  deviceId: string;
  groupId: string;
  onBack: () => void;
}

interface Message {
  id: string;
  senderId: string;
  deviceId: string;
  text: string;
  ciphertext: string;
  timestamp: number;
  isSent: boolean;
}

// Mock MLS encryption for testing
const mockEncrypt = (plaintext: string): string => {
  return btoa(`encrypted:${btoa(plaintext)}:${Date.now()}`);
};

const mockDecrypt = (ciphertext: string): string => {
  try {
    const decoded = atob(ciphertext);
    if (decoded.startsWith('encrypted:')) {
      const parts = decoded.split(':');
      return atob(parts[1]);
    }
    return decoded;
  } catch {
    return ciphertext;
  }
};

const Chat: React.FC<ChatProps> = ({ userId, deviceId, groupId, onBack }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load messages from localStorage
  useEffect(() => {
    const storedMessages = JSON.parse(localStorage.getItem('messages') || '[]');
    const groupMessages = storedMessages.filter((m: any) => m.groupId === groupId);
    setMessages(groupMessages);
  }, [groupId]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;
    setLoading(true);

    try {
      const text = input.trim();
      const ciphertext = mockEncrypt(text);
      
      const newMessage: Message = {
        id: 'msg_' + Date.now(),
        senderId: userId,
        deviceId: deviceId,
        text,
        ciphertext,
        timestamp: Date.now(),
        isSent: true,
      };

      // Save to state and localStorage
      const updatedMessages = [...messages, newMessage];
      setMessages(updatedMessages);
      
      // Save to localStorage
      const allMessages = JSON.parse(localStorage.getItem('messages') || '[]');
      allMessages.push({ ...newMessage, groupId });
      localStorage.setItem('messages', JSON.stringify(allMessages));
      
      setInput('');
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <button onClick={onBack}>Back</button>
        <h2>Chat</h2>
      </div>
      
      <div style={{ 
        height: 300, 
        overflowY: 'auto', 
        border: '1px solid #ccc', 
        padding: 10,
        marginBottom: 10,
        background: '#fafafa'
      }}>
        {messages.length === 0 ? (
          <p style={{ color: '#666' }}>No messages yet</p>
        ) : (
          messages.map(msg => (
            <div 
              key={msg.id} 
              style={{ 
                marginBottom: 8,
                padding: '8px 12px',
                borderRadius: 8,
                background: msg.isSent ? '#d4edda' : '#e9ecef',
                textAlign: msg.isSent ? 'right' : 'left',
              }}
            >
              <div style={{ fontSize: 12, color: '#666', marginBottom: 2 }}>
                {msg.isSent ? 'You' : msg.senderId}
              </div>
              <div>{msg.text}</div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
      
      <div style={{ display: 'flex', gap: 10 }}>
        <input
          type="text"
          name="message"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          style={{ flex: 1, padding: 8 }}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
        />
        <button onClick={handleSend} disabled={loading || !input.trim()}>
          {loading ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  );
};

export default Chat;
