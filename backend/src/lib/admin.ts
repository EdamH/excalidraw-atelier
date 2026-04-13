const adminEmails: Set<string> = new Set(
  (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0)
);

export function isAdminEmail(email: string): boolean {
  return adminEmails.has(email.toLowerCase());
}
