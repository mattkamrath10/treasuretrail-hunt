import { useState } from 'react';
import { Check, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const CATEGORIES = [
  'Watches',
  'Jewelry',
  'Furniture',
  'Antiques',
  'Sneakers',
  'Toys',
  'Collectibles',
  'Tools',
  'Electronics',
  'Other',
];

export default function ProfileSetup() {
  const { updateProfile } = useAuth();
  const [step, setStep] = useState(0);
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const handleNext = async () => {
    setError('');

    if (step === 0) {
      if (!username.trim()) {
        setError('Please choose a username');
        return;
      }
      if (username.length < 3) {
        setError('Username must be at least 3 characters');
        return;
      }
      setStep(1);
    } else if (step === 1) {
      setStep(2);
    } else {
      if (selectedCategories.length === 0) {
        setError('Select at least one category');
        return;
      }
      setIsLoading(true);
      const { error: profileError } = await updateProfile({
        username: username.trim(),
        bio: bio.trim(),
        favorite_categories: selectedCategories,
      } as any);
      setIsLoading(false);

      if (profileError) {
        setError(profileError);
      }
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.progress}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              ...styles.progressBar,
              backgroundColor: i <= step ? 'var(--color-primary-500)' : 'var(--color-neutral-200)',
            }}
          />
        ))}
      </div>

      <div style={styles.content}>
        {step === 0 && (
          <div style={styles.stepContainer}>
            <h2 style={styles.stepTitle}>Choose Your Username</h2>
            <p style={styles.stepSubtitle}>This is how other hunters will find you</p>

            <div style={styles.inputContainer}>
              <span style={styles.atSign}>@</span>
              <input
                type="text"
                placeholder="username"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                style={styles.usernameInput}
                maxLength={20}
              />
            </div>
            <span style={styles.hint}>{username.length}/20 characters</span>
          </div>
        )}

        {step === 1 && (
          <div style={styles.stepContainer}>
            <h2 style={styles.stepTitle}>Add a Short Bio</h2>
            <p style={styles.stepSubtitle}>Tell the community what you're about</p>

            <textarea
              placeholder="Vintage collector, always hunting for mid-century finds..."
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              style={styles.textarea}
              maxLength={150}
              rows={4}
            />
            <span style={styles.hint}>{bio.length}/150 characters (optional)</span>
          </div>
        )}

        {step === 2 && (
          <div style={styles.stepContainer}>
            <h2 style={styles.stepTitle}>Favorite Categories</h2>
            <p style={styles.stepSubtitle}>Select what you love hunting for</p>

            <div style={styles.categoriesGrid}>
              {CATEGORIES.map((cat) => {
                const isSelected = selectedCategories.includes(cat);
                return (
                  <button
                    key={cat}
                    onClick={() => toggleCategory(cat)}
                    style={{
                      ...styles.categoryChip,
                      ...(isSelected ? styles.categoryChipSelected : {}),
                    }}
                  >
                    {isSelected && <Check size={14} style={{ color: 'var(--color-neutral-0)' }} />}
                    <span>{cat}</span>
                  </button>
                );
              })}
            </div>
            <span style={styles.hint}>{selectedCategories.length} selected</span>
          </div>
        )}

        {error && <p style={styles.error}>{error}</p>}
      </div>

      <div style={styles.bottomActions}>
        <button
          onClick={handleNext}
          style={{
            ...styles.nextBtn,
            opacity: isLoading ? 0.7 : 1,
          }}
          disabled={isLoading}
        >
          <span style={styles.nextText}>
            {step === 2 ? (isLoading ? 'Saving...' : 'Start Hunting') : 'Continue'}
          </span>
          {!isLoading && <ArrowRight size={18} style={{ color: 'var(--color-neutral-0)' }} />}
        </button>

        {step === 1 && (
          <button onClick={() => setStep(2)} style={styles.skipBtn}>
            Skip for now
          </button>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    maxWidth: 'var(--max-width)',
    margin: '0 auto',
    width: '100%',
    backgroundColor: 'var(--color-neutral-0)',
    padding: 'var(--space-6)',
    paddingTop: 'calc(env(safe-area-inset-top, 0px) + var(--space-6))',
  },
  progress: {
    display: 'flex',
    gap: 'var(--space-2)',
    marginBottom: 'var(--space-8)',
  },
  progressBar: {
    flex: 1,
    height: '4px',
    borderRadius: 'var(--radius-full)',
    transition: 'background-color var(--transition-base)',
  },
  content: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  stepContainer: {
    animation: 'fadeIn 0.3s ease',
  },
  stepTitle: {
    fontSize: 'var(--font-size-2xl)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
    lineHeight: 'var(--line-height-tight)',
    marginBottom: 'var(--space-2)',
  },
  stepSubtitle: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-500)',
    marginBottom: 'var(--space-6)',
  },
  inputContainer: {
    display: 'flex',
    alignItems: 'center',
    padding: 'var(--space-4)',
    backgroundColor: 'var(--color-neutral-50)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-200)',
  },
  atSign: {
    fontSize: 'var(--font-size-lg)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-400)',
    marginRight: 'var(--space-1)',
  },
  usernameInput: {
    flex: 1,
    fontSize: 'var(--font-size-lg)',
    fontWeight: 'var(--font-weight-medium)',
    color: 'var(--color-neutral-900)',
    backgroundColor: 'transparent',
  },
  textarea: {
    width: '100%',
    padding: 'var(--space-4)',
    backgroundColor: 'var(--color-neutral-50)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-200)',
    fontSize: 'var(--font-size-base)',
    color: 'var(--color-neutral-900)',
    lineHeight: 'var(--line-height-normal)',
    resize: 'none',
  },
  hint: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-400)',
    marginTop: 'var(--space-2)',
    display: 'block',
  },
  categoriesGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--space-2)',
  },
  categoryChip: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-2) var(--space-4)',
    borderRadius: 'var(--radius-full)',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-medium)',
    backgroundColor: 'var(--color-neutral-100)',
    color: 'var(--color-neutral-700)',
    border: '1px solid var(--color-neutral-200)',
    transition: 'all var(--transition-fast)',
  },
  categoryChipSelected: {
    backgroundColor: 'var(--color-primary-500)',
    color: 'var(--color-neutral-0)',
    border: '1px solid var(--color-primary-500)',
  },
  error: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-error-500)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--color-error-50)',
    borderRadius: 'var(--radius-sm)',
    marginTop: 'var(--space-4)',
  },
  bottomActions: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
    paddingTop: 'var(--space-4)',
  },
  nextBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    width: '100%',
    padding: 'var(--space-4)',
    borderRadius: 'var(--radius-md)',
    background: 'linear-gradient(135deg, var(--color-primary-600), var(--color-accent-500))',
    boxShadow: '0 4px 16px rgba(234, 179, 8, 0.3)',
    transition: 'opacity var(--transition-fast)',
  },
  nextText: {
    color: 'var(--color-neutral-0)',
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-semibold)',
  },
  skipBtn: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-400)',
    padding: 'var(--space-2)',
    textAlign: 'center',
  },
};
