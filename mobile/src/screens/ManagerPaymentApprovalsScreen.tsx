import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from '../components/SafeScreen';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { Header } from '../components/Header';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { useMobileAuth } from '../context/MobileAuthContext';
import { useMobileTheme } from '../context/MobileThemeContext';

/**
 * Payment Approvals (manager).
 * A tenant who pays by cash, UPI or bank transfer records the payment as "pending confirmation". It only counts
 * as paid once the owner or a manager approves it. Managers see the tenants of the properties they manage.
 */
interface Props {
  onProfilePress?: () => void;
  onNavigate?: (screenKey: string) => void;
}

export const ManagerPaymentApprovalsScreen: React.FC<Props> = ({ onProfilePress, onNavigate }) => {
  const { colors } = useMobileTheme();
  const { state, confirmCashClaim, rejectCashClaim, confirmOfflinePayment, rejectOfflinePayment } = useMobileAppData();
  const { user } = useMobileAuth();
  const [declineFor, setDeclineFor] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const managerRecord = (state.propertyManagers || []).find(
    (m) =>
      (user?.id && String(m.id) === user.id) ||
      (user?.email && m.email?.toLowerCase().trim() === user.email.toLowerCase().trim())
  );
  const ownerId = user?.ownerId && user.ownerId !== user.id ? user.ownerId : managerRecord?.ownerId || '';

  // Same scope rule as the other manager screens: assigned properties if any, otherwise the owner's portfolio.
  const assigned = useMemo(() => {
    const ids = new Set<string>();
    [
      ...(user?.assignedProperties || []),
      ...(managerRecord?.assignedProperties || []),
      (user as any)?.propertyId,
      (user as any)?.assignedPropertyId,
      managerRecord?.propertyId,
    ].forEach((x) => x && ids.add(String(x)));
    (state.properties || []).forEach((p) => {
      if (p.assignedManagerId === user?.id || (p as any).managerId === user?.id) ids.add(p.id);
    });
    return ids;
  }, [state.properties, user, managerRecord]);

  const inScope = (item: { ownerId?: string; propertyId?: string }) => {
    if (!ownerId || item.ownerId !== ownerId) return false;
    if (assigned.size === 0 || !item.propertyId) return true;
    return assigned.has(item.propertyId);
  };

  const claims = (state.cashClaims || []).filter(
    (c) => c.status === 'pending_confirmation' && c.direction === 'inflow' && c.claimedByRole === 'tenant' && inScope(c)
  );
  const claimIds = new Set(claims.map((c) => c.id));
  const payments = (state.payments || []).filter(
    (p) =>
      p.status === 'pending_confirmation' &&
      p.direction !== 'outflow' &&
      inScope(p) &&
      !(p.cashClaimId && claimIds.has(p.cashClaimId))
  );

  const money = (amount: number, currency?: string) => `${currency || ''} ${Number(amount || 0).toLocaleString('en-IN')}`.trim();

  const run = async (id: string, fn: () => unknown) => {
    setBusyId(id);
    try {
      await Promise.resolve(fn());
    } finally {
      setBusyId(null);
    }
  };

  const decline = (id: string, fn: (r: string) => unknown) => {
    if (!reason.trim()) {
      Alert.alert('Reason needed', 'Please enter a reason for declining.');
      return;
    }
    const r = reason.trim();
    setDeclineFor(null);
    setReason('');
    run(id, () => fn(r));
  };

  const declineBox = (id: string, fn: (r: string) => unknown) =>
    declineFor === id ? (
      <View style={{ marginTop: 10 }}>
        <TextInput
          style={[styles.input, { borderColor: colors.line, color: colors.navy }]}
          placeholder="Reason (e.g. cash not received)"
          placeholderTextColor={colors.inkSoft}
          value={reason}
          onChangeText={setReason}
        />
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <TouchableOpacity style={[styles.btn, { backgroundColor: '#DC2626' }]} onPress={() => decline(id, fn)}>
            <Text style={styles.btnText}>Confirm decline</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }]}
            onPress={() => {
              setDeclineFor(null);
              setReason('');
            }}
          >
            <Text style={[styles.btnText, { color: colors.navy }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    ) : null;

  const actions = (id: string, onApprove: () => void) => (
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
      <TouchableOpacity
        disabled={busyId === id}
        style={[styles.btn, { backgroundColor: '#059669', opacity: busyId === id ? 0.5 : 1 }]}
        onPress={onApprove}
      >
        <Text style={styles.btnText}>Approve</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.btn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }]}
        onPress={() => setDeclineFor(id)}
      >
        <Text style={[styles.btnText, { color: colors.navy }]}>Decline</Text>
      </TouchableOpacity>
    </View>
  );

  const total = claims.length + payments.length;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScreenStatusBar />
      <Header
        title="Payment Approvals"
        onNotificationPress={() => onNavigate?.('notifications_center')}
        onProfilePress={onProfilePress}
      />
      <ScrollView contentContainerStyle={styles.content}>

        {!ownerId && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <Text style={{ color: colors.navy }}>Your account is not linked to a property owner yet, so there is nothing to approve.</Text>
          </View>
        )}

        {!!ownerId && total === 0 && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <Text style={{ color: colors.inkSoft, textAlign: 'center' }}>Nothing is waiting for approval.</Text>
          </View>
        )}

        {claims.map((c) => (
          <View key={c.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <Text style={[styles.title, { color: colors.navy }]}>
              {c.tenantName} · Unit {c.unit}
            </Text>
            <Text style={{ color: colors.inkSoft, fontSize: 13 }}>
              Cash handover ({c.type === 'deposit' ? 'security deposit' : 'rent'}) on {c.handoverDate}
              {c.handoverLocation ? ` at ${c.handoverLocation}` : ''}
            </Text>
            {!!c.notes && <Text style={{ color: colors.navy, fontSize: 13, marginTop: 4 }}>{c.notes}</Text>}
            {!!c.proofPhotoUrl && (
              <TouchableOpacity onPress={() => Linking.openURL(c.proofPhotoUrl!)}>
                <Text style={{ color: '#2563EB', fontSize: 13, marginTop: 4 }}>View photo proof</Text>
              </TouchableOpacity>
            )}
            <Text style={[styles.amount, { color: colors.navy }]}>{money(c.amount, c.currency)}</Text>
            {actions(c.id, () => run(c.id, () => confirmCashClaim(c.id)))}
            {declineBox(c.id, (r) => rejectCashClaim(c.id, r))}
          </View>
        ))}

        {payments.map((p) => (
          <View key={p.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <Text style={[styles.title, { color: colors.navy }]}>
              {p.tenant} · Unit {p.unit}
            </Text>
            <Text style={{ color: colors.inkSoft, fontSize: 13 }}>
              {String(p.method || 'Offline transfer')} · {p.type === 'deposit' ? 'security deposit' : 'rent'} · {p.date}
            </Text>
            {!!p.referenceNo && <Text style={{ color: colors.navy, fontSize: 13 }}>Reference / UTR: {p.referenceNo}</Text>}
            {!!p.proofScreenshot && (
              <TouchableOpacity onPress={() => Linking.openURL(p.proofScreenshot!)}>
                <Text style={{ color: '#2563EB', fontSize: 13, marginTop: 4 }}>View payment screenshot</Text>
              </TouchableOpacity>
            )}
            <Text style={[styles.amount, { color: colors.navy }]}>{money(p.amount, p.currency)}</Text>
            {actions(p.id, () => run(p.id, () => confirmOfflinePayment(p.id)))}
            {declineBox(p.id, (r) => rejectOfflinePayment(p.id, r))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { padding: 16, paddingBottom: 120 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 12 },
  title: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  amount: { fontSize: 20, fontWeight: '800', marginTop: 8 },
  btn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center' },
  btnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
});
