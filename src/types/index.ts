export type UserRole = 'superadmin' | 'owner' | 'tenant' | 'manager' | 'staff';

export interface UserProfile {
  id: string;
  email: string;
  role: UserRole;
  ownerId?: string | null;
  ownerName?: string | null;
  displayName: string;
  phone: string;
  avatarUrl?: string | null;
  status: 'active' | 'suspended' | 'pending_activation' | 'past_due' | 'invited';
  plan?: string;
  mrr?: number;
  rating?: number;
  reminded?: boolean;
  createdAt: string;
  kycDocuments?: { title: string; fileUrl: string; verified: boolean }[];
  tempPassword?: string;
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
  adminSecurityPin?: string;
  hasCompletedTour?: boolean;
}

export interface Plan {
  id: string;
  name: string;
  price: number; // in USD
  properties: number;
  units: number;
  tenants: number;
  managers: number;
  staff: number;
  owners: number;
  isArchived?: boolean;
  isTrialOnly?: boolean;
  isPopular?: boolean;
}

export interface PaymentMethodsConfig {
  cash: { enabled: boolean; instructions?: string };
  upi: { enabled: boolean; upiId: string; qrImage: string | null; merchantName?: string };
  bank: { enabled: boolean; accountName: string; accountNumber: string; bankName?: string; country: string; routing: string; branch?: string };
  paypal: { enabled: boolean; email: string; clientId?: string; secret?: string; connected?: boolean; mode?: 'live' };
  razorpay: { enabled: boolean; keyId: string; keySecret: string; connected?: boolean; mode?: 'live' };
  stripe: { enabled: boolean; pubKey: string; secretKey: string; webhookSecret?: string; connected?: boolean; mode?: 'live' };
  easebuzz?: { enabled: boolean; merchantKey: string; salt: string; subMerchantId?: string; connected?: boolean; mode?: 'live' };
  mock?: { enabled: boolean; connected?: boolean };
  activeGateway?: 'stripe' | 'razorpay' | 'easebuzz' | 'paypal' | 'upi' | 'bank' | 'cash';
}

export interface LateFeeSettings {
  enabled: boolean;
  graceDays: number;
  type: 'percent' | 'flat' | 'daily_fixed' | 'fixed_once' | 'percent_monthly';
  value: number;
  cap?: number;
}

