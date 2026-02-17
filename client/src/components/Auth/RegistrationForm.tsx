import React, { useState } from 'react';

interface RegistrationFormProps {
  onSuccess: (userId: string, deviceId: string) => void;
}

const RegistrationForm: React.FC<RegistrationFormProps> = ({ onSuccess }) => {
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Check for WebAuthn support
      if (!navigator.credentials) {
        // Use mock for testing
        const mockUserId = 'user_' + Date.now() + '_' + Math.random().toString(36).slice(2);
        const mockDeviceId = 'device_' + Date.now();
        
        // Store in localStorage
        localStorage.setItem('userId', mockUserId);
        localStorage.setItem('deviceId', mockDeviceId);
        localStorage.setItem('userProfile', JSON.stringify({ 
          userId: mockUserId, 
          displayName 
        }));
        
        onSuccess(mockUserId, mockDeviceId);
        return;
      }

      // Real WebAuthn flow would go here
      // For E2E testing, we use the mock path
      const mockUserId = 'user_' + Date.now();
      const mockDeviceId = 'device_' + Date.now();
      
      localStorage.setItem('userId', mockUserId);
      localStorage.setItem('deviceId', mockDeviceId);
      localStorage.setItem('userProfile', JSON.stringify({ 
        userId: mockUserId, 
        displayName 
      }));
      
      onSuccess(mockUserId, mockDeviceId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ marginBottom: 20 }}>
      <h2>Register</h2>
      <input
        type="text"
        placeholder="Display Name"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        required
        style={{ width: '100%', padding: 8, marginBottom: 10 }}
      />
      <button type="submit" disabled={loading}>
        {loading ? 'Registering...' : 'Register'}
      </button>
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </form>
  );
};

export default RegistrationForm;
