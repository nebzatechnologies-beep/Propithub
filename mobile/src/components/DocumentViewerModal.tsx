import React, { useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Dimensions,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import {
  DocumentDownloadItem,
  downloadDocument,
  getOrGenerateDocumentDataUrl,
} from '../lib/documentService';
import { useMobileTheme } from '../context/MobileThemeContext';

interface DocumentViewerModalProps {
  visible: boolean;
  onClose: () => void;
  document: DocumentDownloadItem | null;
  onAttachFile?: (dataUrl: string, fileName: string) => void;
}

export const DocumentViewerModal: React.FC<DocumentViewerModalProps> = ({
  visible,
  onClose,
  document: doc,
}) => {
  const { colors, isDark } = useMobileTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  // Obtain the genuine Data URL: uploaded file or official PDF Data URI
  const activeFileUrl = useMemo(() => {
    if (!doc) return '';
    return getOrGenerateDocumentDataUrl(doc);
  }, [doc]);

  if (!doc) return null;

  const isImage =
    activeFileUrl.startsWith('data:image') ||
    /\.(png|jpe?g|webp|gif)$/i.test(doc.fileName);

  const isPdf = !isImage;

  const handleDownload = () => {
    downloadDocument({
      ...doc,
      fileUrl: activeFileUrl,
    });
  };

  const handleOpenExternal = () => {
    if (activeFileUrl && typeof window !== 'undefined') {
      window.open(activeFileUrl, '_blank');
    } else {
      handleDownload();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIconBadge}>
                <Feather
                  name={isImage ? 'image' : 'file-text'}
                  size={16}
                  color="#FFFFFF"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.headerTitle} numberOfLines={1}>
                  {doc.fileName}
                </Text>
                <Text style={styles.headerSub} numberOfLines={1}>
                  {doc.docType || 'Official Tenancy Document'}{doc.meta?.unit ? ` • Unit ${doc.meta.unit}` : ''}
                </Text>
              </View>
            </View>

            <View style={styles.headerRight}>
              <TouchableOpacity
                style={styles.headerActionBtn}
                onPress={handleOpenExternal}
                activeOpacity={0.7}
                accessibilityLabel="Open Fullscreen"
              >
                <Feather name="external-link" size={15} color={colors.navy} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.headerActionBtn}
                onPress={handleDownload}
                activeOpacity={0.7}
                accessibilityLabel="Download Document"
              >
                <Feather name="download" size={15} color={colors.navy} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.headerActionBtn}
                onPress={onClose}
                activeOpacity={0.7}
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={20} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Document Content View - Pure View Mode */}
          <ScrollView
            style={styles.scrollBody}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.previewContainer}>
              {isImage ? (
                /* Real Uploaded Photo / Scan */
                <View style={styles.imageBox}>
                  <Image
                    source={{ uri: activeFileUrl }}
                    style={styles.imagePreview}
                    resizeMode="contain"
                  />
                </View>
              ) : typeof window !== 'undefined' ? (
                /* Real PDF in browser native PDF iframe (zoom, print, pagination) */
                <View style={styles.iframeBox}>
                  <iframe
                    src={activeFileUrl}
                    style={{
                      width: '100%',
                      height: 520,
                      border: 'none',
                      borderRadius: 10,
                    }}
                    title={doc.fileName}
                  />
                </View>
              ) : (
                <View style={styles.fileCard}>
                  <Feather name="file-text" size={36} color="#059669" />
                  <Text style={styles.fileCardTitle}>{doc.fileName}</Text>
                  <Text style={styles.fileCardSub}>Document Ready</Text>
                  <TouchableOpacity style={styles.openExternalBtn} onPress={handleOpenExternal}>
                    <Feather name="external-link" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.openExternalBtnText}>Open Document</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </ScrollView>

          {/* Footer Bar */}
          <View style={styles.footerBar}>
            <TouchableOpacity
              style={styles.downloadPrimaryBtn}
              onPress={handleDownload}
              activeOpacity={0.85}
            >
              <Feather name="download" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.downloadPrimaryBtnText}>Download Document</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.closeSecondaryBtn} onPress={onClose} activeOpacity={0.8}>
              <Text style={styles.closeSecondaryBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.72)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 12,
    },
    modalCard: {
      width: '100%',
      maxWidth: 580,
      maxHeight: SCREEN_HEIGHT * 0.9,
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.line,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
      backgroundColor: colors.surface,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      marginRight: 10,
    },
    headerIconBadge: {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: '#059669',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
    },
    headerTitle: {
      fontSize: 13.5,
      fontWeight: '700',
      color: colors.navy,
    },
    headerSub: {
      fontSize: 11,
      color: colors.inkSoft,
      marginTop: 2,
    },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    headerActionBtn: {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: colors.surfaceSunken,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scrollBody: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      padding: 14,
    },
    previewContainer: {
      width: '100%',
      borderRadius: 12,
      overflow: 'hidden',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      minHeight: 380,
    },
    imageBox: {
      padding: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      minHeight: 380,
    },
    imagePreview: {
      width: '100%',
      height: 480,
    },
    iframeBox: {
      width: '100%',
      backgroundColor: isDark ? '#1E293B' : '#525659',
    },
    fileCard: {
      padding: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fileCardTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.navy,
      marginTop: 12,
      textAlign: 'center',
    },
    fileCardSub: {
      fontSize: 12,
      color: colors.inkSoft,
      marginTop: 4,
      marginBottom: 16,
    },
    openExternalBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#059669',
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 8,
    },
    openExternalBtnText: {
      color: '#FFFFFF',
      fontSize: 12.5,
      fontWeight: '700',
    },
    footerBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderTopWidth: 1,
      borderTopColor: colors.line,
      backgroundColor: colors.surface,
    },
    downloadPrimaryBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#059669',
      paddingVertical: 11,
      paddingHorizontal: 14,
      borderRadius: 10,
    },
    downloadPrimaryBtnText: {
      color: '#FFFFFF',
      fontSize: 12.5,
      fontWeight: '700',
    },
    closeSecondaryBtn: {
      paddingVertical: 11,
      paddingHorizontal: 16,
      borderRadius: 10,
      backgroundColor: colors.surfaceSunken,
      alignItems: 'center',
      justifyContent: 'center',
    },
    closeSecondaryBtnText: {
      color: colors.ink,
      fontSize: 12.5,
      fontWeight: '600',
    },
  });
