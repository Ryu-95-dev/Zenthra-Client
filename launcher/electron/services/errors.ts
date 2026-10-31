/** Error carrying a user-facing French message, safe to display in the UI. */
export class UserError extends Error {
  constructor(message: string, readonly detail?: string) {
    super(message);
    this.name = 'UserError';
  }
}

const SECRET_PATTERNS: RegExp[] = [
  /(--accessToken\s+)\S+/gi,
  /("?(?:access_token|refresh_token|accessToken|identityToken|Token|RpsTicket|code)"?\s*[:=]\s*"?)[^",\s}]+/g,
  /(Bearer\s+)[\w.-]+/gi,
  /(XBL3\.0 x=)[^;]+;[\w.-]+/g,
  /(d=)[\w.-]{20,}/g,
];

/** Removes anything that looks like a token before logging. */
export function redact(text: string): string {
  return SECRET_PATTERNS.reduce((t, re) => t.replace(re, '$1[masqué]'), text);
}

export function toMessage(err: unknown): string {
  if (err instanceof UserError) return err.message;
  if (err instanceof Error) return redact(err.message);
  return redact(String(err));
}
