import { useState, useRef } from 'react';
import { ArrowLeft, Send, Clock, MapPin, DollarSign, Users, Shield, Image, Gavel, Package, Zap, TriangleAlert as AlertTriangle, CircleCheck as CheckCircle, User } from 'lucide-react';

type MessagesView = 'inbox' | 'conversation';

type ThreadType = 'scout' | 'auction' | 'radar' | 'pickup' | 'system';
type CoordStatus = 'awaiting' | 'confirmed' | 'active' | 'scheduled' | 'pending' | 'backup';

interface Thread {
  id: string;
  type: ThreadType;
  username: string;
  lastMessage: string;
  timestamp: string;
  unread: number;
  verified: boolean;
  coordStatus: CoordStatus;
  itemTitle?: string;
}

interface Message {
  id: string;
  sender: 'me' | 'other' | 'system';
  text: string;
  timestamp: string;
  type?: 'text' | 'item-card' | 'auction-card' | 'action';
}

const threads: Thread[] = [
  {
    id: '1',
    type: 'scout',
    username: 'dallas_picker',
    lastMessage: 'I can inspect the credenza tomorrow morning. Want me to check the joints?',
    timestamp: '2m ago',
    unread: 2,
    verified: true,
    coordStatus: 'confirmed',
    itemTitle: 'Mid-Century Danish Teak Credenza',
  },
  {
    id: '2',
    type: 'auction',
    username: 'chi_town_scout',
    lastMessage: 'Current bid just jumped to $1,950. Should I hold or bid higher?',
    timestamp: '15m ago',
    unread: 1,
    verified: true,
    coordStatus: 'active',
    itemTitle: 'Complete Eames Shell Chair Set',
  },
  {
    id: '3',
    type: 'radar',
    username: 'vintage_eye',
    lastMessage: 'Found a Submariner that matches your search. Sending photos now.',
    timestamp: '1h ago',
    unread: 3,
    verified: true,
    coordStatus: 'awaiting',
    itemTitle: 'Rolex Submariner Pre-2010',
  },
  {
    id: '4',
    type: 'pickup',
    username: 'phx_treasure',
    lastMessage: 'Pickup confirmed for Saturday 10am. I\'ll bring padding for transport.',
    timestamp: '3h ago',
    unread: 0,
    verified: true,
    coordStatus: 'scheduled',
    itemTitle: 'Storage Unit Lot #47',
  },
  {
    id: '5',
    type: 'system',
    username: 'TreasureTrail',
    lastMessage: 'Your auction for "Hemingway Collection" ends in 5 hours. 3 scouts available nearby.',
    timestamp: '4h ago',
    unread: 1,
    verified: true,
    coordStatus: 'pending',
  },
  {
    id: '6',
    type: 'scout',
    username: 'barn_find_bill',
    lastMessage: 'Hey, I saw your request for the N64 set. I know a guy in Nashville who has one.',
    timestamp: '1d ago',
    unread: 0,
    verified: false,
    coordStatus: 'awaiting',
    itemTitle: 'Nintendo 64 Complete Set',
  },
  {
    id: '7',
    type: 'auction',
    username: 'nyc_finds',
    lastMessage: 'Backup scout standing by. Let me know if you need me to jump in.',
    timestamp: '2d ago',
    unread: 0,
    verified: true,
    coordStatus: 'backup',
    itemTitle: 'Omega Seamaster 300',
  },
];

const conversationMessages: Message[] = [
  { id: '1', sender: 'other', text: 'Hey! I saw your request for inspection help on the credenza.', timestamp: '10:30 AM' },
  { id: '2', sender: 'me', text: 'Great! Can you check it out before the auction ends tomorrow?', timestamp: '10:32 AM' },
  { id: '3', sender: 'other', text: 'Absolutely. I\'m free tomorrow morning. I\'ll check the joints, finish quality, and any damage.', timestamp: '10:34 AM' },
  { id: '4', sender: 'system', text: 'Scout confirmed availability for inspection', timestamp: '10:35 AM', type: 'action' },
  { id: '5', sender: 'me', text: 'Perfect. Here\'s the auction listing for reference:', timestamp: '10:36 AM' },
  { id: '6', sender: 'me', text: '', timestamp: '10:36 AM', type: 'auction-card' },
  { id: '7', sender: 'other', text: 'Got it. I know this auction house well. They\'re reputable. I\'ll be there at 9am.', timestamp: '10:40 AM' },
  { id: '8', sender: 'other', text: 'I can inspect the credenza tomorrow morning. Want me to check the joints?', timestamp: '10:42 AM' },
  { id: '9', sender: 'me', text: 'Yes please! Also check for any water damage or veneer issues. Budget max is $650.', timestamp: '10:45 AM' },
];

