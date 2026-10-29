import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  StatusBar,
  TextInput,
  TouchableOpacity,
  Modal,
  Alert,
  Switch,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { Header } from '../components/Header';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { useMobileAuth } from '../context/MobileAuthContext';
import { useMobileCurrency } from '../context/MobileCurrencyContext';
import { useMobileTheme } from '../context/MobileThemeContext';
import { MobileAgreement, MobileRequiredIdItem, MobileTenantUploadedIdItem } from '../types';
import { DocumentViewerModal } from '../components/DocumentViewerModal';
import { downloadDocument, DocumentDownloadItem } from '../lib/documentService';
import { uploadOrCompressDocument } from '../lib/imageUploader';
import { pickDocument } from '../lib/nativePicker';

interface ManagerLeaseDocumentsScreenProps {
  onProfilePress?: () => void;
  onViewPdfPress?: (documentUrl?: string) => void;
}

export const ManagerLeaseDocumentsScreen: React.FC<ManagerLeaseDocumentsScreenProps> = ({
  onProfilePress,
  onViewPdfPress,
}) => {
  const { colors, isDark } = useMobileTheme();
  const { state, saveAgreement } = useMobileAppData();
  const { user } = useMobileAuth();
  const { viewCurrency, format } = useMobileCurrency();

  const ownerId = user?.ownerId || '';

  const [search, setSearch] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // New Agreement Form State
  const [newAgUnit, setNewAgUnit] = useState('');
  const [newAgStart, setNewAgStart] = useState(new Date().toISOString().split('T')[0]);
  const [newAgEnd, setNewAgEnd] = useState(
    new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0]
  );
  const [newAgAuto, setNewAgAuto] = useState(false);
  const [newAgFileName, setNewAgFileName] = useState('Signed_Residential_Lease_Agreement.pdf');
  const [newAgFileData, setNewAgFileData] = useState<string>('');
  const [newAgRequireIds, setNewAgRequireIds] = useState<boolean>(false);
  const [newAgIdList, setNewAgIdList] = useState<MobileRequiredIdItem[]>([
    { id: 'id_1', name: 'Voter ID' },
    { id: 'id_2', name: 'Aadhaar Card' },
  ]);
  const [newAgOfflineTenantIds, setNewAgOfflineTenantIds] = useState<Record<string, { fileName: string; fileUrl: string }>>({});

  // Scoped agreements and units strictly matching web data isolation
  const myAgreements = useMemo(() => {
    return ownerId ? state.agreements.filter((a) => a.ownerId === ownerId) : state.agreements;
  }, [state.agreements, ownerId]);

  const myUnits = useMemo(() => {
    return ownerId ? state.units.filter((u) => u.ownerId === ownerId) : state.units;
  }, [state.units, ownerId]);

  const filteredAgreements = useMemo(() => {
    return myAgreements.filter((a) => {
      const q = search.toLowerCase();
      return (
        a.tenant.toLowerCase().includes(q) ||
        a.unit.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q)
      );
    });
  }, [myAgreements, search]);

  const handleCreateAgreement = async () => {
    const unitObj = myUnits.find((u) => u.id === newAgUnit) || myUnits[0];
    if (!unitObj) {
      Alert.alert('Unit Required', 'Please select a unit before creating an agreement.');
      return;
    }

    const validIdList = newAgRequireIds
      ? newAgIdList.filter((item) => item.name.trim().length > 0)
      : [];

    const offlineUploadedIds: MobileTenantUploadedIdItem[] = Object.entries(newAgOfflineTenantIds).map(([id, info]) => {
      const match = validIdList.find((item) => item.id === id);
      return {
        id: `u_${id}`,
        name: match?.name || 'ID Document',
        fileUrl: info.fileUrl,
        fileName: info.fileName,
        uploadedAt: new Date().toISOString(),
      };
    });

    setIsUploading(true);
    try {
      const agId = `AG-${Date.now().toString(36).toUpperCase()}`;
      const newAg: MobileAgreement = {
        id: agId,
        ownerId: ownerId || unitObj.ownerId || '',
        ownerName: user?.ownerName || 'Property Owner',
        propertyId: unitObj.propertyId || '',
        propertyName: unitObj.propertyName || 'Managed Property',
        unit: unitObj.unitNumber || unitObj.id,
        tenant: unitObj.tenant || 'Resident',
        tenantId: unitObj.currentTenantId || '',
        start: newAgStart || new Date().toISOString().split('T')[0],
        end: newAgEnd || new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0],
        rent: unitObj.rent || 0,
        deposit: unitObj.deposit || 0,
        currency: unitObj.currency || viewCurrency,
        escalationPercent: 5,
        lockInMonths: 6,
        noticePeriodDays: 30,
        executionMode: 'already_executed_offline',
        status: unitObj.tenant ? 'active' : 'awaiting_tenant_signature',
        autoRenew: newAgAuto,
        requireTenantId: newAgRequireIds && validIdList.length > 0,
        requiredIdList: newAgRequireIds && validIdList.length > 0 ? validIdList : undefined,
        requiredIdTypes: newAgRequireIds && validIdList.length > 0 ? validIdList.map((i) => i.name.trim()) : undefined,
        requiredIdType: newAgRequireIds && validIdList.length > 0 ? validIdList[0].name.trim() : undefined,
        tenantUploadedIds: offlineUploadedIds.length > 0 ? offlineUploadedIds : undefined,
        tenantUploadedIdUrl: offlineUploadedIds.length > 0 ? offlineUploadedIds[0].fileUrl : undefined,
        tenantUploadedIdName: offlineUploadedIds.length > 0 ? offlineUploadedIds[0].fileName : undefined,
        tenantUploadedIdAt: offlineUploadedIds.length > 0 ? new Date().toISOString() : undefined,
        createdAt: new Date().toISOString(),
        documentUrl: undefined,
        signedDocumentUrl: undefined,
        signedDocumentName: newAgFileName,
        initialAgreementUrl: undefined,
        initialAgreementName: newAgFileName,
      };

      if (newAgFileData) {
        try {
          const safeUrl = await uploadOrCompressDocument(
            newAgFileData,
            `agreements/${agId}/offline_lease_${Date.now()}`
          );
          newAg.documentUrl = safeUrl;
          newAg.signedDocumentUrl = safeUrl;
          newAg.initialAgreementUrl = safeUrl;
        } catch {
          newAg.documentUrl = newAgFileData;
          newAg.signedDocumentUrl = newAgFileData;
          newAg.initialAgreementUrl = newAgFileData;
        }
      }

      saveAgreement(newAg);
      setShowUploadModal(false);
      setNewAgFileData('');
      setNewAgRequireIds(false);
      setNewAgOfflineTenantIds({});
      Alert.alert(
        'Agreement Uploaded ✓',
        `Agreement ${agId} uploaded and filed for Unit ${newAg.unit}.`
      );
    } finally {
      setIsUploading(false);
    }
  };

  const [previewDoc, setPreviewDoc] = useState<DocumentDownloadItem | null>(null);

  const handleViewDocument = (ag: MobileAgreement) => {
    setPreviewDoc({
      fileName: ag.signedDocumentName || ag.documentUrl || `Tenancy_Agreement_${ag.unit}.pdf`,
      fileUrl: ag.signedDocumentUrl || ag.documentUrl || ag.initialAgreementUrl,
      title: `Lease Agreement - Unit ${ag.unit}`,
      docType: 'Official Tenancy Agreement',
      meta: {
        agreementId: ag.id,
        tenantName: ag.tenant,
        unit: ag.unit,
        propertyName: ag.propertyName,
        amount: ag.rent ? format(ag.rent, ag.currency || viewCurrency) : undefined,
        date: ag.start,
      },
    });
  };

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);


  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      {/* StatusBar managed globally */}
      <ScreenStatusBar />

      {/* Header */}
      <Header
        title="Agreements"
        onNotificationPress={() => {}}
        onProfilePress={onProfilePress}
      />

      <ScrollView
        style={[styles.scroll, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Control Bar matching Web */}
        <View style={styles.topControlRow}>
          <Text style={[styles.documentsCountText, { color: colors.navy }]} numberOfLines={1}>
            Agreements ({myAgreements.length})
          </Text>
          <TouchableOpacity
            style={styles.uploadAgreementBtn}
            onPress={() => {
              if (myUnits.length > 0) {
                setNewAgUnit(myUnits[0].id);
              }
              setShowUploadModal(true);
            }}
            activeOpacity={0.8}
          >
            <Feather name="plus" size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
            <Text style={styles.uploadAgreementBtnText}>Upload</Text>
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Feather name="search" size={15} color={colors.inkSoft} style={{ marginRight: 8 }} />
          <TextInput
            style={[styles.searchInput, { color: colors.navy }]}
            placeholder="Search tenant, unit, or ID..."
            placeholderTextColor={colors.inkSoft}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color={colors.inkSoft} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Agreements List matching Web Cards */}
        {filteredAgreements.length === 0 ? (
          <View style={[styles.emptyContainer, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <Feather name="file-text" size={48} color={colors.inkSoft} />
            <Text style={[styles.emptyTitle, { color: colors.navy }]}>No Agreements</Text>
            <Text style={[styles.emptySub, { color: colors.inkSoft }]}>
              {search
                ? 'No agreements match your search criteria.'
                : 'No lease documents on record. Upload an agreement to get started.'}
            </Text>
          </View>
        ) : (
          filteredAgreements.map((a) => {
            const isSigned = a.status === 'active';
            const isAwaiting =
              a.status === 'awaiting_tenant_signature' ||
              a.status === 'draft';

            return (
              <View key={a.id} style={[styles.agreementCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                <View style={styles.cardHeaderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.documentIdText}>#{a.id}</Text>
                    <Text style={[styles.tenantNameText, { color: colors.navy }]}>{a.tenant}</Text>
                    <Text style={[styles.unitSubText, { color: colors.inkSoft }]}>
                      Unit {a.unit} • {a.propertyName || 'Property'}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.statusBadge,
                      isSigned
                        ? styles.statusBadgeGreen
                        : isAwaiting
                        ? styles.statusBadgeAmber
                        : styles.statusBadgeGrey,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusBadgeText,
                        isSigned
                          ? { color: '#059669' }
                          : isAwaiting
                          ? { color: '#B45309' }
                          : { color: colors.inkSoft },
                      ]}
                    >
                      {isSigned ? 'Signed' : isAwaiting ? 'Awaiting Signature' : a.status}
                    </Text>
                  </View>
                </View>

                {/* Term & File Info */}
                <View style={[styles.termInfoRow, { borderTopColor: colors.line }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Feather name="calendar" size={12} color={colors.inkSoft} />
                    <Text style={[styles.termText, { color: colors.inkSoft }]}>
                      {a.start} → {a.end}
                    </Text>
                  </View>
                  <View style={[styles.fileBadge, isDark && { backgroundColor: '#064E3B' }]}>
                    <Feather name="file" size={11} color="#059669" style={{ marginRight: 4 }} />
                    <Text style={styles.fileBadgeText} numberOfLines={1}>
                      Signed Document
                    </Text>
                  </View>
                </View>

                {/* Card Action Footer */}
                <View style={[styles.cardFooter, { borderTopColor: colors.line }]}>
                  <TouchableOpacity
                    style={[styles.viewDocumentBtn, isDark && { backgroundColor: '#1E293B', borderColor: colors.line }]}
                    onPress={() => handleViewDocument(a)}
                    activeOpacity={0.8}
                  >
                    <Feather name="eye" size={13} color={colors.navy} style={{ marginRight: 5 }} />
                    <Text style={[styles.viewDocumentBtnText, { color: colors.navy }]}>View</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.viewDocumentBtn, isDark && { backgroundColor: '#1E293B', borderColor: colors.line }, { marginLeft: 8 }]}
                    onPress={() =>
                      downloadDocument({
                        fileName: a.signedDocumentName || a.documentUrl || `Tenancy_Agreement_${a.unit}.pdf`,
                        fileUrl: a.signedDocumentUrl || a.documentUrl,
                        title: `Lease Agreement - Unit ${a.unit}`,
                        docType: 'Official Tenancy Agreement',
                        meta: {
                          tenantName: a.tenant,
                          unit: a.unit,
                          propertyName: a.propertyName,
                          amount: format(a.rent, a.currency || viewCurrency),
                          date: a.start,
                        },
                      })
                    }
                    activeOpacity={0.8}
                  >
                    <Feather name="download" size={13} color={colors.navy} style={{ marginRight: 5 }} />
                    <Text style={[styles.viewDocumentBtnText, { color: colors.navy }]}>Download</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Upload Agreement Modal (Exact Match to Web Modal) */}
      <Modal visible={showUploadModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface, borderTopColor: colors.line }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.line }]}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.navy }]}>Upload Lease Agreement</Text>
              </View>
              <TouchableOpacity onPress={() => setShowUploadModal(false)}>
                <Ionicons name="close" size={20} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Unit Selection */}
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.inkSoft }]}>Select Unit</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {myUnits.map((u) => (
                    <TouchableOpacity
                      key={u.id}
                      style={[
                        styles.unitSelectPill,
                        { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: colors.line },
                        newAgUnit === u.id && styles.unitSelectPillSelected,
                      ]}
                      onPress={() => setNewAgUnit(u.id)}
                    >
                      <Text
                        style={[
                          styles.unitSelectPillText,
                          { color: colors.inkSoft },
                          newAgUnit === u.id && styles.unitSelectPillTextSelected,
                        ]}
                      >
                        Unit {u.unitNumber} {u.tenant ? `(${u.tenant})` : ''}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Start Date */}
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.inkSoft }]}>Lease Start Date</Text>
                <TextInput
                  style={[styles.textInput, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: colors.line, color: colors.navy }]}
                  value={newAgStart}
                  onChangeText={setNewAgStart}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.inkSoft}
                />
              </View>

              {/* End Date */}
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.inkSoft }]}>Lease End Date</Text>
                <TextInput
                  style={[styles.textInput, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: colors.line, color: colors.navy }]}
                  value={newAgEnd}
                  onChangeText={setNewAgEnd}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.inkSoft}
                />
              </View>

              {/* File Attachment Card */}
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.inkSoft }]}>Lease Document File (PDF / Images)</Text>
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: isDark ? '#064E3B' : '#F0FDF4',
                    borderWidth: 1,
                    borderColor: isDark ? '#059669' : '#86EFAC',
                    padding: 10,
                    borderRadius: 8,
                    gap: 8,
                  }}
                  onPress={async () => {
                    try {
                      const picked = await pickDocument({ type: ['application/pdf', 'image/*'] });
                      if (picked) {
                        setNewAgFileName(picked.name);
                        setNewAgFileData(picked.base64 || picked.uri);
                        Alert.alert('File Attached ✓', `${picked.name} attached.`);
                      }
                    } catch (err: any) {
                      Alert.alert('Selection Error', err?.message || 'Could not select document.');
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <Feather name="file-text" size={18} color="#059669" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? '#ECFDF5' : '#065F46' }}>{newAgFileName}</Text>
                    <Text style={{ fontSize: 10.5, color: '#059669' }}>Tap to choose or replace file</Text>
                  </View>
                  <Feather name="upload" size={15} color="#059669" />
                </TouchableOpacity>
              </View>

              {/* Auto-Renew Option */}
              <View style={styles.autoRenewRow}>
                <View>
                  <Text style={[styles.autoRenewLabel, { color: colors.navy }]}>Auto-Renewal</Text>
                  <Text style={[styles.autoRenewSub, { color: colors.inkSoft }]}>Annual term extension notice</Text>
                </View>
                <Switch
                  value={newAgAuto}
                  onValueChange={setNewAgAuto}
                  trackColor={{ false: colors.line, true: '#10B981' }}
                  thumbColor="#FFFFFF"
                />
              </View>

              {/* Identity Verification Requirements (Web Parity) */}
              <View
                style={{
                  marginTop: 14,
                  padding: 12,
                  backgroundColor: isDark ? '#1E293B' : (newAgRequireIds ? '#FFFDF8' : '#F8FAFC'),
                  borderWidth: 1.5,
                  borderColor: newAgRequireIds ? '#D97706' : colors.line,
                  borderRadius: 10,
                  marginBottom: 16,
                }}
              >
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                  onPress={() => setNewAgRequireIds(!newAgRequireIds)}
                  activeOpacity={0.8}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 }}>
                    <Ionicons
                      name={newAgRequireIds ? 'checkbox' : 'square-outline'}
                      size={20}
                      color={newAgRequireIds ? '#D97706' : colors.inkSoft}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.navy }}>
                        Request Resident ID Verification Documents
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.inkSoft, marginTop: 1 }}>
                        {newAgRequireIds
                          ? 'Resident must provide these ID documents for verification.'
                          : 'Require identity verification (Aadhaar, Voter ID, Passport, etc.)'}
                      </Text>
                    </View>
                  </View>
                  {newAgRequireIds && (
                    <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#92400E' }}>
                        {newAgIdList.length} ID{newAgIdList.length === 1 ? '' : 's'} Required
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>

                {newAgRequireIds && (
                  <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748B', marginBottom: 6, letterSpacing: 0.3 }}>
                      QUICK ADD SUGGESTIONS
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                      {['Voter ID', 'Aadhaar Card', 'PAN Card', 'Passport', 'Driving License', 'Police Verification'].map((preset) => {
                        const isAdded = newAgIdList.some((item) => item.name.toLowerCase() === preset.toLowerCase());
                        return (
                          <TouchableOpacity
                            key={preset}
                            style={{
                              paddingHorizontal: 9,
                              paddingVertical: 4,
                              borderRadius: 6,
                              backgroundColor: isAdded ? '#E2E8F0' : '#FEF3C7',
                              borderWidth: 1,
                              borderColor: isAdded ? '#CBD5E1' : '#FDE68A',
                              opacity: isAdded ? 0.6 : 1,
                            }}
                            disabled={isAdded}
                            onPress={() => {
                              setNewAgIdList([...newAgIdList, { id: `id_${Date.now()}_${Math.random()}`, name: preset }]);
                            }}
                          >
                            <Text style={{ fontSize: 11, fontWeight: '600', color: isAdded ? '#64748B' : '#92400E' }}>
                              {isAdded ? '✓ ' : '+ '}
                              {preset}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748B', marginBottom: 6, letterSpacing: 0.3 }}>
                      REQUIRED ID DOCUMENT LIST
                    </Text>
                    <View style={{ gap: 8 }}>
                      {newAgIdList.map((item, idx) => (
                        <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748B', width: 22 }}>
                            #{idx + 1}
                          </Text>
                          <TextInput
                            style={[styles.textInput, { flex: 1, marginBottom: 0, paddingVertical: 6, fontSize: 12.5 }]}
                            value={item.name}
                            placeholder="e.g. Passport, Aadhaar, Driving License"
                            placeholderTextColor="#94A3B8"
                            onChangeText={(txt) => {
                              const updated = [...newAgIdList];
                              updated[idx].name = txt;
                              setNewAgIdList(updated);
                            }}
                          />
                          <TouchableOpacity
                            style={{
                              paddingHorizontal: 8,
                              paddingVertical: 7,
                              backgroundColor: newAgOfflineTenantIds[item.id] ? '#DCFCE7' : '#F1F5F9',
                              borderRadius: 6,
                              borderWidth: 1,
                              borderColor: newAgOfflineTenantIds[item.id] ? '#86EFAC' : '#CBD5E1',
                            }}
                            onPress={async () => {
                              try {
                                const picked = await pickDocument({ type: ['application/pdf', 'image/*'] });
                                if (picked) {
                                  setNewAgOfflineTenantIds((prev) => ({
                                    ...prev,
                                    [item.id]: {
                                      fileName: picked.name,
                                      fileUrl: picked.base64 || picked.uri,
                                    },
                                  }));
                                  Alert.alert('ID Attached ✓', `${item.name} file attached: ${picked.name}`);
                                }
                              } catch (err: any) {
                                Alert.alert('Selection Error', err?.message || 'Could not attach ID.');
                              }
                            }}
                          >
                            <Text style={{ fontSize: 10.5, fontWeight: '700', color: newAgOfflineTenantIds[item.id] ? '#15803D' : '#475569' }}>
                              {newAgOfflineTenantIds[item.id] ? 'Attached ✓' : 'Upload File'}
                            </Text>
                          </TouchableOpacity>
                          {newAgIdList.length > 1 && (
                            <TouchableOpacity
                              onPress={() => setNewAgIdList(newAgIdList.filter((_, i) => i !== idx))}
                              style={{ padding: 6 }}
                            >
                              <Feather name="trash-2" size={15} color="#EF4444" />
                            </TouchableOpacity>
                          )}
                        </View>
                      ))}
                    </View>

                    <TouchableOpacity
                      style={{
                        marginTop: 10,
                        flexDirection: 'row',
                        alignItems: 'center',
                        alignSelf: 'flex-start',
                        gap: 4,
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        backgroundColor: '#FFFFFF',
                        borderWidth: 1,
                        borderColor: '#CBD5E1',
                        borderRadius: 6,
                      }}
                      onPress={() => setNewAgIdList([...newAgIdList, { id: `id_${Date.now()}_${Math.random()}`, name: '' }])}
                    >
                      <Feather name="plus" size={13} color="#059669" />
                      <Text style={{ fontSize: 11.5, fontWeight: '600', color: '#059669' }}>
                        Add Custom ID Requirement
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* Submit Button */}
              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handleCreateAgreement}
                activeOpacity={0.85}
                disabled={isUploading}
              >
                <Text style={styles.submitBtnText} numberOfLines={1}>
                  {isUploading ? 'Registering...' : 'Save Agreement'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Universal Document Inspection & Viewer Modal */}
      <DocumentViewerModal
        visible={!!previewDoc}
        onClose={() => setPreviewDoc(null)}
        document={previewDoc}
        onAttachFile={async (dataUrl, fileName) => {
          if (previewDoc?.meta?.agreementId) {
            const agId = previewDoc.meta.agreementId;
            const ag = myAgreements.find((a) => a.id === agId);
            if (ag) {
              const safeUrl = await uploadOrCompressDocument(
                dataUrl,
                `agreements/${ag.id}/${Date.now()}_${fileName}`
              );
              saveAgreement({
                ...ag,
                documentUrl: safeUrl,
                signedDocumentUrl: safeUrl,
                signedDocumentName: fileName,
              });
            }
          }
        }}
      />
    </SafeAreaView>
  );
};

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
    backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  topControlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  documentsCountText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.inkSoft,
    flex: 1,
    marginRight: 8,
  },
  uploadAgreementBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    flexShrink: 0,
  },
  uploadAgreementBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: colors.navy,
    padding: 0,
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.navy,
    marginTop: 10,
    marginBottom: 4,
  },
  emptySub: {
    fontSize: 12,
    color: colors.inkSoft,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  agreementCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  documentIdText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669',
    marginBottom: 2,
  },
  tenantNameText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.navy,
  },
  unitSubText: {
    fontSize: 12,
    color: colors.inkSoft,
    marginTop: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeGreen: {
    backgroundColor: '#DCFCE7',
  },
  statusBadgeAmber: {
    backgroundColor: '#FEF3C7',
  },
  statusBadgeGrey: {
    backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  termInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.line,
    marginVertical: 4,
  },
  termText: {
    fontSize: 11.5,
    color: colors.inkSoft,
    fontWeight: '500',
  },
  fileBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    maxWidth: 120,
  },
  fileBadgeText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#059669',
  },
  cardFooter: {
    marginTop: 8,
  },
  viewDocumentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 6,
    paddingVertical: 8,
  },
  viewDocumentBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.navy,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.navy,
  },
  modalSubTitle: {
    fontSize: 12,
    color: colors.inkSoft,
    marginTop: 2,
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.ink,
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: colors.navy,
  },
  unitSelectPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  unitSelectPillSelected: {
    borderColor: '#059669',
    backgroundColor: '#ECFDF5',
  },
  unitSelectPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.inkSoft,
  },
  unitSelectPillTextSelected: {
    color: '#059669',
  },
  autoRenewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.line,
  },
  autoRenewLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.navy,
  },
  autoRenewSub: {
    fontSize: 11.5,
    color: colors.inkSoft,
    marginTop: 1,
  },
  submitBtn: {
    backgroundColor: '#059669',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  });