export interface OwnerSubscriptionMandate {
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

export interface OwnerSettings {
  ownerId: string;
  planId: string;
  planName: string;
  planStatus: 'trialing' | 'active' | 'past_due' | 'expired';
  trialEndsAt: string | null;
  subscriptionEndsAt: string | null;
  billingCycle?: 'monthly' | 'annual';
  autoRenew?: boolean;
  cancelsAtPeriodEnd?: boolean;
  subscriptionMandate?: OwnerSubscriptionMandate;
  previousActivePlanId?: string;
  isInitialTrial?: boolean;
  purgeScheduledAt?: string | null;
  paymentMethods: PaymentMethodsConfig;
  lateFeeConfig: LateFeeSettings;
  taxConfig: {
    label: string;
    percent: number;
  };
  rentalReminderConfig?: {
    enabled: boolean;
    daysPrior: number;
  };
  rentReminderDaysPrior?: number;
  invoiceTemplate?: InvoiceTemplateConfig;
  depositTemplate?: InvoiceTemplateConfig;
}

export interface InvoiceTemplateConfig {
  issuerName: string;
  issuerTaxNo: string;
  issuerAddress: string;
  issuerPhone: string;
  issuerEmail: string;
  taxLabel: string;
  taxPercent: number;
  termsAndConditions: string;
  signatoryName: string;
  signatureUrl?: string;
  notes: string;
  documentTitle?: string;
  custodyMechanism?: string;
  depositClassification?: string;
  refundTimelineDays?: number;
  bankName?: string;
  accountName?: string;
  accountNumber?: string;
  ifscOrRouting?: string;
  upiId?: string;
}

export interface PlatformInvoiceTemplateConfig {
  issuerName: string;
  issuerTaxNo: string;
  issuerAddress: string;
  issuerPhone: string;
  issuerEmail: string;
  taxLabel?: string;
  taxPercent?: number;
  termsAndConditions: string;
  signatoryName: string;
  signatoryRole?: string;
  notes: string;
  bankName?: string;
  accountName?: string;
  accountNumber?: string;
  swiftCode?: string;
}

export interface PropertyAddress {
  formattedAddress: string;
  lat: number;
  lng: number;
  placeId: string;
  city: string;
  country: string;
  street?: string;
}

export interface Property {
  id: string;
  ownerId: string;
  name: string;
  address: PropertyAddress;
  amenities: string[];
  amenityPhotos?: { name: string; image: string }[];
  images: string[];
  unitCount: number;
  occupied: number;
  createdAt: string;
  country?: string;
  currency?: string;
  unitList?: Unit[];
  propertyType?: string;
  floorsCount?: number;
  yearBuilt?: number;
  assignedManagerId?: string;
  rules?: {
    petsAllowed: boolean;
    smokingAllowed: boolean;
    sublettingAllowed: boolean;
    minLeaseMonths: number;
    noticePeriodDays: number;
  };
}

export interface Unit {
  id: string;
  propertyId: string;
  propertyName?: string;
  country?: string;
  address?: string;
  ownerId: string;
  unitNumber: string;
  rent: number;
  deposit: number;
  currency: string;
  status: 'occupied' | 'vacant' | 'reserved' | 'maintenance';
  isListedPublicly: boolean;
  tenant: string | null;
  currentTenantId?: string | null;
  unitType?: string;
  floor?: string;
  areaSqFt?: number;
  bathrooms?: number;
  furnishing?: 'Unfurnished' | 'Semi-Furnished' | 'Fully Furnished';
  electricityMeter?: string;
  waterMeter?: string;
  images?: string[];
  image?: string;
}

export interface TenantRentalHistory {
  owner: string;
  property: string;
  period: string;
}

export interface TenantRecord {
  id: string;
  name: string;
  phone: string;
  email: string;
  unit: string;
  owner: string;
  ownerId: string;
  leaseStart: string;
  leaseEnd: string;
  rent: number;
  deposit: number;
  rating: number;
  history: TenantRentalHistory[];
  kycDocuments: { title: string; fileUrl: string; verified: boolean }[];
  unitsRented: string[]; // Supports multiple properties/units
  propertyName?: string;
  propertyId?: string;
  currency?: string;
  status?: 'active' | 'inactive' | 'unmanaged_archive' | 'vacated' | string;
}

export interface RequiredIdItem {
  id: string;
  name: string; // e.g. 'Voter ID', 'Aadhaar Card', 'Passport', 'Driving License', 'PAN Card'
}

export interface TenantUploadedIdItem {
  id: string;
  name: string; // matches RequiredIdItem name
  fileUrl: string;
  fileName: string;
  fileSize?: number;
  uploadedAt: string;
}

export interface TenancyRequest {
  id: string;
  ownerId: string;
  ownerName: string;
  ownerEmail?: string;
  ownerPhone?: string;
  tenantId: string;
  tenantName: string;
  tenantEmail: string;
  tenantPhone?: string;
  propertyId: string;
  propertyName: string;
  unitId: string;
  unitNumber: string;
  rent: number;
  deposit: number;
  currency: string;
  leaseStart: string;
  leaseEnd: string;
  message?: string;
  agreementFileName?: string;
  agreementFileData?: string | null;
  agreementFileSize?: number | null;
  requireTenantId?: boolean;
  requiredIdTypes?: string[];
  requiredIdList?: RequiredIdItem[];
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  createdAt: string;
  respondedAt?: string;
}

export interface Agreement {
  id: string;
  ownerId: string;
  ownerName?: string;
  propertyId: string;
  propertyName?: string;
  unit: string;
  unitId?: string;
  tenant: string;
  tenantId: string;
  tenantEmail?: string;
  tenantPhone?: string;
  isDraft?: boolean;
  draftStep?: 1 | 2 | 3;
  draftSavedAt?: string;
  type: 'builder' | 'uploaded' | 'upload';
  executionMode?: 'digital_dispatch' | 'already_executed_offline';
  contentHtml?: string | null;
  fileData?: string | null; // draft agreement data URL or uploaded template
  fileName?: string | null;
  fileSize?: string | number | null;
  start: string;
  end: string;
  rent: number;
  deposit: number;
  currency?: string;
  rentDueDay?: number;
  rentReminderDaysPrior?: number;
  status: 'draft' | 'awaiting_tenant_signature' | 'awaiting_tenant_upload' | 'pending_approval' | 'pending_deposit' | 'pending_countersign' | 'signed' | 'active' | 'terminated' | 'rejected' | 'unmanaged_archive';
  tenantSignature?: {
    signatureDataUrl: string;
    signedAt: string;
  } | null;
  // Document Records
  initialAgreementUrl?: string; // Pre-signed/initial agreement uploaded by owner upfront
  initialAgreementName?: string;
  initialUploadedAt?: string;
  signedDocumentUrl?: string; // Physical signed document uploaded by tenant (After tenant sign)
  signedDocumentName?: string;
  signedUploadedAt?: string;
  rejectionReason?: string;
  rejectedAt?: string;
  ownerSignedDocumentUrl?: string; // Pre-signed or executed document uploaded by landlord
  ownerSignedDocumentName?: string;
  ownerSignedUploadedAt?: string;
  ownerSignatureNotes?: string;
  requireTenantId?: boolean;
  requiredIdType?: string;
  requiredIdTypes?: string[];
  requiredIdList?: RequiredIdItem[];
  tenantUploadedIds?: TenantUploadedIdItem[];
  tenantUploadedIdUrl?: string;
  tenantUploadedIdName?: string;
  tenantUploadedIdAt?: string;
  approvedAt?: string;
  approvedBy?: string;
  counterSignedAt?: string; // Legacy backwards-compatible alias
  counterSignatory?: string; // Legacy backwards-compatible alias
  depositInvoiceId?: string;
  depositStatus?: 'unpaid' | 'pending_confirmation' | 'paid' | 'settlement_pending' | 'refunded';
  autoRenew: boolean;
  renewalTerms?: {
    effectiveDate: string;
    previousRent: number;
    newRent: number;
    percentageIncrease: number;
    newLeaseEnd: string;
    termMonths: number;
    acceptedAt: string;
    ownerNotes?: string;
  };
  autopay?: TenantAutopayMandate;
  isRenewal?: boolean;
  previousAgreementId?: string;
  createdAt?: string;
}

export interface TenantAutopayMandate {
  enabled?: boolean;
  status: 'active' | 'paused' | 'failing' | 'cancelled';
  activeGateway: 'stripe' | 'razorpay' | 'easebuzz' | 'paypal';
  mandateToken?: string;
  mandateId?: string;
  customerId?: string;
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

export interface AgreementTemplate {
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

export interface TransactionAuditTrail {
  claimedBy: string;
  claimedByRole: 'tenant' | 'owner';
  claimedByName?: string;
  claimedAt: string;
  confirmedBy?: string;
  confirmedByName?: string;
  confirmedAt?: string;
  handoverLocation?: string;
  proofPhotoUrl?: string;
  rejectionReason?: string;
  rejectedAt?: string;
}

export interface CashHandoverClaim {
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