const quickActions = [
  { label: 'Send Auction Link', icon: Gavel },
  { label: 'Request Pickup', icon: Package },
  { label: 'Share Flash Find', icon: Zap },
  { label: 'Negotiate Budget', icon: DollarSign },
  { label: 'Confirm Availability', icon: CheckCircle },
  { label: 'Recruit Backup', icon: Users },
];

const threadTypeLabels: Record<ThreadType, string> = {
  scout: 'Scout',
  auction: 'Auction',
  radar: 'Rare Radar',
  pickup: 'Pickup',
  system: 'System',
};

const threadTypeColors: Record<ThreadType, { bg: string; text: string }> = {
  scout: { bg: 'var(--color-primary-50)', text: 'var(--color-primary-700)' },
  auction: { bg: 'var(--color-accent-50)', text: 'var(--color-accent-700)' },
  radar: { bg: 'var(--color-secondary-50)', text: 'var(--color-secondary-700)' },
  pickup: { bg: 'var(--color-warning-50)', text: 'var(--color-warning-700)' },
  system: { bg: 'var(--color-neutral-100)', text: 'var(--color-neutral-600)' },
};

const statusLabels: Record<CoordStatus, string> = {
  awaiting: 'Awaiting Response',
  confirmed: 'Scout Confirmed',
  active: 'Auction Active',
  scheduled: 'Pickup Scheduled',
  pending: 'Shipping Pending',
  backup: 'Backup Scout Needed',
};

const statusColors: Record<CoordStatus, { bg: string; text: string }> = {
  awaiting: { bg: 'var(--color-warning-50)', text: 'var(--color-warning-700)' },
  confirmed: { bg: 'var(--color-success-50)', text: 'var(--color-success-700)' },
  active: { bg: 'var(--color-error-50)', text: 'var(--color-error-700)' },
  scheduled: { bg: 'var(--color-primary-50)', text: 'var(--color-primary-700)' },
  pending: { bg: 'var(--color-neutral-100)', text: 'var(--color-neutral-600)' },
  backup: { bg: 'var(--color-secondary-50)', text: 'var(--color-secondary-700)' },
};

export default function Messages({ onBack }: { onBack: () => void }) {
  const [view, setView] = useState<MessagesView>('inbox');
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);

  const handleOpenThread = (thread: Thread) => {
    setSelectedThread(thread);
    setView('conversation');
  };

  if (view === 'conversation' && selectedThread) {
    return (
      <ConversationView
        thread={selectedThread}
        onBack={() => setView('inbox')}
      />
    );
  }

  return <InboxView threads={threads} onOpenThread={handleOpenThread} onBack={onBack} />;
}

