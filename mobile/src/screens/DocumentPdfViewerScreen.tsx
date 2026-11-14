import React, { useMemo, useState, useCallback } from 'react';
import { useMobileTheme } from '../context/MobileThemeContext';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Ionicons, Feather } from '@expo/vector-icons';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { useMobileAuth } from '../context/MobileAuthContext';
import { useMobileCurrency } from '../context/MobileCurrencyContext';
import { useMobileToast } from '../context/MobileToastContext';

const escapeHtml = (val: string) =>
  val
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const DocumentPdfViewerScreen: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const { colors, isDark } = useMobileTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const { state } = useMobileAppData();
  const { user } = useMobileAuth();
  const { format, viewCurrency } = useMobileCurrency();
  const { showToast } = useMobileToast();
  const [refreshing, setRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  }, []);

  const activeAgreement = useMemo(() => {
    const userAgreements = state.agreements.filter(
      (a) =>
        a.tenantId === user?.id ||
        a.ownerId === user?.id ||
        (user?.email && a.tenantEmail?.toLowerCase() === user.email.toLowerCase())
    );
    return (
      userAgreements.find((a) => a.status === 'active') ||
      userAgreements.find((a) => !a.isDraft) ||
      userAgreements[0] ||
      null
    );
  }, [state.agreements, user?.id, user?.email]);

  const matchedUnit = state.units.find(
    (u) =>
      (u.unitNumber === activeAgreement?.unit || u.id === activeAgreement?.unit) &&
      (!activeAgreement?.propertyId || u.propertyId === activeAgreement.propertyId)
  );
  const matchedProp = activeAgreement?.propertyId
    ? state.properties.find((p) => p.id === activeAgreement.propertyId)
    : null;

  const currency = activeAgreement?.currency || matchedProp?.currency || matchedUnit?.currency || viewCurrency;
  const ownerName = activeAgreement?.ownerName || user?.ownerName || 'Property Landlord';
  const tenantName = activeAgreement?.tenant || user?.displayName || 'Resident';
  const propAddress =
    typeof matchedProp?.address === 'string'
      ? matchedProp.address
      : matchedProp?.address
      ? [
          matchedProp.address.street,
          matchedProp.address.city,
          matchedProp.address.state,
          matchedProp.address.country,
        ]
          .filter(Boolean)
          .join(', ')
      : '';
  const propertyDesc = `Unit ${activeAgreement?.unit || matchedUnit?.unitNumber || '—'}, ${activeAgreement?.propertyName || matchedProp?.name || 'Property Premises'}${propAddress ? ` (${propAddress})` : ''}`;
  const dynamicRent = activeAgreement?.rent ?? matchedUnit?.rent ?? 0;
  const dynamicDeposit = activeAgreement?.deposit ?? matchedUnit?.deposit ?? (dynamicRent > 0 ? dynamicRent * 2 : 0);
  const rentStr = dynamicRent > 0 ? `${format(dynamicRent, currency)} / month` : 'As per lease schedule';
  const depositStr = `${format(dynamicDeposit, currency)} (Refundable upon inspection)`;
  const executionDate = activeAgreement?.start || activeAgreement?.createdAt?.split('T')[0] || 'Pending Start Date';
  const leaseEndDate = activeAgreement?.end || 'Open / Periodic';
  const dueDay = activeAgreement?.rentDueDay || activeAgreement?.dueDay || 1;
  const lockInMonths = activeAgreement?.lockInMonths ?? matchedProp?.rules?.minLeaseMonths ?? 0;
  const noticePeriodDays = activeAgreement?.noticePeriodDays ?? matchedProp?.rules?.noticePeriodDays ?? 30;
  const escalationPercent = activeAgreement?.escalationPercent ?? 0;
  const docRef = activeAgreement?.id ? `PRHP-LE-${activeAgreement.id}` : 'PRHP-LE-DRAFT';
  const statusLabel = (activeAgreement?.status || 'draft').replace(/_/g, ' ').toUpperCase();
  const jurisdictionHeader = matchedProp?.country
    ? `${matchedProp.country.toUpperCase()} • DIGITAL LEASE RECORD`
    : 'PROPITHUB CLOUD • DIGITAL LEASE RECORD';

  const clauses = useMemo(() => {
    const list: string[] = [];
    if (activeAgreement?.start && activeAgreement?.end) {
      list.push(`Lease Term: Commences on ${activeAgreement.start} and concludes on ${activeAgreement.end}.`);
    } else {
      list.push(`Lease Term: Effective from ${executionDate} (${leaseEndDate}).`);
    }
    list.push(`Rent Payment Schedule: Monthly rent of ${rentStr} is payable on or before day ${dueDay} of each month.`);
    list.push(`Notice Period: Either party must provide at least ${noticePeriodDays} days prior written notice before vacating or terminating.`);
    if (lockInMonths > 0) {
      list.push(`Lock-In Period: Neither party may terminate this agreement within the initial ${lockInMonths} month(s) lock-in period.`);
    }
    if (escalationPercent > 0) {
      list.push(`Annual Escalation: Monthly rent is subject to an annual escalation of ${escalationPercent}% upon renewal.`);
    }
    if (activeAgreement?.specialClauses && activeAgreement.specialClauses.length > 0) {
      activeAgreement.specialClauses.forEach((c) => {
        if (c && c.trim()) list.push(c.trim());
      });
    }
    return list;
  }, [activeAgreement, executionDate, leaseEndDate, rentStr, dueDay, noticePeriodDays, lockInMonths, escalationPercent]);

  const buildPdfHtml = useCallback(() => {
    const clauseItems = clauses.map((c, idx) => `<li><strong>${idx + 1}.</strong> ${escapeHtml(c)}</li>`).join('');
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #0F172A; padding: 32px; line-height: 1.5; }
            .stamp { background: #ECFDF5; border: 1px solid #A7F3D0; border-radius: 8px; padding: 12px; text-align: center; margin-bottom: 20px; }
            .stamp-org { font-size: 11px; font-weight: 700; color: #065F46; letter-spacing: 0.6px; }
            .stamp-ref { font-size: 10px; color: #047857; margin-top: 4px; }
            h1 { font-size: 18px; text-align: center; margin: 0 0 12px; letter-spacing: 0.4px; }
            .intro { font-size: 13px; color: #475569; margin-bottom: 18px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
            td { padding: 8px 6px; border-bottom: 1px solid #E2E8F0; font-size: 13px; vertical-align: top; }
            td.k { font-weight: 700; color: #475569; width: 38%; }
            td.v { font-weight: 600; color: #0F172A; }
            h2 { font-size: 13px; letter-spacing: 0.5px; margin: 18px 0 8px; border-top: 1px solid #E2E8F0; padding-top: 14px; }
            ul { padding-left: 0; list-style: none; margin: 0; }
            li { font-size: 12.5px; color: #334155; margin-bottom: 8px; }
            .sig { margin-top: 20px; background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 8px; padding: 12px; font-size: 12px; color: #166534; font-weight: 600; }
          </style>
        </head>
        <body>
          <div class="stamp">
            <div class="stamp-org">${escapeHtml(jurisdictionHeader)}</div>
            <div class="stamp-ref">DOCUMENT REF: ${escapeHtml(docRef)} • STATUS: ${escapeHtml(statusLabel)}</div>
          </div>
          <h1>RESIDENTIAL TENANCY LEASE AGREEMENT</h1>
          <p class="intro">This Agreement of Tenancy is recorded with execution start date ${escapeHtml(executionDate)} and term end ${escapeHtml(leaseEndDate)} by and between:</p>
          <table>
            <tr><td class="k">LESSOR / OWNER</td><td class="v">${escapeHtml(ownerName)}</td></tr>
            <tr><td class="k">LESSEE / TENANT</td><td class="v">${escapeHtml(tenantName)}</td></tr>
            <tr><td class="k">DEMISED PREMISES</td><td class="v">${escapeHtml(propertyDesc)}</td></tr>
            <tr><td class="k">MONTHLY RENT</td><td class="v">${escapeHtml(rentStr)}</td></tr>
            <tr><td class="k">SECURITY DEPOSIT</td><td class="v">${escapeHtml(depositStr)}</td></tr>
            <tr><td class="k">EXECUTION MODE</td><td class="v">${escapeHtml((activeAgreement?.executionMode || 'digital_dispatch').replace(/_/g, ' ').toUpperCase())}</td></tr>
          </table>
          <h2>TERMS & COVENANTS</h2>
          <ul>${clauseItems}</ul>
          <div class="sig">
            ${
              activeAgreement?.tenantSignedAt || activeAgreement?.approvedAt
                ? `Verified lease record • Tenant signed: ${escapeHtml(activeAgreement?.tenantSignedAt?.split('T')[0] || 'Recorded')} • Landlord/Approval: ${escapeHtml((activeAgreement?.approvedAt || activeAgreement?.ownerSignedAt || executionDate).split('T')[0])}`
                : 'Draft / Pending execution lease summary generated from Propithub.'
            }
          </div>
        </body>
      </html>
    `;
  }, [jurisdictionHeader, docRef, statusLabel, executionDate, leaseEndDate, ownerName, tenantName, propertyDesc, rentStr, depositStr, activeAgreement, clauses]);

  const handlePrintPdf = async () => {
    setIsExporting(true);
    try {
      await Print.printAsync({ html: buildPdfHtml() });
    } catch (err: any) {
      Alert.alert('Print Error', err?.message || 'Unable to launch print dialog.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportOrSharePdf = async () => {
    setIsExporting(true);
    try {
      const html = buildPdfHtml();
      if (Platform.OS === 'web') {
        await Print.printAsync({ html });
        showToast('Print / Save as PDF opened ✓', 'success');
        return;
      }
      const { uri } = await Print.printToFileAsync({ html });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `Share Lease Agreement (${docRef})`,
          UTI: 'com.adobe.pdf',
        });
        showToast('Agreement PDF ready ✓', 'success');
      } else {
        await Print.printAsync({ html });
      }
    } catch (err: any) {
      Alert.alert('Export Error', err?.message || 'Unable to export agreement PDF.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
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
          <View style={{ flexShrink: 1 }}>
            <Text style={styles.headerTitle} numberOfLines={1}>Agreement PDF</Text>
            <Text style={styles.headerSub} numberOfLines={1}>Ref: {docRef}</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.actionIconBtn}
            onPress={handleExportOrSharePdf}
            disabled={isExporting}
            activeOpacity={0.7}
          >
            <Feather name="share-2" size={17} color={colors.navy} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionIconBtn}
            onPress={handlePrintPdf}
            disabled={isExporting}
            activeOpacity={0.7}
          >
            <Feather name="printer" size={17} color={colors.navy} />
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        enabled={Platform.OS !== 'web'}
      >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* Document Sheet Paper Representation */}
        <View style={styles.paperSheet}>
          <View style={[styles.stampHeader, isDark && { backgroundColor: 'rgba(16, 185, 129, 0.12)', borderColor: 'rgba(16, 185, 129, 0.35)' }]}>
            <Text style={[styles.stampOrg, isDark && { color: '#34D399' }]}>{jurisdictionHeader}</Text>
            <Text style={[styles.stampRef, isDark && { color: '#A7F3D0' }]}>
              REF: {docRef} • STATUS: {statusLabel}
            </Text>
          </View>

          <Text style={styles.docMainTitle}>RESIDENTIAL TENANCY LEASE AGREEMENT</Text>

          <Text style={styles.docIntro}>
            This Agreement of Tenancy covers the term starting {executionDate} through {leaseEndDate} by and between:
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

          <View style={styles.tableRow}>
            <Text style={styles.tableKey}>LEASE TERM:</Text>
            <Text style={styles.tableVal}>{executionDate} → {leaseEndDate}</Text>
          </View>

          <View style={styles.tableRow}>
            <Text style={styles.tableKey}>NOTICE / LOCK-IN:</Text>
            <Text style={styles.tableVal}>{noticePeriodDays} days notice • {lockInMonths} mo lock-in</Text>
          </View>

          <View style={styles.divider} />

          <Text style={styles.clauseHeading}>TERMS & COVENANTS</Text>
          {clauses.map((clause, index) => (
            <Text key={index} style={styles.clauseText}>
              {index + 1}. {clause}
            </Text>
          ))}

          <View style={styles.divider} />

          {/* Digital Signature Audit Stamp */}
          <View style={[styles.signatureBox, isDark && { backgroundColor: 'rgba(16, 185, 129, 0.12)', borderColor: 'rgba(16, 185, 129, 0.3)' }]}>
            <Feather
              name={activeAgreement?.tenantSignedAt || activeAgreement?.approvedAt ? 'check-circle' : 'file-text'}
              size={16}
              color="#10B981"
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.signatureText, isDark && { color: '#A7F3D0' }]}>
              {activeAgreement?.tenantSignedAt || activeAgreement?.approvedAt
                ? `Digitally verified lease (${statusLabel}) • Tenant: ${activeAgreement?.tenantSignedAt?.split('T')[0] || 'Signed'} • Owner: ${(activeAgreement?.approvedAt || activeAgreement?.ownerSignedAt || executionDate).split('T')[0]}`
                : activeAgreement
                ? `Lease record status: ${statusLabel}. Pending final signature or activation.`
                : 'No active agreement linked yet. Showing summary template.'}
            </Text>
          </View>
        </View>

        {/* Share / Export PDF Button */}
        <TouchableOpacity
          style={[styles.shareBtn, isExporting && { opacity: 0.7 }]}
          onPress={handleExportOrSharePdf}
          disabled={isExporting}
          activeOpacity={0.85}
        >
          {isExporting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.shareBtnText} numberOfLines={1}>Export & Share PDF</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
      </KeyboardAvoidingView>
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
    flex: 1,
    minWidth: 0,
    marginRight: 8,
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
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 6,
    padding: 10,
    alignItems: 'center',
    marginBottom: 14,
  },
  stampOrg: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#065F46',
    letterSpacing: 0.5,
  },
  stampRef: {
    fontSize: 8.5,
    color: '#047857',
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
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: isDark ? colors.lineLight : '#F1F5F9',
    gap: 8,
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
