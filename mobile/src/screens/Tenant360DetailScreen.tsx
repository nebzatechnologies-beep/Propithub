import React, { useState, useMemo } from 'react';
import { useMobileTheme } from '../context/MobileThemeContext';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Linking,
  Alert,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { useMobileCurrency } from '../context/MobileCurrencyContext';
import { useMobileAuth } from '../context/MobileAuthContext';

interface Tenant360DetailScreenProps {
  onBack?: () => void;
  tenantId?: string;
  onInitiateVacatePress?: (unitId: string) => void;
}

export const Tenant360DetailScreen: React.FC<Tenant360DetailScreenProps> = ({
  onBack,
  tenantId,
  onInitiateVacatePress,
}) => {
  const { colors, isDark } = useMobileTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const { state } = useMobileAppData();
  const { format, viewCurrency } = useMobileCurrency();
  const { user } = useMobileAuth();

  const ownerId = user?.role === 'owner' ? user.id : '';
  const myProperties = useMemo(() => {
    if (!ownerId) return state.properties;
    return state.properties.filter(
      (p) => p.ownerId === ownerId || (user?.email && (p as any).ownerEmail?.toLowerCase() === user.email.toLowerCase())
    );
  }, [state.properties, ownerId, user?.email]);
  const myPropertyIds = useMemo(() => new Set(myProperties.map((p) => p.id)), [myProperties]);

  const myTenants = useMemo(() => {
    if (!ownerId) return state.tenants;
    return state.tenants.filter((t) => {
      const matchOwner = t.ownerId === ownerId;
      const matchProp = Boolean(t.propertyId && myPropertyIds.has(t.propertyId));
      const matchAgreement = (state.agreements || []).some(
        (a) =>
          (a.ownerId === ownerId || (a.propertyId && myPropertyIds.has(a.propertyId))) &&
          (a.tenantId === t.id || (t.email && a.tenantEmail?.toLowerCase() === t.email.toLowerCase())) &&
          a.status !== 'terminated' && a.status !== 'cancelled'
      );
      return matchOwner || matchProp || matchAgreement;
    });
  }, [state.tenants, state.agreements, ownerId, myPropertyIds]);

  const [selectedId, setSelectedId] = useState(tenantId || myTenants[0]?.id || '');
  const tenant = myTenants.find((t) => t.id === selectedId) || myTenants[0];

  const tenantInvoices = useMemo(() => {
    if (!tenant) return [];
    return state.invoices.filter((i) => {
      const matchId = i.tenantId === tenant.id;
      const matchUnit =
        (i.unit === tenant.unit || (tenant.unit && i.unit?.toLowerCase().trim() === tenant.unit.toLowerCase().trim())) &&
        (!i.propertyId || !tenant.propertyId || i.propertyId === tenant.propertyId);
      return matchId || matchUnit;
    });
  }, [state.invoices, tenant]);

  const tenantTickets = useMemo(() => {
    if (!tenant) return [];
    return state.tickets.filter((t) => {
      const matchId = t.tenantId === tenant.id;
      const matchUnit =
        (t.unit === tenant.unit || (tenant.unit && t.unit?.toLowerCase().trim() === tenant.unit.toLowerCase().trim())) &&
        (!t.propertyId || !tenant.propertyId || t.propertyId === tenant.propertyId);
      return matchId || matchUnit;
    });
  }, [state.tickets, tenant]);

  const tenantAgreement = useMemo(() => {
    if (!tenant) return null;
    return (
      state.agreements.find((a) => {
        const matchUnit =
          a.unit === tenant.unit ||
          (tenant.unit && a.unit?.toLowerCase().trim() === tenant.unit.toLowerCase().trim());
        const matchProp = !a.propertyId || !tenant.propertyId || a.propertyId === tenant.propertyId;
        const matchTenant = a.tenantId === tenant.id || Boolean(tenant.email && a.tenantEmail?.toLowerCase() === tenant.email.toLowerCase());
        return matchProp && matchTenant && (!tenant.unit || matchUnit);
      }) || null
    );
  }, [state.agreements, tenant]);

  const pendingTenancyRequest = useMemo(() => {
    if (!tenant) return null;
    return (
      (state.tenancyRequests || []).find(
        (r) =>
          r.status === 'pending' &&
          (r.tenantId === tenant.id || (tenant.email && r.tenantEmail?.toLowerCase().trim() === tenant.email.toLowerCase().trim())) &&
          (!tenant.propertyId || !r.propertyId || r.propertyId === tenant.propertyId)
      ) || null
    );
  }, [state.tenancyRequests, tenant]);

  const pendingDue = tenantInvoices
    .filter((i) => i.status !== 'paid')
    .reduce((sum, i) => sum + i.total, 0);

  const handleCall = (phone?: string) => {
    if (!phone) {
      Alert.alert('No Phone', 'No contact number available for this resident.');
      return;
    }
    Linking.openURL(`tel:${phone}`);
  };

  const handleEmail = (email?: string) => {
    if (!email) {
      Alert.alert('No Email', 'No email address registered for this resident.');
      return;
    }
    Linking.openURL(`mailto:${email}`);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* StatusBar managed globally */}

      {/* Real Screen Status Bar */}
      <ScreenStatusBar />

      {/* Screen Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={20} color="#0F172A" />
          </TouchableOpacity>
          <View style={styles.logoBadge}>
            <Feather name="user-check" size={18} color="#FFFFFF" />
          </View>
          <View>
            <Text style={styles.headerTitle}>Tenant 360 Profile</Text>
          </View>
        </View>
        <View style={styles.verifiedBadge}>
          <Text style={styles.verifiedBadgeText}>
            {tenant?.kycStatus === 'verified' ? 'VERIFIED' : 'PENDING'}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Tenant Selector Pill Bar */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tenantPillsRow}>
          {myTenants.map((t) => {
            const isSelected = t.id === tenant?.id;
            return (
              <TouchableOpacity
                key={t.id}
                style={[styles.tPill, isSelected && styles.tPillActive]}
                onPress={() => setSelectedId(t.id)}
              >
                <Text style={[styles.tPillText, isSelected && styles.tPillTextActive]}>
                  {t.name} (Unit {t.unit})
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Tenant Header Card */}
        <View style={styles.card}>
          <View style={styles.profileTop}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>
                {tenant?.name?.split(' ').map((n) => n[0]).join('').slice(0, 2) || 'TN'}
              </Text>
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.tenantName}>{tenant?.name}</Text>
              <Text style={styles.tenantUnit}>
                Unit {tenant?.unit} • {tenant?.propertyName}
              </Text>
              <Text style={styles.tenantPhone}>
                {tenant?.phone} • {tenant?.email}
              </Text>
            </View>
          </View>

          {/* Quick Contact & Action Buttons */}
          <View style={styles.contactActionRow}>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => handleCall(tenant?.phone)}
              activeOpacity={0.8}
            >
              <Feather name="phone" size={14} color="#059669" />
              <Text style={styles.actionBtnText}>Call</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => handleEmail(tenant?.email)}
              activeOpacity={0.8}
            >
              <Feather name="mail" size={14} color="#2563EB" />
              <Text style={[styles.actionBtnText, { color: '#2563EB' }]}>Email</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, { borderColor: '#FECACA', backgroundColor: '#FEF2F2' }]}
              onPress={() => onInitiateVacatePress?.(tenant?.unit || '')}
              activeOpacity={0.8}
            >
              <Feather name="log-out" size={14} color="#DC2626" />
              <Text style={[styles.actionBtnText, { color: '#DC2626' }]}> Vacate</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.cardDivider} />

          <View style={styles.financialRow}>
            <View>
              <Text style={styles.finLabel}>MONTHLY RENT</Text>
              <Text style={styles.finValue}>
                {format(tenant?.rent || 0, tenant?.currency || viewCurrency)}
              </Text>
            </View>
            <View>
              <Text style={styles.finLabel}>DEPOSIT HELD</Text>
              <Text style={styles.finValue}>
                {format(tenant?.deposit || 0, tenant?.currency || viewCurrency)}
              </Text>
            </View>
            <View>
              <Text style={styles.finLabel}>DUE BALANCE</Text>
              <Text style={[styles.finValue, { color: pendingDue > 0 ? '#EF4444' : '#10B981' }]}>
                {pendingDue > 0 ? format(pendingDue, tenant?.currency || viewCurrency) : `Clear (${format(0, tenant?.currency || viewCurrency)})`}
              </Text>
            </View>
          </View>
        </View>

        {/* Emergency Contact Card */}
        {tenant?.emergencyContact && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Emergency Contact</Text>
            <View style={styles.emergencyRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.emergencyName}>{tenant.emergencyContact.name}</Text>
                <Text style={styles.emergencySub}>
                  {tenant.emergencyContact.relation} • {tenant.emergencyContact.phone}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.emergencyCallBtn}
                onPress={() => handleCall(tenant.emergencyContact?.phone)}
                activeOpacity={0.8}
              >
                <Feather name="phone-call" size={13} color="#DC2626" />
                <Text style={styles.emergencyCallText}>SOS Call</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* KYC Verification & Security Credentials */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Identity & Verification Status</Text>

          <View style={styles.kycRow}>
            <View style={styles.kycLeft}>
              <Ionicons name="card-outline" size={18} color={tenant?.aadhaarNumber ? "#059669" : "#F59E0B"} />
              <View style={{ marginLeft: 8 }}>
                <Text style={styles.kycTitle}>Aadhaar Number</Text>
                <Text style={styles.kycSub}>{tenant?.aadhaarNumber || 'Not Uploaded / Pending'}</Text>
              </View>
            </View>
            <Ionicons
              name={tenant?.aadhaarNumber ? "checkmark-circle" : "time-outline"}
              size={18}
              color={tenant?.aadhaarNumber ? "#059669" : "#F59E0B"}
            />
          </View>

          <View style={styles.kycRow}>
            <View style={styles.kycLeft}>
              <Ionicons name="document-text-outline" size={18} color={tenant?.panNumber ? "#059669" : "#F59E0B"} />
              <View style={{ marginLeft: 8 }}>
                <Text style={styles.kycTitle}>PAN Card</Text>
                <Text style={styles.kycSub}>{tenant?.panNumber || 'Not Uploaded / Pending'}</Text>
              </View>
            </View>
            <Ionicons
              name={tenant?.panNumber ? "checkmark-circle" : "time-outline"}
              size={18}
              color={tenant?.panNumber ? "#059669" : "#F59E0B"}
            />
          </View>

          <View style={styles.kycRow}>
            <View style={styles.kycLeft}>
              <Ionicons name="shield-checkmark-outline" size={18} color={tenant?.policeVerificationDone ? "#059669" : "#94A3B8"} />
              <View style={{ marginLeft: 8 }}>
                <Text style={styles.kycTitle}>Local Police Verification</Text>
                <Text style={styles.kycSub}>
                  {tenant?.policeVerificationDone ? 'Clearance certificate verified on file' : 'Verification pending / not conducted'}
                </Text>
              </View>
            </View>
            <Ionicons
              name={tenant?.policeVerificationDone ? "checkmark-circle" : "ellipse-outline"}
              size={18}
              color={tenant?.policeVerificationDone ? "#059669" : "#94A3B8"}
            />
          </View>

          {/* Uploaded / Requested KYC Documents */}
          {tenant?.kycDocuments && tenant.kycDocuments.length > 0 && (
            <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748B', marginBottom: 6 }}>
                UPLOADED ID PROOFS ({tenant.kycDocuments.length})
              </Text>
              {tenant.kycDocuments.map((doc, idx) => (
                <View key={idx} style={[styles.kycRow, { marginBottom: 6 }]}>
                  <View style={styles.kycLeft}>
                    <Ionicons name="document-attach-outline" size={16} color="#2563EB" />
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#1E293B', marginLeft: 8 }}>
                      {doc.title}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 11, color: doc.verified ? '#059669' : '#F59E0B', fontWeight: '600' }}>
                    {doc.verified ? 'Verified ✓' : 'Pending Review'}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Lease & Dates */}
        <View style={styles.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Text style={styles.cardTitle}>
              {pendingTenancyRequest ? 'Tenancy Offer (Pending Acceptance)' : 'Lease Information'}
            </Text>
            {pendingTenancyRequest ? (
              <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 }}>
                <Text style={{ fontSize: 11, color: '#B45309', fontWeight: '700' }}>PENDING ACCEPTANCE</Text>
              </View>
            ) : tenantAgreement?.status === 'active' && tenantAgreement?.depositStatus === 'paid' ? (
              <View style={{ backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 }}>
                <Text style={{ fontSize: 11, color: '#15803D', fontWeight: '700' }}>ACTIVE LEASE</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.leaseDetailRow}>
            <Text style={styles.leaseDetailLabel}>Agreement ID</Text>
            <Text style={styles.leaseDetailVal}>
              {tenantAgreement?.id || (pendingTenancyRequest ? 'Pending Acceptance' : 'No Active Lease')}
            </Text>
          </View>
          <View style={styles.leaseDetailRow}>
            <Text style={styles.leaseDetailLabel}>Lease Period</Text>
            <Text style={styles.leaseDetailVal}>
              {tenantAgreement?.start || pendingTenancyRequest?.leaseStart || tenant?.leaseStart || 'N/A'} to {tenantAgreement?.end || pendingTenancyRequest?.leaseEnd || tenant?.leaseEnd || 'N/A'}
            </Text>
          </View>
          <View style={styles.leaseDetailRow}>
            <Text style={styles.leaseDetailLabel}>Annual Escalation</Text>
            <Text style={styles.leaseDetailVal}>
              {tenantAgreement?.escalationPercent != null ? `${tenantAgreement.escalationPercent}% annually` : 'Standard terms'}
            </Text>
          </View>
          <View style={styles.leaseDetailRow}>
            <Text style={styles.leaseDetailLabel}>Notice Period Requirement</Text>
            <Text style={styles.leaseDetailVal}>
              {tenantAgreement?.noticePeriodDays != null ? `${tenantAgreement.noticePeriodDays} days written` : '30 days written'}
            </Text>
          </View>
        </View>

        {/* Maintenance Tickets by this resident */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Recent Repair Tickets ({tenantTickets.length})</Text>

          {tenantTickets.length === 0 ? (
            <Text style={{ fontSize: 12, color: '#94A3B8', paddingVertical: 8 }}>No repair requests on record.</Text>
          ) : (
            tenantTickets.map((tck) => (
              <View key={tck.id} style={styles.tckRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tckIssue}>{tck.issue}</Text>
                  <Text style={styles.tckMeta}>{tck.id} • {tck.category}</Text>
                </View>
                <View style={tck.status === 'resolved' ? styles.statusBadgeGreen : styles.statusBadgeAmber}>
                  <Text style={tck.status === 'resolved' ? styles.statusBadgeTextGreen : styles.statusBadgeTextAmber}>
                    {tck.status.toUpperCase()}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    marginRight: 10,
    padding: 4,
  },
  logoBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.navy,
  },
  headerSub: {
    fontSize: 11,
    color: colors.inkSoft,
  },
  verifiedBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  verifiedBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 30,
  },
  tenantPillsRow: {
    marginBottom: 12,
  },
  tPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    marginRight: 8,
  },
  tPillActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#059669',
  },
  tPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.inkSoft,
  },
  tPillTextActive: {
    color: '#059669',
    fontWeight: '700',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    marginBottom: 12,
  },
  profileTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: isDark ? colors.surfaceSunken : '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.navy,
  },
  tenantName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.navy,
  },
  tenantUnit: {
    fontSize: 12,
    color: colors.inkSoft,
    marginTop: 2,
  },
  tenantPhone: {
    fontSize: 11,
    color: colors.inkMuted,
    marginTop: 1,
  },
  contactActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
  },
  actionBtnText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#059669',
  },
  cardDivider: {
    height: 1,
    backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
    marginVertical: 12,
  },
  financialRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  finLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.inkSoft,
  },
  finValue: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.navy,
    marginTop: 2,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.navy,
    marginBottom: 10,
  },
  emergencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    padding: 10,
  },
  emergencyName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#991B1B',
  },
  emergencySub: {
    fontSize: 11.5,
    color: '#B91C1C',
    marginTop: 2,
  },
  emergencyCallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  emergencyCallText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },
  kycRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  kycLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  kycTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.navy,
  },
  kycSub: {
    fontSize: 11,
    color: colors.inkSoft,
  },
  leaseDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  leaseDetailLabel: {
    fontSize: 12,
    color: colors.inkSoft,
  },
  leaseDetailVal: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.navy,
  },
  tckRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  tckIssue: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.navy,
  },
  tckMeta: {
    fontSize: 11,
    color: colors.inkSoft,
    marginTop: 1,
  },
  statusBadgeGreen: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusBadgeTextGreen: {
    fontSize: 9,
    fontWeight: '700',
    color: '#059669',
  },
  statusBadgeAmber: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusBadgeTextAmber: {
    fontSize: 9,
    fontWeight: '700',
    color: '#D97706',
  },
});
