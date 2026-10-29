export type UserRole = 'owner' | 'tenant' | 'manager' | 'staff';

export interface MobileUserProfile {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  phone: string;
  ownerId?: string | null;
  ownerName?: string | null;
  propertyId?: string;
  avatarUrl?: string | null;
  assignedProperties?: string[];
  plan?: string;
  status?: 'active' | 'suspended' | 'pending_activation' | 'past_due' | string;
  notificationPreferences?: {
    emailInvoices: boolean;
    emailMaintenance: boolean;
    emailAnnouncements: boolean;
    inAppReminders: boolean;
    smsAlerts: boolean;
  };
  deletionStatus?: 'none' | 'pending_deletion' | 'deleted';
  deletionRequestedAt?: string | null;
  scheduledPermanentDeletionAt?: string | null;
  hasCompletedTour?: boolean;
  createdAt?: string;
}

export interface MobilePropertyAddress {
  formattedAddress: string;
  city: string;
  state?: string;
  country: string;
  postalCode?: string;
  lat?: number;
  lng?: number;
}

export interface MobileProperty {
  id: string;
  ownerId: string;
  name: string;
  address: MobilePropertyAddress | string;
  propertyType: string; // e.g. Residential Apartment, Commercial Office, Villa, Gated Community
  floorsCount: number;
  yearBuilt?: number;
  country: string;
  currency: string;
  unitCount: number;
  occupied: number;
  amenities: string[];
  amenityPhotos?: { name: string; image: string }[];
  images: string[];
  coverPhotoIndex?: number;
  assignedManagerId?: string;
  rules?: {
    petsAllowed: boolean;
    smokingAllowed: boolean;
    sublettingAllowed: boolean;
    minLeaseMonths: number;
    noticePeriodDays: number;
  };
  createdAt: string;
}

export interface MobileUnit {
  id: string;
  propertyId: string;
  propertyName: string;
  ownerId: string;
  unitNumber: string;
  unitType: string; // 1 BHK, 2 BHK, 3 BHK, Studio, Penthouse, Commercial
  floor: string;
  areaSqFt: number;
  furnishing: 'Unfurnished' | 'Semi-Furnished' | 'Fully Furnished';
  rent: number;
  deposit: number;
  currency: string;
  status: 'occupied' | 'vacant' | 'reserved' | 'maintenance';
  isListedPublicly: boolean;
  tenant?: string | null;
  currentTenantId?: string | null;
  electricityMeter?: string;
  waterMeter?: string;
  images?: string[];
  image?: string;
}

export interface MobileTenantRecord {
  id: string;
  name: string;
  phone: string;
  email: string;
  unit: string;
  propertyId: string;
  propertyName: string;
  ownerId: string;
  leaseStart: string;
  leaseEnd: string;
  rent: number;
  deposit: number;
  currency: string;
  rating: number;
  kycStatus: 'verified' | 'pending' | 'rejected';
  aadhaarNumber?: string;
  panNumber?: string;
  emergencyContact?: { name: string; phone: string; relation: string };
  policeVerificationDone?: boolean;
  unitsRented?: string[];
  kycDocuments?: { title: string; fileUrl?: string; verified?: boolean }[];
  history?: any[];
  status?: 'active' | 'inactive' | 'unmanaged_archive' | 'vacated' | string;
}