  // Handover Metadata
  claimedBy: string;
  claimedByRole: 'tenant' | 'owner';
  claimedByName: string;
  claimedAt: string;
  handoverDate: string;
  handoverLocation?: string;
  notes?: string;
  proofPhotoUrl?: string;

  // Counterparty Confirmation
  status: 'pending_confirmation' | 'confirmed' | 'rejected' | 'cancelled';
  confirmedBy?: string;
  confirmedByName?: string;
  confirmedAt?: string;
  rejectionReason?: string;
}

export interface PaymentTransaction {
  id: string;
  ownerId: string;
  tenant: string;
  tenantId: string;
  unit: string;
  propertyId?: string;
  amount: number;
  currency?: string;
  date: string;
  dueDate: string;
  direction?: 'inflow' | 'outflow'; // inflow: Tenant -> Owner, outflow: Owner -> Tenant
  status: 'paid' | 'pending_confirmation' | 'overdue' | 'disputed' | 'cancelled';
  method: string;
  type: 'rent' | 'deposit' | 'deposit_refund' | 'task_fee' | 'late_fee';
  lateFeeApplied?: number;
  taxApplied?: number;
  invoiceId?: string;
  settlementId?: string;
  cashClaimId?: string;
  notes?: string;
  audit?: TransactionAuditTrail;
}

export interface Invoice {
  id: string;
  ownerId: string;
  tenant: string;
  tenantId: string;
  unit: string;
  amount: number;
  tax: number;
  total: number;
  due: string;
  status: 'sent' | 'paid' | 'overdue' | 'draft' | 'cancelled' | 'pending_confirmation' | 'refunded' | 'void';
  currency?: string;
  propertyName?: string;
  propertyId?: string;
  invoiceType?: 'rent' | 'deposit' | 'utility' | 'maintenance' | 'late_fee';
  type?: 'rent' | 'deposit' | 'task_fee' | 'late_fee';
  leaseAgreementId?: string;
  lateFeeApplied?: number;
  lateFeeWaived?: boolean;
  lateFeeWaivedReason?: string;
  lateFeeCalculation?: string;
  items?: Array<{ description: string; amount: number }>;
  issueDate?: string;
  paidAt?: string;
  paymentMethodUsed?: string;
  receiptNumber?: string;
  notes?: string;
  // Offline Payment Proof & Reconciliation Fields
  paymentProofUrl?: string;
  paymentProofRef?: string; // UTR or Bank Reference No
  paymentProofDate?: string;
  paymentProofNotes?: string;
  // Production Legal & Tax Fields
  issuerName?: string;
  issuerTaxNo?: string; // GSTIN / Tax ID / VAT
  issuerAddress?: string;
  issuerPhone?: string;
  issuerEmail?: string;
  tenantTaxNo?: string;
  tenantPhone?: string;
  tenantEmail?: string;
  billingPeriodStart?: string;
  billingPeriodEnd?: string;
  termsAndConditions?: string; // T&C
  bankDetails?: {
    bankName?: string;
    accountName?: string;
    accountNumber?: string;
    ifscOrRouting?: string;
    upiId?: string;
  };
  signatoryName?: string;
  signatureUrl?: string;
  discount?: number;
  documentTitle?: string;
  custodyMechanism?: string;
  depositClassification?: string;
  refundTimelineDays?: number;
}

export interface PlatformInvoice {
  id: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  planId: string;
  planName: string;
  periodStart: string;
  periodEnd: string;
  amount: number;
  takeRateFee?: number;
  tax: number;
  taxLabel?: string;
  billingCycle?: string;
  total: number;
  currency: string;
  status: 'issued' | 'paid' | 'overdue' | 'void';
  issueDate: string;
  dueDate: string;
  paidAt?: string;
  paymentMethod?: string;
  transactionRef?: string;
  notes?: string;
  // Legal & Tax Fields
  issuerTaxNo?: string;
  ownerTaxNo?: string;
  termsAndConditions?: string;
  signatoryName?: string;
}

export interface StaffMember {
  id: string;
  name: string;
  role: string;
  ownerId: string;
  ownerName: string;
  phone: string;
  email: string;
  activeTickets: number;
  rating: number;
  completed: number;
  paymentDetails: {
    method: 'bank' | 'upi' | 'paypal' | 'cash';
    bank: { accountName: string; accountNumber: string; country: string; routing: string };
    upi: { upiId: string; qrImage: string | null };
    paypalEmail: string;
  };
  tempPassword?: string;
}

export interface PropertyManager {
  id: string | number;
  name: string;
  email: string;
  phone: string;
  ownerId: string;
  ownerName: string;
  propertyId?: string;
  tempPassword?: string;
  compensation?: {
    type: 'fixed_monthly' | 'percent_rent';
    rate: number;
    currency: string;
  };
}

export interface ManagerPayoutRecord {
  id: string;
  managerId: string;
  managerName: string;
  ownerId: string;
  month: string;
  amount: number;
  currency: string;
  status: 'paid' | 'pending';
  paymentMethod: string;
  utrReference?: string;
  paidAt?: string;
  notes?: string;
}

export interface TicketPayment {
  payer: 'owner' | 'tenant' | null;
  amount: number | null;
  method: string | null;
  status: 'none' | 'awaiting_payment' | 'pending_approval' | 'confirmed';
}

export interface Ticket {
  id: string;
  ownerId: string;
  propertyId?: string;
  agreementId?: string;
  unit: string;
  unitId?: string;
  tenant: string;
  tenantId: string;
  tenantContact: {
    phone: string;
    email: string;
  };
  issue: string;
  priority: 'Low' | 'Medium' | 'High';
  status: 'open' | 'assigned' | 'in_progress' | 'resolved';
  assignedTo: string | null;
  assignedStaffId?: string | null;
  created: string;
  payment: TicketPayment;
  photos?: string[];
  category?: string;
  rating?: number;
  residentFeedback?: string;
  completionNotes?: string;
  notes?: string;
}

export interface MoveOutAmenityCheck {
  id?: string;
  room?: string;
  item?: string;
  amenity: string;
  condition: 'good' | 'damaged' | 'fair' | 'minor_wear';
  deduction?: number;
  photo?: string | null;
  photos?: string[];
  notes?: string;
}

export interface MoveOutDeduction {
  reason: string;
  amount: number;
  amenity: string;
}

export interface MoveOut {
  id: string;
  ownerId: string;
  owner?: string;
  ownerName: string;
  propertyId?: string;
  propertyName?: string;
  agreementId?: string;
  unit: string;
  unitId?: string;
  tenant: string;
  tenantId?: string;
  tenantEmail?: string;
  tenantPhone?: string;
  status: 'notice_filed' | 'requested' | 'inspection_scheduled' | 'inspected' | 'settlement_pending' | 'awaiting_tenant_approval' | 'refund_scheduled' | 'settled' | 'refund_completed' | 'disputed';
  moveOutDate: string;
  inspectionDate: string | null;
  refundDate: string | null;
  inspectionChecklist?: MoveOutAmenityCheck[];
  deposit: number;
  currency: string;
  deductions?: MoveOutDeduction[];
  finalRefundAmount?: number;
  tenantConfirmedReceipt?: boolean;
  tenantConfirmedAt?: string;
  completedAt?: string | null;
  amenityPhotos?: { name: string; image: string }[];
  outcome?: {
    type: 'refund' | 'bill';
    amount: number;
    reason: string | null;
    refundRemaining?: number;
  } | null;
  createdAt?: string;
}

export type MoveOutRequest = MoveOut;

export interface TenantReview {
  id?: string;
  owner?: string;
  ownerId?: string;
  tenant?: string;
  tenantId?: string;
  propertyId?: string;
  by: string;
  rating: number;
  text: string;
  createdAt?: string;
}

export interface Dispute {
  id: string;
  ownerId?: string;
  tenantId?: string;
  raisedById?: string;
  unit?: string;
  invoiceId?: string;
  type: 'Payment' | 'Maintenance' | 'Deposit' | 'Review' | string;
  raisedBy: string;
  against: string;
  detail: string;
  status: 'awaiting_owner' | 'community_review' | 'resolved';
  evidence: string;
  created: string;
  resolution?: string | null;
  votes: { support: number; reject: number };
  votedBy?: string[];
}

export interface ReviewItem {
  id: string;
  owner?: string;
  tenant?: string;
  by: string;
  rating: number;
  text: string;
  createdAt?: string;
}

export interface InAppNotification {
  id: string;
  userId: string;
  title: string;
  body: string;
  link?: string;
  isRead: boolean;
  createdAt: string;
  type?: string;
  cashClaimId?: string;
  actionable?: boolean;
}

export interface AuditLogItem {
  id?: string;
  time: string;
  timestamp?: string;
  actor: string;
  actorRole?: 'superadmin' | 'owner' | 'tenant' | 'staff' | 'system' | string;
  action: string;
  category?: 'financial' | 'lease' | 'support' | 'security' | 'maintenance' | 'user' | 'system' | string;
  detail: string;
  propertyId?: string;
  unit?: string;
}

export interface PlatformSupportTicket {
  id: string;
  owner: string;
  ownerId?: string;
  ownerEmail?: string;
  topic: string;
  detail?: string;
  category?: 'billing' | 'technical' | 'subscription' | 'leasing' | 'feature_request' | 'general';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'waiting_on_us' | 'resolved';
  reply?: string;
  repliedAt?: string;
  repliedBy?: string;
  createdAt?: string;
  resolvedAt?: string;
  resolvedBy?: 'owner' | 'admin';
  resolutionNotes?: string;
}

export interface RenewalItem {
  id?: string;
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
  // Document attachments
  ownerAgreementFileUrl?: string | null;
  ownerAgreementFileName?: string | null;
  ownerAgreementFileSize?: number | null;
  tenantSignedFileUrl?: string | null;
  tenantSignedFileName?: string | null;
  tenantSignedFileSize?: number | null;
  tenantSignedAt?: string;
  ownerApprovedAt?: string;
}

export interface StaffScheduleItem {
  day: string;
  job: string;
  unit: string;
  time: string;
  staffId?: string;
}

export interface LandingFeatureItem {
  id: string;
  icon: string;
  title: string;
  description: string;
}

export interface LandingStepItem {
  id: string;
  stepNumber: string;
  title: string;
  description: string;
}

export interface LandingPricingTier {
  id: string;
  name: string;
  price: string;
  period: string;
  description: string;
  popular?: boolean;
  features: string[];
  ctaText: string;
  ctaLink?: string;
}

export interface LandingTestimonialItem {
  id: string;
  quote: string;
  name: string;
  role: string;
  stars: number;
  avatarUrl?: string;
  avatarBg?: string;
  avatarColor?: string;
  avatarIcon?: string;
}

export interface LandingFaqItem {
  id: string;
  question: string;
  answer: string;
}

export interface LandingSectionsVisibility {
  showAnnouncement?: boolean;
  showHero?: boolean;
  showStats?: boolean;
  showFeatures?: boolean;
  showHowItWorks?: boolean;
  showPricing?: boolean;
  showListings?: boolean;
  showTestimonials?: boolean;
  showFaq?: boolean;
  showCtaBanner?: boolean;
  showFooter?: boolean;
}

export interface LandingConfig {
  // Brand & Top bar
  brandName?: string;
  brandAccent?: string;
  faviconUrl?: string;
  browserTitle?: string;
  brandTagline?: string;
  announcement?: {
    enabled: boolean;
    badge: string;
    text: string;
    linkText?: string;
    linkUrl?: string;
  };

