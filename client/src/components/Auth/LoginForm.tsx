import React, { useState } from 'react';

interface LoginFormProps {
  onSuccess: (userId: string, deviceId: string) => void;
}

/**
 * Generate a mock JWT token for testing
 * In production, this would come from the backend after WebAuthn verification
 */
function generateMockJWT(userId: string, deviceId: string): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub: userId,
    device_id: deviceId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours
  };

  // Base64 encode (simplified, not cryptographically secure)
  const headerB64 = btoa(JSON.stringify(header));
  const payloadB64 = btoa(JSON.stringify(payload));
  const signature = 'mock_signature_' + Math.random().toString(36).substring(7);

  return `${headerB64}.${payloadB64}.${signature}`;
}

const LoginForm: React.FC<LoginFormProps> = ({ onSuccess }) => {
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Mock login for testing
      const savedUserId = localStorage.getItem('userId');
      const savedDeviceId = localStorage.getItem('deviceId');

      if (savedUserId && savedDeviceId) {
        // Check if we have a valid auth token
        let authToken = localStorage.getItem('authToken');

        // If no token or expired, generate new one
        if (!authToken) {
          authToken = generateMockJWT(savedUserId, savedDeviceId);
          localStorage.setItem('authToken', authToken);
        } else {
          // In production, you'd verify token expiration here
          // For now, we trust the stored token
        }

        onSuccess(savedUserId, savedDeviceId);
      } else {
        setError('No registered user found');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2>Login</h2>
      <input
        type="text"
        placeholder="User ID (for testing, leave empty)"
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
        style={{ width: '100%', padding: 8, marginBottom: 10 }}
      />
      <button type="submit" disabled={loading}>
        {loading ? 'Logging in...' : 'Login'}
      </button>
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </form>
  );
};

export default LoginForm;