export interface MobileAgreement {
  id: string;
  ownerId: string;
  ownerName: string;
  propertyId: string;
  propertyName: string;
  unit: string;
  unitId?: string;
  tenant: string;
  tenantId: string;
  tenantEmail?: string;
  tenantPhone?: string;
  isDraft?: boolean;
  draftStep?: 1 | 2 | 3;
  draftSavedAt?: string;
  start: string;
  end: string;
  rent: number;
  deposit: number;
  currency: string;
  escalationPercent: number;
  lockInMonths: number;
  noticePeriodDays: number;
  dueDay?: number;
  offlineDepositCollected?: boolean;
  offlineDepositRef?: string;
  depositInvoiceId?: string;
  depositStatus?: 'unpaid' | 'paid' | 'waived' | 'refunded';
  documentUrl?: string;
  signedDocumentUrl?: string;
  signedDocumentName?: string;
  renewalProposal?: {
    proposedRent: number;
    proposedStart: string;
    proposedEnd: string;
    proposedBy: 'owner' | 'tenant';
    status: 'pending' | 'accepted' | 'declined';
    declineReason?: string;
    addendumUrl?: string;
  };
  status: 'draft' | 'awaiting_tenant_signature' | 'awaiting_tenant_upload' | 'pending_approval' | 'pending_deposit' | 'active' | 'terminated' | 'expired' | 'cancelled' | 'rejected' | 'unmanaged_archive';
  executionMode: 'digital_dispatch' | 'already_executed_offline';
  specialClauses?: string[];
  rentDueDay?: number;
  autoRenew?: boolean;
  initialAgreementUrl?: string;
  initialAgreementName?: string;
  initialUploadedAt?: string;
  rejectionReason?: string;
  rejectedAt?: string;
  ownerSignedDocumentUrl?: string;
  ownerSignedDocumentName?: string;
  ownerSignedUploadedAt?: string;
  signedUploadedAt?: string;
  approvedAt?: string;
  approvedBy?: string;
  counterSignedAt?: string; // Legacy backwards-compatible alias
  counterSignatory?: string; // Legacy backwards-compatible alias
  renewalTerms?: {
    effectiveDate?: string;
    previousRent?: number;
    newRent?: number;
    percentageIncrease?: number;
    newLeaseEnd?: string;
    acceptedAt?: string;
    ownerNotes?: string;
  };
  tenantSignedAt?: string;
  tenantSignature?: string;
  ownerSignedAt?: string;
  requireTenantId?: boolean;
  requiredIdType?: string;
  requiredIdTypes?: string[];
  requiredIdList?: MobileRequiredIdItem[];
  tenantUploadedIdUrl?: string;
  tenantUploadedIdName?: string;
  tenantUploadedIdAt?: string;
  tenantUploadedIds?: MobileTenantUploadedIdItem[];
  autopay?: MobileTenantAutopayMandate;
  createdAt: string;
}

export interface MobileAgreementTemplate {
  id: string;
  ownerId: string;
  ownerName?: string;
  title: string;
  description?: string;
  propertyId?: string;
  propertyName?: string;
  fileName: string;
  fileData: string;
  fileSizeKb: number;
  fileType?: 'pdf' | 'image' | 'doc' | string;
  uploadedBy?: 'owner' | 'admin' | string;
  uploadedByUserId?: string;
  uploadedAt: string;
  status: 'active' | 'archived' | 'deleted';
  deletedAt?: string;
  deletedBy?: string;
}

export interface MobileTenantAutopayMandate {
  enabled?: boolean;
  status: 'active' | 'paused' | 'failing' | 'cancelled';
  activeGateway: 'stripe' | 'razorpay' | 'easebuzz' | 'paypal';
  mandateToken?: string;
  mandateId?: string;
  customerReferenceId?: string;
  authInstrument?: 'upi' | 'card' | 'netbanking' | 'paypal_account';
  paymentMethodDisplay?: string;
  displayDetails?: string;
  maxAuthorizedAmount?: number;
  rentAmount?: number;
  currency?: string;
  billingDay?: number;
  rentDueDay?: number;
  lastDebitedAt?: string;
  nextDebitDate: string;
  failureCount?: number;
  lastFailureReason?: string;
  optedInAt?: string;
  advanceNoticeSent?: boolean;
  createdAt?: string;
  updatedAt: string;
}

export interface MobileRequiredIdItem {
  id: string;
  name: string; // e.g. 'Voter ID', 'Aadhaar Card', 'Passport', 'Driving License', 'PAN Card'
}

export interface MobileTenantUploadedIdItem {
  id: string;
  name: string; // matches MobileRequiredIdItem name
  fileUrl: string;
  fileName: string;
  fileSize?: number;
  uploadedAt: string;
}

export interface MobileInvoiceItem {
  description: string;
  amount: number;
  quantity?: number;
  rate?: number;
}

