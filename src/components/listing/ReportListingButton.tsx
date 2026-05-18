import { useState } from 'react';
import { Flag, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface Props {
  table: 'community_posts' | 'marketplace_listings' | 'external_listings';
  listingId: string;
}

const REASONS = [
  'Scam or fraud',
  'Counterfeit item',
  'Wrong location / fake event',
  'Prohibited item',
  'Spam or duplicate',
  'Other',
];

export default function ReportListingButton({ table, listingId }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async () => {
    if (!user) {
      setErrorMsg('Please sign in to report a listing.');
      setStatus('error');
      return;
    }
    if (!reason) return;
    setStatus('saving');
    setErrorMsg('');
    const { error } = await supabase.from('listing_reports').insert({
      reporter_id: user.id,
      listing_table: table,
      listing_id: listingId,
      reason,
      details: details.trim(),
    });
    if (error) {
      setErrorMsg(error.message);
      setStatus('error');
      return;
    }
    setStatus('sent');
    setTimeout(() => {
      setOpen(false);
      setStatus('idle');
      setReason('');
      setDetails('');
    }, 1500);
  };

  return (
    <>
      <button onClick={() => setOpen(true)} style={st.btn} type="button">
        <Flag size={12} style={{ color: 'var(--color-neutral-500)' }} />
        <span>Report</span>
      </button>
      {open && (
        <div style={st.overlay} onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div style={st.sheet}>
            <div style={st.header}>
              <span style={st.title}>Report this listing</span>
              <button onClick={() => setOpen(false)} style={st.closeBtn} type="button">
                <X size={18} />
              </button>
            </div>
            <div style={st.body}>
              <label style={st.label}>Reason</label>
              <div style={st.reasonGrid}>
                {REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReason(r)}
                    style={{ ...st.reasonBtn, ...(reason === r ? st.reasonBtnActive : {}) }}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <label style={{ ...st.label, marginTop: 12 }}>Additional details (optional)</label>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                style={st.textarea}
                rows={3}
                placeholder="Share anything that helps our team investigate"
                maxLength={500}
              />
              {errorMsg && <p style={st.error}>{errorMsg}</p>}
              {status === 'sent' && <p style={st.success}>Report submitted. Our team will review it.</p>}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!reason || status === 'saving' || status === 'sent'}
                style={{ ...st.submit, opacity: !reason || status === 'saving' || status === 'sent' ? 0.6 : 1 }}
              >
                {status === 'saving' ? 'Sending…' : status === 'sent' ? 'Sent' : 'Send Report'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const st: Record<string, React.CSSProperties> = {
  btn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 10px',
    borderRadius: 'var(--radius-full)',
    border: '1px solid var(--color-neutral-200)',
    backgroundColor: 'var(--color-neutral-0)',
    color: 'var(--color-neutral-600)',
    fontSize: '11px',
    fontWeight: 'var(--font-weight-medium)',
    cursor: 'pointer',
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    zIndex: 1000,
  },
  sheet: {
    width: '100%',
    maxWidth: '480px',
    backgroundColor: 'var(--color-neutral-0)',
    borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
    display: 'flex',
    flexDirection: 'column',
    maxHeight: '85vh',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-4)',
    borderBottom: '1px solid var(--color-neutral-100)',
  },
  title: {
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
  },
  closeBtn: {
    width: '32px',
    height: '32px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-neutral-100)',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    padding: 'var(--space-4)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
    overflowY: 'auto',
  },
  label: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-700)',
  },
  reasonGrid: { display: 'flex', flexWrap: 'wrap', gap: '6px' },
  reasonBtn: {
    padding: '6px 12px',
    borderRadius: 'var(--radius-full)',
    border: '1px solid var(--color-neutral-200)',
    backgroundColor: 'var(--color-neutral-0)',
    color: 'var(--color-neutral-700)',
    fontSize: '12px',
    cursor: 'pointer',
    fontWeight: 'var(--font-weight-medium)',
  },
  reasonBtnActive: {
    backgroundColor: 'var(--color-error-500)',
    borderColor: 'var(--color-error-500)',
    color: 'var(--color-neutral-0)',
  },
  textarea: {
    padding: '10px 12px',
    border: '1px solid var(--color-neutral-200)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-900)',
    backgroundColor: 'var(--color-neutral-0)',
    fontFamily: 'inherit',
    resize: 'vertical',
  },
  error: { fontSize: '12px', color: 'var(--color-error-500)' },
  success: { fontSize: '12px', color: 'var(--color-success-600)' },
  submit: {
    marginTop: 'var(--space-2)',
    padding: '12px',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--color-error-500)',
    color: 'var(--color-neutral-0)',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-bold)',
    border: 'none',
    cursor: 'pointer',
  },
};