function InboxView({
  threads,
  onOpenThread,
  onBack,
}: {
  threads: Thread[];
  onOpenThread: (t: Thread) => void;
  onBack: () => void;
}) {
  const [filter, setFilter] = useState<ThreadType | 'all'>('all');
  const filtered = filter === 'all' ? threads : threads.filter((t) => t.type === filter);
  const totalUnread = threads.reduce((sum, t) => sum + t.unread, 0);

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.headerRow}>
          <button onClick={onBack} style={styles.backBtn}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 style={styles.title}>Messages</h1>
            {totalUnread > 0 && (
              <span style={styles.unreadSummary}>{totalUnread} unread</span>
            )}
          </div>
        </div>
      </header>

      <div style={styles.filterRow}>
        <button
          onClick={() => setFilter('all')}
          style={{ ...styles.filterChip, ...(filter === 'all' ? styles.filterChipActive : {}) }}
        >
          All
        </button>
        {(['scout', 'auction', 'radar', 'pickup', 'system'] as ThreadType[]).map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            style={{ ...styles.filterChip, ...(filter === t ? styles.filterChipActive : {}) }}
          >
            {threadTypeLabels[t]}
          </button>
        ))}
      </div>

      <div style={styles.threadList}>
        {filtered.map((thread, index) => (
          <button
            key={thread.id}
            onClick={() => onOpenThread(thread)}
            style={{ ...styles.threadItem, animationDelay: `${index * 60}ms` }}
          >
            <div style={styles.threadAvatar}>
              <User size={18} style={{ color: 'var(--color-neutral-400)' }} />
              {thread.verified && (
                <div style={styles.threadVerifiedBadge}>
                  <Shield size={8} style={{ color: 'var(--color-neutral-0)' }} />
                </div>
              )}
            </div>

            <div style={styles.threadContent}>
              <div style={styles.threadTopRow}>
                <span style={styles.threadUsername}>@{thread.username}</span>
                <span style={styles.threadTime}>{thread.timestamp}</span>
              </div>
              <div style={styles.threadMiddle}>
                <span
                  style={{
                    ...styles.threadTypeBadge,
                    backgroundColor: threadTypeColors[thread.type].bg,
                    color: threadTypeColors[thread.type].text,
                  }}
                >
                  {threadTypeLabels[thread.type]}
                </span>
                <span
                  style={{
                    ...styles.threadStatusBadge,
                    backgroundColor: statusColors[thread.coordStatus].bg,
                    color: statusColors[thread.coordStatus].text,
                  }}
                >
                  {statusLabels[thread.coordStatus]}
                </span>
              </div>
              {thread.itemTitle && (
                <span style={styles.threadItemTitle}>{thread.itemTitle}</span>
              )}
              <p style={styles.threadPreview}>{thread.lastMessage}</p>
            </div>

            {thread.unread > 0 && (
              <div style={styles.unreadBadge}>
                <span style={styles.unreadCount}>{thread.unread}</span>
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function ConversationView({
  thread,
  onBack,
}: {
  thread: Thread;
  onBack: () => void;
}) {
  const [showActions, setShowActions] = useState(false);
  const [draft, setDraft] = useState('');
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sendMessage = () => {
    const text = draft.trim();
    if (!text) return;
    setLocalMessages((prev) => [...prev, {
      id: `local-${Date.now()}`,
      sender: 'me',
      text,
      timestamp: 'Just now',
      type: 'text',
    }]);
    setDraft('');
  };

  return (
    <div style={styles.container}>
      <header style={styles.convHeader}>
        <button onClick={onBack} style={styles.backBtn}>
          <ArrowLeft size={20} />
        </button>
        <div style={styles.convHeaderInfo}>
          <div style={styles.convHeaderTop}>
            <span style={styles.convUsername}>@{thread.username}</span>
            {thread.verified && (
              <Shield size={12} style={{ color: 'var(--color-primary-500)' }} />
            )}
          </div>
          <span
            style={{
              ...styles.convStatus,
              color: statusColors[thread.coordStatus].text,
            }}
          >
            {statusLabels[thread.coordStatus]}
          </span>
        </div>
        <TrustIndicator verified={thread.verified} />
      </header>

      {thread.itemTitle && (
        <div style={styles.convItemBar}>
          <span style={styles.convItemLabel}>Re: {thread.itemTitle}</span>
          <span
            style={{
              ...styles.threadTypeBadge,
              backgroundColor: threadTypeColors[thread.type].bg,
              color: threadTypeColors[thread.type].text,
            }}
          >
            {threadTypeLabels[thread.type]}
          </span>
        </div>
      )}

      <div style={styles.messagesList}>
        {[...conversationMessages, ...localMessages].map((msg) => {
          if (msg.type === 'auction-card') {
            return <AuctionReferenceCard key={msg.id} />;
          }
          if (msg.type === 'action') {
            return (
              <div key={msg.id} style={styles.systemMessage}>
                <CheckCircle size={12} style={{ color: 'var(--color-success-500)' }} />
                <span style={styles.systemText}>{msg.text}</span>
                <span style={styles.systemTime}>{msg.timestamp}</span>
              </div>
            );
          }
          return (
            <div
              key={msg.id}
              style={{
                ...styles.messageBubbleWrap,
                justifyContent: msg.sender === 'me' ? 'flex-end' : 'flex-start',
              }}
            >
              <div
                style={{
                  ...styles.messageBubble,
                  ...(msg.sender === 'me' ? styles.bubbleMine : styles.bubbleOther),
                }}
              >
                <p style={styles.messageText}>{msg.text}</p>
                <span
                  style={{
                    ...styles.messageTime,
                    color: msg.sender === 'me' ? 'rgba(255,255,255,0.7)' : 'var(--color-neutral-400)',
                  }}
                >
                  {msg.timestamp}
                </span>
              </div>
            </div>
          );
        })}

        <div style={styles.typingIndicator}>
          <div style={styles.typingDots}>
            <span style={styles.dot} />
            <span style={{ ...styles.dot, animationDelay: '0.2s' }} />
            <span style={{ ...styles.dot, animationDelay: '0.4s' }} />
          </div>
          <span style={styles.typingText}>@{thread.username} is typing...</span>
        </div>
      </div>

      {showActions && (
        <div style={styles.actionsPanel}>
          <div style={styles.actionsGrid}>
            {quickActions.map((action) => (
              <button
                key={action.label}
                onClick={() => setShowActions(false)}
                style={styles.quickActionBtn}
              >
                <action.icon size={16} style={{ color: 'var(--color-primary-600)' }} />
                <span style={styles.quickActionLabel}>{action.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={styles.inputBar}>
        <button
          onClick={() => setShowActions(!showActions)}
          style={{
            ...styles.plusBtn,
            ...(showActions ? styles.plusBtnActive : {}),
          }}
        >
          <Zap size={18} style={{ color: showActions ? 'var(--color-neutral-0)' : 'var(--color-primary-600)' }} />
        </button>
        <button style={styles.imageBtn} aria-label="Attach image" onClick={() => fileInputRef.current?.click()}>
          <Image size={18} style={{ color: 'var(--color-neutral-400)' }} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              setLocalMessages((prev) => [...prev, {
                id: `local-${Date.now()}`,
                sender: 'me',
                text: `📷 ${f.name}`,
                timestamp: 'Just now',
                type: 'text',
              }]);
            }
            if (e.target) e.target.value = '';
          }}
        />
        <div style={styles.inputWrap}>
          <input
            type="text"
            placeholder="Type a message..."
            style={styles.messageInput}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') sendMessage(); }}
          />
        </div>
        <button
          style={{ ...styles.sendBtn, opacity: draft.trim() ? 1 : 0.5 }}
          aria-label="Send message"
          onClick={sendMessage}
          disabled={!draft.trim()}
        >
          <Send size={18} style={{ color: 'var(--color-neutral-0)' }} />
        </button>
      </div>
    </div>
  );
}

function TrustIndicator({ verified }: { verified: boolean }) {
  if (!verified) {
    return (
      <div style={styles.trustWarning}>
        <AlertTriangle size={12} style={{ color: 'var(--color-warning-600)' }} />
        <span style={styles.trustWarningText}>New</span>
      </div>
    );
  }
  return (
    <div style={styles.trustBadge}>
      <Shield size={12} style={{ color: 'var(--color-success-600)' }} />
      <span style={styles.trustBadgeText}>Trusted</span>
    </div>
  );
}

function AuctionReferenceCard() {
  return (
    <div style={styles.refCardWrap}>
      <div style={styles.refCard}>
        <img
          src="https://images.pexels.com/photos/1350789/pexels-photo-1350789.jpeg?auto=compress&cs=tinysrgb&w=200"
          alt="Auction item"
          style={styles.refCardImage}
        />
        <div style={styles.refCardBody}>
          <h4 style={styles.refCardTitle}>Mid-Century Danish Teak Credenza</h4>
          <div style={styles.refCardMeta}>
            <span style={styles.refCardBid}>
              <DollarSign size={10} /> Current: $380
            </span>
            <span style={styles.refCardTimer}>
              <Clock size={10} /> 2h 14m left
            </span>
          </div>
          <div style={styles.refCardMeta}>
            <span style={styles.refCardLocation}>
              <MapPin size={10} /> Dallas, TX
            </span>
            <span style={styles.refCardScout}>
              <Users size={10} /> 6 scouts
            </span>
          </div>
          <span style={styles.refCardStatus}>Scout Confirmed</span>
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
    backgroundColor: 'var(--color-neutral-0)',
    borderBottom: '1px solid var(--color-neutral-100)',
    flexShrink: 0,
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
  },
  title: {
    fontSize: 'var(--font-size-xl)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
  },
  unreadSummary: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-primary-600)',
    fontWeight: 'var(--font-weight-medium)',
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

  // Filters
  filterRow: {
    display: 'flex',
    gap: 'var(--space-2)',
    padding: 'var(--space-3) var(--space-4)',
    overflow: 'auto',
    borderBottom: '1px solid var(--color-neutral-50)',
    flexShrink: 0,
  },
  filterChip: {
    padding: 'var(--space-1) var(--space-3)',
    borderRadius: 'var(--radius-full)',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-medium)',
    backgroundColor: 'var(--color-neutral-100)',
    color: 'var(--color-neutral-600)',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  filterChipActive: {
    backgroundColor: 'var(--color-neutral-900)',
    color: 'var(--color-neutral-0)',
  },

  // Thread list
  threadList: {
    flex: 1,
    overflow: 'auto',
  },
  threadItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 'var(--space-3)',
    padding: 'var(--space-4)',
    borderBottom: '1px solid var(--color-neutral-50)',
    width: '100%',
    textAlign: 'left',
    animation: 'slideUp 0.3s ease forwards',
    opacity: 0,
    animationFillMode: 'forwards',
  },
  threadAvatar: {
    position: 'relative',
    width: '44px',
    height: '44px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-neutral-100)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  threadVerifiedBadge: {
    position: 'absolute',
    bottom: '-1px',
    right: '-1px',
    width: '16px',
    height: '16px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-primary-500)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '2px solid var(--color-neutral-0)',
  },
  threadContent: {
    flex: 1,
    minWidth: 0,
  },
  threadTopRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '3px',
  },
  threadUsername: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-900)',
  },
  threadTime: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-400)',
  },
  threadMiddle: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    marginBottom: '4px',
  },
  threadTypeBadge: {
    fontSize: '10px',
    fontWeight: 'var(--font-weight-bold)',
    padding: '1px 6px',
    borderRadius: 'var(--radius-full)',
  },
  threadStatusBadge: {
    fontSize: '10px',
    fontWeight: 'var(--font-weight-semibold)',
    padding: '1px 6px',
    borderRadius: 'var(--radius-full)',
  },
  threadItemTitle: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-medium)',
    color: 'var(--color-neutral-600)',
    marginBottom: '2px',
    display: 'block',
  },
  threadPreview: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-500)',
    lineHeight: 'var(--line-height-normal)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  unreadBadge: {
    width: '20px',
    height: '20px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-primary-500)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 'var(--space-2)',
  },
  unreadCount: {
    fontSize: '10px',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-0)',
  },

  // Conversation header
  convHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-3) var(--space-4)',
    borderBottom: '1px solid var(--color-neutral-100)',
    flexShrink: 0,
  },
  convHeaderInfo: {
    flex: 1,
  },
  convHeaderTop: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
  },
  convUsername: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
  },
  convStatus: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-medium)',
  },
  convItemBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-2) var(--space-4)',
    backgroundColor: 'var(--color-neutral-50)',
    borderBottom: '1px solid var(--color-neutral-100)',
    flexShrink: 0,
  },
  convItemLabel: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-600)',
    fontWeight: 'var(--font-weight-medium)',
  },

  // Trust
  trustBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    padding: 'var(--space-1) var(--space-2)',
    backgroundColor: 'var(--color-success-50)',
    borderRadius: 'var(--radius-full)',
    border: '1px solid var(--color-success-100)',
  },
  trustBadgeText: {
    fontSize: '10px',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-success-700)',
  },
  trustWarning: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    padding: 'var(--space-1) var(--space-2)',
    backgroundColor: 'var(--color-warning-50)',
    borderRadius: 'var(--radius-full)',
    border: '1px solid var(--color-warning-100)',
  },
  trustWarningText: {
    fontSize: '10px',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-warning-700)',
  },

  // Messages
  messagesList: {
    flex: 1,
    overflow: 'auto',
    padding: 'var(--space-4)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },
  messageBubbleWrap: {
    display: 'flex',
    width: '100%',
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 'var(--space-3) var(--space-4)',
    borderRadius: 'var(--radius-md)',
  },
  bubbleMine: {
    backgroundColor: 'var(--color-primary-600)',
    borderBottomRightRadius: '4px',
  },
  bubbleOther: {
    backgroundColor: 'var(--color-neutral-100)',
    borderBottomLeftRadius: '4px',
  },
  messageText: {
    fontSize: 'var(--font-size-sm)',
    lineHeight: 'var(--line-height-normal)',
    color: 'inherit',
  },
  messageTime: {
    fontSize: '10px',
    display: 'block',
    marginTop: '4px',
  },
  systemMessage: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-2)',
  },
  systemText: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-success-600)',
    fontWeight: 'var(--font-weight-medium)',
  },
  systemTime: {
    fontSize: '10px',
    color: 'var(--color-neutral-400)',
  },
  typingIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2)',
  },
  typingDots: {
    display: 'flex',
    gap: '3px',
    alignItems: 'center',
  },
  dot: {
    width: '6px',
    height: '6px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-neutral-300)',
    animation: 'pulse 1.2s infinite',
  },
  typingText: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-400)',
  },

  // Reference card
  refCardWrap: {
    display: 'flex',
    justifyContent: 'flex-end',
    width: '100%',
  },
  refCard: {
    display: 'flex',
    gap: 'var(--space-2)',
    maxWidth: '85%',
    padding: 'var(--space-2)',
    backgroundColor: 'var(--color-neutral-50)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-200)',
  },
  refCardImage: {
    width: '56px',
    height: '56px',
    borderRadius: 'var(--radius-sm)',
    objectFit: 'cover',
    flexShrink: 0,
  },
  refCardBody: {
    flex: 1,
    minWidth: 0,
  },
  refCardTitle: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-900)',
    marginBottom: '3px',
    lineHeight: 'var(--line-height-tight)',
  },
  refCardMeta: {
    display: 'flex',
    gap: 'var(--space-2)',
    marginBottom: '2px',
  },
  refCardBid: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    fontSize: '10px',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-800)',
  },
  refCardTimer: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    fontSize: '10px',
    color: 'var(--color-error-600)',
  },
  refCardLocation: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    fontSize: '10px',
    color: 'var(--color-neutral-500)',
  },
  refCardScout: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    fontSize: '10px',
    color: 'var(--color-neutral-500)',
  },
  refCardStatus: {
    fontSize: '10px',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-success-600)',
  },

  // Quick actions
  actionsPanel: {
    padding: 'var(--space-3) var(--space-4)',
    borderTop: '1px solid var(--color-neutral-100)',
    backgroundColor: 'var(--color-neutral-50)',
    flexShrink: 0,
  },
  actionsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 'var(--space-2)',
  },
  quickActionBtn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    padding: 'var(--space-3)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--color-neutral-0)',
    border: '1px solid var(--color-neutral-200)',
  },
  quickActionLabel: {
    fontSize: '10px',
    fontWeight: 'var(--font-weight-medium)',
    color: 'var(--color-neutral-700)',
    textAlign: 'center',
    lineHeight: '1.2',
  },

  // Input bar
  inputBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-3) var(--space-4)',
    borderTop: '1px solid var(--color-neutral-100)',
    backgroundColor: 'var(--color-neutral-0)',
    flexShrink: 0,
  },
  plusBtn: {
    width: '36px',
    height: '36px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-primary-50)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    border: '1px solid var(--color-primary-200)',
  },
  plusBtnActive: {
    backgroundColor: 'var(--color-primary-500)',
    border: '1px solid var(--color-primary-500)',
  },
  imageBtn: {
    width: '36px',
    height: '36px',
    borderRadius: 'var(--radius-md)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  inputWrap: {
    flex: 1,
    padding: 'var(--space-2) var(--space-3)',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-neutral-50)',
    border: '1px solid var(--color-neutral-200)',
  },
  messageInput: {
    width: '100%',
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-900)',
    backgroundColor: 'transparent',
  },
  sendBtn: {
    width: '36px',
    height: '36px',
    borderRadius: 'var(--radius-full)',
    background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-accent-500))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
};
