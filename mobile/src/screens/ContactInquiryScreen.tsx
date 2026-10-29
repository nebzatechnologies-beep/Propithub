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
  TextInput,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { PropithubIcon } from '../components/PropithubLogo';

export const ContactInquiryScreen: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const { colors, isDark } = useMobileTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');

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
            <Text style={styles.headerTitle}>Contact Support</Text>
          </View>
        </View>
        <View style={styles.helpBadge}>
          <Text style={styles.helpBadgeText}>SUPPORT</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
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

        {/* Inquiry Form */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Send Us a Message</Text>

          <Text style={styles.inputLabel}>Your Full Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="John Doe"
            placeholderTextColor="#94A3B8"
          />

          <Text style={styles.inputLabel}>Email Address</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="john@example.com"
            placeholderTextColor="#94A3B8"
            keyboardType="email-address"
          />

          <Text style={styles.inputLabel}>Inquiry Message</Text>
          <TextInput
            style={styles.textArea}
            value={message}
            onChangeText={setMessage}
            placeholder="Describe your inquiry, billing question, or technical request..."
            placeholderTextColor="#94A3B8"
            multiline
          />

          <TouchableOpacity style={styles.sendBtn} activeOpacity={0.85}>
            <Text style={styles.sendBtnText}>Send Message</Text>
          </TouchableOpacity>
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
