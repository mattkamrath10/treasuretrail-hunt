import { useState } from 'react';
import { MapPin, Zap, Radar, ArrowRight } from 'lucide-react';

interface OnboardingProps {
  onComplete: () => void;
}

interface Slide {
  icon: typeof MapPin;
  title: string;
  description: string;
  color: string;
}

const slides: Slide[] = [
  {
    icon: MapPin,
    title: 'Discover Hidden Treasures',
    description: 'Browse an endless feed of amazing finds from yard sales, thrift stores, estate sales, and more.',
    color: 'var(--color-primary-500)',
  },
  {
    icon: Zap,
    title: 'Snap & Identify Instantly',
    description: 'Photograph any item and our AI will identify it, estimate its value, and create a listing in seconds.',
    color: 'var(--color-accent-500)',
  },
  {
    icon: Radar,
    title: 'Find What You\'re Looking For',
    description: 'Post items you want and let our network of scouts help you find them in the wild.',
    color: 'var(--color-secondary-500)',
  },
];

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [currentSlide, setCurrentSlide] = useState(0);

  const handleNext = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(currentSlide + 1);
    } else {
      onComplete();
    }
  };

  const slide = slides[currentSlide];
  const Icon = slide.icon;
  const isLast = currentSlide === slides.length - 1;

  return (
    <div style={styles.container}>
      <div style={styles.skipContainer}>
        <button onClick={onComplete} style={styles.skipBtn}>
          Skip
        </button>
      </div>

      <div style={styles.logoContainer}>
        <h1 style={styles.logo}>TreasureTrail</h1>
        <p style={styles.tagline}>Every find tells a story</p>
      </div>

      <div style={styles.slideContainer}>
        <div
          style={{
            ...styles.iconContainer,
            backgroundColor: `${slide.color}15`,
          }}
        >
          <Icon size={48} style={{ color: slide.color }} />
        </div>
        <h2 style={styles.slideTitle}>{slide.title}</h2>
        <p style={styles.slideDescription}>{slide.description}</p>
      </div>

      <div style={styles.bottom}>
        <div style={styles.dots}>
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentSlide(i)}
              style={{
                ...styles.dot,
                ...(i === currentSlide ? styles.dotActive : {}),
              }}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>

        <button onClick={handleNext} style={styles.nextBtn}>
          <span style={styles.nextText}>
            {isLast ? 'Get Started' : 'Next'}
          </span>
          <ArrowRight size={18} style={{ color: 'var(--color-neutral-0)' }} />
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    padding: 'var(--space-6)',
    maxWidth: 'var(--max-width)',
    margin: '0 auto',
    width: '100%',
    background: 'linear-gradient(180deg, var(--color-neutral-0) 0%, var(--color-neutral-50) 100%)',
  },
  skipContainer: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginBottom: 'var(--space-8)',
  },
  skipBtn: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-medium)',
    color: 'var(--color-neutral-400)',
    padding: 'var(--space-2) var(--space-4)',
  },
  logoContainer: {
    textAlign: 'center',
    marginBottom: 'var(--space-12)',
  },
  logo: {
    fontSize: 'var(--font-size-3xl)',
    fontWeight: 'var(--font-weight-bold)',
    background: 'linear-gradient(135deg, var(--color-primary-600), var(--color-accent-500))',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    letterSpacing: '-1px',
  },
  tagline: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-500)',
    marginTop: 'var(--space-1)',
  },
  slideContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    padding: '0 var(--space-4)',
    animation: 'scaleIn 0.3s ease',
  },
  iconContainer: {
    width: '96px',
    height: '96px',
    borderRadius: 'var(--radius-xl)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 'var(--space-6)',
  },
  slideTitle: {
    fontSize: 'var(--font-size-2xl)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
    marginBottom: 'var(--space-3)',
    lineHeight: 'var(--line-height-tight)',
  },
  slideDescription: {
    fontSize: 'var(--font-size-base)',
    color: 'var(--color-neutral-500)',
    lineHeight: 'var(--line-height-normal)',
    maxWidth: '320px',
  },
  bottom: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 'var(--space-6)',
    paddingBottom: 'var(--space-4)',
  },
  dots: {
    display: 'flex',
    gap: 'var(--space-2)',
  },
  dot: {
    width: '8px',
    height: '8px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-neutral-200)',
    transition: 'all var(--transition-base)',
  },
  dotActive: {
    width: '24px',
    backgroundColor: 'var(--color-primary-500)',
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
    transition: 'transform var(--transition-fast)',
  },
  nextText: {
    color: 'var(--color-neutral-0)',
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-semibold)',
  },
};
