/**
 * A Firestore REST document, as plain JavaScript (October audit, correctness
 * debt).
 *
 * The participant view and the check-in screen first read a game over REST,
 * before the SDK's listener attaches, and there were THREE copies of this
 * decoder — already drifted: the participant view's resync-on-wake copy dropped
 * `timestampValue`, so any timestamp in the document came back null whenever a
 * phone woke up. One decoder, tested.
 *
 * Unknown value kinds decode to null rather than throwing: a field written by a
 * newer build must not take the whole screen down.
 */
export function fromRestValue(v: any): any {
  if (!v || typeof v !== 'object') return null;
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('referenceValue' in v) return v.referenceValue;
  if ('geoPointValue' in v) return v.geoPointValue;
  if ('arrayValue' in v) return (v.arrayValue?.values || []).map(fromRestValue);
  if ('mapValue' in v) return fromRestFields(v.mapValue?.fields);
  return null;
}

/** The `fields` of a REST document, decoded. */
export function fromRestFields(fields: Record<string, any> | null | undefined): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, fv] of Object.entries(fields || {})) out[k] = fromRestValue(fv);
  return out;
}
