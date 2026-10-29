import React, { useMemo, useState } from 'react';
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
import { PropithubIcon } from '../components/PropithubLogo';

export const LegalPoliciesScreen: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const { colors, isDark } = useMobileTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [activeTab, setActiveTab] = useState<'terms' | 'privacy' | 'refund'>('terms');

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
            <PropithubIcon size={20} />
          </View>
          <View>
            <Text style={styles.headerTitle}>Legal & Compliance</Text>
          </View>
        </View>
        <View style={styles.legalBadge}>
          <Text style={styles.legalBadgeText}>v2.4</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Navigation Tabs Capsule */}
        <View style={styles.tabContainer}>
          {(['terms', 'privacy', 'refund'] as const).map((t) => {
            const isSelected = activeTab === t;
            const label =
              t === 'terms'
                ? 'Terms of Service'
                : t === 'privacy'
                ? 'Privacy Policy'
                : 'Refund Policy';
            return (
              <TouchableOpacity
                key={t}
                style={[styles.tabButton, isSelected && styles.tabButtonActive]}
                onPress={() => setActiveTab(t)}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabText, isSelected && styles.tabTextActive]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Content Card */}
        <View style={styles.card}>
          {activeTab === 'terms' && (
            <View>
              <Text style={styles.policyTitle}>Terms of Platform Service</Text>
              <Text style={styles.updatedDate}>Last revised: May 2025</Text>

              <Text style={styles.sectionHeader}>1. Tenancy Ledger Immutability</Text>
              <Text style={styles.bodyText}>
                Propithub serves as a neutral record of ledger transactions between property owners and residents. All digital receipts generated upon bank confirmation or verified cash receipts are permanently logged.
              </Text>

              <Text style={styles.sectionHeader}>2. Digital Signature Enforceability</Text>
              <Text style={styles.bodyText}>
                Agreements executed through Propithub’s Digital Signature Canvas constitute legally binding residential tenancy agreements under applicable national and municipal tenancy laws.
              </Text>
            </View>
          )}

          {activeTab === 'privacy' && (
            <View>
              <Text style={styles.policyTitle}>Privacy & Data Protection</Text>
              <Text style={styles.updatedDate}>Last revised: May 2025</Text>

              <Text style={styles.sectionHeader}>1. Identity Document Safeguards</Text>
              <Text style={styles.bodyText}>
                Tenant Aadhaar and PAN documents uploaded for verification are encrypted with AES-256 at rest and masked in all non-administrative views.
              </Text>

              <Text style={styles.sectionHeader}>2. Third-Party Sharing</Text>
              <Text style={styles.bodyText}>
                We do not sell personal data. Financial transaction identifiers are shared solely with authorized payment gateways (Razorpay, Stripe) for reconciliation.
              </Text>

              <Text style={styles.sectionHeader}>3. Right to Erasure &amp; Account Deletion</Text>
              <Text style={styles.bodyText}>
                You can delete your account and personal data at any time through Account Settings → Security → Danger Zone. Requests observe a 72-hour cooling-off grace period during which you can log back in to cancel the deletion and restore complete access. After 72 hours, personal records and authentication credentials are permanently purged.
              </Text>
            </View>
          )}

          {activeTab === 'refund' && (
            <View>
              <Text style={styles.policyTitle}>Refund & Deposit Settlement Policy</Text>
              <Text style={styles.updatedDate}>Last revised: May 2025</Text>

              <Text style={styles.sectionHeader}>1. Security Deposit Remittance</Text>
              <Text style={styles.bodyText}>
                Security deposit balances must be formally released by the property owner within 7 business days following the completion of joint room-by-room move-out inspection.
              </Text>

              <Text style={styles.sectionHeader}>2. Contested Deductions</Text>
              <Text style={styles.bodyText}>
                If a tenant contests repair charges, funds are placed on administrative hold pending dispute mediation review.
              </Text>
            </View>
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
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
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
  legalBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  legalBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
    letterSpacing: 0.2,
  },
  scroll: {
    flex: 1,
    backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 36,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: isDark ? colors.surfaceSunken : '#E2E8F0',
    borderRadius: 12,
    padding: 3,
    marginBottom: 16,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },
  tabButtonActive: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  tabText: {
    fontSize: 11.5,
    fontWeight: '500',
    color: colors.inkSoft,
  },
  tabTextActive: {
    color: colors.navy,
    fontWeight: '700',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 18,
    marginBottom: 16,
  },
  policyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.navy,
  },
  updatedDate: {
    fontSize: 11.5,
    color: colors.inkMuted,
    marginTop: 2,
    marginBottom: 16,
  },
  sectionHeader: {
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.navy,
    marginTop: 10,
    marginBottom: 4,
  },
  bodyText: {
    fontSize: 12.5,
    color: colors.inkSoft,
    lineHeight: 19,
  },
});
