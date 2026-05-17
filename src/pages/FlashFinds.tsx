import { useState } from 'react';
import { Camera, ArrowLeft, ArrowRight, X, MapPin, DollarSign, Tag, Sparkles, Eye, CircleCheck as CheckCircle, Image, Pencil, Plus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { GuestOverlay } from '../components/GuestGate';
import AiAnalysisPage from './AiAnalysis';

type FlowStep = 'main' | 'photo' | 'details' | 'ai-analysis' | 'confirmation';

const CATEGORIES = [
  'Electronics', 'Furniture', 'Books', 'Collectibles', 'Antiques',
  'Art', 'Jewelry', 'Watches', 'Toys', 'Tools', 'Clothing', 'Other',
];


export default function FlashFinds() {
  const { isGuest } = useAuth();
  const [step, setStep] = useState<FlowStep>('main');

  if (isGuest) {
    return (
      <div style={{ height: '100%', position: 'relative' }}>
        <GuestOverlay
          title="Flash Finds"
          subtitle="Snap photos of your finds, get instant AI valuations, and share with the community."
        />
      </div>
    );
  }
  const [hasPhoto, setHasPhoto] = useState(false);
  const [form, setForm] = useState({
    title: '',
    category: '',
    notes: '',
    price: '',
    location: '',
  });

  const handleTakePhoto = () => {
    setHasPhoto(true);
    setStep('photo');
  };

  const handlePhotoConfirm = () => {
    setStep('details');
  };

  const handleDetailsSubmit = () => {
    setStep('ai-analysis');
  };

  const handleAiDone = () => {
    setStep('confirmation');
  };

  const handleReset = () => {
    setStep('main');
    setHasPhoto(false);
    setForm({ title: '', category: '', notes: '', price: '', location: '' });
  };

  if (step === 'main') {
    return <MainScreen onUpload={handleTakePhoto} />;
  }

  if (step === 'photo') {
    return (
      <PhotoPreview
        hasPhoto={hasPhoto}
        onConfirm={handlePhotoConfirm}
        onRetake={handleTakePhoto}
        onBack={handleReset}
      />
    );
  }

  if (step === 'details') {
    return (
      <DetailsForm
        form={form}
        setForm={setForm}
        onSubmit={handleDetailsSubmit}
        onBack={() => setStep('photo')}
      />
    );
  }

  if (step === 'ai-analysis') {
    return (
      <AiAnalysisPage
        form={form}
        onDone={handleAiDone}
        onBack={() => setStep('details')}
      />
    );
  }

  return (
    <Confirmation
      form={form}
      onPostAnother={handleReset}
      onViewFeed={() => setStep('main')}
      onEdit={() => setStep('details')}
    />
  );
}

function MainScreen({ onUpload }: { onUpload: () => void }) {
  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.headerTitle}>Flash Finds</h1>
        <p style={styles.headerSubtitle}>Snap. Identify. Sell.</p>
      </header>

      <div style={styles.mainContent}>
        <div style={styles.uploadHero}>
          <div style={styles.uploadRings}>
            <div style={styles.ringOuter} />
            <div style={styles.ringMiddle} />
            <button onClick={onUpload} style={styles.uploadBtn}>
              <Camera size={36} style={{ color: 'var(--color-neutral-0)' }} />
            </button>
          </div>
          <h2 style={styles.heroTitle}>Snap a Find</h2>
          <p style={styles.heroSubtitle}>Photograph any treasure and get instant AI analysis</p>
        </div>

        <div style={styles.quickActions}>
          <button onClick={onUpload} style={styles.quickAction}>
            <div style={styles.quickActionIcon}>
              <Camera size={20} style={{ color: 'var(--color-primary-600)' }} />
            </div>
            <span style={styles.quickActionLabel}>Take Photo</span>
          </button>
          <button onClick={onUpload} style={styles.quickAction}>
            <div style={styles.quickActionIcon}>
              <Image size={20} style={{ color: 'var(--color-secondary-600)' }} />
            </div>
            <span style={styles.quickActionLabel}>From Gallery</span>
          </button>
        </div>

        <div style={styles.tipsSection}>
          <h3 style={styles.tipsTitle}>Tips for best results</h3>
          <div style={styles.tipsList}>
            <div style={styles.tip}>
              <span style={styles.tipNumber}>1</span>
              <span style={styles.tipText}>Good lighting, no shadows</span>
            </div>
            <div style={styles.tip}>
              <span style={styles.tipNumber}>2</span>
              <span style={styles.tipText}>Capture labels and markings</span>
            </div>
            <div style={styles.tip}>
              <span style={styles.tipNumber}>3</span>
              <span style={styles.tipText}>Show front, back, and details</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PhotoPreview({
  hasPhoto,
  onConfirm,
  onRetake,
  onBack,
}: {
  hasPhoto: boolean;
  onConfirm: () => void;
  onRetake: () => void;
  onBack: () => void;
}) {
  return (
    <div style={styles.container}>
      <header style={styles.stepHeader}>
        <button onClick={onBack} style={styles.backBtn}>
          <ArrowLeft size={20} />
        </button>
        <span style={styles.stepLabel}>Photo Preview</span>
        <button onClick={onBack} style={styles.closeBtn}>
          <X size={20} />
        </button>
      </header>

      <div style={styles.photoContent}>
        {hasPhoto ? (
          <div style={styles.photoPreviewContainer}>
            <div style={styles.cameraPlaceholder}>
              <Camera size={48} style={{ color: 'var(--color-neutral-400)' }} />
              <p style={styles.placeholderText}>Photo captured</p>
            </div>
            <div style={styles.photoOverlay}>
              <span style={styles.photoHint}>AI will analyze this image</span>
            </div>
          </div>
        ) : (
          <div style={styles.cameraPlaceholder}>
            <Camera size={48} style={{ color: 'var(--color-neutral-300)' }} />
            <p style={styles.placeholderText}>Camera viewfinder</p>
          </div>
        )}

        <div style={styles.photoActions}>
          <button onClick={onRetake} style={styles.retakeBtn}>
            <Camera size={18} />
            <span>Retake</span>
          </button>
          <button onClick={onConfirm} style={styles.usePhotoBtn}>
            <CheckCircle size={18} />
            <span>Use This Photo</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailsForm({
  form,
  setForm,
  onSubmit,
  onBack,
}: {
  form: { title: string; category: string; notes: string; price: string; location: string };
  setForm: (f: typeof form) => void;
  onSubmit: () => void;
  onBack: () => void;
}) {
  return (
    <div style={styles.container}>
      <header style={styles.stepHeader}>
        <button onClick={onBack} style={styles.backBtn}>
          <ArrowLeft size={20} />
        </button>
        <span style={styles.stepLabel}>Item Details</span>
        <div style={{ width: 36 }} />
      </header>

      <div style={styles.detailsContent}>
        <div style={styles.miniPreview}>
          <div style={{ ...styles.miniImage, backgroundColor: 'var(--color-neutral-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)' }}>
            <Camera size={20} style={{ color: 'var(--color-neutral-400)' }} />
          </div>
          <div style={styles.miniMeta}>
            <span style={styles.miniLabel}>Your find</span>
            <span style={styles.miniHint}>Add details below</span>
          </div>
        </div>

        <div style={styles.formFields}>
          <div style={styles.field}>
            <label style={styles.fieldLabel}>Item Title</label>
            <input
              type="text"
              placeholder="What did you find?"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              style={styles.input}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.fieldLabel}>Category</label>
            <div style={styles.categoryGrid}>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setForm({ ...form, category: cat })}
                  style={{
                    ...styles.categoryChip,
                    ...(form.category === cat ? styles.categoryChipActive : {}),
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.fieldLabel}>Price Found At</label>
            <div style={styles.priceWrapper}>
              <DollarSign size={16} style={{ color: 'var(--color-neutral-400)' }} />
              <input
                type="text"
                placeholder="0.00"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                style={styles.priceInput}
              />
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.fieldLabel}>Location Found</label>
            <div style={styles.locationWrapper}>
              <MapPin size={16} style={{ color: 'var(--color-neutral-400)' }} />
              <input
                type="text"
                placeholder="Yard sale, thrift store, etc."
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                style={styles.locationInput}
              />
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.fieldLabel}>Notes (optional)</label>
            <textarea
              placeholder="Condition, backstory, anything interesting..."
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              style={styles.textarea}
              rows={3}
            />
          </div>
        </div>

        <button onClick={onSubmit} style={styles.continueBtn}>
          <Sparkles size={18} style={{ color: 'var(--color-neutral-0)' }} />
          <span style={styles.continueBtnText}>Analyze with AI</span>
          <ArrowRight size={18} style={{ color: 'var(--color-neutral-0)' }} />
        </button>
      </div>
    </div>
  );
}

