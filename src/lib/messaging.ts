import { supabase } from './supabase';
import { assertClean, GUIDELINE_MESSAGE } from './contentFilter';

export type ListingKind = 'marketplace' | 'community_post' | 'external_listing';

export interface Conversation {
  id: string;
  user_a_id: string;
  user_b_id: string;
  listing_id: string | null;
  listing_kind: ListingKind | null;
  last_message_at: string;
  last_message_preview: string;
  created_at: string;
  // Resolved client-side from the joined profiles row for the *other* user:
  other_user_id?: string;
  other_username?: string;
  other_avatar_url?: string | null;
  unread_count?: number;
}

export interface ChatMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  conversation_id: string | null;
  listing_id: string | null;
  listing_kind: ListingKind | null;
  content: string;
  read_at: string | null;
  created_at: string;
}

/**
 * Resolve an existing conversation between the current user and `otherUserId`
 * (optionally scoped to a listing). If none exists, create one. The DB RPC
 * is SECURITY DEFINER so the pair-ordering invariant is enforced server-side.
 */
export async function getOrCreateConversation(input: {
  otherUserId: string;
  listingId?: string | null;
  listingKind?: ListingKind | null;
}): Promise<{ conversationId: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('get_or_create_conversation', {
    p_other_user: input.otherUserId,
    p_listing_id: input.listingId ?? null,
    p_listing_kind: input.listingKind ?? null,
  });
  if (error) return { conversationId: null, error: error.message };
  return { conversationId: (data as unknown) as string, error: null };
}

/**
 * Send a message. The DB INSERT policy requires that the caller is the
 * sender and a member of the conversation, so a forged conversation_id
 * is rejected server-side.
 */
export async function sendMessage(input: {
  conversationId: string;
  receiverId: string;
  content: string;
  listingId?: string | null;
  listingKind?: ListingKind | null;
}): Promise<{ message: ChatMessage | null; error: string | null }> {
  const body = input.content.trim();
  if (!body) return { message: null, error: 'Message cannot be empty' };
  if (assertClean(body).blocked) return { message: null, error: GUIDELINE_MESSAGE };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { message: null, error: 'Not signed in' };

  const { data, error } = await supabase
    .from('messages')
    .insert({
      sender_id: user.id,
      receiver_id: input.receiverId,
      conversation_id: input.conversationId,
      listing_id: input.listingId ?? null,
      listing_kind: input.listingKind ?? null,
      content: body,
    })
    .select('*')
    .single();

  if (error) return { message: null, error: error.message };

  // Best-effort: bump the conversation's last_message_at preview. Failure
  // here is non-fatal — the inbox falls back to MAX(messages.created_at).
  await supabase
    .from('conversations')
    .update({
      last_message_at: new Date().toISOString(),
      last_message_preview: body.slice(0, 140),
    })
    .eq('id', input.conversationId);

  return { message: data as ChatMessage, error: null };
}

/**
 * Fetch all conversations the current user is a member of, ordered most
 * recent first. Attaches the *other* user's username/avatar so the inbox
 * can render without an extra round trip.
 */
export async function fetchConversations(userId: string): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from('conversations')
    .select(`
      id, user_a_id, user_b_id, listing_id, listing_kind,
      last_message_at, last_message_preview, created_at,
      profile_a:profiles!conversations_user_a_id_fkey ( username, avatar_url ),
      profile_b:profiles!conversations_user_b_id_fkey ( username, avatar_url )
    `)
    .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
    .order('last_message_at', { ascending: false })
    .limit(100);

  if (error || !data) {
    // The named FK relationships above may not be auto-discoverable; fall back
    // to a simple fetch and resolve the other-user profile per row.
    const { data: plain } = await supabase
      .from('conversations')
      .select('*')
      .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
      .order('last_message_at', { ascending: false })
      .limit(100);
    if (!plain) return [];
    const otherIds = Array.from(new Set(plain.map((c: any) =>
      c.user_a_id === userId ? c.user_b_id : c.user_a_id
    )));
    const profMap = new Map<string, { username: string; avatar_url: string | null }>();
    if (otherIds.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', otherIds);
      (profs ?? []).forEach((p: any) => profMap.set(p.id, { username: p.username, avatar_url: p.avatar_url }));
    }
    return plain.map((c: any) => {
      const otherId = c.user_a_id === userId ? c.user_b_id : c.user_a_id;
      const prof = profMap.get(otherId);
      return {
        ...c,
        other_user_id: otherId,
        other_username: prof?.username ?? 'hunter',
        other_avatar_url: prof?.avatar_url ?? null,
      } as Conversation;
    });
  }

  return (data as any[]).map((c) => {
    const isA = c.user_a_id === userId;
    const other = isA ? c.profile_b : c.profile_a;
    const otherId = isA ? c.user_b_id : c.user_a_id;
    return {
      id: c.id,
      user_a_id: c.user_a_id,
      user_b_id: c.user_b_id,
      listing_id: c.listing_id,
      listing_kind: c.listing_kind,
      last_message_at: c.last_message_at,
      last_message_preview: c.last_message_preview ?? '',
      created_at: c.created_at,
      other_user_id: otherId,
      other_username: other?.username ?? 'hunter',
      other_avatar_url: other?.avatar_url ?? null,
    } as Conversation;
  });
}

/**
 * Page through messages in a conversation, oldest first. RLS guarantees
 * non-members get an empty result.
 */
export async function fetchMessages(conversationId: string, sinceIso?: string): Promise<ChatMessage[]> {
  let q = supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(500);
  if (sinceIso) q = q.gt('created_at', sinceIso);
  const { data, error } = await q;
  if (error || !data) return [];
  return data as ChatMessage[];
}

/**
 * Mark all messages addressed to the current user in this conversation as
 * read. Idempotent — read_at is only set when NULL.
 */
export async function markConversationRead(conversationId: string, userId: string): Promise<void> {
  await supabase
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('receiver_id', userId)
    .is('read_at', null);
}

/**
 * Count unread messages addressed to `userId` across all conversations.
 * Used by the inbox badge.
 */
export async function fetchUnreadCount(userId: string): Promise<number> {
  const { count } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('receiver_id', userId)
    .is('read_at', null);
  return count ?? 0;
}
