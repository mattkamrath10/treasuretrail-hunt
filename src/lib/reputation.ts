import type { Profile } from './supabase';

/**
 * Profile-completeness score (0..100). Used to drive the home-screen
 * onboarding checklist and the profile "complete your profile" CTA.
 *
 * The weights are intentionally chunky (20 each) so users see meaningful
 * jumps when they fill in a field. Five fields × 20 = 100.
 */
export interface CompletenessBreakdown {
  score: number;
  checks: Array<{ key: string; label: string; done: boolean }>;
}

export function profileCompleteness(profile: Partial<Profile> | null): CompletenessBreakdown {
  const checks = [
    { key: 'username',  label: 'Choose a username',           done: !!profile?.username },
    { key: 'avatar',    label: 'Upload a profile picture',    done: !!profile?.avatar_url },
    { key: 'bio',       label: 'Write a short bio',           done: !!profile?.bio && (profile.bio?.length ?? 0) >= 10 },
    { key: 'categories',label: 'Pick favorite categories',    done: Array.isArray((profile as any)?.favorite_categories) && (profile as any).favorite_categories.length > 0 },
    { key: 'location',  label: 'Set your location',           done: !!(profile as any)?.location_city || !!(profile as any)?.location_state },
  ];
  const done = checks.filter((c) => c.done).length;
  return { score: Math.round((done / checks.length) * 100), checks };
}

/**
 * Human-friendly account age. Used on profile cards.
 */
export function accountAge(createdAt: string | null | undefined): string {
  if (!createdAt) return 'New member';
  const ms = Date.now() - new Date(createdAt).getTime();
  const days = Math.max(0, Math.floor(ms / 86_400_000));
  if (days < 1) return 'Joined today';
  if (days < 30) return `Joined ${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `Joined ${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.floor(months / 12);
  return `Joined ${years} year${years === 1 ? '' : 's'} ago`;
}

/**
 * Star rating helper — clamps to 0..5 and rounds to nearest 0.1 so the
 * displayed value is stable across renders.
 */
export function normalizeReputation(raw: number | null | undefined): number {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : 5;
  return Math.max(0, Math.min(5, Math.round(n * 10) / 10));
}

/**
 * Reputation tier label for badge text. Tuned for real activity, not vanity:
 *   < 3.0  Building
 *   3.0+   Trusted
 *   4.2+   Established
 *   4.7+   Top Hunter
 */
export function reputationTier(raw: number | null | undefined): string {
  const n = normalizeReputation(raw);
  if (n >= 4.7) return 'Top Hunter';
  if (n >= 4.2) return 'Established';
  if (n >= 3.0) return 'Trusted';
  return 'Building';
}
