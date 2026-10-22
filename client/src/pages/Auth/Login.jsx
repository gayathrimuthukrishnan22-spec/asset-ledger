// ======================================================
// File Name : Login.jsx
// Purpose   : Page-level component for Login
// ======================================================

import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { authApi } from '../../api/auth.api';
import { PasswordInput } from '../../components/ui/PasswordInput';
import { passwordStrengthIssues } from '../../utils/password';
import './login.css';

// ======================================================
// START: Page Component
// ======================================================

// ======================================================
// Function : Login
// Purpose  : React component that renders the 'Login' UI
// ======================================================

export function Login() {
    const { isAuthenticated, login } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // Toggles the card between "Sign In" and "Register" — a public
    // self-registration form. Registering doesn't sign anyone in: it
    // creates a "Pending" user (see POST /api/auth/register) that an
    // Administrator has to review in User Management (assign a role +
    // Page Access, then Save) before that email/password can log in.
    const [mode, setMode] = useState('login'); // 'login' | 'register'
    const [regName, setRegName] = useState('');
    const [regEmail, setRegEmail] = useState('');
    const [regPassword, setRegPassword] = useState('');
    const [regError, setRegError] = useState('');
    const [regSubmitting, setRegSubmitting] = useState(false);
    const [regDone, setRegDone] = useState(false);

    // Already signed in (e.g. hit /login directly with a live session) — bounce to
    // wherever they were headed, or the dashboard.
    if (isAuthenticated) {
        const from = location.state?.from?.pathname ?? '/';
        return <Navigate to={from} replace/>;
    }

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        const result = await login({ email, password });
        setSubmitting(false);
        if (!result.ok) {
            setError(result.error);
            return;
        }
        const from = location.state?.from?.pathname ?? '/';
        navigate(from, { replace: true });
    };

    const switchMode = (next) => {
        setMode(next);
        setError('');
        setRegError('');
        setRegDone(false);
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        if (!regName.trim() || !regEmail.trim() || !regPassword) {
            setRegError('Name, email and password are required.');
            return;
        }
        const issues = passwordStrengthIssues(regPassword);
        if (issues.length) {
            setRegError(`Password needs ${issues.join(', ')}.`);
            return;
        }
        setRegSubmitting(true);
        setRegError('');
        try {
            await authApi.register(regName.trim(), regEmail.trim(), regPassword);
            setRegDone(true);
            setRegName('');
            setRegEmail('');
            setRegPassword('');
        } catch (err) {
            setRegError(err.message || 'Could not submit registration.');
        } finally {
            setRegSubmitting(false);
        }
    };

    return (<div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <div className="logo">
            <span className="mark">FA</span>
            <span>AssetLedger</span>
          </div>
          <div className="sub">Fixed Asset Management</div>
        </div>

        {mode === 'login' ? (<>
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <label htmlFor="login-email">Work email</label>
              <input id="login-email" type="email" autoComplete="username" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus/>
            </div>
            <PasswordInput
              id="login-password"
              label="Password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            {error && <div className="login-error">{error}</div>}

            <button type="submit" className="btn btn-primary login-submit" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <div className="login-hint">Use a User Management account's email and password to sign in.</div>
          <div className="login-hint">
            New here?{' '}
            <button type="button" onClick={() => switchMode('register')} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--primary, #2563eb)', fontWeight: 600, cursor: 'pointer' }}>
              Register
            </button>
          </div>
        </>) : (<>
          {regDone ? (<div className="login-hint" style={{ textAlign: 'center' }}>
              <p style={{ marginBottom: 10 }}>Registration submitted. An admin needs to review your request and
                assign your access before you can sign in.</p>
              <button type="button" className="btn btn-primary login-submit" onClick={() => switchMode('login')}>
                Back to Sign In
              </button>
            </div>) : (<>
            <form onSubmit={handleRegister}>
              <div className="form-row">
                <label htmlFor="reg-name">Full name</label>
                <input id="reg-name" type="text" autoComplete="name" placeholder="e.g. Priya N." value={regName} onChange={(e) => setRegName(e.target.value)} autoFocus/>
              </div>
              <div className="form-row">
                <label htmlFor="reg-email">Work email</label>
                <input id="reg-email" type="email" autoComplete="username" placeholder="you@company.com" value={regEmail} onChange={(e) => setRegEmail(e.target.value)}/>
              </div>
              <PasswordInput
                id="reg-password"
                label="Password"
                autoComplete="new-password"
                placeholder="••••••••"
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                showStrength
              />

              {regError && <div className="login-error">{regError}</div>}

              <button type="submit" className="btn btn-primary login-submit" disabled={regSubmitting}>
                {regSubmitting ? 'Submitting…' : 'Submit Registration'}
              </button>
            </form>
            <div className="login-hint">
              Already have access?{' '}
              <button type="button" onClick={() => switchMode('login')} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--primary, #2563eb)', fontWeight: 600, cursor: 'pointer' }}>
                Sign In
              </button>
            </div>
          </>)}
        </>)}
      </div>
    </div>);
}

// ======================================================
// END: Login
// ======================================================

// ======================================================
// END: Page Component
// ======================================================

// ======================================================
// END OF FILE : Login.jsx
// ======================================================