  // Section visibility switches
  sections?: LandingSectionsVisibility;

  // Hero
  heroKicker?: string;
  headline: string;
  subheadline: string;
  ctaText: string;
  ctaLink?: string;
  secondaryCtaText?: string;
  secondaryCtaLink?: string;
  trustPills?: string[];
  ratingText?: string;
  heroMockup?: {
    propertyName: string;
    locationText: string;
    badgeText: string;
  };

  // Stats
  stats?: {
    stat1Number: string;
    stat1Label: string;
    stat2Number: string;
    stat2Label: string;
    stat3Number: string;
    stat3Label: string;
    stat4Number: string;
    stat4Label: string;
  };

  // Features
  featuresKicker?: string;
  featuresTitle?: string;
  featuresSubtitle?: string;
  featuresList?: LandingFeatureItem[];

  // How it works
  howItWorksKicker?: string;
  howItWorksTitle?: string;
  howItWorksSubtitle?: string;
  howItWorksSteps?: LandingStepItem[];

  // Pricing
  pricingKicker?: string;
  pricingTitle?: string;
  pricingSubtitle?: string;
  pricingPlans?: LandingPricingTier[];

  // Listings
  listingsKicker?: string;
  listingsTitle?: string;
  listingsSubtitle?: string;

  // Testimonials
  testimonialsKicker?: string;
  testimonialsTitle?: string;
  testimonialsSubtitle?: string;
  testimonialsList?: LandingTestimonialItem[];

