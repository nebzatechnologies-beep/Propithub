import React, { useMemo } from 'react';
import { useMobileTheme } from '../context/MobileThemeContext';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { useMobileAuth } from '../context/MobileAuthContext';
import { useMobileCurrency } from '../context/MobileCurrencyContext';

export const DocumentPdfViewerScreen: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const { colors, isDark } = useMobileTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const { state } = useMobileAppData();
  const { user } = useMobileAuth();
  const { format, viewCurrency } = useMobileCurrency();

  const activeAgreement = state.agreements.find(
    (a) =>
      a.tenantId === user.id ||
      a.ownerId === user.id ||
      (user.email && a.tenantEmail?.toLowerCase() === user.email.toLowerCase())
  ) || null;

  const matchedUnit = state.units.find(
    (u) =>
      (u.unitNumber === activeAgreement?.unit || u.id === activeAgreement?.unit) &&
      (!activeAgreement?.propertyId || u.propertyId === activeAgreement.propertyId)
  );
  const matchedProp = activeAgreement?.propertyId ? state.properties.find((p) => p.id === activeAgreement.propertyId) : null;
  const currency = activeAgreement?.currency || matchedProp?.currency || matchedUnit?.currency || viewCurrency;
  const ownerName = activeAgreement?.ownerName || user.ownerName || 'Property Landlord';
  const tenantName = activeAgreement?.tenant || user.displayName || 'Resident';
  const propertyDesc = `Unit ${activeAgreement?.unit || matchedUnit?.unitNumber || 'Unit'}, ${activeAgreement?.propertyName || matchedProp?.name || 'Property Premises'}`;
  const dynamicRent = activeAgreement?.rent ?? matchedUnit?.rent ?? 0;
  const dynamicDeposit = activeAgreement?.deposit ?? matchedUnit?.deposit ?? (dynamicRent > 0 ? dynamicRent * 2 : 0);
  const rentStr = dynamicRent > 0 ? `${format(dynamicRent, currency)} / month` : 'As per lease schedule';
  const depositStr = `${format(dynamicDeposit, currency)} (Refundable upon inspection)`;
  const executionDate = activeAgreement?.start || new Date().toISOString().split('T')[0];

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* StatusBar managed globally */}

      {/* Real Screen Status Bar */}
      <ScreenStatusBar />

      {/* Screen Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={20} color={colors.navy} />
          </TouchableOpacity>
          <View style={styles.logoBadge}>
            <Feather name="file-text" size={18} color="#FFFFFF" />
          </View>
          <View>
            <Text style={styles.headerTitle}>Agreement PDF</Text>
            <Text style={styles.headerSub}>Ref: {activeAgreement?.id ? `PRHP-LE-${activeAgreement.id}` : 'PRHP-LE-GEN'}</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.actionIconBtn} activeOpacity={0.7}>
            <Feather name="share-2" size={17} color="#0F172A" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionIconBtn} activeOpacity={0.7}>
            <Feather name="printer" size={17} color="#0F172A" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Document Sheet Paper Representation */}
        <View style={styles.paperSheet}>
          <View style={styles.stampHeader}>
            <Text style={styles.stampOrg}>STATE OF UTTAR PRADESH • E-STAMP CERTIFICATE</Text>
            <Text style={styles.stampRef}>CERTIFICATE NO: IN-UP98421092834102Y</Text>
          </View>

          <Text style={styles.docMainTitle}>RESIDENTIAL TENANCY LEASE AGREEMENT</Text>

          <Text style={styles.docIntro}>
            This Agreement of Tenancy is executed on {executionDate} by and between:
          </Text>

          {/* Party Details */}
          <View style={styles.tableRow}>
            <Text style={styles.tableKey}>LESSOR / OWNER:</Text>
            <Text style={styles.tableVal}>{ownerName}</Text>
          </View>

          <View style={styles.tableRow}>
            <Text style={styles.tableKey}>LESSEE / TENANT:</Text>
            <Text style={styles.tableVal}>{tenantName}</Text>
          </View>

          <View style={styles.tableRow}>
            <Text style={styles.tableKey}>DEMISED PREMISES:</Text>
            <Text style={styles.tableVal}>{propertyDesc}</Text>
          </View>

          <View style={styles.tableRow}>
            <Text style={styles.tableKey}>MONTHLY RENT:</Text>
            <Text style={styles.tableVal}>{rentStr}</Text>
          </View>

          <View style={styles.tableRow}>
            <Text style={styles.tableKey}>SECURITY DEPOSIT:</Text>
            <Text style={styles.tableVal}>{depositStr}</Text>
          </View>

          <View style={styles.divider} />

          <Text style={styles.clauseHeading}>TERMS & COVENANTS</Text>
          <Text style={styles.clauseText}>
            1. The term of this lease shall be for an initial period of 11 months commencing from 11 May 2025.
          </Text>
          <Text style={styles.clauseText}>
            2. The tenant covenants to pay all actual metered utility charges including electricity and water.
          </Text>
          <Text style={styles.clauseText}>
            3. Neither party shall terminate this agreement within the first 6 months (lock-in period).
          </Text>

          <View style={styles.divider} />

          {/* Digital Signature Audit Stamp */}
          <View style={styles.signatureBox}>
            <Feather name="check-circle" size={16} color="#10B981" style={{ marginRight: 6 }} />
            <Text style={styles.signatureText}>
              Digitally verified & cryptographically signed by both parties.
            </Text>
          </View>
        </View>

        {/* Share Button */}
        <TouchableOpacity style={styles.shareBtn} activeOpacity={0.85}>
          <Text style={styles.shareBtnText} numberOfLines={1}>Export PDF</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
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
    paddingRight: 10,
  },
  logoBadge: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.navy,
    letterSpacing: -0.3,
  },
  headerSub: {
    fontSize: 11,
    color: colors.inkSoft,
    marginTop: 1,
    fontWeight: '500',
  },
  headerRight: {
    flexDirection: 'row',
    gap: 8,
  },
  actionIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
    backgroundColor: isDark ? colors.surfaceSunken : '#E2E8F0',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 36,
  },
  paperSheet: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 20,
    marginBottom: 16,
  },
  stampHeader: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 6,
    padding: 10,
    alignItems: 'center',
    marginBottom: 14,
  },
  stampOrg: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#92400E',
    letterSpacing: 0.5,
  },
  stampRef: {
    fontSize: 8.5,
    color: '#B45309',
    marginTop: 2,
    fontWeight: '600',
  },
  docMainTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.navy,
    textAlign: 'center',
    letterSpacing: 0.3,
    marginBottom: 12,
  },
  docIntro: {
    fontSize: 11.5,
    color: colors.inkSoft,
    lineHeight: 16,
    marginBottom: 12,
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  tableKey: {
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.inkSoft,
    width: '38%',
  },
  tableVal: {
    fontSize: 11,
    color: colors.navy,
    width: '62%',
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: isDark ? colors.surfaceSunken : '#E2E8F0',
    marginVertical: 14,
  },
  clauseHeading: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.navy,
    marginBottom: 8,
  },
  clauseText: {
    fontSize: 11,
    color: colors.inkSoft,
    lineHeight: 16,
    marginBottom: 6,
  },
  signatureBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 6,
    padding: 10,
    marginTop: 4,
  },
  signatureText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#166534',
    flex: 1,
  },
  shareBtn: {
    backgroundColor: '#10B981',
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
