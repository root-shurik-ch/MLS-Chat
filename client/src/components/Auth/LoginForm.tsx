import React, { useState } from 'react';

interface LoginFormProps {
  onSuccess: (userId: string, deviceId: string) => void;
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
