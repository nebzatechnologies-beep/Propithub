import React, { useState, useMemo } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import { MapPin } from 'lucide-react';
import { Unit } from '../../types';
import { ButtonProcessing } from '../../components/common/Spinner';
import { db, isFirebaseConfigured } from '../../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';

interface InspectionLog {
  id: string;
  unitId: string;
  unitNumber: string;
  propertyId: string;
  date: string;
  inspector: string;
  condition: 'excellent' | 'good' | 'fair' | 'needs_repair';
  notes: string;
  loggedAt: string;
}

export const ManagedPropertiesPage: React.FC = () => {
  const { state, updateState, showToast, logAuditEvent } = useAppData();
  const { user } = useAuth();
  const ownerId = user?.ownerId || '';

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

  const [inspectingUnit, setInspectingUnit] = useState<Unit | null>(null);
  const [inspCondition, setInspCondition] = useState<'excellent' | 'good' | 'fair' | 'needs_repair'>('good');
  const [inspNotes, setInspNotes] = useState('');
  const [inspDate, setInspDate] = useState(new Date().toISOString().split('T')[0]);
  const [isSavingInspection, setIsSavingInspection] = useState(false);

  const handleToggleListing = (unitId: string) => {
    updateState((prev) => ({
      ...prev,
      units: prev.units.map((u) =>
        u.id === unitId ? { ...u, isListedPublicly: !u.isListedPublicly } : u
      ),
    }));
    showToast('Listing status toggled on public directory.');
  };

  const handleSaveInspection = async () => {
    if (!inspectingUnit) return;
    setIsSavingInspection(true);
    try {
      const newLog: InspectionLog = {
        id: `INSP-${Date.now()}`,
        unitId: inspectingUnit.id,
        unitNumber: inspectingUnit.unitNumber,
        propertyId: inspectingUnit.propertyId || '',
        date: inspDate,
        inspector: user?.displayName || 'Property Manager',
        condition: inspCondition,
        notes: inspNotes.trim() || `Routine inspection — condition: ${inspCondition}.`,
        loggedAt: new Date().toISOString(),
      };

      logAuditEvent({
        actor: newLog.inspector,
        actorRole: 'staff',
        action: 'Unit Inspection Logged',
        category: 'maintenance',
        propertyId: newLog.propertyId,
        unit: newLog.unitNumber,
        detail: `Unit ${newLog.unitNumber}: ${newLog.condition.toUpperCase()} — ${newLog.notes}`,
      }).catch(console.warn);

      if (isFirebaseConfigured) {
        await setDoc(doc(db, 'propertyInspections', newLog.id), newLog, { merge: true }).catch((err) =>
          console.warn('Firestore propertyInspections error:', err)
        );
      }

      showToast(`Inspection logged for Unit ${inspectingUnit.unitNumber} — ${inspCondition}.`);
      setInspCondition('good');
      setInspDate(new Date().toISOString().split('T')[0]);
    } finally {
      setIsSavingInspection(false);
    }
  };

  return (
    <div>
      {myProperties.map((p) => {
        const propUnits = myUnits.filter((u) => u.propertyId === p.id);
        return (
          <div key={p.id} className="panel" style={{ marginBottom: '20px' }}>
            <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16.5px' }}>{p.name}</h3>
                <div className="hint" style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                  <MapPin size={13} /> {p.address.formattedAddress}
                </div>
              </div>
              <span className="badge grey" style={{ fontSize: '11.5px' }}>
                {propUnits.length} units managed
              </span>
            </div>
            <div className="panel-body">
              {propUnits.length === 0 ? (
                <div style={{ color: 'var(--ink-soft)', padding: '16px', textAlign: 'center' }}>
                  No units recorded for this property.
                </div>
              ) : (
                <>
                  {/* Desktop / Tablet Table View (>640px) */}
                  <div className="desktop-table-view">
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Unit</th>
                            <th>Tenant</th>
                            <th>Status</th>
                            <th>Public Listing</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {propUnits.map((u) => (
                            <tr key={u.id}>
                              <td style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {((u.images && u.images[0]) || u.image) ? (
                                  <img
                                    src={(u.images && u.images[0]) || u.image}
                                    alt={`Unit ${u.unitNumber}`}
                                    style={{ width: '28px', height: '28px', borderRadius: '4px', objectFit: 'cover', border: '1px solid var(--line)' }}
                                  />
                                ) : null}
                                <b>{u.unitNumber}</b>
                              </td>
                              <td>
                                {u.status === 'reserved' && u.tenant ? (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                    <span className="badge amber" style={{ fontSize: '10.5px', padding: '1px 6px' }}>Pending Invite</span>
                                    <span>{u.tenant}</span>
                                  </span>
                                ) : (
                                  u.tenant || <span style={{ color: 'var(--ink-soft)' }}>Vacant</span>
                                )}
                              </td>
                              <td>
                                <span className={`badge ${u.status === 'occupied' ? 'green' : u.status === 'reserved' ? 'amber' : u.status === 'maintenance' ? 'red' : 'blue'}`}>
                                  {u.status.toUpperCase()}
                                </span>
                              </td>
                              <td>
                                {u.status === 'vacant' ? (
                                  <label
                                    className={`toggle ${u.isListedPublicly ? 'on' : ''}`}
                                    onClick={() => handleToggleListing(u.id)}
                                  >
                                    <span className="track" />
                                  </label>
                                ) : u.status === 'reserved' ? (
                                  <span style={{ color: 'var(--ink-soft)', fontSize: '12px' }}>Reserved</span>
                                ) : u.status === 'maintenance' ? (
                                  <span style={{ color: 'var(--ink-soft)', fontSize: '12px' }}>Under Repair</span>
                                ) : (
                                  <span style={{ color: 'var(--ink-soft)', fontSize: '12px' }}>Occupied</span>
                                )}
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="btn secondary small"
                                  onClick={() => setInspectingUnit(u)}
                                >
                                  Inspection Log
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Mobile Touch Cards (<=640px) */}
                  <div className="mobile-card-view">
                    {propUnits.map((u) => (
                      <div key={u.id} className="staff-card">
                        <div className="staff-card-header">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            {((u.images && u.images[0]) || u.image) && (
                              <img
                                src={(u.images && u.images[0]) || u.image}
                                alt={`Unit ${u.unitNumber}`}
                                style={{ width: '36px', height: '36px', borderRadius: '6px', objectFit: 'cover', border: '1px solid var(--line)' }}
                              />
                            )}
                            <div>
                              <b style={{ fontSize: '15px', color: 'var(--ink)' }}>Unit {u.unitNumber}</b>
                              <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
                                {u.status === 'reserved' && u.tenant
                                  ? `Pending Invite: ${u.tenant}`
                                  : u.tenant
                                  ? `Tenant: ${u.tenant}`
                                  : 'Vacant Unit'}
                              </div>
                            </div>
                          </div>
                          <span className={`badge ${u.status === 'occupied' ? 'green' : u.status === 'reserved' ? 'amber' : u.status === 'maintenance' ? 'red' : 'blue'}`}>
                            {u.status.toUpperCase()}
                          </span>
                        </div>

                        <div style={{ margin: '10px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface-sunken)', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--line)' }}>
                          <span style={{ fontSize: '12.5px', color: 'var(--ink)' }}>Public Listing:</span>
                          {u.status === 'vacant' ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '11px', color: u.isListedPublicly ? 'var(--ledger)' : 'var(--ink-soft)', fontWeight: 600 }}>
                                {u.isListedPublicly ? 'Listed' : 'Unlisted'}
                              </span>
                              <label
                                className={`toggle ${u.isListedPublicly ? 'on' : ''}`}
                                onClick={() => handleToggleListing(u.id)}
                              >
                                <span className="track" />
                              </label>
                            </div>
                          ) : (
                            <span style={{ fontSize: '11px', color: 'var(--ink-soft)', fontWeight: 600 }}>
                              {u.status === 'reserved' ? 'Reserved' : u.status === 'maintenance' ? 'Under Repair' : 'Occupied'}
                            </span>
                          )}
                        </div>

                        <div className="staff-card-footer">
                          <button
                            type="button"
                            className="btn secondary small btn-mobile-full"
                            style={{ fontWeight: 600 }}
                            onClick={() => setInspectingUnit(u)}
                          >
                            📋 Log Unit Inspection
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })}

      {/* Inspection Log Modal */}
      {inspectingUnit && (
        <div className="modal-backdrop" onClick={() => setInspectingUnit(null)}>
          <div className="modal-card" style={{ maxWidth: '480px', width: '92vw' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3 style={{ fontSize: '16px' }}>Log Inspection — Unit {inspectingUnit.unitNumber}</h3>
              <button type="button" className="btn secondary small" onClick={() => setInspectingUnit(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="field">
                <label>Inspection date</label>
                <input
                  type="date"
                  value={inspDate}
                  onChange={(e) => setInspDate(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Overall condition</label>
                <select
                  value={inspCondition}
                  onChange={(e) => setInspCondition(e.target.value as any)}
                >
                  <option value="excellent">Excellent</option>
                  <option value="good">Good</option>
                  <option value="fair">Fair</option>
                  <option value="needs_repair">Needs Repair</option>
                </select>
              </div>
              <div className="field">
                <label>Notes / Observations</label>
                <textarea
                  rows={4}
                  placeholder="Describe the condition, any issues, maintenance needed…"
                  value={inspNotes}
                  onChange={(e) => setInspNotes(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '14px 20px', borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}>
              <button type="button" className="btn secondary" onClick={() => setInspectingUnit(null)}>Cancel</button>
              <button
                type="button"
                className="btn brass"
                onClick={handleSaveInspection}
                disabled={isSavingInspection}
              >
                <ButtonProcessing
                  loading={isSavingInspection}
                  loadingText="Saving inspection..."
                  defaultText="Save inspection"
                />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
