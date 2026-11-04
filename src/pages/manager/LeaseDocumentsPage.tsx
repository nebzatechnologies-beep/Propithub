import React, { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import { Agreement, PropertyEnquiry } from '../../types';
import { ButtonProcessing } from '../../components/common/Spinner';
import { OnboardResidentModal } from '../../components/owner/OnboardResidentModal';
import {
  FileText,
  UserPlus,
  CheckCircle2,
  Phone,
  Clock,
  Calendar,
  Eye,
  Download,
  AlertTriangle,
  X,
} from 'lucide-react';

export const LeaseDocumentsPage: React.FC = () => {
  const { state, updateState, saveAgreement, approveSignedAgreement, updateEnquiryStatus, showToast } = useAppData();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();

  const initialTab = searchParams.get('tab') === 'enquiries' ? 'enquiries' : 'leases';
  const [subTab, setSubTab] = useState<'leases' | 'enquiries'>(initialTab);

  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isOnboardOpen, setIsOnboardOpen] = useState(false);
  const [onboardEnquiryData, setOnboardEnquiryData] = useState<{
    unitId: string;
    propertyId: string;
    name: string;
    phone: string;
    email?: string;
  } | null>(null);

  const [viewingAgreement, setViewingAgreement] = useState<Agreement | null>(null);
  const [inspectingSignedAgreement, setInspectingSignedAgreement] = useState<Agreement | null>(null);
  const [isApproving, setIsApproving] = useState(false);

  const [newAgUnit, setNewAgUnit] = useState('');
  const [newAgStart, setNewAgStart] = useState('');
  const [newAgEnd, setNewAgEnd] = useState('');
  const [newAgAuto, setNewAgAuto] = useState('Off');
  const [newAgFileName, setNewAgFileName] = useState<string | null>(null);
  const [newAgFileData, setNewAgFileData] = useState<string | null>(null);

  const managerRecord = (state.propertyManagers || (state as any).managers || []).find(
    (m: any) =>
      (user?.id && String(m.id) === user.id) ||
      (user?.email && m.email?.toLowerCase() === user.email.toLowerCase())
  );
  const assignedPropertyId = (user as any)?.propertyId || (user as any)?.assignedPropertyId || managerRecord?.propertyId || '';
  const ownerId = user?.ownerId || (managerRecord as any)?.ownerId || '';

  const myProperties = useMemo(() => {
    let props = state.properties;
    if (ownerId) {
      props = props.filter((p) => p.ownerId === ownerId);
    }
    if (assignedPropertyId) {
      return props.filter((p) => p.id === assignedPropertyId || p.assignedManagerId === user?.id);
    }
    const explicitlyAssigned = props.filter((p) => p.assignedManagerId === user?.id);
    return explicitlyAssigned;
  }, [state.properties, ownerId, assignedPropertyId, user?.id]);

  const myPropertyIds = useMemo(() => new Set(myProperties.map((p) => p.id)), [myProperties]);

  const myUnits = useMemo(() => {
    if (!ownerId) return [];
    return state.units.filter((u) => u.ownerId === ownerId && (!u.propertyId || myPropertyIds.has(u.propertyId)));
  }, [state.units, ownerId, myPropertyIds]);

  // Show agreements and active digital leases belonging to the manager's assigned portfolio
  const myAgreements = useMemo(() => {
    if (!ownerId) return [];

    // 1. Direct agreements
    const agList: Agreement[] = state.agreements.filter((a) => {
      const matchOwner = a.ownerId === ownerId;
      const matchProp = Boolean(a.propertyId && myPropertyIds.has(a.propertyId));
      const matchUnit = myUnits.some((u) => u.unitNumber === a.unit || u.id === a.unit);
      return matchOwner || matchProp || matchUnit;
    });

    // 2. Also merge active digital tenancy requests for these units
    const existingAgIds = new Set(agList.map((a) => a.id));
    (state.tenancyRequests || []).forEach((req) => {
      const matchProp = Boolean(req.propertyId && myPropertyIds.has(req.propertyId));
      const matchOwner = req.ownerId === ownerId;
      const matchUnit = myUnits.some((u) => u.unitNumber === req.unitNumber || u.id === req.unitId);

      if ((matchProp || matchOwner || matchUnit) && req.status === 'pending') {
        const reqAgId = (req as any).agreementId || `REQ-${req.id.slice(-6)}`;
        if (!existingAgIds.has(reqAgId)) {
          agList.push({
            id: reqAgId,
            ownerId: req.ownerId || ownerId,
            propertyId: req.propertyId || '',
            unit: req.unitNumber || req.unitId,
            tenant: req.tenantName || 'Prospective Resident',
            tenantId: req.tenantId || '',
            type: 'uploaded',
            contentHtml: null,
            fileName: req.agreementFileName || 'Digital Tenancy Agreement',
            fileData: req.agreementFileData || null,
            start: req.leaseStart || new Date().toISOString().split('T')[0],
            end: req.leaseEnd || new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0],
            rent: req.rent || 0,
            deposit: req.deposit || 0,
            status: 'pending_deposit' as any,
            tenantSignature: null,
            autoRenew: false,
          });
          existingAgIds.add(reqAgId);
        }
      }
    });

    return agList;
  }, [state.agreements, state.tenancyRequests, ownerId, myPropertyIds, myUnits]);

  // Enquiries received for this manager's portfolio
  const myEnquiries = useMemo(() => {
    return (state.enquiries || []).filter((e) => {
      if (e.managerId && e.managerId === user?.id) return true;
      if (e.ownerId && ownerId && e.ownerId === ownerId) return true;
      if (myPropertyIds.has(e.propertyId)) return true;
      return false;
    });
  }, [state.enquiries, user?.id, ownerId, myPropertyIds]);

  const newEnquiriesCount = useMemo(() => {
    return myEnquiries.filter((e) => e.status === 'new').length;
  }, [myEnquiries]);

  const getAgreementStatusBadge = (a: Agreement) => {
    const matchUnit = myUnits.find((u) => u.id === a.unit || u.unitNumber === a.unit);
    const isDraft = a.status === 'draft' || a.id.startsWith('DFT-');
    const isTenantDifferent = Boolean(
      matchUnit && matchUnit.tenant && (a.tenant || '').trim().toLowerCase() !== matchUnit.tenant.trim().toLowerCase()
    );
    const isStaleDraft = isDraft && isTenantDifferent;

    if (isStaleDraft) {
      return (
        <span
          className="badge amber"
          style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
          title={`Unit ${a.unit} is currently assigned or reserved for ${matchUnit?.tenant || 'another resident'}`}
        >
          <Clock size={11} /> Stale Draft
        </span>
      );
    }
    if (a.status === 'pending_approval' || a.status === 'awaiting_tenant_upload' || a.status === ('awaiting_review' as any)) {
      return (
        <span
          className="badge amber"
          style={{
            fontSize: '11px',
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            background: '#FEF3C7',
            color: '#92400E',
            border: '1px solid #FCD34D',
            padding: '3px 8px',
            borderRadius: '6px',
          }}
        >
          <Clock size={11} /> Pending Approval
        </span>
      );
    }
    if (a.status === 'signed' || a.status === 'active') {
      return (
        <span
          className="badge green"
          style={{
            fontSize: '11px',
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            background: '#ECFDF5',
            color: '#065F46',
            border: '1px solid #A7F3D0',
            padding: '3px 8px',
            borderRadius: '6px',
          }}
        >
          <CheckCircle2 size={11} /> Signed
        </span>
      );
    }
    if (a.status === 'pending_deposit') {
      return (
        <span
          className="badge blue"
          style={{
            fontSize: '11px',
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            background: '#EFF6FF',
            color: '#1E40AF',
            border: '1px solid #BFDBFE',
            padding: '3px 8px',
            borderRadius: '6px',
          }}
        >
          <Clock size={11} /> Pending Deposit
        </span>
      );
    }
    if (isDraft) {
      return <span className="badge grey" style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '6px' }}>Draft</span>;
    }
    const cleanStatus = a.status
      ? a.status.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      : 'Active';
    return (
      <span className="badge grey" style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '6px' }}>
        {cleanStatus}
      </span>
    );
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setNewAgFileName(file.name);
      const reader = new FileReader();
      reader.onload = () => {
        setNewAgFileData(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCreateAgreement = async () => {
    const unitObj = myUnits.find((u) => u.id === newAgUnit) || myUnits[0];
    if (!unitObj) {
      showToast('Please select a unit before creating an agreement.');
      return;
    }
    setIsUploading(true);
    try {
      const agId = `AGR-${Date.now().toString().slice(-6)}`;
      const newAg: Agreement = {
        id: agId,
        ownerId: ownerId,
        propertyId: unitObj.propertyId || '',
        unit: unitObj.unitNumber || unitObj.id,
        unitId: unitObj.id,
        tenant: unitObj.tenant || 'Prospective Resident',
        tenantId: unitObj.currentTenantId || '',
        type: 'uploaded',
        contentHtml: null,
        fileName: newAgFileName,
        fileData: newAgFileData,
        start: newAgStart || new Date().toISOString().split('T')[0],
        end: newAgEnd || new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0],
        rent: unitObj.rent || 0,
        deposit: unitObj.deposit || 0,
        status: unitObj.tenant ? 'signed' : 'awaiting_tenant_upload',
        tenantSignature: null,
        autoRenew: newAgAuto === 'On',
      };

      await saveAgreement(newAg);
      setIsUploadOpen(false);
      showToast(`Agreement ${agId} uploaded for Unit ${newAg.unit}.`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleApproveSignedLease = async () => {
    if (!inspectingSignedAgreement) return;
    setIsApproving(true);
    try {
      await approveSignedAgreement(
        inspectingSignedAgreement.id,
        user?.displayName || managerRecord?.name || 'Property Manager'
      );
      setInspectingSignedAgreement(null);
      showToast(`Signed lease for Unit ${inspectingSignedAgreement.unit} approved successfully!`);
    } catch (err: any) {
      showToast(err.message || 'Failed to approve lease agreement.');
    } finally {
      setIsApproving(false);
    }
  };

  const handleStartOnboardingFromEnquiry = (enq: PropertyEnquiry) => {
    updateEnquiryStatus(enq.id, 'reviewed');
    setOnboardEnquiryData({
      unitId: enq.unitId,
      propertyId: enq.propertyId,
      name: enq.prospectName,
      phone: enq.prospectPhone,
      email: enq.prospectEmail,
    });
    setIsOnboardOpen(true);
  };

  return (
    <div>
      {/* Clean Subtabs Bar */}
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px',
          background: 'var(--surface-sunken, #f1f5f9)',
          borderRadius: '12px',
          border: '1px solid var(--line, #e2e8f0)',
          marginBottom: '20px',
        }}
      >
        <button
          type="button"
          onClick={() => setSubTab('leases')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 18px',
            borderRadius: '8px',
            fontSize: '13.5px',
            fontWeight: subTab === 'leases' ? 700 : 500,
            color: subTab === 'leases' ? '#065F46' : 'var(--slate, #64748b)',
            background: subTab === 'leases' ? '#ffffff' : 'transparent',
            boxShadow: subTab === 'leases' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          Leases ({myAgreements.length})
        </button>
        <button
          type="button"
          onClick={() => setSubTab('enquiries')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 18px',
            borderRadius: '8px',
            fontSize: '13.5px',
            fontWeight: subTab === 'enquiries' ? 700 : 500,
            color: subTab === 'enquiries' ? '#065F46' : 'var(--slate, #64748b)',
            background: subTab === 'enquiries' ? '#ffffff' : 'transparent',
            boxShadow: subTab === 'enquiries' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <span>Enquiries ({myEnquiries.length})</span>
          {newEnquiriesCount > 0 && (
            <span
              style={{
                background: '#ea580c',
                color: '#fff',
                fontSize: '10.5px',
                padding: '1px 6px',
                borderRadius: '8px',
                fontWeight: 700,
              }}
            >
              {newEnquiriesCount} New
            </span>
          )}
        </button>
      </div>

      {subTab === 'leases' ? (
        <div>
          {/* Action Header */}
          <div className="panel-head" style={{ border: 'none', padding: '0 0 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div className="hint" style={{ fontSize: '13.5px', color: 'var(--slate, #64748b)' }}>
              {myAgreements.length} {myAgreements.length === 1 ? 'document' : 'documents'} on file across managed units
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn brass btn-mobile-full"
                onClick={() => {
                  setOnboardEnquiryData(null);
                  setIsOnboardOpen(true);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontWeight: 700,
                  background: '#059669',
                  borderColor: '#059669',
                  color: '#ffffff',
                  padding: '9px 18px',
                  borderRadius: '8px',
                }}
              >
                <UserPlus size={15} /> Onboard Resident
              </button>
            </div>
          </div>

          <div className="panel">
            <div className="panel-body">
              {myAgreements.length === 0 ? (
                <div style={{ color: 'var(--ink-soft)', padding: '36px 16px', textAlign: 'center' }}>
                  <FileText size={36} style={{ color: 'var(--ink-soft)', margin: '0 auto 8px' }} />
                  <p style={{ margin: 0, fontWeight: 600 }}>No lease documents on record.</p>
                  <span style={{ fontSize: '12.5px' }}>Onboard a resident to issue and manage leases.</span>
                </div>
              ) : (
                <>
                  {/* Desktop / Tablet Table View (>640px) */}
                  <div className="desktop-table-view">
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Document</th>
                            <th>Tenant</th>
                            <th>Unit</th>
                            <th>Term</th>
                            <th>Status</th>
                            <th>File</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {myAgreements.map((a) => (
                            <tr key={a.id}>
                              <td><b>{a.id}</b></td>
                              <td>{a.tenant}</td>
                              <td>Unit {a.unit}</td>
                              <td>{a.start} → {a.end}</td>
                              <td>
                                {getAgreementStatusBadge(a)}
                              </td>
                              <td>
                                {a.fileName ? (
                                  <span
                                    className="badge green"
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      fontSize: '11px',
                                      maxWidth: '180px',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                    }}
                                    title={a.fileName}
                                  >
                                    <FileText size={11} style={{ flexShrink: 0 }} />
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {a.fileName}
                                    </span>
                                  </span>
                                ) : (
                                  <span className="badge grey" style={{ fontSize: '11px' }}>No file</span>
                                )}
                              </td>
                              <td>
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                  <button
                                    type="button"
                                    className="btn secondary small"
                                    onClick={() => setViewingAgreement(a)}
                                    style={{ padding: '5px 12px', borderRadius: '6px' }}
                                  >
                                    View
                                  </button>
                                  {(a.status === 'pending_approval' || a.status === 'awaiting_tenant_upload' || a.status === 'pending_deposit' || a.tenantSignature || (a as any).signedDocumentUrl) && (
                                    <button
                                      type="button"
                                      className="btn brass small"
                                      onClick={() => setInspectingSignedAgreement(a)}
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        background: '#059669',
                                        borderColor: '#059669',
                                        color: '#ffffff',
                                        fontWeight: 600,
                                        padding: '5px 12px',
                                        borderRadius: '6px',
                                      }}
                                    >
                                      <CheckCircle2 size={12} /> Review & Approve
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Mobile Agreement Cards (<=640px) */}
                  <div className="mobile-card-view">
                    {myAgreements.map((a) => (
                      <div key={a.id} className="staff-card">
                        <div className="staff-card-header">
                          <b style={{ fontSize: '14px', color: 'var(--ink)' }}>{a.id}</b>
                          {getAgreementStatusBadge(a)}
                        </div>

                        <div style={{ fontWeight: 600, fontSize: '14.5px', color: 'var(--ink)', margin: '4px 0' }}>
                          {a.tenant}
                        </div>

                        <div className="staff-card-meta">
                          <div className="staff-card-meta-item">
                            <span>Unit: <b>{a.unit}</b></span>
                          </div>
                          <div className="staff-card-meta-item">
                            <span>Term: {a.start} → {a.end}</span>
                          </div>
                        </div>

                        <div style={{ marginTop: '8px', fontSize: '12px' }}>
                          {a.fileName ? (
                            <span className="badge green" style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              📄 {a.fileName}
                            </span>
                          ) : (
                            <span className="badge grey">No PDF attached</span>
                          )}
                        </div>

                        <div className="staff-card-footer" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="btn secondary small"
                            style={{ fontWeight: 600, flex: 1 }}
                            onClick={() => setViewingAgreement(a)}
                          >
                            View
                          </button>
                          {(a.status === 'pending_approval' || a.status === 'awaiting_tenant_upload' || a.status === 'pending_deposit' || a.tenantSignature || (a as any).signedDocumentUrl) && (
                            <button
                              type="button"
                              className="btn brass small"
                              style={{ fontWeight: 700, flex: 1, background: '#059669', borderColor: '#059669', color: '#ffffff' }}
                              onClick={() => setInspectingSignedAgreement(a)}
                            >
                              Review & Approve
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Enquiries Tab */
        <div>
          <div className="panel-head" style={{ border: 'none', padding: '0 0 16px' }}>
            <div className="hint">
              Prospective tenant enquiries for your managed properties. Contact prospects directly via phone to schedule walkthroughs.
            </div>
          </div>

          <div className="panel">
            <div className="panel-body">
              {myEnquiries.length === 0 ? (
                <div style={{ color: 'var(--ink-soft)', padding: '36px 16px', textAlign: 'center' }}>
                  <Phone size={36} style={{ color: 'var(--ink-soft)', margin: '0 auto 8px' }} />
                  <p style={{ margin: 0, fontWeight: 600 }}>No enquiries received yet.</p>
                  <span style={{ fontSize: '12.5px' }}>When renters submit enquiries from the public listing, they will appear here.</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {myEnquiries.map((enq) => (
                    <div
                      key={enq.id}
                      style={{
                        padding: '18px 20px',
                        background: enq.status === 'new' ? 'var(--surface)' : 'var(--surface-sunken)',
                        border: enq.status === 'new' ? '2px solid #10B981' : '1px solid var(--line)',
                        borderRadius: '14px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '14px',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ink)' }}>
                            {enq.prospectName}
                          </span>
                          {enq.status === 'new' && (
                            <span className="badge amber" style={{ fontSize: '11px', fontWeight: 700 }}>
                              New Enquiry
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--ink-soft)', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                          <span>Unit: <b>{enq.unitNumber}</b> ({enq.propertyName})</span>
                          <span>Desired Move-In: <b>{enq.moveInDate}</b></span>
                          <span>Received: <b>{new Date(enq.createdAt).toLocaleDateString()}</b></span>
                        </div>
                        {enq.notes && (
                          <div style={{ marginTop: '6px', fontSize: '12.5px', color: 'var(--ink)', fontStyle: 'italic' }}>
                            "{enq.notes}"
                          </div>
                        )}
                      </div>

                      {/* Actions Cluster */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <a
                          href={`tel:${enq.prospectPhone}`}
                          className="btn secondary small"
                          style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                        >
                          <Phone size={13} color="#10B981" /> Call {enq.prospectPhone}
                        </a>
                        <button
                          type="button"
                          className="btn brass small"
                          onClick={() => handleStartOnboardingFromEnquiry(enq)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontWeight: 700 }}
                        >
                          <UserPlus size={13} /> Onboard as Tenant
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Unified Onboard Resident Modal for Property Manager */}
      <OnboardResidentModal
        isOpen={isOnboardOpen}
        onClose={() => {
          setIsOnboardOpen(false);
          setOnboardEnquiryData(null);
        }}
        entryContext="leasing"
        preselectedUnitId={onboardEnquiryData?.unitId}
        preselectedPropertyId={onboardEnquiryData?.propertyId}
        prefilledTenantName={onboardEnquiryData?.name}
        prefilledTenantPhone={onboardEnquiryData?.phone}
        prefilledTenantEmail={onboardEnquiryData?.email}
        onSuccess={() => {
          showToast('Resident invitation dispatched successfully!');
        }}
      />

      {/* Review & Approve Signed Lease Modal */}
      {inspectingSignedAgreement && (
        <div className="modal-backdrop" onClick={() => setInspectingSignedAgreement(null)}>
          <div className="modal-card" style={{ maxWidth: '580px', width: '92vw' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3 style={{ fontSize: '16.5px', fontWeight: 800 }}>Review & Approve Signed Lease</h3>
              <button type="button" className="btn secondary small" onClick={() => setInspectingSignedAgreement(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ background: 'var(--surface-sunken)', padding: '14px 16px', borderRadius: '10px', marginBottom: '16px' }}>
                <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>
                  Unit {inspectingSignedAgreement.unit} — {inspectingSignedAgreement.tenant}
                </div>
                <div style={{ fontSize: '12.5px', color: 'var(--ink-soft)', marginTop: '4px' }}>
                  Term: {inspectingSignedAgreement.start} → {inspectingSignedAgreement.end} • Rent: ${inspectingSignedAgreement.rent}/mo
                </div>
              </div>

              {inspectingSignedAgreement.fileName && (
                <div style={{ padding: '12px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '8px', marginBottom: '16px', fontSize: '13px', color: '#065F46' }}>
                  ✓ Signed Agreement Document: <b>{inspectingSignedAgreement.fileName}</b>
                </div>
              )}

              <p style={{ fontSize: '13px', color: 'var(--ink-soft)', lineHeight: 1.45 }}>
                By approving this signed agreement as Property Manager, you confirm the resident credentials and unlock security deposit settlement.
              </p>
            </div>
            <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '14px 20px', borderTop: '1px solid var(--line)' }}>
              <button type="button" className="btn secondary" onClick={() => setInspectingSignedAgreement(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn brass"
                onClick={handleApproveSignedLease}
                disabled={isApproving}
                style={{ fontWeight: 700 }}
              >
                <ButtonProcessing
                  loading={isApproving}
                  loadingText="Approving Lease..."
                  defaultText="Approve & Countersign Lease"
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {isUploadOpen && (
        <div className="modal-backdrop" onClick={() => setIsUploadOpen(false)}>
          <div className="modal-card" style={{ maxWidth: '480px', width: '92vw' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3 style={{ fontSize: '16px' }}>Upload agreement</h3>
              <button
                type="button"
                className="btn secondary small"
                onClick={() => setIsUploadOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="field">
                <label>Tenant / unit</label>
                <select
                  value={newAgUnit}
                  onChange={(e) => setNewAgUnit(e.target.value)}
                >
                  {myUnits.length === 0 ? (
                    <option value="">No units available for assigned portfolio</option>
                  ) : (
                    myUnits.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.unitNumber || u.id} ({u.tenant || 'Vacant'})
                      </option>
                    ))
                  )}
                </select>
              </div>
              <div className="row">
                <div className="field">
                  <label>Start date</label>
                  <input
                    type="date"
                    value={newAgStart}
                    onChange={(e) => setNewAgStart(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>End date</label>
                  <input
                    type="date"
                    value={newAgEnd}
                    onChange={(e) => setNewAgEnd(e.target.value)}
                  />
                </div>
              </div>
              <div className="field">
                <label>Auto-renew</label>
                <select
                  value={newAgAuto}
                  onChange={(e) => setNewAgAuto(e.target.value)}
                >
                  <option value="Off">Off</option>
                  <option value="On">On</option>
                </select>
              </div>
              <div className="field">
                <label>Agreement document</label>
                <input type="file" onChange={handleFileChange} />
              </div>
            </div>
            <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '14px 20px', borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setIsUploadOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn brass"
                onClick={handleCreateAgreement}
                disabled={isUploading}
              >
                <ButtonProcessing
                  loading={isUploading}
                  loadingText="Uploading..."
                  defaultText="Upload"
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Agreement Modal */}
      {viewingAgreement && (
        <div className="modal-backdrop" onClick={() => setViewingAgreement(null)}>
          <div className="modal-card" style={{ maxWidth: '480px', width: '92vw' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3 style={{ fontSize: '16px' }}>Agreement {viewingAgreement.id}</h3>
              <button
                type="button"
                className="btn secondary small"
                onClick={() => setViewingAgreement(null)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--ink-soft)', marginBottom: '14px', fontSize: '13px' }}>
                {viewingAgreement.tenant}, unit {viewingAgreement.unit}
              </p>
              <div className="kv" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: '13px' }}>
                <span className="k" style={{ color: 'var(--ink-soft)' }}>Term</span>
                <span>{viewingAgreement.start} → {viewingAgreement.end}</span>
              </div>
              <div className="divider" style={{ margin: '14px 0' }} />
              {viewingAgreement.fileData ? (
                <div className="note-box">
                  Uploaded file: <b>{viewingAgreement.fileName}</b>
                </div>
              ) : (
                <p style={{ color: 'var(--ink-soft)', fontSize: '13px' }}>
                  No file uploaded yet.
                </p>
              )}
            </div>
            <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '14px 20px', borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setViewingAgreement(null)}
              >
                Close
              </button>
              {viewingAgreement.fileData && (
                <a
                  className="btn brass"
                  href={viewingAgreement.fileData}
                  download={viewingAgreement.fileName || 'agreement.pdf'}
                  style={{ textDecoration: 'none' }}
                >
                  Download file
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
