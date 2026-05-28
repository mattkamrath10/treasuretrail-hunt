import { useEffect, useState, useRef, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  ArrowLeft, Send, MessageCircle, Loader, Tag,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  fetchConversations, fetchMessages, sendMessage, markConversationRead,
  type Conversation, type ChatMessage,
} from '../lib/messaging';
import { supabase } from '../lib/supabase';
import { ImageWithFade } from '../components/ui/ImageWithFade';
import { toThumbUrl } from '../lib/imageCompress';

/**
 * Messages.tsx — real direct-message inbox.
 *
 * Behavior:
 *   - When the URL is `/messages`, renders the conversation list.
 *   - When the URL is `/messages/:id`, renders the chat view.
 *
 * Realtime: V1 uses a 5s poll for new messages while a chat is open and a
 * 15s poll for the inbox list. Supabase realtime channels can replace this
 * later without changing the data contract.
 */
export default function Messages({ onBack }: { onBack: () => void }) {
  const { id: routeId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  // ---- gating: must be signed in --------------------------------------
  if (!user) {
    return (
      <div style={styles.stateScreen}>
        <MessageCircle size={36} style={{ color: 'var(--color-neutral-400)' }} />
        <span style={styles.stateTitle}>Sign in to message hunters</span>
        <span style={styles.stateMuted}>Direct messages live with your account.</span>
        <button style={styles.primaryBtn} onClick={onBack}>Back</button>
      </div>
    );
  }

  if (routeId) {
    return <ConversationView conversationId={routeId} onBack={() => navigate('/messages')} />;
  }
  return <InboxView onBack={onBack} onOpen={(id) => navigate(`/messages/${id}`)} />;
}

// =====================================================================
// Inbox
// =====================================================================
function InboxView({ onBack, onOpen }: { onBack: () => void; onOpen: (id: string) => void }) {
  const { user } = useAuth();
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    if (!user) return;
    const rows = await fetchConversations(user.id);
    setConvos(rows);
    setLoading(false);

    // Per-conversation unread count, addressed to me. One small query
    // per conversation is fine for V1; can be batched into a view later.
    const entries = await Promise.all(rows.map(async (c) => {
      const { count } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', c.id)
        .eq('receiver_id', user.id)
        .is('read_at', null);
      return [c.id, count ?? 0] as const;
    }));
    const next: Record<string, number> = {};
    entries.forEach(([id, n]) => { next[id] = n; });
    setUnreadMap(next);
  }, [user]);

  useEffect(() => {
    load().catch((e) => { setError(String(e?.message || e)); setLoading(false); });
    const t = window.setInterval(() => { load().catch(() => {}); }, 15000);
    return () => window.clearInterval(t);
  }, [load]);

  return (
    <div style={styles.page}>
      <header style={styles.topBar}>
        <button onClick={onBack} style={styles.iconBtn} aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <span style={styles.topTitle}>Messages</span>
        <span style={{ width: 44 }} />
      </header>

      <div style={styles.scroll}>
        {loading ? (
          <div style={styles.stateBlock}>
            <Loader size={22} style={{ color: 'var(--color-primary-500)', animation: 'spin 0.8s linear infinite' }} />
            <span style={styles.stateMuted}>Loading…</span>
          </div>
        ) : error ? (
          <div style={styles.stateBlock}>
            <span style={styles.stateTitle}>Couldn’t load messages</span>
            <span style={styles.stateMuted}>{error}</span>
          </div>
        ) : convos.length === 0 ? (
          <div style={styles.stateBlock}>
            <MessageCircle size={32} style={{ color: 'var(--color-neutral-400)' }} />
            <span style={styles.stateTitle}>No messages yet</span>
            <span style={styles.stateMuted}>Open a listing and tap “Message Seller” to start a conversation.</span>
          </div>
        ) : (
          <ul style={styles.list}>
            {convos.map((c) => {
              const unread = unreadMap[c.id] ?? 0;
              const initial = (c.other_username || 'h').slice(0, 1).toUpperCase();
              return (
                <li key={c.id}>
                  <button
                    onClick={() => onOpen(c.id)}
                    style={{ ...styles.row, fontWeight: unread > 0 ? 700 : 500 }}
                    aria-label={`Open chat with @${c.other_username}`}
                  >
                    {c.other_avatar_url ? (
                      <ImageWithFade
                        src={toThumbUrl(c.other_avatar_url) ?? c.other_avatar_url}
                        fallbackSrc={c.other_avatar_url}
                        alt={c.other_username || 'user'}
                        style={styles.avatarImg}
                      />
                    ) : (
                      <div style={styles.avatarFallback}>{initial}</div>
                    )}
                    <div style={styles.rowMeta}>
                      <span style={styles.rowName}>@{c.other_username || 'hunter'}</span>
                      <span style={styles.rowPreview}>
                        {c.last_message_preview || 'No messages yet'}
                      </span>
                      {c.listing_id && (
                        <span style={styles.rowChip}>
                          <Tag size={11} /> {c.listing_kind === 'marketplace' ? 'Listing' : 'Find'}
                        </span>
                      )}
                    </div>
                    <div style={styles.rowRight}>
                      <span style={styles.rowTime}>{formatRelative(c.last_message_at)}</span>
                      {unread > 0 && (
                        <span style={styles.unreadDot}>{unread > 9 ? '9+' : unread}</span>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// =====================================================================
// Conversation
// =====================================================================
function ConversationView({ conversationId, onBack }: { conversationId: string; onBack: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [conv, setConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // Seed the composer once from navigation state (e.g. "Message Requester"
  // CTA on WantedDetail passes a friendly opener). We consume the state on
  // first render and then clear it so a later back/forward doesn't re-seed.
  const initialPrefill = (location.state as { prefill?: string } | null)?.prefill ?? '';
  const [draft, setDraft] = useState(initialPrefill);
  useEffect(() => {
    if (initialPrefill) {
      navigate(location.pathname, { replace: true, state: null });
    }
    // run once per mount intentionally
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Track the highest created_at we've seen so polling pulls deltas only.
  const lastTsRef = useRef<string | null>(null);
  // Pending optimistic sends, in FIFO order. Each entry stores the temp
  // row id plus the (sender, content) tuple we'll match against the next
  // server echo. We CONSUME one entry per matching echo so two identical
  // messages sent back-to-back are not collapsed into one bubble.
  const pendingTempsRef = useRef<Array<{ tempId: string; sender: string; content: string }>>([]);

  // ---- initial load: resolve conversation + fetch history --------------
  useEffect(() => {
    let cancelled = false;
    if (!user) return;
    setLoading(true); setError(null);
    (async () => {
      const { data, error: cErr } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', conversationId)
        .maybeSingle();
      if (cancelled) return;
      if (cErr) { setError(cErr.message); setLoading(false); return; }
      if (!data) { setError('Conversation not found'); setLoading(false); return; }
      // Hydrate the "other user" so the header renders without an extra hop.
      const otherId = data.user_a_id === user.id ? data.user_b_id : data.user_a_id;
      const { data: prof } = await supabase
        .from('profiles')
        .select('username, avatar_url')
        .eq('id', otherId)
        .maybeSingle();
      setConv({
        ...data,
        other_user_id: otherId,
        other_username: prof?.username ?? 'hunter',
        other_avatar_url: prof?.avatar_url ?? null,
      } as Conversation);

      const initial = await fetchMessages(conversationId);
      if (cancelled) return;
      setMessages(initial);
      lastTsRef.current = initial.length > 0 ? initial[initial.length - 1].created_at : null;
      setLoading(false);
      // Mark addressed-to-me as read (best-effort).
      markConversationRead(conversationId, user.id).catch(() => {});
    })();
    return () => { cancelled = true; };
  }, [conversationId, user]);

  // ---- 5s delta poll while open ---------------------------------------
  useEffect(() => {
    if (!user || loading) return;
    const tick = async () => {
      const since = lastTsRef.current;
      const fresh = await fetchMessages(conversationId, since ?? undefined);
      if (fresh.length === 0) return;
      // For each fresh row, if it matches the OLDEST pending temp by
      // (sender, content), consume that temp (drop it from local state)
      // — this guarantees one-to-one pairing even when the user sends
      // two identical messages in a row.
      const consumedTempIds = new Set<string>();
      for (const f of fresh) {
        const idx = pendingTempsRef.current.findIndex(
          (t) => t.sender === f.sender_id && t.content === f.content
        );
        if (idx >= 0) {
          consumedTempIds.add(pendingTempsRef.current[idx].tempId);
          pendingTempsRef.current.splice(idx, 1);
        }
      }
      setMessages((prev) => {
        const next = consumedTempIds.size > 0
          ? prev.filter((m) => !consumedTempIds.has(m.id))
          : prev;
        // Dedup by id to defend against any other source of double-insert.
        const seen = new Set(next.map((m) => m.id));
        const additions = fresh.filter((f) => !seen.has(f.id));
        return [...next, ...additions];
      });
      lastTsRef.current = fresh[fresh.length - 1].created_at;
      // Only mark-read when at least one fresh message is addressed to me;
      // avoids a write storm on conversations where I'm only sending.
      if (fresh.some((f) => f.receiver_id === user.id && f.read_at === null)) {
        markConversationRead(conversationId, user.id).catch(() => {});
      }
    };
    const t = window.setInterval(() => { tick().catch(() => {}); }, 5000);
    return () => window.clearInterval(t);
  }, [conversationId, user, loading]);

  // ---- auto-scroll on new messages ------------------------------------
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const handleSend = async () => {
    if (!user || !conv || sending) return;
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    const tempId = `temp-${Date.now()}`;
    const optimistic: ChatMessage = {
      id: tempId,
      sender_id: user.id,
      receiver_id: conv.other_user_id!,
      conversation_id: conversationId,
      listing_id: conv.listing_id,
      listing_kind: conv.listing_kind,
      content: body,
      read_at: null,
      created_at: new Date().toISOString(),
    };
    pendingTempsRef.current.push({ tempId, sender: user.id, content: body });
    setMessages((prev) => [...prev, optimistic]);
    setDraft('');

    const { message, error: sErr } = await sendMessage({
      conversationId,
      receiverId: conv.other_user_id!,
      content: body,
      listingId: conv.listing_id,
      listingKind: conv.listing_kind,
    });
    setSending(false);
    if (sErr || !message) {
      // Rollback
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      pendingTempsRef.current = pendingTempsRef.current.filter((t) => t.tempId !== tempId);
      setError(sErr || 'Send failed');
      window.setTimeout(() => setError(null), 3000);
      setDraft(body); // restore so user can retry
      return;
    }
    // Replace temp with real row in-place, and consume the pending pairing
    // so the next poll doesn't try to dedup it a second time.
    setMessages((prev) => prev.map((m) => (m.id === tempId ? message : m)));
    pendingTempsRef.current = pendingTempsRef.current.filter((t) => t.tempId !== tempId);
    lastTsRef.current = message.created_at;
  };

  const otherInitial = (conv?.other_username || 'h').slice(0, 1).toUpperCase();

  return (
    <div style={styles.page}>
      <header style={styles.topBar}>
        <button onClick={onBack} style={styles.iconBtn} aria-label="Back to inbox">
          <ArrowLeft size={20} />
        </button>
        <button
          onClick={() => conv?.other_username && navigate(`/profile/${conv.other_username}`)}
          style={styles.chatHeaderBtn}
          aria-label={conv?.other_username ? `View @${conv.other_username}` : 'Recipient'}
          disabled={!conv?.other_username}
        >
          {conv?.other_avatar_url ? (
            <ImageWithFade
              src={toThumbUrl(conv.other_avatar_url) ?? conv.other_avatar_url}
              fallbackSrc={conv.other_avatar_url}
              alt={conv.other_username || 'user'}
              style={styles.avatarImgSm}
            />
          ) : (
            <div style={styles.avatarFallbackSm}>{otherInitial}</div>
          )}
          <span style={styles.chatHeaderName}>@{conv?.other_username || '…'}</span>
        </button>
        {conv?.listing_id && (
          <button
            onClick={() => conv.listing_id && navigate(
              conv.listing_kind === 'community_post' ? `/find/${conv.listing_id}` : `/listing/${conv.listing_id}`
            )}
            style={styles.iconBtn}
            aria-label="Open linked listing"
          >
            <Tag size={18} />
          </button>
        )}
      </header>

      <div ref={scrollRef} style={styles.chatScroll}>
        {loading ? (
          <div style={styles.stateBlock}>
            <Loader size={22} style={{ color: 'var(--color-primary-500)', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : messages.length === 0 ? (
          <div style={styles.stateBlock}>
            <span style={styles.stateMuted}>Say hello — no messages yet.</span>
          </div>
        ) : (
          <ul style={styles.bubbleList}>
            {messages.map((m) => {
              const mine = m.sender_id === user!.id;
              return (
                <li key={m.id} style={{ ...styles.bubbleRow, justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                  <div style={{ ...styles.bubble, ...(mine ? styles.bubbleMine : styles.bubbleTheirs) }}>
                    <span style={styles.bubbleText}>{m.content}</span>
                    <span style={styles.bubbleTime}>{formatTime(m.created_at)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Sticky composer. Padding-bottom respects the iOS keyboard / safe-area
          inset so the input is never hidden behind the home indicator. */}
      <div style={styles.composer}>
        {error && <div style={styles.errorBanner}>{error}</div>}
        <div style={styles.composerRow}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write a message…"
            style={styles.input}
            rows={1}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <button
            onClick={handleSend}
            disabled={sending || draft.trim().length === 0}
            style={{
              ...styles.sendBtn,
              opacity: (sending || draft.trim().length === 0) ? 0.55 : 1,
              cursor: (sending || draft.trim().length === 0) ? 'not-allowed' : 'pointer',
            }}
            aria-label="Send message"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// helpers
// =====================================================================
function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString();
}

// =====================================================================
// styles
// =====================================================================
const styles: Record<string, CSSProperties> = {
  page: { height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--color-neutral-50)', overflow: 'hidden' },
  topBar: {
    flexShrink: 0, display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
    padding: 'var(--space-3) var(--space-4)',
    paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)',
    backgroundColor: 'var(--color-neutral-0)', borderBottom: '1px solid var(--color-neutral-200)',
    position: 'sticky', top: 0, zIndex: 10,
  },
  topTitle: { flex: 1, textAlign: 'center', fontWeight: 700, fontSize: 'var(--font-size-base)', color: 'var(--color-neutral-900)' },
  iconBtn: {
    width: 44, height: 44, borderRadius: 'var(--radius-full)', border: 'none',
    backgroundColor: 'transparent', color: 'var(--color-neutral-800)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
  },
  chatHeaderBtn: {
    flex: 1, minHeight: 44, display: 'flex', alignItems: 'center', gap: 8,
    background: 'transparent', border: 'none', padding: '0 4px', cursor: 'pointer', textAlign: 'left',
  },
  chatHeaderName: { fontSize: 'var(--font-size-base)', fontWeight: 700, color: 'var(--color-neutral-900)' },
  scroll: { flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' },
  chatScroll: {
    flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch',
    padding: 'var(--space-3) var(--space-4)',
  },
  list: { listStyle: 'none', margin: 0, padding: 0 },
  row: {
    width: '100%', display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
    padding: 'var(--space-3) var(--space-4)', minHeight: 72,
    background: 'transparent', border: 'none', borderBottom: '1px solid var(--color-neutral-200)',
    cursor: 'pointer', textAlign: 'left',
  },
  rowMeta: { flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
  rowName: { fontSize: 'var(--font-size-base)', color: 'var(--color-neutral-900)' },
  rowPreview: {
    fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-600)',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
  },
  rowChip: {
    display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4,
    fontSize: 'var(--font-size-xs)', color: 'var(--color-primary-700)',
    backgroundColor: 'var(--color-primary-50)', padding: '2px 8px',
    borderRadius: 'var(--radius-full)', alignSelf: 'flex-start',
  },
  rowRight: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 },
  rowTime: { fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-500)' },
  unreadDot: {
    minWidth: 20, height: 20, padding: '0 6px',
    borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-primary-500)',
    color: '#fff', fontSize: 11, fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  avatarImg: { width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 },
  avatarFallback: {
    width: 44, height: 44, borderRadius: '50%',
    backgroundColor: 'var(--color-primary-100)', color: 'var(--color-primary-700)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 700, fontSize: 18, flexShrink: 0,
  },
  avatarImgSm: { width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' },
  avatarFallbackSm: {
    width: 32, height: 32, borderRadius: '50%',
    backgroundColor: 'var(--color-primary-100)', color: 'var(--color-primary-700)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 700, fontSize: 14,
  },
  bubbleList: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 },
  bubbleRow: { display: 'flex' },
  bubble: {
    maxWidth: '78%', padding: '8px 12px',
    borderRadius: 'var(--radius-lg)',
    display: 'flex', flexDirection: 'column', gap: 4,
    boxShadow: '0 1px 1px rgba(0,0,0,0.04)',
  },
  bubbleMine: {
    backgroundColor: 'var(--color-primary-500)', color: '#fff',
    borderBottomRightRadius: 6,
  },
  bubbleTheirs: {
    backgroundColor: 'var(--color-neutral-0)', color: 'var(--color-neutral-900)',
    border: '1px solid var(--color-neutral-200)',
    borderBottomLeftRadius: 6,
  },
  bubbleText: { fontSize: 'var(--font-size-sm)', lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  bubbleTime: { fontSize: 10, opacity: 0.7, alignSelf: 'flex-end' },
  composer: {
    flexShrink: 0,
    backgroundColor: 'var(--color-neutral-0)',
    borderTop: '1px solid var(--color-neutral-200)',
    padding: 'var(--space-2) var(--space-3)',
    paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)',
  },
  composerRow: { display: 'flex', gap: 8, alignItems: 'flex-end' },
  input: {
    flex: 1, minHeight: 44, maxHeight: 120,
    padding: '10px 12px', borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--color-neutral-200)',
    fontSize: 'var(--font-size-base)', lineHeight: 1.4,
    fontFamily: 'inherit', resize: 'none',
    backgroundColor: 'var(--color-neutral-50)',
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 'var(--radius-full)',
    border: 'none', backgroundColor: 'var(--color-primary-500)',
    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  errorBanner: {
    backgroundColor: 'var(--color-error-50, #fef2f2)',
    color: 'var(--color-error-700, #b91c1c)',
    padding: '6px 12px', borderRadius: 'var(--radius-md)',
    fontSize: 'var(--font-size-xs)', marginBottom: 6,
  },
  stateBlock: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: 'var(--space-2)', padding: 'var(--space-6) var(--space-4)', textAlign: 'center',
  },
  stateScreen: {
    height: '100%', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 'var(--space-3)',
    padding: 'var(--space-4)', textAlign: 'center',
  },
  stateTitle: { fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--color-neutral-900)' },
  stateMuted: { fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-600)', maxWidth: 360 },
  primaryBtn: {
    minHeight: 48, padding: '12px 20px', borderRadius: 'var(--radius-md)',
    border: 'none', backgroundColor: 'var(--color-primary-500)', color: '#fff',
    fontWeight: 700, cursor: 'pointer',
  },
};