export interface MobileInvoice {
  id: string;
  ownerId: string;
  tenant: string;
  tenantId: string;
  unit: string;
  unitId?: string;
  propertyName: string;
  propertyId: string;
  landlordName?: string;
  landlordEmail?: string;
  amount: number;
  tax: number;
  total: number;
  due: string;
  issueDate?: string;
  status: 'sent' | 'paid' | 'overdue' | 'draft' | 'cancelled' | 'pending_confirmation' | 'refunded' | 'void';
  currency: string;
  type: 'rent' | 'deposit' | 'utility' | 'maintenance' | 'task_fee' | 'late_fee';
  invoiceType?: 'rent' | 'deposit' | 'utility' | 'maintenance' | 'task_fee' | 'late_fee';
  items: MobileInvoiceItem[];
  meterReadings?: {
    electricityCurrent?: number;
    electricityPrevious?: number;
    ratePerKwh?: number;
    waterCharges?: number;
  };
  paidAt?: string;
  paymentMethodUsed?: string;
  receiptNumber?: string;
  tenantEmail?: string;
  leaseAgreementId?: string;
  agreementId?: string;
  lateFeeApplied?: number;
  lateFeeWaived?: boolean;
  lateFeeWaivedReason?: string;
  lateFeeCalculation?: string;
  notes?: string;
  createdAt: string;
}

export interface MobileCashHandoverClaim {
  id: string;
  direction: 'inflow' | 'outflow';
  type: 'rent' | 'deposit' | 'deposit_refund' | 'maintenance' | 'other';
  amount: number;
  currency: string;
  ownerId: string;
  tenantId: string;
  tenantName: string;
  unit: string;
  propertyName?: string;
  propertyId?: string;
  invoiceId?: string;
  settlementId?: string;
  transactionId?: string;
  moveOutId?: string;
  claimedBy: string;
  claimedByRole: 'tenant' | 'owner';
  claimedByName: string;
  claimedAt: string;
  handoverDate: string;
  handoverLocation?: string;
  notes?: string;
  proofPhotoUrl?: string;
  status: 'pending_confirmation' | 'confirmed' | 'rejected' | 'cancelled';
  confirmedBy?: string;
  confirmedByName?: string;
  confirmedAt?: string;
  rejectionReason?: string;
}

export interface MobilePaymentTransaction {
  id: string;
  invoiceId?: string;
  agreementId?: string;
  ownerId: string;
  tenant: string;
  tenantId: string;
  unit: string;
  unitId?: string;
  propertyName?: string;
  propertyId?: string;
  amount: number;
  currency: string;
  date: string;
  dueDate?: string;
  direction?: 'inflow' | 'outflow'; // inflow: Tenant -> Owner, outflow: Owner -> Tenant (Refund)
  status: 'paid' | 'pending' | 'pending_confirmation' | 'overdue' | 'disputed' | 'cancelled' | 'failed';
  method: 'UPI' | 'Credit/Debit Card' | 'NetBanking' | 'Cash Handover' | 'NEFT/IMPS' | 'EASEBUZZ' | 'Bank Transfer' | 'Cash' | 'Cheque' | string;
  type: 'rent' | 'deposit' | 'utility' | 'deposit_refund' | 'task_fee' | 'late_fee';
  referenceNo?: string;
  cashClaimId?: string;
  settlementId?: string;
  notes?: string;
  rejectionReason?: string;
}

export interface MobileTicketPayment {
  payer: 'owner' | 'tenant' | null;
  amount: number | null;
  method: string | null;
  status: 'none' | 'awaiting_payment' | 'pending_approval' | 'confirmed';
}

export interface MobileStaffScheduleItem {
  day: string;
  job: string;
  unit: string;
  time: string;
  staffId?: string;
  ownerId?: string;
}

export interface MobileTicket {
  id: string;
  ownerId: string;
  propertyId: string;
  propertyName: string;
  unit: string;
  unitId?: string;
  tenant: string;
  tenantId: string;
  tenantPhone: string;
  tenantEmail?: string;
  issue: string;
  category: 'Plumbing' | 'Electrical' | 'HVAC' | 'Carpentry' | 'Appliance' | 'Other';
  priority: 'Low' | 'Medium' | 'High' | 'Emergency';
  status: 'open' | 'assigned' | 'in_progress' | 'resolved' | 'closed';
  preferredTimeSlot?: string;
  assignedStaffId?: string | null;
  assignedStaffName?: string | null;
  costEstimate?: number;
  currency?: string;
  completionNotes?: string;
  photos?: string[];
  created: string;
  payment?: MobileTicketPayment;
  rating?: number;
  residentFeedback?: string;
}