function Confirmation({
  form,
  onPostAnother,
  onViewFeed,
  onEdit,
}: {
  form: { title: string; category: string; notes: string; price: string; location: string };
  onPostAnother: () => void;
  onViewFeed: () => void;
  onEdit: () => void;
}) {
  return (
    <div style={styles.container}>
      <div style={styles.confirmContent}>
        <div style={styles.successHeader}>
          <div style={styles.successIcon}>
            <CheckCircle size={40} style={{ color: 'var(--color-success-500)' }} />
          </div>
          <h2 style={styles.successTitle}>Find Posted!</h2>
          <p style={styles.successSubtitle}>Your treasure is now live in the feed</p>
        </div>

        <div style={styles.postedCard}>
          <div style={{ ...styles.postedImage, backgroundColor: 'var(--color-neutral-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)' }}>
            <Camera size={24} style={{ color: 'var(--color-neutral-400)' }} />
          </div>
          <div style={styles.postedInfo}>
            <h3 style={styles.postedTitle}>{form.title}</h3>
            <div style={styles.postedMeta}>
              <span style={styles.postedCategory}>
                <Tag size={12} /> {form.category || 'Antiques'}
              </span>
              {form.price && (
                <span style={styles.postedPrice}>
                  <DollarSign size={12} /> {form.price}
                </span>
              )}
              {form.location && (
                <span style={styles.postedLocation}>
                  <MapPin size={12} /> {form.location}
                </span>
              )}
            </div>
          </div>
        </div>

        <div style={styles.confirmActions}>
          <button onClick={onViewFeed} style={styles.viewFeedBtn}>
            <Eye size={18} />
            <span>View in Feed</span>
          </button>
          <button onClick={onEdit} style={styles.editBtn}>
            <Pencil size={18} />
            <span>Edit Find</span>
          </button>
          <button onClick={onPostAnother} style={styles.postAnotherBtn}>
            <Plus size={18} style={{ color: 'var(--color-neutral-0)' }} />
            <span style={{ color: 'var(--color-neutral-0)' }}>Post Another</span>
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    backgroundColor: 'var(--color-neutral-0)',
  },
  header: {
    padding: 'var(--space-4)',
    borderBottom: '1px solid var(--color-neutral-100)',
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: 'var(--font-size-xl)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
  },
  headerSubtitle: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-500)',
    marginTop: '2px',
  },
  mainContent: {
    flex: 1,
    overflow: 'auto',
    padding: 'var(--space-4)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  uploadHero: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: 'var(--space-10) 0 var(--space-8)',
  },
  uploadRings: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '140px',
    height: '140px',
    marginBottom: 'var(--space-5)',
  },
  ringOuter: {
    position: 'absolute',
    width: '140px',
    height: '140px',
    borderRadius: 'var(--radius-full)',
    border: '2px solid var(--color-primary-100)',
    animation: 'pulse 2s ease-in-out infinite',
  },
  ringMiddle: {
    position: 'absolute',
    width: '110px',
    height: '110px',
    borderRadius: 'var(--radius-full)',
    border: '2px solid var(--color-primary-200)',
    animation: 'pulse 2s ease-in-out infinite 0.3s',
  },
  uploadBtn: {
    width: '80px',
    height: '80px',
    borderRadius: 'var(--radius-full)',
    background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-accent-500))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 8px 32px rgba(234, 179, 8, 0.35)',
    transition: 'transform var(--transition-fast)',
    position: 'relative',
    zIndex: 1,
  },
  heroTitle: {
    fontSize: 'var(--font-size-2xl)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
    marginBottom: 'var(--space-1)',
  },
  heroSubtitle: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-500)',
    textAlign: 'center',
    maxWidth: '260px',
  },
  quickActions: {
    display: 'flex',
    gap: 'var(--space-3)',
    width: '100%',
    marginBottom: 'var(--space-8)',
  },
  quickAction: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-4)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-200)',
    backgroundColor: 'var(--color-neutral-50)',
    transition: 'all var(--transition-fast)',
  },
  quickActionIcon: {
    width: '44px',
    height: '44px',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--color-neutral-0)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: 'var(--shadow-sm)',
  },
  quickActionLabel: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-medium)',
    color: 'var(--color-neutral-700)',
  },
  tipsSection: {
    width: '100%',
    padding: 'var(--space-4)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--color-neutral-50)',
    border: '1px solid var(--color-neutral-100)',
  },
  tipsTitle: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-800)',
    marginBottom: 'var(--space-3)',
  },
  tipsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },
  tip: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
  },
  tipNumber: {
    width: '22px',
    height: '22px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-primary-100)',
    color: 'var(--color-primary-700)',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-bold)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  tipText: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-600)',
  },

  // Step header
  stepHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-4)',
    borderBottom: '1px solid var(--color-neutral-100)',
    flexShrink: 0,
  },
  backBtn: {
    width: '36px',
    height: '36px',
    borderRadius: 'var(--radius-md)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--color-neutral-600)',
  },
  closeBtn: {
    width: '36px',
    height: '36px',
    borderRadius: 'var(--radius-md)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--color-neutral-400)',
  },
  stepLabel: {
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-900)',
  },

  // Photo preview
  photoContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  photoPreviewContainer: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  photoOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 'var(--space-4)',
    background: 'linear-gradient(transparent, rgba(0,0,0,0.6))',
    display: 'flex',
    justifyContent: 'center',
  },
  photoHint: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-0)',
    fontWeight: 'var(--font-weight-medium)',
    backgroundColor: 'rgba(0,0,0,0.4)',
    padding: 'var(--space-1) var(--space-3)',
    borderRadius: 'var(--radius-full)',
    backdropFilter: 'blur(4px)',
  },
  cameraPlaceholder: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-3)',
    backgroundColor: 'var(--color-neutral-900)',
  },
  placeholderText: {
    color: 'var(--color-neutral-400)',
    fontSize: 'var(--font-size-sm)',
  },
  photoActions: {
    display: 'flex',
    gap: 'var(--space-3)',
    padding: 'var(--space-4)',
    backgroundColor: 'var(--color-neutral-0)',
    borderTop: '1px solid var(--color-neutral-100)',
  },
  retakeBtn: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-3)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-200)',
    color: 'var(--color-neutral-700)',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-medium)',
  },
  usePhotoBtn: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-3)',
    borderRadius: 'var(--radius-md)',
    background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-accent-500))',
    color: 'var(--color-neutral-0)',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
  },

  // Details form
  detailsContent: {
    flex: 1,
    overflow: 'auto',
    padding: 'var(--space-4)',
    display: 'flex',
    flexDirection: 'column',
  },
  miniPreview: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-3)',
    backgroundColor: 'var(--color-neutral-50)',
    borderRadius: 'var(--radius-md)',
    marginBottom: 'var(--space-5)',
  },
  miniImage: {
    width: '48px',
    height: '48px',
    borderRadius: 'var(--radius-sm)',
    objectFit: 'cover',
  },
  miniMeta: {
    display: 'flex',
    flexDirection: 'column',
  },
  miniLabel: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-800)',
  },
  miniHint: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-400)',
  },
  formFields: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-5)',
    flex: 1,
    marginBottom: 'var(--space-4)',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },
  fieldLabel: {
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
  categoryGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--space-2)',
  },
  categoryChip: {
    padding: 'var(--space-2) var(--space-3)',
    borderRadius: 'var(--radius-full)',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-medium)',
    backgroundColor: 'var(--color-neutral-100)',
    color: 'var(--color-neutral-600)',
    border: '1px solid transparent',
    transition: 'all var(--transition-fast)',
  },
  categoryChipActive: {
    backgroundColor: 'var(--color-primary-50)',
    color: 'var(--color-primary-700)',
    border: '1px solid var(--color-primary-200)',
  },
  priceWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-3) var(--space-4)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--color-neutral-50)',
    border: '1px solid var(--color-neutral-200)',
  },
  priceInput: {
    flex: 1,
    fontSize: 'var(--font-size-base)',
    color: 'var(--color-neutral-900)',
    backgroundColor: 'transparent',
  },
  locationWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-3) var(--space-4)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--color-neutral-50)',
    border: '1px solid var(--color-neutral-200)',
  },
  locationInput: {
    flex: 1,
    fontSize: 'var(--font-size-base)',
    color: 'var(--color-neutral-900)',
    backgroundColor: 'transparent',
  },
  textarea: {
    padding: 'var(--space-3) var(--space-4)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--color-neutral-50)',
    border: '1px solid var(--color-neutral-200)',
    fontSize: 'var(--font-size-base)',
    color: 'var(--color-neutral-900)',
    lineHeight: 'var(--line-height-normal)',
    resize: 'none',
    width: '100%',
  },
  continueBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    width: '100%',
    padding: 'var(--space-4)',
    borderRadius: 'var(--radius-md)',
    background: 'linear-gradient(135deg, var(--color-primary-600), var(--color-accent-500))',
    boxShadow: '0 4px 16px rgba(234, 179, 8, 0.3)',
    flexShrink: 0,
  },
  continueBtnText: {
    color: 'var(--color-neutral-0)',
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-semibold)',
  },

  // Confirmation
  confirmContent: {
    flex: 1,
    overflow: 'auto',
    padding: 'var(--space-6) var(--space-4)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  successHeader: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    marginBottom: 'var(--space-6)',
    animation: 'scaleIn 0.4s ease',
  },
  successIcon: {
    width: '72px',
    height: '72px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-success-50)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 'var(--space-3)',
  },
  successTitle: {
    fontSize: 'var(--font-size-2xl)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
  },
  successSubtitle: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-500)',
    marginTop: 'var(--space-1)',
  },
  postedCard: {
    width: '100%',
    borderRadius: 'var(--radius-lg)',
    overflow: 'hidden',
    boxShadow: 'var(--shadow-lg)',
    marginBottom: 'var(--space-6)',
    animation: 'slideUp 0.5s ease forwards',
  },
  postedImage: {
    width: '100%',
    aspectRatio: '4/3',
    objectFit: 'cover',
  },
  postedInfo: {
    padding: 'var(--space-4)',
    backgroundColor: 'var(--color-neutral-0)',
  },
  postedTitle: {
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
    marginBottom: 'var(--space-2)',
  },
  postedMeta: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--space-3)',
    marginBottom: 'var(--space-3)',
  },
  postedCategory: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-500)',
  },
  postedPrice: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-success-600)',
    fontWeight: 'var(--font-weight-medium)',
  },
  postedLocation: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-500)',
  },
  postedValueBadge: {
    display: 'inline-flex',
    padding: 'var(--space-1) var(--space-3)',
    backgroundColor: 'var(--color-primary-50)',
    borderRadius: 'var(--radius-full)',
    border: '1px solid var(--color-primary-200)',
  },
  valueBadgeText: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-primary-700)',
  },
  confirmActions: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },
  viewFeedBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    width: '100%',
    padding: 'var(--space-3)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-200)',
    color: 'var(--color-neutral-700)',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-medium)',
  },
  editBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    width: '100%',
    padding: 'var(--space-3)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-200)',
    color: 'var(--color-neutral-700)',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-medium)',
  },
  postAnotherBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    width: '100%',
    padding: 'var(--space-4)',
    borderRadius: 'var(--radius-md)',
    background: 'linear-gradient(135deg, var(--color-primary-600), var(--color-accent-500))',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    boxShadow: '0 4px 16px rgba(234, 179, 8, 0.3)',
    marginTop: 'var(--space-2)',
  },
};