  // FAQ
  faqKicker?: string;
  faqTitle?: string;
  faqSubtitle?: string;
  faqList?: LandingFaqItem[];

  // CTA Banner
  ctaBannerTitle?: string;
  ctaBannerSubtitle?: string;
  ctaBannerPrimaryText?: string;
  ctaBannerPrimaryLink?: string;
  ctaBannerSecondaryText?: string;
  ctaBannerSecondaryLink?: string;

  // Footer & Corporate
  footerBrandDescription?: string;
  footerCompanyName?: string;
  footerEmail?: string;
  footerPhone?: string;
  footerCopyright?: string;

  // Dynamic Policy & Support Pages (Terms, Privacy, Refund, Contact)
  legalPages?: LandingLegalPagesConfig;
}

export interface PolicySectionItem {
  id: string;
  title: string;
  content: string;
}

export interface LegalPolicyPageConfig {
  title: string;
  subtitle: string;
  lastUpdated: string;
  sections: PolicySectionItem[];
}

export interface ContactSupportConfig {
  title: string;
  subtitle: string;
  email: string;
  phone: string;
  address: string;
  businessHours: string;
  responseTimeNotice: string;
  faqs?: { question: string; answer: string }[];
}

export interface LandingLegalPagesConfig {
  terms: LegalPolicyPageConfig;
  privacy: LegalPolicyPageConfig;
  refund: LegalPolicyPageConfig;
  contact: ContactSupportConfig;
}

export interface PlatformGateways {
  stripe: { enabled: boolean; connected: boolean; pubKey: string; secretKey: string; webhookSecret?: string; mode?: 'test' | 'live' };
  razorpay: { enabled: boolean; connected: boolean; keyId: string; keySecret: string; webhookSecret?: string; mode?: 'test' | 'live' };
  paypal: { enabled: boolean; connected: boolean; clientId: string; secret: string; mode?: 'test' | 'live' };
  easebuzz?: { enabled: boolean; connected: boolean; merchantKey: string; salt: string; subMerchantId?: string; mode?: 'live' | 'test' };
  mock?: { enabled: boolean; connected: boolean };
  activeBillingGateway?: 'stripe' | 'razorpay' | 'easebuzz' | 'paypal';
}

export interface CommsConfig {
  twilioSid: string;
  twilioAuthToken?: string;
  twilioConnected: boolean;
  twilioNumber: string;
  sendgridKey: string;
  sendgridConnected: boolean;
  sendgridFrom: string;