export interface MobileMoveOutCheckItem {
  id?: string;
  room: string;
  item: string;
  amenity?: string;
  condition: 'good' | 'minor_wear' | 'damaged' | 'fair';
  deduction: number;
  notes?: string;
  photo?: string | null;
  photos?: string[];
}

export interface MobileMoveOut {
  id: string;
  ownerId?: string;
  tenantId: string;
  tenantName: string;
  tenantEmail?: string;
  tenant?: string;
  propertyId: string;
  propertyName: string;
  agreementId?: string;
  unit: string;
  unitId?: string;
  moveOutDate: string;
  inspectionDate?: string;
  refundDate?: string;
  depositHeld: number;
  deposit?: number;
  currency: string;
  status: 'notice_filed' | 'requested' | 'inspection_scheduled' | 'inspected' | 'settlement_pending' | 'refund_scheduled' | 'settled' | 'refund_completed' | 'disputed' | 'awaiting_tenant_approval';
  inspectionChecklist: MobileMoveOutCheckItem[];
  deductions?: Array<{
    reason?: string;
    amount: number;
    amenity?: string;
  }>;
  totalDeductions: number;
  unpaidBills: number;
  netRefundAmount: number;
  finalRefundAmount?: number;
  settlementId?: string;
  settlementStatus?: 'awaiting_tenant_approval' | 'approved' | 'rejected' | 'contested' | 'refunded' | 'settlement_pending' | 'refund_completed';
  payoutMethod?: string;
  tenantDisputeRaised?: boolean;
  tenantApprovedSettlement?: boolean;
  settledAt?: string;
  chosenPayoutDetails?: {
    method: 'upi' | 'paypal' | 'iban' | 'bank_in' | 'cash';
    accountHolderName?: string;
    upiId?: string;
    accountNumber?: string;
    ifscCode?: string;
    paypalEmail?: string;
    iban?: string;
    swiftBic?: string;
    notes?: string;
  };
  cashRefundHandover?: {
    claimedByName: string;
    amount: number;
    currency: string;
    handoverDate: string;
    handoverLocation?: string;
    notes?: string;
    status: 'pending_confirmation' | 'confirmed' | 'rejected';
    rejectedReason?: string;
  };
  tenantConfirmedReceipt?: boolean;
  tenantConfirmedAt?: string;
}

export interface MobileDepositSettlement {
  id: string;
  moveOutId?: string;
  agreementId?: string;
  propertyId: string;
  propertyName?: string;
  unit: string;
  tenantId: string;
  tenantName: string;
  tenantEmail?: string;
  ownerId?: string;
  currency: string;
  grossDepositHeld?: number;
  originalDeposit?: number;
  deductions?: Array<{
    id?: string;
    category?: string;
    title: string;
    amount: number;
  }>;
  totalDeductions: number;
  netRefundableAmount: number;
  finalRefundAmount?: number;
  status: 'awaiting_tenant_approval' | 'approved' | 'rejected' | 'contested' | 'refunded' | 'settlement_pending' | 'refund_completed';
  chosenPayoutDetails?: {
    method: 'upi' | 'paypal' | 'iban' | 'bank_in' | 'cash';
    accountHolderName?: string;
    upiId?: string;
    accountNumber?: string;
    ifscCode?: string;
    iban?: string;
    swiftBic?: string;
    paypalEmail?: string;
    notes?: string;
  };
  rejectionReason?: string;
  revisionNotes?: string;
  revisedAt?: string;
  disbursementMethod?: string;
  paymentReference?: string;
  proofDocumentUrl?: string;
  disbursedAt?: string;
  tenantConfirmedReceipt?: boolean;
  tenantConfirmedAt?: string;
  cashClaimId?: string;
  createdAt: string;
}


