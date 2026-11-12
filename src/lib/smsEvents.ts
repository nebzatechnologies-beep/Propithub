/**
 * SMS is reserved for major transactions; everything else is email only.
 * Each key is a switch under Superadmin > Integrations > Platform Event Triggers,
 * stored in platformConfig/notifications.notificationToggles.
 * Keep in sync with SMS_EVENT_DEFAULTS in functions/src/index.ts.
 */
export const SMS_EVENT_DEFAULTS: Record<string, boolean> = {
  'SMS: Welcome message': false,
  'SMS: Final deletion warning': true,
  'SMS: Trial ending notice': false,
  'SMS: Autopay advance notice': false,
  'SMS: Autopay failed': true,
  'SMS: Late fee applied': true,
  'SMS: Rent reminder': false,
  'SMS: Lease expiry warning': false,
  'SMS: New rent invoice': false,
  'SMS: Rent payment received': true,
  'SMS: Lease signature request': false,
  'SMS: Lease signed and active': true,
  'SMS: Deposit statement': false,
  'SMS: Deposit refund': true,
  'SMS: Emergency ticket': true,
  'SMS: Ticket updates': false,
  'SMS: Announcement': true,
  'SMS: Cash claim': false,
  'SMS: Cash confirmed': true,
};
