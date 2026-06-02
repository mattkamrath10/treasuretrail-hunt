/**
 * Unified content-reporting boundary (Apple Guideline 1.2 — a mechanism for
 * users to flag objectionable content).
 *
 * All "Report" surfaces across the app (listings, finds, events, live events,
 * profiles, comments, messages) write to the single `content_reports` table via
 * submitReport(). The table is created in
 * supabase/migrations/20260602000010_apple_ugc_compliance.sql and is applied
 * manually by the project owner. If the migration has not been applied yet,
 * submitReport surfaces a clear error rather than silently dropping the report.
 */
import { supabase } from './supabase';

export type ReportContentType =
  | 'listing'
  | 'find'
  | 'event'
  | 'live_event'
  | 'profile'
  | 'comment'
  | 'message';

export const REPORT_CATEGORIES = [
  'Spam',
  'Scam or fraud',
  'Harassment',
  'Hate speech',
  'Sexual content',
  'Violence',
  'Copyright violation',
  'Other',
] as const;

export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export interface SubmitReportArgs {
  reporterId: string;
  contentType: ReportContentType;
  /** The id of the reported object (uuid or external id). Stored as text. */
  contentId: string;
  /** The author of the reported content, when known. */
  reportedUserId?: string | null;
  category: ReportCategory | string;
  details?: string;
}

export async function submitReport(
  a: SubmitReportArgs,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('content_reports').insert({
    reporter_id: a.reporterId,
    content_type: a.contentType,
    content_id: a.contentId,
    reported_user_id: a.reportedUserId ?? null,
    category: a.category,
    details: (a.details ?? '').trim(),
  });
  if (error) {
    // 42P01 = relation does not exist (migration not applied yet).
    if (error.code === '42P01') {
      return {
        error:
          'Reporting is being set up. Please try again shortly or contact support.',
      };
    }
    return { error: error.message };
  }
  return { error: null };
}

export type ReportStatus = 'pending' | 'reviewing' | 'actioned' | 'dismissed';

export interface ContentReport {
  id: string;
  reporter_id: string;
  content_type: ReportContentType;
  content_id: string;
  reported_user_id: string | null;
  category: string;
  details: string | null;
  status: ReportStatus;
  created_at: string;
}

/**
 * Admin-only queue read. RLS (is_admin()) gates this server-side, so a
 * non-admin simply gets an empty list. Returns `tableMissing` so the UI can
 * show a "migration not applied yet" hint instead of a generic error.
 */
export async function fetchReports(
  status?: ReportStatus,
): Promise<{ reports: ContentReport[]; error: string | null; tableMissing: boolean }> {
  let q = supabase
    .from('content_reports')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) {
    if (error.code === '42P01') return { reports: [], error: null, tableMissing: true };
    return { reports: [], error: error.message, tableMissing: false };
  }
  return { reports: (data ?? []) as ContentReport[], error: null, tableMissing: false };
}

/** Admin-only status update. RLS restricts UPDATE to admins. */
export async function updateReportStatus(
  id: string,
  status: ReportStatus,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('content_reports')
    .update({ status })
    .eq('id', id);
  return { error: error ? error.message : null };
}
