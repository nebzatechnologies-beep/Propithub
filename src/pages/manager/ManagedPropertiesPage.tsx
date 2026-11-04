import React, { useState, useMemo } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import { MapPin, Building2, Plus, X, Building, Check, Sparkles } from 'lucide-react';
import { AddressDisplay } from '../../components/common/AddressDisplay';
import { GooglePlacesAddressPicker } from '../../components/GooglePlacesAddressPicker';
import { Property, PropertyAddress, Unit } from '../../types';
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
  const { state, updateState, showToast, logAuditEvent, saveProperty } = useAppData();
  const { user } = useAuth();
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

  const [inspectingUnit, setInspectingUnit] = useState<Unit | null>(null);
  const [inspCondition, setInspCondition] = useState<'excellent' | 'good' | 'fair' | 'needs_repair'>('good');
  const [inspNotes, setInspNotes] = useState('');
  const [inspDate, setInspDate] = useState(new Date().toISOString().split('T')[0]);
  const [isSavingInspection, setIsSavingInspection] = useState(false);

  // Add Property state for manager
  const [isAddPropertyModalOpen, setIsAddPropertyModalOpen] = useState(false);
  const [propName, setPropName] = useState('');
  const [propAddress, setPropAddress] = useState<PropertyAddress | null>(null);
  const [manualAddress, setManualAddress] = useState('');
  const [propCategory, setPropCategory] = useState<'residential' | 'commercial' | 'mixed'>('residential');
  const [propStructure, setPropStructure] = useState<'single_unit' | 'multi_unit'>('multi_unit');
  const [unitCount, setUnitCount] = useState<number>(4);
  const [rent, setRent] = useState<number>(18000);
  const [deposit, setDeposit] = useState<number>(36000);
  const [furnishing, setFurnishing] = useState<'Unfurnished' | 'Semi-Furnished' | 'Fully Furnished'>('Semi-Furnished');
  const [bedrooms, setBedrooms] = useState<number>(2);
  const [bathrooms, setBathrooms] = useState<number>(2);
  const [areaSqFt, setAreaSqFt] = useState<number>(1050);
  const [propImage, setPropImage] = useState('');
  const [isSavingProp, setIsSavingProp] = useState(false);

  const handleCreateProperty = async () => {
    if (!propName.trim()) {
      showToast('⚠️ Please enter a property name.');
      return;
    }
    const finalOwnerId = ownerId || user?.ownerId || (managerRecord as any)?.ownerId || user?.id || '';
    if (!finalOwnerId) {
      showToast('⚠️ No owner ID linked to your manager account.');
      return;
    }
    setIsSavingProp(true);
    try {
      const propId = `PROP-${Date.now()}`;
      const addressObj: PropertyAddress = propAddress || {
        formattedAddress: manualAddress.trim() || 'Address on file',
        lat: 0,
        lng: 0,
        placeId: `manual_${Date.now()}`,
        city: 'City',
        country: 'India',
        street: manualAddress.trim() || 'Address on file',
      };

      const newProp: Property = {
        id: propId,
        ownerId: finalOwnerId,
        assignedManagerId: user?.id,
        name: propName.trim(),
        address: addressObj,
        amenities: ['24/7 Security', 'Elevator', 'Power Backup', 'Water Supply'],
        images: propImage.trim() ? [propImage.trim()] : ['https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=1200&auto=format&fit=crop&q=80'],
        unitCount: propStructure === 'single_unit' ? 1 : Math.max(1, unitCount),
        occupied: 0,
        createdAt: new Date().toISOString(),
        country: addressObj.country || 'India',
        currency: 'INR',
        propertyCategory: propCategory,
        propertyStructure: propStructure,
        isSingleUnit: propStructure === 'single_unit',
      };

      const newUnits: Unit[] = [];
      const count = propStructure === 'single_unit' ? 1 : Math.max(1, unitCount);
      for (let i = 1; i <= count; i++) {
        const uNum = propStructure === 'single_unit' ? 'Unit 1' : `${i}01`;
        newUnits.push({
          id: `UNIT-${propId}-${i}`,
          propertyId: propId,
          propertyName: newProp.name,
          country: newProp.country,
          address: addressObj.formattedAddress,
          ownerId: finalOwnerId,
          unitNumber: uNum,
          rent: Number(rent) || 15000,
          deposit: Number(deposit) || 30000,
          currency: 'INR',
          status: 'vacant',
          isListedPublicly: true,
          tenant: null,
          currentTenantId: null,
          unitType: propStructure === 'single_unit' ? `${bedrooms}BHK` : '2BHK',
          furnishing: furnishing,
          areaSqFt: Number(areaSqFt) || 1000,
          bathrooms: Number(bathrooms) || 2,
          images: newProp.images,
          image: newProp.images[0],
        });
      }

      await saveProperty(newProp, newUnits);
      showToast(`✓ Property "${newProp.name}" created with ${newUnits.length} vacant unit${newUnits.length > 1 ? 's' : ''}!`);
      setIsAddPropertyModalOpen(false);
      setPropName('');
      setPropAddress(null);
      setManualAddress('');
      setPropImage('');
    } catch (err) {
      console.error('Failed to create property:', err);
      showToast('❌ Failed to create property. Please try again.');
    } finally {
      setIsSavingProp(false);
    }
  };

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
      {/* Top Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800 }}>Managed Properties</h2>
          <div style={{ fontSize: '13px', color: 'var(--ink-soft)' }}>
            Portfolio buildings and unit inventory assigned to your operations
          </div>
        </div>
        <button
          type="button"
          className="btn brass"
          onClick={() => setIsAddPropertyModalOpen(true)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <Plus size={16} /> Add Property
        </button>
      </div>

      {myProperties.length === 0 ? (
        <div className="panel" style={{ padding: '60px 24px', textAlign: 'center' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '14px',
              background: 'var(--surface-sunken, #F1F5F9)',
              color: 'var(--ink-soft, #64748B)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
            }}
          >
            <Building2 size={28} />
          </div>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 800, color: 'var(--ink)' }}>
            No Managed Properties Yet
          </h3>
          <p style={{ margin: '0 auto 20px', maxWidth: '460px', fontSize: '13.5px', color: 'var(--ink-soft)', lineHeight: 1.5 }}>
            You do not have any properties assigned to your management account yet. Create your first property or wait for your property owner to assign one.
          </p>
          <button
            type="button"
            className="btn brass"
            onClick={() => setIsAddPropertyModalOpen(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={16} /> Add First Property
          </button>
        </div>
      ) : (
    <div>
      {myProperties.map((p) => {
        const propUnits = myUnits.filter((u) => u.propertyId === p.id);
        return (
          <div key={p.id} className="panel" style={{ marginBottom: '20px' }}>
            <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16.5px' }}>{p.name}</h3>
                <div className="hint" style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px', flexWrap: 'wrap' }}>
                  <MapPin size={13} style={{ flexShrink: 0 }} /> <AddressDisplay address={p.address} fallback="Address on file" />
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
                            <th style={{ width: '120px' }}>Unit</th>
                            <th>Tenant</th>
                            <th style={{ width: '130px' }}>Status</th>
                            <th style={{ width: '160px' }}>Public Listing</th>
                            <th style={{ width: '140px', textAlign: 'right' }}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {propUnits.map((u) => (
                            <tr key={u.id}>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  {((u.images && u.images[0]) || u.image) ? (
                                    <img
                                      src={(u.images && u.images[0]) || u.image}
                                      alt={`Unit ${u.unitNumber}`}
                                      style={{ width: '28px', height: '28px', borderRadius: '4px', objectFit: 'cover', border: '1px solid var(--line)' }}
                                    />
                                  ) : null}
                                  <b>{u.unitNumber}</b>
                                </div>
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
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                                    <label
                                      className={`toggle ${u.isListedPublicly ? 'on' : ''}`}
                                      onClick={() => handleToggleListing(u.id)}
                                      title={u.isListedPublicly ? 'Listed publicly' : 'Unlisted'}
                                    >
                                      <span className="track" />
                                    </label>
                                    <span style={{ fontSize: '12px', color: u.isListedPublicly ? 'var(--ledger)' : 'var(--ink-soft)', fontWeight: 600 }}>
                                      {u.isListedPublicly ? 'Listed' : 'Unlisted'}
                                    </span>
                                  </div>
                                ) : (
                                  <span style={{ color: 'var(--ink-soft)', fontSize: '12px' }}>—</span>
                                )}
                              </td>
                              <td style={{ textAlign: 'right' }}>
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
    </div>
  )}

      {/* Add Property Modal for Manager */}
      {isAddPropertyModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsAddPropertyModalOpen(false)}>
          <div
            className="modal-card"
            style={{ maxWidth: '580px', width: '94vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head" style={{ borderBottom: '1px solid var(--line)', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700 }}>Add New Property</h3>
                <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '2px' }}>
                  Create and onboard a building into your management portfolio
                </div>
              </div>
              <button
                type="button"
                className="btn secondary small"
                onClick={() => setIsAddPropertyModalOpen(false)}
                style={{ borderRadius: '50%', width: '30px', height: '30px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                ✕
              </button>
            </div>

            <div className="modal-body" style={{ overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Property Name */}
              <div className="field">
                <label style={{ fontWeight: 600, fontSize: '13px' }}>Property / Building Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Greenwood Palms Residency"
                  value={propName}
                  onChange={(e) => setPropName(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--line)' }}
                />
              </div>

              {/* Address Picker */}
              <div className="field">
                <label style={{ fontWeight: 600, fontSize: '13px' }}>Location / Address *</label>
                <div style={{ marginBottom: '6px' }}>
                  <GooglePlacesAddressPicker
                    onAddressSelect={(addr) => setPropAddress(addr)}
                  />
                </div>
                {propAddress ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#047857', background: '#ecfdf5', padding: '6px 10px', borderRadius: '6px' }}>
                    <Check size={14} />
                    <span>{propAddress.formattedAddress}</span>
                  </div>
                ) : (
                  <input
                    type="text"
                    placeholder="Or enter address manually: Street, City, State"
                    value={manualAddress}
                    onChange={(e) => setManualAddress(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '13px' }}
                  />
                )}
              </div>

              {/* Property Structure */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="field">
                  <label style={{ fontWeight: 600, fontSize: '13px' }}>Structure</label>
                  <select
                    value={propStructure}
                    onChange={(e) => setPropStructure(e.target.value as any)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--line)' }}
                  >
                    <option value="multi_unit">Multi-Unit Building</option>
                    <option value="single_unit">Single Unit / Villa</option>
                  </select>
                </div>
                <div className="field">
                  <label style={{ fontWeight: 600, fontSize: '13px' }}>Category</label>
                  <select
                    value={propCategory}
                    onChange={(e) => setPropCategory(e.target.value as any)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--line)' }}
                  >
                    <option value="residential">Residential</option>
                    <option value="commercial">Commercial</option>
                    <option value="mixed">Mixed-Use</option>
                  </select>
                </div>
              </div>

              {/* Structure-specific configuration */}
              {propStructure === 'multi_unit' ? (
                <div style={{ background: 'var(--surface-sunken)', padding: '14px', borderRadius: '10px', border: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--ink)' }}>Initial Units Configuration</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                    <div className="field" style={{ margin: 0 }}>
                      <label style={{ fontSize: '12px' }}>Units Count</label>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={unitCount}
                        onChange={(e) => setUnitCount(Math.max(1, parseInt(e.target.value) || 1))}
                        style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--line)' }}
                      />
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label style={{ fontSize: '12px' }}>Rent / mo (₹)</label>
                      <input
                        type="number"
                        min={0}
                        value={rent}
                        onChange={(e) => setRent(parseInt(e.target.value) || 0)}
                        style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--line)' }}
                      />
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label style={{ fontSize: '12px' }}>Deposit (₹)</label>
                      <input
                        type="number"
                        min={0}
                        value={deposit}
                        onChange={(e) => setDeposit(parseInt(e.target.value) || 0)}
                        style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--line)' }}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ background: 'var(--surface-sunken)', padding: '14px', borderRadius: '10px', border: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--ink)' }}>Single Unit Details</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div className="field" style={{ margin: 0 }}>
                      <label style={{ fontSize: '12px' }}>Monthly Rent (₹)</label>
                      <input
                        type="number"
                        value={rent}
                        onChange={(e) => setRent(parseInt(e.target.value) || 0)}
                        style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--line)' }}
                      />
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label style={{ fontSize: '12px' }}>Security Deposit (₹)</label>
                      <input
                        type="number"
                        value={deposit}
                        onChange={(e) => setDeposit(parseInt(e.target.value) || 0)}
                        style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--line)' }}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                    <div className="field" style={{ margin: 0 }}>
                      <label style={{ fontSize: '12px' }}>Bedrooms</label>
                      <input
                        type="number"
                        min={1}
                        value={bedrooms}
                        onChange={(e) => setBedrooms(parseInt(e.target.value) || 1)}
                        style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--line)' }}
                      />
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label style={{ fontSize: '12px' }}>Bathrooms</label>
                      <input
                        type="number"
                        min={1}
                        value={bathrooms}
                        onChange={(e) => setBathrooms(parseInt(e.target.value) || 1)}
                        style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--line)' }}
                      />
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label style={{ fontSize: '12px' }}>Area (Sq Ft)</label>
                      <input
                        type="number"
                        value={areaSqFt}
                        onChange={(e) => setAreaSqFt(parseInt(e.target.value) || 0)}
                        style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--line)' }}
                      />
                    </div>
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label style={{ fontSize: '12px' }}>Furnishing Status</label>
                    <select
                      value={furnishing}
                      onChange={(e) => setFurnishing(e.target.value as any)}
                      style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--line)' }}
                    >
                      <option value="Unfurnished">Unfurnished</option>
                      <option value="Semi-Furnished">Semi-Furnished</option>
                      <option value="Fully Furnished">Fully Furnished</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Photo Image URL */}
              <div className="field">
                <label style={{ fontWeight: 600, fontSize: '13px' }}>Property Image URL (Optional)</label>
                <input
                  type="url"
                  placeholder="https://example.com/building.jpg"
                  value={propImage}
                  onChange={(e) => setPropImage(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '13px' }}
                />
              </div>
            </div>

            <div className="modal-foot" style={{ borderTop: '1px solid var(--line)', padding: '14px 20px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setIsAddPropertyModalOpen(false)}
                disabled={isSavingProp}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn brass"
                onClick={handleCreateProperty}
                disabled={isSavingProp}
                style={{ minWidth: '130px' }}
              >
                <ButtonProcessing
                  loading={isSavingProp}
                  loadingText="Creating..."
                  defaultText="Create Property"
                />
              </button>
            </div>
          </div>
        </div>
      )}

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