export interface MobileDispute {
  id: string;
  ownerId?: string;
  tenantId?: string;
  raisedById: string;
  raisedByName: string;
  raisedByRole: 'tenant' | 'owner';
  againstName: string;
  propertyId: string;
  propertyName: string;
  unit: string;
  category: 'Security Deposit Deduction' | 'Maintenance Quality' | 'Unauthorized Charges' | 'Lease Breach';
  amountDisputed: number;
  currency: string;
  statement: string;
  evidenceNotes: string;
  status: 'filed' | 'under_review' | 'mediation_in_progress' | 'resolved';
  managerResolution?: string;
  resolvedAt?: string;
  createdAt: string;
}

export interface MobileStaffMember {
  id: string;
  name: string;
  role: string;
  phone: string;
  email: string;
  assignedProperties: string[];
  activeTickets: number;
  rating: number;
  status: 'available' | 'on_duty' | 'off_duty';
  ownerId?: string;
  completed?: number;
}

export interface MobilePropertyManager {
  id: string;
  name: string;
  email: string;
  phone: string;
  role?: string;
  propertyId?: string;
  assignedProperties?: string[];
  ownerId: string;
  ownerName?: string;
  tempPassword?: string;
}

export interface MobileManagerPayout {
  id: string;
  managerId: string;
  managerName: string;
  ownerId: string;
  month?: string;
  amount: number;
  currency: string;
  status: 'paid' | 'pending';
  paymentMethod: string;
  utrReference?: string;
  paidAt: string;
  notes?: string;
}

export interface MobileInAppNotification {
  id: string;
  userId?: string;
  recipientId?: string;
  recipientRole?: string;
  ownerId?: string;
  title: string;
  body: string;
  category: 'bills' | 'repairs' | 'leases' | 'system' | 'info';
  isRead: boolean;
  read?: boolean;
  createdAt: string;
  relatedEntityId?: string;
}

export interface MobilePlan {
  id: string;
  name: string;
  price: number; // in USD
  properties: number;
  units: number;
  tenants: number;
  managers: number;
  staff: number;
  owners?: number;
  isArchived?: boolean;
  isTrialOnly?: boolean;
}

export interface MobilePlatformInvoice {
  id: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  planId: string;
  planName: string;
  amount: number;
  tax: number;
  total: number;
  currency: string;
  status: 'paid' | 'pending';
  issueDate: string;
  dueDate: string;
  paidAt?: string;
  periodStart?: string;
  periodEnd?: string;
  billingCycle?: 'monthly' | 'annual';
  notes?: string;
  paymentMethod?: string;
  transactionRef?: string;
}

export interface MobileInvoiceTemplateConfig {
  issuerName: string;
  issuerTaxNo?: string;
  issuerAddress?: string;
  issuerPhone?: string;
  issuerEmail?: string;
  taxLabel?: string;
  taxPercent?: number;
  bankName?: string;
  accountName?: string;
  accountNumber?: string;
  ifscOrRouting?: string;
  upiId?: string;
  termsAndConditions?: string;
  signatoryName?: string;
  signatureUrl?: string;
  notes?: string;
  documentTitle?: string;
  custodyMechanism?: string;
  depositClassification?: string;
  refundTimelineDays?: number;
}

export interface MobileLateFeeSettings {
  enabled?: boolean;
  graceDays: number;
  type: 'flat' | 'percent' | 'daily_fixed' | 'fixed_once' | 'percent_monthly';
  value: number;
  cap?: number;
  reminderDaysPrior?: number;
  reminderEnabled?: boolean;
}

