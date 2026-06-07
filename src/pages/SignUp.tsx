import { useState } from 'react';
import { Camera, Eye, EyeOff, ArrowRight, ArrowLeft, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { TreasureChestLogo } from '../components/TreasureChestLogo';

interface SignUpProps {
  onSwitchToLogin: () => void;
  onGuestBrowse?: () => void;
}

export default function SignUp({ onSwitchToLogin, onGuestBrowse }: SignUpProps) {
  const { signUp } = useAuth();
  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

  const handleSubmit = async () => {
    setError('');

    if (!form.username.trim()) {
      setError('Username is required');
      return;
    }
    if (!form.email.trim()) {
      setError('Email is required');
      return;
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (!acceptedTerms) {
      setError('You must accept the Terms of Service and Community Guidelines to create an account');
      return;
    }

    setIsLoading(true);
    const { error: signUpError, needsConfirmation } = await signUp(form.email, form.password);

    if (signUpError) {
      setIsLoading(false);
      setError(friendlySignupError(signUpError));
      return;
    }

    // Email confirmation is required: there is no session yet. Show a clear
    // "check your email" screen instead of silently doing nothing, which would
    // otherwise leave the user confused and prone to re-submitting.
    if (needsConfirmation) {
      setIsLoading(false);
      setConfirmSent(true);
      return;
    }

    // Best-effort: record Terms acceptance timestamp. Only reachable when a
    // session was established immediately (email confirmation disabled).
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('profiles')
          .update({ tos_accepted_at: new Date().toISOString() })
          .eq('id', user.id);
      }
    } catch {
      /* non-fatal */
    }
    setIsLoading(false);
  };

  if (confirmSent) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 'var(--space-2)' }}>
            <TreasureChestLogo size={40} glow />
          </div>
          <h1 style={styles.logo}>TreasureTrail</h1>
          <h2 style={styles.title}>Check your email</h2>
          <p style={styles.subtitle}>
            We sent a confirmation link to <strong>{form.email}</strong>. Tap the link
            in that email to activate your account, then come back and log in.
          </p>
        </div>
        <button onClick={onSwitchToLogin} style={styles.submitBtn}>
          <span style={styles.submitText}>Back to Log In</span>
          <ArrowRight size={18} style={{ color: 'var(--color-neutral-0)' }} />
        </button>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <button onClick={onSwitchToLogin} style={styles.backBtn}>
        <ArrowLeft size={20} style={{ color: 'var(--color-neutral-600)' }} />
      </button>

      <div style={styles.header}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 'var(--space-2)' }}>
          <TreasureChestLogo size={40} glow />
        </div>
        <h1 style={styles.logo}>TreasureTrail</h1>
        <h2 style={styles.title}>Create Account</h2>
        <p style={styles.subtitle}>Join the treasure hunting community</p>
      </div>

      <div style={styles.avatarSection}>
        <div style={styles.avatarCircle}>
          <Camera size={24} style={{ color: 'var(--color-neutral-400)' }} />
        </div>
        <span style={styles.avatarHint}>Add profile photo</span>
      </div>

      <div style={styles.form}>
        <div style={styles.inputGroup}>
          <label style={styles.label}>Username</label>
          <input
            type="text"
            placeholder="Choose a unique username"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            style={styles.input}
          />
        </div>

        <div style={styles.inputGroup}>
          <label style={styles.label}>Email</label>
          <input
            type="email"
            placeholder="your@email.com"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            style={styles.input}
          />
        </div>

        <div style={styles.inputGroup}>
          <label style={styles.label}>Password</label>
          <div style={styles.passwordWrapper}>
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Min. 6 characters"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              style={styles.passwordInput}
            />
            <button onClick={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <div style={styles.inputGroup}>
          <label style={styles.label}>Confirm Password</label>
          <div style={styles.passwordWrapper}>
            <input
              type={showConfirm ? 'text' : 'password'}
              placeholder="Re-enter your password"
              value={form.confirmPassword}
              onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
              style={styles.passwordInput}
            />
            <button onClick={() => setShowConfirm(!showConfirm)} style={styles.eyeBtn}>
              {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setAcceptedTerms((v) => !v)}
          style={styles.termsRow}
          aria-pressed={acceptedTerms}
        >
          <span style={{ ...styles.checkbox, ...(acceptedTerms ? styles.checkboxOn : {}) }}>
            {acceptedTerms && <Check size={14} style={{ color: 'var(--color-neutral-0)' }} />}
          </span>
          <span style={styles.termsText}>
            I am 17+ and agree to the TreasureTrail{' '}
            <strong>Terms of Service</strong> and{' '}
            <strong>Community Guidelines</strong>, including a zero-tolerance
            policy for objectionable content and abusive users.
          </span>
        </button>

        {error && <p style={styles.error}>{error}</p>}

        <button
          onClick={handleSubmit}
          style={{
            ...styles.submitBtn,
            opacity: isLoading ? 0.7 : 1,
          }}
          disabled={isLoading}
        >
          <span style={styles.submitText}>{isLoading ? 'Creating Account...' : 'Create Account'}</span>
          {!isLoading && <ArrowRight size={18} style={{ color: 'var(--color-neutral-0)' }} />}
        </button>
      </div>

      <div style={styles.footer}>
        <p style={styles.switchText}>
          Already have an account?{' '}
          <button onClick={onSwitchToLogin} style={styles.switchLink}>Log In</button>
        </p>
        {onGuestBrowse && (
          <button onClick={onGuestBrowse} style={styles.guestBtn}>
            <span style={styles.guestBtnText}>Browse as Guest</span>
          </button>
        )}
      </div>
    </div>
  );
}

