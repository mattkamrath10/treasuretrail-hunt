import { useState } from 'react';
import { Eye, EyeOff, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { TreasureChestLogo } from '../components/TreasureChestLogo';

interface LoginProps {
  onSwitchToSignUp: () => void;
  onGuestBrowse?: () => void;
}

export default function Login({ onSwitchToSignUp, onGuestBrowse }: LoginProps) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    setError('');

    if (!email.trim()) {
      setError('Email is required');
      return;
    }
    if (!password) {
      setError('Password is required');
      return;
    }

    setIsLoading(true);
    const { error: signInError } = await signIn(email, password);
    setIsLoading(false);

    if (signInError) {
      setError(signInError);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.topSection}>
        <TreasureChestLogo size={56} glow />
        <h1 style={styles.logo}>TreasureTrail</h1>
        <p style={styles.tagline}>Every find tells a story</p>
      </div>

      <div style={styles.formSection}>
        <h2 style={styles.title}>Welcome Back</h2>
        <p style={styles.subtitle}>Sign in to continue treasure hunting</p>

        <div style={styles.form}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.input}
            />
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Password</label>
            <div style={styles.passwordWrapper}>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={styles.passwordInput}
              />
              <button onClick={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button style={styles.forgotBtn}>Forgot Password?</button>

          {error && <p style={styles.error}>{error}</p>}

          <button
            onClick={handleSubmit}
            style={{
              ...styles.submitBtn,
              opacity: isLoading ? 0.7 : 1,
            }}
            disabled={isLoading}
          >
            <span style={styles.submitText}>{isLoading ? 'Signing In...' : 'Log In'}</span>
            {!isLoading && <ArrowRight size={18} style={{ color: 'var(--color-neutral-0)' }} />}
          </button>
        </div>
      </div>

      <p style={styles.switchText}>
        Don't have an account?{' '}
        <button onClick={onSwitchToSignUp} style={styles.switchLink}>Sign Up</button>
      </p>

      {onGuestBrowse && (
        <button onClick={onGuestBrowse} style={styles.guestBtn}>
          <span style={styles.guestBtnText}>Browse as Guest</span>
        </button>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: '100%',
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column',
    maxWidth: 'var(--max-width)',
    margin: '0 auto',
    width: '100%',
    backgroundColor: 'var(--color-neutral-0)',
  },
  topSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: 'var(--space-12) var(--space-6) var(--space-8)',
    background: 'linear-gradient(180deg, var(--color-neutral-900) 0%, var(--color-neutral-800) 100%)',
    borderRadius: '0 0 var(--radius-xl) var(--radius-xl)',
  },
  logo: {
    fontSize: 'var(--font-size-2xl)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-0)',
    letterSpacing: '-0.5px',
  },
  tagline: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-400)',
    marginTop: 'var(--space-1)',
  },
  formSection: {
    flex: 1,
    padding: 'var(--space-6)',
  },
  title: {
    fontSize: 'var(--font-size-2xl)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
    lineHeight: 'var(--line-height-tight)',
  },
  subtitle: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-500)',
    marginTop: 'var(--space-1)',
    marginBottom: 'var(--space-6)',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-4)',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-1)',
  },
  label: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-medium)',
    color: 'var(--color-neutral-700)',
  },
  input: {
    padding: 'var(--space-3) var(--space-4)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--color-neutral-50)',
    border: '1px solid var(--color-neutral-200)',
    fontSize: 'var(--font-size-base)',
    color: 'var(--color-neutral-900)',
    width: '100%',
  },
  passwordWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  passwordInput: {
    padding: 'var(--space-3) var(--space-4)',
    paddingRight: 'var(--space-12)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--color-neutral-50)',
    border: '1px solid var(--color-neutral-200)',
    fontSize: 'var(--font-size-base)',
    color: 'var(--color-neutral-900)',
    width: '100%',
  },
  eyeBtn: {
    position: 'absolute',
    right: 'var(--space-3)',
    color: 'var(--color-neutral-400)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  forgotBtn: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-primary-600)',
    fontWeight: 'var(--font-weight-medium)',
    textAlign: 'right',
    alignSelf: 'flex-end',
    marginTop: '-var(--space-2)',
  },
  error: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-error-500)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--color-error-50)',
    borderRadius: 'var(--radius-sm)',
  },
  submitBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    width: '100%',
    padding: 'var(--space-4)',
    borderRadius: 'var(--radius-md)',
    background: 'linear-gradient(135deg, var(--color-primary-600), var(--color-accent-500))',
    boxShadow: '0 4px 16px rgba(234, 179, 8, 0.3)',
    marginTop: 'var(--space-2)',
    transition: 'opacity var(--transition-fast)',
  },
  submitText: {
    color: 'var(--color-neutral-0)',
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-semibold)',
  },
  switchText: {
    textAlign: 'center',
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-500)',
    padding: 'var(--space-4) var(--space-6) var(--space-6)',
  },
  switchLink: {
    color: 'var(--color-primary-600)',
    fontWeight: 'var(--font-weight-semibold)',
  },
  guestBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    maxWidth: 'var(--max-width)',
    margin: '0 auto',
    padding: 'var(--space-3)',
    paddingBottom: 'var(--space-6)',
  },
  guestBtnText: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-500)',
    fontWeight: 'var(--font-weight-medium)',
    textDecoration: 'underline',
    textDecorationColor: 'var(--color-neutral-300)',
    textUnderlineOffset: '2px',
  },
};