  // WhatsApp Cloud API
  whatsappPhoneNumberId?: string;
  whatsappWabaId?: string;
  whatsappAccessToken?: string;
  whatsappWebhookVerifyToken?: string;
  whatsappBotEnabled?: boolean;
  whatsappConnected?: boolean;

  // Google Gemini AI
  geminiApiKey?: string;
  geminiModel?: string;
  aiEnabled?: boolean;
  aiReceiptOcrEnabled?: boolean;
  aiDamageDetectionEnabled?: boolean;
  aiVoiceTranscriptionEnabled?: boolean;
  aiConversationalAssistantEnabled?: boolean;
  aiConnected?: boolean;
}

export type PayoutRegion = 'IN' | 'US' | 'GB' | 'EU' | 'GLOBAL';

export type PayoutChannelType =
  | 'upi'          // India UPI (VPA)
  | 'bank_in'      // India Bank Transfer (Account + IFSC)
  | 'ach_us'       // US ACH Direct Deposit (Routing + Account)
  | 'uk_sort'      // UK Faster Payments (Sort Code + Account)
  | 'iban_eu'      // EU / Global (IBAN + SWIFT/BIC)
  | 'paypal';      // Global PayPal

export interface TenantPayoutProfile {
  id?: string;
  tenantId: string;
  region: PayoutRegion;
  channel: PayoutChannelType;
  currency: string;
  accountHolderName: string;
  isVerified?: boolean;
  updatedAt: string;

