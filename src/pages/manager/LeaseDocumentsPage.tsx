import React, { useState, useMemo } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import { Agreement } from '../../types';
import { ButtonProcessing } from '../../components/common/Spinner';

export const LeaseDocumentsPage: React.FC = () => {
  const { state, updateState, saveAgreement, showToast } = useAppData();
  const { user } = useAuth();
  const ownerId = user?.ownerId || '';

  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [viewingAgreement, setViewingAgreement] = useState<Agreement | null>(null);

  const [newAgUnit, setNewAgUnit] = useState('');
  const [newAgStart, setNewAgStart] = useState('');
  const [newAgEnd, setNewAgEnd] = useState('');
  const [newAgAuto, setNewAgAuto] = useState('Off');
  const [newAgFileName, setNewAgFileName] = useState<string | null>(null);
  const [newAgFileData, setNewAgFileData] = useState<string | null>(null);

  const managerRecord = (state.managers || []).find(
    (m) =>
      (user?.id && String(m.id) === user.id) ||
      (user?.email && m.email?.toLowerCase() === user.email.toLowerCase())
  );
  const assignedPropertyId = (user as any)?.propertyId || (user as any)?.assignedPropertyId || managerRecord?.propertyId || '';

  const myProperties = useMemo(() => {
    if (!ownerId) return [];
    const props = state.properties.filter((p) => p.ownerId === ownerId);
    if (assignedPropertyId) {
      return props.filter((p) => p.id === assignedPropertyId || p.assignedManagerId === user?.id);
    }
    const explicitlyAssigned = props.filter((p) => p.assignedManagerId === user?.id);
    return explicitlyAssigned.length > 0 ? explicitlyAssigned : props;
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
          Stale Draft
        </span>
      );
    }
    if (a.status === 'signed' || a.status === 'active') {
      return <span className="badge green" style={{ fontSize: '11px' }}>Signed</span>;
    }
    if (a.status === 'awaiting_tenant_upload') {
      return <span className="badge amber" style={{ fontSize: '11px' }}>Awaiting Signature</span>;
    }
    if (a.status === 'pending_deposit') {
      return <span className="badge amber" style={{ fontSize: '11px' }}>Pending Deposit</span>;
    }
    if (isDraft) {
      return <span className="badge grey" style={{ fontSize: '11px' }}>Draft</span>;
    }
    return <span className="badge grey" style={{ fontSize: '11px' }}>{a.status}</span>;
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
      const agId = `AG-${Date.now().toString(36).toUpperCase()}`;
      const newAg: Agreement = {
        id: agId,
        ownerId: ownerId || unitObj.ownerId || '',
        propertyId: unitObj.propertyId || '',
        unit: unitObj.unitNumber || unitObj.id,
        tenant: unitObj.tenant || 'Resident',
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

  return (
    <div>
      <div className="panel-head" style={{ border: 'none', padding: '0 0 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div className="hint">{myAgreements.length} documents on file</div>
        <button
          type="button"
          className="btn brass btn-mobile-full"
          onClick={() => {
            setNewAgUnit(myUnits[0]?.id || 'A-101');
            setIsUploadOpen(true);
          }}
        >
          + Upload agreement
        </button>
      </div>

      <div className="panel">
        <div className="panel-body">
          {myAgreements.length === 0 ? (
            <div style={{ color: 'var(--ink-soft)', padding: '24px 16px', textAlign: 'center' }}>
              No lease documents on record. Upload an agreement to get started.
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
                          <td>{a.unit}</td>
                          <td>{a.start} → {a.end}</td>
                          <td>
                            {getAgreementStatusBadge(a)}
                          </td>
                          <td>
                            {a.fileName ? (
                              <span className="badge green">{a.fileName}</span>
                            ) : (
                              <span className="badge grey">No file</span>
                            )}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn secondary small"
                              onClick={() => setViewingAgreement(a)}
                            >
                              View
                            </button>
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

                    <div className="staff-card-footer">
                      <button
                        type="button"
                        className="btn secondary small btn-mobile-full"
                        style={{ fontWeight: 600 }}
                        onClick={() => setViewingAgreement(a)}
                      >
                        View Agreement Details
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

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
