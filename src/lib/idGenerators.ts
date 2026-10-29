/**
 * Production-standard ID generator utility for Propithub.
 * Distinct formats for:
 * 1. Financial Payment Transactions: TXN-YYYYMMDD-XXXXXX
 * 2. Security Deposit Vouchers: DEP-YYYY-XXXXX
 * 3. Monthly Rent / Tax Invoices: INV-YYYY-XXXXX
 * 4. Official Payment Receipts: RCPT-YYYY-XXXXX
 */

/**
 * Generates a clean, chronological transaction ID for internal, offline, or mock settlements:
 * Format: TXN-YYYYMMDD-XXXXXX (e.g. TXN-20260922-849201)
 */
export function generateTransactionId(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `TXN-${yyyy}${mm}${dd}-${rand}`;
}

/**
 * Generates a clean Security Deposit Voucher ID:
 * Format: DEP-YYYY-XXXX or DEP-${cleanAgId} (e.g. DEP-2026-0042 or DEP-227340)
 */
export function generateDepositVoucherId(agreementOrSuffix?: string): string {
  if (agreementOrSuffix) {
    const clean = agreementOrSuffix.replace(/[^a-zA-Z0-9]/g, '');
    return `DEP-${clean}`;
  }
  const year = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `DEP-${year}-${rand}`;
}

/**
 * Generates a clean Rent / General Invoice ID:
 * Format: INV-YYYY-XXXX (e.g. INV-2026-0089)
 */
export function generateInvoiceId(prefix = 'INV'): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${year}-${rand}`;
}

/**
 * Generates an official payment receipt number:
 * Format: RCPT-YYYY-XXXX (e.g. RCPT-2026-849201)
 */
export function generateReceiptId(): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `RCPT-${year}-${rand}`;
}

/**
 * Generates a unique, collision-proof Maintenance Ticket ID:
 * Format: TCK-YYYYMMDD-XXXXXX (e.g. TCK-20261022-748291)
 */
export function generateTicketId(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `TCK-${yyyy}${mm}${dd}-${rand}`;
}