  // Region-Specific Fields
  upiId?: string;               // India UPI (e.g. user@okaxis)
  accountNumber?: string;       // IN, US, UK, Global
  ifscCode?: string;            // India (e.g. HDFC0001234)
  routingNumber?: string;       // US 9-digit ABA Routing
  accountType?: 'checking' | 'savings'; // US Account Type
  sortCode?: string;            // UK 6-digit Sort Code
  iban?: string;                // Europe / Global IBAN
  swiftBic?: string;            // Global SWIFT / BIC Code
  bankName?: string;
  paypalEmail?: string;         // PayPal
}

export interface DepositDeductionItem {
  id: string;
  category: 'utility_arrears' | 'repair_damage' | 'cleaning' | 'unpaid_rent' | 'early_termination' | 'other';
  title: string;
  amount: number;
  description?: string;
  receiptProofUrl?: string;
}

export interface SettlementPayoutDetails {
  method: 'upi' | 'bank_in' | 'iban' | 'paypal' | 'cash';
  accountHolderName: string;
  upiId?: string;
  accountNumber?: string;
  ifscCode?: string;
  iban?: string;
  swiftBic?: string;
  paypalEmail?: string;
  notes?: string;
}

export interface DepositSettlement {
  id: string;
  agreementId: string;
  propertyId: string;
  propertyName: string;
  unit: string;
  tenantId: string;
  tenantName: string;
  tenantEmail: string;
  ownerId: string;
  currency: string;

