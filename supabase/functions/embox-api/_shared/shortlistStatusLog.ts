export type StatusLogEntry = { status: string; at: string };

/** Build initial status_log array for a new shortlist entry. */
export const createInitialLog = (nextStep: string): StatusLogEntry[] => [
  { status: nextStep, at: new Date().toISOString() },
];

/** Normalize legacy status_log values (string, double-encoded, null) to an array. */
export const normalizeStatusLog = (existing: unknown): StatusLogEntry[] => {
  if (existing == null) return [];

  if (Array.isArray(existing)) {
    return existing.filter(
      (item): item is StatusLogEntry =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as StatusLogEntry).status === 'string' &&
        typeof (item as StatusLogEntry).at === 'string',
    );
  }

  if (typeof existing === 'string') {
    try {
      const parsed: unknown = JSON.parse(existing);
      return normalizeStatusLog(parsed);
    } catch {
      return [];
    }
  }

  return [];
};

/** Append a status entry to an existing log (handles legacy formats). */
export const appendToLog = (existing: unknown, nextStep: string): StatusLogEntry[] => {
  const log = normalizeStatusLog(existing);
  log.push({ status: nextStep, at: new Date().toISOString() });
  return log;
};

const ALLOWED_CONTACT_CHANNELS = new Set(['wechat', 'email', 'phone']);

/** True when promote body includes all outreach fields for atomic contact creation. */
export const isOutreachPromote = (body: Record<string, unknown>): boolean => {
  const { outreachPerson, channel, reason } = body;
  return (
    typeof outreachPerson === 'string' &&
    outreachPerson.trim().length > 0 &&
    typeof channel === 'string' &&
    ALLOWED_CONTACT_CHANNELS.has(channel) &&
    typeof reason === 'string' &&
    reason.trim().length > 0
  );
};