export interface MobileOwnerSubscriptionMandate {
  autoRenew: boolean;
  status: 'active' | 'trialing' | 'grace_period' | 'past_due' | 'cancelled';
  activeGateway: 'stripe' | 'razorpay' | 'easebuzz' | 'paypal';
  subscriptionId?: string;
  mandateId?: string;
  customerId?: string;
  displayDetails?: string;
  currentPlanId: string;
  planId?: string;
  planName?: string;
  amount?: number;
  currency?: string;
  nextBillingDate?: string;
  previousActivePlanId?: string;
  billingCycle: 'monthly' | 'annual';
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  isInitialTrial?: boolean;
  trialEndsAt?: string | null;
  purgeScheduledAt?: string | null;
  failureCount: number;
  lastInvoiceId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface MobileOwnerSettings {
  ownerId: string;
  planId: string;
  planName: string;
  planStatus: 'trialing' | 'active' | 'past_due' | 'expired';
  trialEndsAt: string | null;
  subscriptionEndsAt: string | null;
  billingCycle?: 'monthly' | 'annual';
  autoRenew?: boolean;
  cancelsAtPeriodEnd?: boolean;
  subscriptionMandate?: MobileOwnerSubscriptionMandate;
  previousActivePlanId?: string;
  isInitialTrial?: boolean;
  purgeScheduledAt?: string | null;
  invoiceTemplate?: MobileInvoiceTemplateConfig;
  depositTemplate?: MobileInvoiceTemplateConfig;
  lateFeeConfig?: MobileLateFeeSettings;
  rentReminderDaysPrior?: number;
  rentalReminderConfig?: {
    enabled: boolean;
    daysPrior: number;
  };
  /** Payment gateways configured by this owner — synced from Firestore owners/{ownerId}.paymentMethods */
  paymentMethods?: MobilePaymentMethodsConfig;
}

export interface MobilePlatformGateways {
  stripe?: { pubKey: string; secretKey?: string; mode?: 'test' | 'live'; enabled: boolean };
  razorpay?: { keyId: string; keySecret?: string; mode?: 'test' | 'live'; enabled: boolean };
  paypal?: { clientId: string; secret?: string; mode?: 'test' | 'live'; enabled: boolean };
  easebuzz?: { enabled: boolean; connected?: boolean; merchantKey: string; salt: string; subMerchantId?: string; mode?: 'live' | 'test' };
  mock?: { enabled: boolean };
}

export interface MobilePlanUsage {
  planName: string;
  tier?: 'starter' | 'growth' | 'enterprise';
  propertiesUsed: number;
  propertiesMax: number;
  maxProperties?: number;
  unitsUsed: number;
  unitsMax: number;
  maxUnits?: number;
  tenantsUsed?: number;
  tenantsMax?: number;
  isPropertyLimitReached: boolean;
  isUnitLimitReached: boolean;
  isTenantLimitReached?: boolean;
}

export interface MobilePaymentMethodsConfig {
  mock?: { enabled: boolean };
  stripe?: {
    enabled: boolean;
    connected?: boolean;
    mode: 'test' | 'live';
    pubKey: string;
    secretKey: string;
    webhookSecret?: string;
  };
  razorpay?: {
    enabled: boolean;
    connected?: boolean;
    mode: 'test' | 'live';
    keyId: string;
    keySecret: string;
  };
  paypal?: {
    enabled: boolean;
    connected?: boolean;
    mode: 'test' | 'live';
    email: string;
    clientId: string;
    secret: string;
  };
  easebuzz?: {
    enabled?: boolean;
    connected?: boolean;
    mode?: 'live' | 'test';
    merchantKey?: string;
    salt?: string;
    subMerchantId?: string;
  };
  upi?: {
    enabled?: boolean;
    upiId: string;
    merchantName: string;
    qrImage?: string;
  };
  bank?: {
    enabled?: boolean;
    accountName: string;
    bankName: string;
    accountNumber: string;
    routing: string;
    country?: string;
  };
  cash?: {
    enabled?: boolean;
    instructions: string;
  };
}

export interface MobileAnnouncement {
  id: string;
  ownerId: string;
  authorId?: string;
  title: string;
  body: string;
  category: 'general' | 'maintenance' | 'emergency' | 'event' | 'rules';
  priority: 'normal' | 'high' | 'urgent';
  propertyId?: string;
  propertyName?: string;
  targetRoles: ('tenant' | 'staff' | 'manager')[];
  isPinned: boolean;
  requireAck: boolean;
  status: 'published' | 'scheduled' | 'draft' | 'archived';
  createdAt: string;
  acknowledgedBy?: string[];
}

export interface MobileTenancyRequest {
  id: string;
  ownerId: string;
  ownerName: string;
  ownerEmail?: string;
  tenantId?: string;
  tenantName: string;
  tenantEmail: string;
  tenantPhone?: string;
  propertyId: string;
  propertyName: string;
  unit?: string;
  unitId?: string;
  unitNumber?: string;
  rent: number;
  deposit: number;
  currency?: string;
  leaseStart?: string;
  leaseEnd?: string;
  agreementFileName?: string;
  agreementFileData?: string;
  agreementFileUrl?: string;
  requireTenantId?: boolean;
  requiredIdType?: string;
  requiredIdTypes?: string[];
  requiredIdList?: MobileRequiredIdItem[];
  tenantUploadedIdName?: string;
  tenantUploadedIdUrl?: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  message: string;
  createdAt: string;
}

export interface MobilePlatformSupportTicket {
  id: string;
  userId?: string;
  owner?: string;
  ownerId?: string;
  ownerEmail?: string;
  topic: string;
  category: 'billing' | 'technical' | 'subscription' | 'leasing' | 'feature_request' | 'general';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  detail: string;
  status: 'open' | 'waiting_on_us' | 'resolved';
  reply?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface MobileTenantReview {
  id: string;
  tenantId?: string;
  tenantName: string;
  ownerId?: string;
  ownerName?: string;
  propertyId?: string;
  propertyName?: string;
  unit?: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface MobileRenewalItem {
  id?: string;
  agreementId?: string;
  unit: string;
  tenant: string;
  tenantId?: string;
  ownerId?: string;
  propertyId?: string;
  propertyName?: string;
  currency?: string;
  currentRent?: number;
  percentageIncrease?: number; // e.g. 10 for 10%
  proposedRent?: number;
  rentIncreaseAmount?: number; // proposedRent - currentRent
  termMonths?: number;
  leaseEnd: string;
  newLeaseStart?: string;
  newLeaseEnd?: string;
  daysLeft: number;
  status: 'pending_decision' | 'renewal_requested' | 'renewal_offered' | 'signed_by_tenant' | 'accepted' | 'rejected' | 'auto_renew_set';
  requestedAt?: string;
  offeredAt?: string;
  respondedAt?: string;
  ownerNotes?: string;
  tenantNotes?: string;
  ownerAgreementFileUrl?: string | null;
  ownerAgreementFileName?: string | null;
  ownerAgreementFileSize?: number | null;
  tenantSignedFileUrl?: string | null;
  tenantSignedFileName?: string | null;
  tenantSignedFileSize?: number | null;
  tenantSignedAt?: string;
  ownerApprovedAt?: string;
}

export type MobileCommunicationCategory =
  | 'rent'
  | 'billing'
  | 'leasing'
  | 'deposit'
  | 'maintenance'
  | 'subscription'
  | 'dispute'
  | 'announcement'
  | 'custom';

export type MobileCommunicationChannel = 'sms' | 'email' | 'in_app';

export interface MobileCommunicationLog {
  id: string;
  type: string;
  category: MobileCommunicationCategory;
  title: string;
  body: string;
  htmlContent?: string;
  channels: MobileCommunicationChannel[];
  recipientId: string;
  recipientName: string;
  recipientRole: 'tenant' | 'owner' | 'manager' | 'staff' | 'superadmin';
  recipientContact: {
    email?: string;
    phone?: string;
  };
  senderId: string;
  senderName: string;
  senderRole: 'system' | 'superadmin' | 'owner' | 'staff';
  ownerId?: string | null;
  ownerName?: string;
  propertyId?: string;
  propertyName?: string;
  unitId?: string;
  unitNumber?: string;
  relatedEntityId?: string;
  deliveryStatus: {
    sms?: 'delivered' | 'failed' | 'skipped' | 'not_requested';
    email?: 'delivered' | 'failed' | 'skipped' | 'not_requested';
    inApp?: 'delivered' | 'read' | 'not_requested';
  };
  smsSid?: string;
  emailMessageId?: string;
  errorMessage?: string;
  createdAt: string;
  hasAttachment?: boolean;
}

export interface MobileCommsConfig {
  twilioSid: string;
  twilioAuthToken: string;
  twilioConnected: boolean;
  twilioNumber: string;
  sendgridKey: string;
  sendgridConnected: boolean;
  sendgridFrom: string;
}

