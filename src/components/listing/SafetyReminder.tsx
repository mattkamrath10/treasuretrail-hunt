import { ShieldAlert } from 'lucide-react';

interface Props {
  variant?: 'inline' | 'detail';
}

export default function SafetyReminder({ variant = 'inline' }: Props) {
  const tips = [
    'Meet in a public, well-lit location when possible.',
    'Verify the item in person before paying.',
    'Never share your exact home address until contact is confirmed.',
    'Use in-app messaging — avoid sharing personal contact info early.',
  ];
  return (
    <div style={variant === 'detail' ? st.detail : st.inline}>
      <div style={st.header}>
        <ShieldAlert size={14} style={{ color: 'var(--color-warning-600)' }} />
        <span style={st.title}>Meetup safety</span>
      </div>
      <ul style={st.list}>
        {tips.map((t) => (
          <li key={t} style={st.item}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

const st: Record<string, React.CSSProperties> = {
  inline: {
    padding: 'var(--space-3)',
    backgroundColor: 'var(--color-warning-50)',
    border: '1px solid var(--color-warning-200)',
    borderRadius: 'var(--radius-md)',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  detail: {
    padding: 'var(--space-3)',
    backgroundColor: 'var(--color-warning-50)',
    border: '1px solid var(--color-warning-200)',
    borderRadius: 'var(--radius-md)',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    marginTop: 'var(--space-3)',
  },
  header: { display: 'flex', alignItems: 'center', gap: '6px' },
  title: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-warning-700)',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
  },
  list: { margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '2px' },
  item: { fontSize: '12px', color: 'var(--color-neutral-700)', lineHeight: 'var(--line-height-snug)' },
};
