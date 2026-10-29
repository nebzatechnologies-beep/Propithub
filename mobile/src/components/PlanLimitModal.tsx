import React, { useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Platform,
  StatusBar,
} from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { ResourceQuotaType } from '../hooks/usePlanLimits';
import { useMobileTheme } from '../context/MobileThemeContext';

interface PlanLimitModalProps {
  visible: boolean;
  resourceType: ResourceQuotaType | null;
  currentUsage?: number;
  limit?: number;
  planName?: string;
  onClose: () => void;
  onUpgrade?: () => void;
}

const RESOURCE_LABELS: Record<
  ResourceQuotaType,
  { singular: string; plural: string; description: string; icon: keyof typeof Feather.glyphMap }
> = {
  properties: {
    singular: 'Property',
    plural: 'Properties',
    description: 'Add more buildings, estates, or commercial complexes to your portfolio.',
    icon: 'home',
  },
  units: {
    singular: 'Unit',
    plural: 'Units',
    description: 'Create additional apartments, flats, or commercial spaces under your properties.',
    icon: 'layers',
  },
  tenants: {
    singular: 'Tenant',
    plural: 'Tenants',
    description: 'Onboard and manage additional tenants with automated billing and agreements.',
    icon: 'users',
  },
  managers: {
    singular: 'Property Manager',
    plural: 'Property Managers',
    description: 'Delegate building operations and tenant communications to managers.',
    icon: 'shield',
  },
  staff: {
    singular: 'Staff Member',
    plural: 'Staff Members',
    description: 'Add maintenance techs, security personnel, and support team members.',
    icon: 'tool',
  },
};

