import React, { useState } from 'react';
import RegistrationForm from './RegistrationForm';
import LoginForm from './LoginForm';

const AuthPage: React.FC = () => {
  const [mode, setMode] = useState<'register' | 'login'>('register');

  return (
    <div className="auth-page">
      <h1>MLS Chat</h1>
      <div>
        <button onClick={() => setMode('register')}>Register</button>
        <button onClick={() => setMode('login')}>Login</button>
      </div>
      {mode === 'register' ? <RegistrationForm /> : <LoginForm />}
    </div>
  );
};

export default AuthPage;