  grossDepositHeld: number;
  deductions: DepositDeductionItem[];
  totalDeductions: number;
  netRefundableAmount: number;

  status: 'draft' | 'awaiting_tenant_approval' | 'rejected' | 'contested' | 'approved' | 'awaiting_tenant_cash_confirmation' | 'refunded';

  // Payout Execution Details
  payoutProfileSnapshot?: TenantPayoutProfile;
  chosenPayoutDetails?: SettlementPayoutDetails;
  disbursementMethod?: 'gateway_automated' | 'bank_manual_transfer' | 'cash_handover';
  paymentReference?: string;    // UTR number, Stripe Transfer ID, or Bank wire ref
  proofDocumentUrl?: string;    // Payment slip / screenshot
  disbursedAt?: string;
  cashClaimId?: string;
  moveOutId?: string;

  createdAt: string;
  tenantApprovedAt?: string;
  tenantConfirmedReceipt?: boolean;
  tenantConfirmedAt?: string;
  rejectionReason?: string;
  rejectionDate?: string;
  revisionNotes?: string;
  revisedAt?: string;
  disputeId?: string;
  notes?: string;
}

export type CommunicationCategory = 
  | 'rent'
  | 'lease'
  | 'leasing'
  | 'deposit'
  | 'maintenance'
  | 'subscription'
  | 'dispute'
  | 'announcement'
  | 'custom';

export type CommunicationChannel = 'sms' | 'email' | 'in_app';

export interface CommunicationLog {
  id: string;
  type: string;
  category: CommunicationCategory;
  title: string;
  body: string;
  htmlContent?: string;
  channels: CommunicationChannel[];
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
}

export type AnnouncementPriority = 'normal' | 'important' | 'urgent' | 'emergency';
export type AnnouncementCategory = 'general' | 'maintenance' | 'policy' | 'community' | 'security';
export type AnnouncementStatus = 'draft' | 'scheduled' | 'published' | 'archived';

export interface AnnouncementAcknowledgment {
  tenantId: string;
  tenantName: string;
  unitNumber?: string;
  propertyId?: string;
  propertyName?: string;
  acknowledgedAt: string;
}

export interface Announcement {
  id: string;
  ownerId: string;
  authorName: string;
  title: string;
  body: string;
  category: AnnouncementCategory;
  priority: AnnouncementPriority;
  status: AnnouncementStatus;
  targetScope: {
    allProperties: boolean;
    propertyIds: string[];
    targetRoles: ('tenant' | 'staff' | 'manager' | 'owner')[];
    mode?: 'all' | 'specific' | 'specific_people';
    targetUserIds?: string[];
  };
  isPinned: boolean;
  requireAcknowledgment: boolean;
  acknowledgments?: AnnouncementAcknowledgment[];
  publishedAt: string;
  scheduledFor?: string;
  expiresAt?: string;
  viewsCount?: number;
  createdAt: string;
  updatedAt: string;
}