export const PlanLimitModal: React.FC<PlanLimitModalProps> = ({
  visible,
  resourceType,
  currentUsage = 0,
  limit = 0,
  planName = 'Free Trial',
  onClose,
  onUpgrade,
}) => {
  const { colors, isDark } = useMobileTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  if (!visible || !resourceType) return null;

  const info = RESOURCE_LABELS[resourceType] || {
    singular: 'Resource',
    plural: 'Resources',
    description: 'Unlock more capacity by upgrading your subscription tier.',
    icon: 'lock',
  };

  const isZeroLimit = limit === 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <SafeAreaView style={styles.safeArea}>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            {/* Header: Icon + Close Button */}
            <View style={styles.headerRow}>
              <View style={[styles.iconCircle, isDark && { backgroundColor: 'rgba(217, 119, 6, 0.15)', borderColor: 'rgba(217, 119, 6, 0.3)' }]}>
                <Feather name={info.icon} size={20} color="#D97706" />
              </View>
              <TouchableOpacity
                onPress={onClose}
                style={[styles.closeBtn, { backgroundColor: colors.surfaceSunken }]}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                activeOpacity={0.7}
              >
                <Feather name="x" size={18} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>

            {/* Scrollable Body to Guarantee No Cutoff on Any Screen Size */}
            <ScrollView
              style={styles.bodyScroll}
              contentContainerStyle={styles.bodyContent}
              bounces={false}
              showsVerticalScrollIndicator={false}
            >
              {/* Title & Subtitle */}
              <Text style={[styles.title, { color: colors.navy }]}>
                {info.singular} Limit Reached
              </Text>
              <Text style={[styles.subtitle, { color: colors.inkSoft }]}>
                {isZeroLimit ? (
                  <>
                    <Text style={[styles.bold, { color: colors.navy }]}>{info.plural}</Text> are not included on the{' '}
                    <Text style={styles.boldPlan}>{planName}</Text>. Upgrade your tier to unlock delegation.
                  </>
                ) : (
                  <>
                    You have reached the maximum quota of <Text style={[styles.bold, { color: colors.navy }]}>{limit}</Text> {info.plural.toLowerCase()} permitted on your{' '}
                    <Text style={styles.boldPlan}>{planName}</Text>.
                  </>
                )}
              </Text>

              {/* Progress Gauge */}
              <View style={[styles.gaugeContainer, { backgroundColor: colors.surfaceSunken, borderColor: colors.line }]}>
                <View style={styles.gaugeHeader}>
                  <Text style={[styles.gaugeLabel, { color: colors.inkSoft }]}>Plan Allocation</Text>
                  <Text style={[styles.gaugeValue, isZeroLimit ? styles.gaugeZero : styles.gaugeFull]}>
                    {isZeroLimit ? `0 Allowed on ${planName}` : `${currentUsage} / ${limit} Used`}
                  </Text>
                </View>
                <View style={[styles.progressBarBg, { backgroundColor: colors.line }]}>
                  <View
                    style={[
                      styles.progressBarFill,
                      { width: isZeroLimit ? '100%' : `${Math.min(100, (currentUsage / Math.max(1, limit)) * 100)}%` },
                      isZeroLimit ? styles.progressBarZero : styles.progressBarFull,
                    ]}
                  />
                </View>
                <Text style={[styles.gaugeDesc, { color: colors.inkSoft }]}>{info.description}</Text>
              </View>

              {/* Benefits Box */}
              <View style={[styles.benefitsBox, isDark && { backgroundColor: 'rgba(16, 185, 129, 0.12)', borderColor: 'rgba(16, 185, 129, 0.25)' }]}>
                <Text style={[styles.benefitsTitle, isDark && { color: '#34D399' }]}>Upgrade to unlock:</Text>
                <View style={styles.benefitItem}>
                  <Ionicons name="checkmark-circle" size={16} color="#16A34A" style={styles.benefitIcon} />
                  <Text style={[styles.benefitText, isDark && { color: '#6EE7B7' }]}>Expanded property & unit quotas</Text>
                </View>
                <View style={styles.benefitItem}>
                  <Ionicons name="checkmark-circle" size={16} color="#16A34A" style={styles.benefitIcon} />
                  <Text style={[styles.benefitText, isDark && { color: '#6EE7B7' }]}>Unlimited tenant onboarding & leases</Text>
                </View>
                <View style={styles.benefitItem}>
                  <Ionicons name="checkmark-circle" size={16} color="#16A34A" style={styles.benefitIcon} />
                  <Text style={[styles.benefitText, isDark && { color: '#6EE7B7' }]}>Dedicated team collaboration & managers</Text>
                </View>
              </View>
            </ScrollView>

            {/* Actions: Sticky at Bottom of Card */}
            <View style={styles.actionCol}>
              <TouchableOpacity
                style={[styles.upgradeBtn, { backgroundColor: colors.primary }]}
                onPress={() => {
                  onClose();
                  if (onUpgrade) onUpgrade();
                }}
                activeOpacity={0.88}
              >
                <Feather name="zap" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.upgradeBtnText}>Upgrade Subscription</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={onClose}
                activeOpacity={0.7}
              >
                <Text style={[styles.cancelBtnText, { color: colors.inkSoft }]}>Maybe Later</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
};

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 16 : 48,
    paddingBottom: Platform.OS === 'android' ? 24 : 36,
  },
  safeArea: {
    width: '100%',
    maxWidth: 390,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxHeight: '100%',
    backgroundColor: colors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bodyScroll: {
    flexShrink: 1,
    marginBottom: 12,
  },
  bodyContent: {
    paddingBottom: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.navy,
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13.5,
    color: colors.inkSoft,
    lineHeight: 19,
    marginBottom: 14,
  },
  bold: {
    fontWeight: '700',
    color: colors.navy,
  },
  boldPlan: {
    fontWeight: '700',
    color: '#D97706',
  },
  gaugeContainer: {
    backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    marginBottom: 12,
  },
  gaugeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  gaugeLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    color: colors.inkSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  gaugeValue: {
    fontSize: 12,
    fontWeight: '700',
  },
  gaugeFull: {
    color: '#DC2626',
  },
  gaugeZero: {
    color: '#D97706',
  },
  progressBarBg: {
    height: 6,
    backgroundColor: isDark ? colors.surfaceSunken : '#E2E8F0',
    borderRadius: 999,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 999,
  },
  progressBarFull: {
    backgroundColor: '#DC2626',
  },
  progressBarZero: {
    backgroundColor: '#F59E0B',
  },
  gaugeDesc: {
    fontSize: 11.5,
    color: colors.inkSoft,
    lineHeight: 15,
  },
  benefitsBox: {
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    padding: 12,
    marginBottom: 4,
  },
  benefitsTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#166534',
    marginBottom: 6,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  benefitIcon: {
    marginRight: 6,
  },
  benefitText: {
    fontSize: 12,
    color: '#15803D',
    fontWeight: '500',
    flex: 1,
  },
  actionCol: {
    paddingTop: 8,
    gap: 6,
  },
  upgradeBtn: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  upgradeBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  cancelBtn: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: colors.inkSoft,
    fontSize: 13,
    fontWeight: '600',
  },
});
