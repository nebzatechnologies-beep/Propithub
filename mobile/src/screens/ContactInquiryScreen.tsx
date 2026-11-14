import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { useMobileTheme } from '../context/MobileThemeContext';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { doc, setDoc } from 'firebase/firestore';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { PropithubIcon } from '../components/PropithubLogo';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { useMobileAuth } from '../context/MobileAuthContext';
import { useMobileToast } from '../context/MobileToastContext';
import { db, isFirebaseConfigured } from '../lib/firebase';

export const ContactInquiryScreen: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const { colors, isDark } = useMobileTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const { createPlatformSupportTicket } = useMobileAppData();
  const { user, role } = useMobileAuth();
  const { showToast } = useMobileToast();

  const [name, setName] = useState(user?.displayName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedRef, setSubmittedRef] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (user?.displayName && !name) setName(user.displayName);
    if (user?.email && !email) setEmail(user.email);
  }, [user?.displayName, user?.email]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  }, []);

  const handleSendMessage = async () => {
    const cleanName = name.trim();
    const cleanEmail = email.trim();
    const cleanMsg = message.trim();

    if (!cleanName || !cleanEmail || !cleanMsg) {
      Alert.alert('Missing Details', 'Please fill in your name, email address, and inquiry message.');
      return;
    }
    if (!cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }

    setIsSubmitting(true);
    try {
      const refId = `TKT-MOB-${Math.floor(100000 + Math.random() * 900000)}`;
      const topic = subject.trim() || `Inquiry from ${cleanName} (${(role || 'general').toUpperCase()})`;
      await createPlatformSupportTicket({
        id: refId,
        userId: user?.id,
        owner: cleanName,
        ownerId: user?.id,
        ownerEmail: cleanEmail,
        topic,
        category: 'general',
        priority: 'medium',
        detail: cleanMsg,
      });

      if (isFirebaseConfigured) {
        await setDoc(
          doc(db, 'platformSupport', refId),
          {
            senderEmail: cleanEmail,
            senderPhone: user?.phone || null,
            role: role || 'general',
            message: cleanMsg,
          },
          { merge: true }
        ).catch(console.warn);

        const notifId = `notif_sup_${Date.now()}`;
        await setDoc(
          doc(db, 'notifications', notifId),
          {
            id: notifId,
            userId: 'role_superadmin',
            title: `New Support Request: ${subject.trim() || 'General Inquiry'}`,
            body: `${cleanName} (${cleanEmail}) sent an inquiry: "${cleanMsg.slice(0, 80)}${cleanMsg.length > 80 ? '...' : ''}"`,
            category: 'system',
            link: '/superadmin/oversight',
            isRead: false,
            createdAt: new Date().toISOString(),
            relatedEntityId: refId,
          },
          { merge: true }
        ).catch(console.warn);
      }

      setSubmittedRef(refId);
      setSubject('');
      setMessage('');
      showToast(`Support inquiry dispatched (${refId}) ✓`, 'success');
      Alert.alert('Inquiry Sent ✓', `Your support ticket (${refId}) has been submitted. Our team will reply within 24 hours.`);
    } catch (err: any) {
      Alert.alert('Submission Failed', err?.message || 'Could not send inquiry. Please try again.');
    } finally {
      setIsSubmitting(false);
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
            <PropithubIcon size={20} />
          </View>
          <View style={{ flexShrink: 1 }}>
            <Text style={styles.headerTitle} numberOfLines={1}>Contact Support</Text>
          </View>
        </View>
        <View style={styles.helpBadge}>
          <Text style={styles.helpBadgeText}>SUPPORT</Text>
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
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* Support SLA Banner (Dark Card) */}
        <View style={styles.darkCard}>
          <Text style={styles.slaTitle}>Enterprise Support Desk</Text>
          <Text style={styles.slaDesc}>
            Our team assists property owners, managers, and tenants with guaranteed 24-hour response turnaround.
          </Text>
          <View style={styles.directContactRow}>
            <Feather name="mail" size={14} color="#10B981" style={{ marginRight: 6 }} />
            <Text style={styles.directEmail}>support@propithub.com</Text>
          </View>
        </View>

        {submittedRef && (
          <View style={[styles.successBanner, { backgroundColor: isDark ? 'rgba(16,185,129,0.14)' : '#ECFDF5', borderColor: '#10B981' }]}>
            <Feather name="check-circle" size={16} color="#10B981" style={{ marginRight: 8 }} />
            <Text style={{ flex: 1, fontSize: 12.5, fontWeight: '600', color: isDark ? '#A7F3D0' : '#065F46' }}>
              Ticket {submittedRef} received. Our support team will respond shortly.
            </Text>
          </View>
        )}

        {/* Inquiry Form */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Send Us a Message</Text>

          <Text style={styles.inputLabel}>Your Full Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="John Doe"
            placeholderTextColor={colors.inkMuted}
          />

          <Text style={styles.inputLabel}>Email Address</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="john@example.com"
            placeholderTextColor={colors.inkMuted}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <Text style={styles.inputLabel}>Subject (Optional)</Text>
          <TextInput
            style={styles.input}
            value={subject}
            onChangeText={setSubject}
            placeholder="e.g. Billing question, Technical support"
            placeholderTextColor={colors.inkMuted}
          />

          <Text style={styles.inputLabel}>Inquiry Message</Text>
          <TextInput
            style={styles.textArea}
            value={message}
            onChangeText={setMessage}
            placeholder="Describe your inquiry, billing question, or technical request..."
            placeholderTextColor={colors.inkMuted}
            multiline
          />

          <TouchableOpacity
            style={[styles.sendBtn, isSubmitting && { opacity: 0.7 }]}
            onPress={handleSendMessage}
            disabled={isSubmitting}
            activeOpacity={0.85}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.sendBtnText}>Send Message</Text>
            )}
          </TouchableOpacity>
        </View>
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
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 14,
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
  helpBadge: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  helpBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563EB',
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
  darkCard: {
    backgroundColor: '#131A2A',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    padding: 18,
    marginBottom: 16,
  },
  slaTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  slaDesc: {
    fontSize: 12,
    color: colors.inkMuted,
    lineHeight: 18,
    marginBottom: 12,
  },
  directContactRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  directEmail: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#10B981',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.navy,
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    color: colors.inkSoft,
    marginBottom: 5,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: colors.navy,
    backgroundColor: colors.surface,
    marginBottom: 12,
  },
  textArea: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: colors.navy,
    backgroundColor: colors.surface,
    height: 80,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  sendBtn: {
    backgroundColor: '#10B981',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