/** Map raw Supabase auth errors to clear, user-friendly messages. */
function friendlySignupError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('already registered') || m.includes('already exists')) {
    return 'An account with this email already exists. Please log in instead.';
  }
  if (m.includes('valid email') || m.includes('invalid email')) {
    return 'Please enter a valid email address.';
  }
  if (m.includes('password')) {
    return 'Password must be at least 6 characters.';
  }
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  if (m.includes('network') || m.includes('fetch')) {
    return 'Network error. Please check your connection and try again.';
  }
  return message;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: '100%',
    overflow: 'auto',
    padding: 'var(--space-6)',
    paddingTop: 'calc(env(safe-area-inset-top, 0px) + var(--space-6))',
    maxWidth: 'var(--max-width)',
    margin: '0 auto',
    width: '100%',
    backgroundColor: 'var(--color-neutral-0)',
  },
  backBtn: {
    width: '36px',
    height: '36px',
    borderRadius: 'var(--radius-md)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 'var(--space-4)',
  },
  header: {
    marginBottom: 'var(--space-6)',
  },
  logo: {
    fontSize: 'var(--font-size-lg)',
    fontWeight: 'var(--font-weight-bold)',
    background: 'linear-gradient(135deg, var(--color-primary-600), var(--color-accent-500))',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    marginBottom: 'var(--space-2)',
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
  },
  avatarSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    marginBottom: 'var(--space-6)',
  },
  avatarCircle: {
    width: '72px',
    height: '72px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-neutral-100)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '2px dashed var(--color-neutral-300)',
    marginBottom: 'var(--space-2)',
  },
  avatarHint: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-400)',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
    marginBottom: 'var(--space-4)',
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
    transition: 'border-color var(--transition-fast)',
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
  error: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-error-500)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--color-error-50)',
    borderRadius: 'var(--radius-sm)',
  },
  termsRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 'var(--space-2)',
    textAlign: 'left',
    padding: 'var(--space-2) 0',
    cursor: 'pointer',
  },
  checkbox: {
    flexShrink: 0,
    width: '22px',
    height: '22px',
    borderRadius: 'var(--radius-sm)',
    border: '2px solid var(--color-neutral-300)',
    backgroundColor: 'var(--color-neutral-0)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: '1px',
  },
  checkboxOn: {
    backgroundColor: 'var(--color-primary-600)',
    borderColor: 'var(--color-primary-600)',
  },
  termsText: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-600)',
    lineHeight: 'var(--line-height-snug)',
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
  footer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-2) 0 var(--space-4)',
  },
  switchText: {
    textAlign: 'center',
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-500)',
    margin: 0,
  },
  switchLink: {
    color: 'var(--color-primary-600)',
    fontWeight: 'var(--font-weight-semibold)',
  },
  guestBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--space-2) var(--space-3)',
  },
  guestBtnText: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-primary-600)',
    fontWeight: 'var(--font-weight-semibold)',
    textDecoration: 'underline',
    textDecorationColor: 'var(--color-primary-300)',
    textUnderlineOffset: '2px',
  },
};
