import React, { useState, useRef, useEffect } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { Search, UserCheck, UserPlus, X, Mail, Phone, Home, Edit3 } from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../../lib/firebase';
import { UserProfile, TenantRecord } from '../../types';

export interface SelectedTenantInfo {
  id: string;
  name: string;
  email: string;
  phone: string;
  tempPassword?: string;
  isNew?: boolean;
}

interface TenantSearchComboboxProps {
  selectedTenant: SelectedTenantInfo | null;
  onSelectTenant: (tenant: SelectedTenantInfo | null) => void;
  ownerId?: string;
  required?: boolean;
  label?: string;
  placeholder?: string;
}

export const TenantSearchCombobox: React.FC<TenantSearchComboboxProps> = ({
  selectedTenant,
  onSelectTenant,
  ownerId,
  required = true,
  label,
  placeholder = 'Type tenant name, email, or phone...',
}) => {
  const { state, updateState } = useAppData();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newPassword, setNewPassword] = useState('Welcome@123');

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync fresh users & tenants from Firestore on mount so recently registered users appear immediately
  useEffect(() => {
    if (isFirebaseConfigured) {
      getDocs(collection(db, 'users'))
        .then((snap) => {
          const freshUsers: UserProfile[] = [];
          snap.forEach((d) => {
            const u = d.data() as UserProfile;
            if (u && u.email) freshUsers.push({ ...u, id: u.id || d.id });
          });
          if (freshUsers.length > 0) {
            updateState((prev) => ({ ...prev, users: freshUsers }));
          }
        })
        .catch(console.warn);

      getDocs(collection(db, 'tenants'))
        .then((snap) => {
          const freshTenants: TenantRecord[] = [];
          snap.forEach((d) => {
            const t = d.data() as TenantRecord;
            if (t && t.id) freshTenants.push(t);
          });
          if (freshTenants.length > 0) {
            updateState((prev) => ({ ...prev, tenants: freshTenants }));
          }
        })
        .catch(console.warn);
    }
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Build candidates list: owner's past/current tenants + all platform registered tenants
  const candidateTenants = React.useMemo(() => {
    const map = new Map<string, SelectedTenantInfo & { unit?: string; isPlatformUser?: boolean }>();

    // Owner's property IDs
    const ownerPropertyIds = new Set(
      (state.properties || [])
        .filter((p) => !ownerId || p.ownerId === ownerId)
        .map((p) => p.id)
    );

    // 1. Owner's past & active tenants from state.tenants
    (state.tenants || []).forEach((t) => {
      const matchOwner =
        !ownerId ||
        t.ownerId === ownerId ||
        (t.propertyId && ownerPropertyIds.has(t.propertyId)) ||
        (state.agreements || []).some((a) => a.ownerId === ownerId && (a.tenantId === t.id || a.tenant === t.name)) ||
        (state.units || []).some((u) => ownerPropertyIds.has(u.propertyId) && (u.currentTenantId === t.id || u.tenant === t.name));

      if (matchOwner && t.name) {
        const key = (t.email || t.id || t.name).toLowerCase();
        map.set(key, {
          id: t.id || `tenant_${Date.now()}`,
          name: t.name,
          email: t.email || '',
          phone: t.phone || '',
          unit: t.unit && t.unit !== 'Unassigned' ? t.unit : undefined,
          isPlatformUser: false,
        });
      }
    });

    // 2. Discover tenants from occupied units belonging to this owner
    (state.units || [])
      .filter((u) => ownerPropertyIds.has(u.propertyId) && u.tenant && u.tenant !== 'Unassigned')
      .forEach((u) => {
        const key = u.tenant!.toLowerCase();
        if (!map.has(key)) {
          map.set(key, {
            id: u.currentTenantId || `tenant_${Date.now()}`,
            name: u.tenant!,
            email: '',
            phone: '',
            unit: u.unitNumber,
            isPlatformUser: false,
          });
        }
      });

    // 3. All registered users on Propithub platform (exclude owner themselves)
    (state.users || []).forEach((u) => {
      if (u.id === ownerId) return;
      const isTenantRole = !u.role || u.role.toLowerCase() === 'tenant' || (u.role as string).toLowerCase() === 'user';
      if (isTenantRole && (u.displayName || u.email)) {
        const key = (u.email || u.id).toLowerCase();
        if (!map.has(key)) {
          map.set(key, {
            id: u.id,
            name: u.displayName || u.email.split('@')[0],
            email: u.email || '',
            phone: u.phone || '',
            isPlatformUser: true,
          });
        }
      }
    });

    return Array.from(map.values());
  }, [state.tenants, state.users, state.properties, state.units, state.agreements, ownerId]);

  // Filter candidates by query
  const filteredCandidates = candidateTenants.filter((t) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase().trim();
    const nameMatch = (t.name || '').toLowerCase().includes(q);
    const emailMatch = (t.email || '').toLowerCase().includes(q);
    const phoneMatch = (t.phone || '').toLowerCase().includes(q);
    return nameMatch || emailMatch || phoneMatch;
  });

  const handleSelect = (t: SelectedTenantInfo) => {
    onSelectTenant(t);
    setQuery('');
    setIsOpen(false);
    setIsAddingNew(false);
  };

  const handleQuickUseTypedName = (nameToUse: string) => {
    const clean = nameToUse.trim();
    if (!clean) return;
    const newTenant: SelectedTenantInfo = {
      id: `usr_tenant_${Date.now()}`,
      name: clean,
      email: '',
      phone: '',
      tempPassword: 'Welcome@123',
      isNew: true,
    };
    onSelectTenant(newTenant);
    setQuery('');
    setIsOpen(false);
    setIsAddingNew(false);
  };

  const handleAddNewSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newName.trim()) return;
    const cleanEmail = newEmail.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      alert('Please enter a valid email address for the tenant.');
      return;
    }
    const cleanPhone = newPhone.trim();
    const phoneDigits = cleanPhone.replace(/\D/g, '');
    if (cleanPhone && (phoneDigits.length < 7 || phoneDigits.length > 15)) {
      alert('Please enter a valid phone number with country code (e.g. +971 50 123 4567).');
      return;
    }
    const cleanPass = newPassword.trim();
    if (cleanPass && cleanPass.length < 6) {
      alert('Temporary password must be at least 6 characters long.');
      return;
    }
    const newTenant: SelectedTenantInfo = {
      id: selectedTenant?.id || `usr_tenant_${Date.now()}`,
      name: newName.trim(),
      email: cleanEmail,
      phone: cleanPhone,
      tempPassword: cleanPass || 'Welcome@123',
      isNew: selectedTenant ? selectedTenant.isNew : true,
    };
    onSelectTenant(newTenant);
    setIsAddingNew(false);
    setIsOpen(false);
  };

  const openEditModalForSelected = () => {
    if (!selectedTenant) return;
    setNewName(selectedTenant.name || '');
    setNewEmail(selectedTenant.email || '');
    setNewPhone(selectedTenant.phone || '');
    setNewPassword(selectedTenant.tempPassword || 'Welcome@123');
    setIsAddingNew(true);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      {label && (
        <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>
          {label}
        </label>
      )}

      {/* Selected Tenant Card State */}
      {selectedTenant && !isAddingNew ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 14px',
            background: 'var(--surface-sunken)',
            border: '1.5px solid var(--brass, #9C7A34)',
            borderRadius: 'var(--radius, 8px)',
            gap: '10px',
            maxWidth: '100%',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: 'rgba(16, 185, 129, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#10B981',
                flexShrink: 0,
              }}
            >
              <UserCheck size={20} />
            </div>
            <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
              <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span>{selectedTenant.name}</span>
                {selectedTenant.isNew ? (
                  <span className="badge" style={{ fontSize: '10.5px', background: '#FEF3C7', color: '#92400E', padding: '2px 7px', borderRadius: '4px' }}>
                    New Resident
                  </span>
                ) : (
                  <span className="badge" style={{ fontSize: '10.5px', background: '#ECFDF5', color: '#065F46', padding: '2px 7px', borderRadius: '4px' }}>
                    Existing Resident
                  </span>
                )}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--ink-soft)', display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginTop: '3px' }}>
                {selectedTenant.email ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Mail size={12} style={{ flexShrink: 0 }} /> {selectedTenant.email}
                  </span>
                ) : (
                  <span style={{ color: 'var(--brass)', cursor: 'pointer', fontStyle: 'italic' }} onClick={openEditModalForSelected}>
                    + Add email
                  </span>
                )}
                {selectedTenant.phone ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Phone size={12} style={{ flexShrink: 0 }} /> {selectedTenant.phone}
                  </span>
                ) : (
                  <span style={{ color: 'var(--brass)', cursor: 'pointer', fontStyle: 'italic' }} onClick={openEditModalForSelected}>
                    + Add phone
                  </span>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            <button
              type="button"
              className="btn secondary small"
              onClick={openEditModalForSelected}
              title="Edit tenant details"
              style={{ padding: '5px 8px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <Edit3 size={13} /> Edit
            </button>
            <button
              type="button"
              className="btn secondary small"
              onClick={() => {
                onSelectTenant(null);
                setQuery('');
                setTimeout(() => inputRef.current?.focus(), 50);
              }}
              title="Remove and select another tenant"
              style={{ padding: '5px 8px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <X size={13} /> Change
            </button>
          </div>
        </div>
      ) : isAddingNew ? (
        /* Inline Quick Add / Edit Form */
        <div
          style={{
            padding: '16px',
            background: 'var(--surface)',
            border: '1.5px solid var(--brass, #9C7A34)',
            borderRadius: 'var(--radius, 8px)',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>
              {selectedTenant ? `Edit Details for ${selectedTenant.name}` : 'Register New Resident for Lease'}
            </span>
            <button
              type="button"
              className="btn secondary small"
              onClick={() => setIsAddingNew(false)}
              style={{ padding: '3px 8px', fontSize: '11.5px' }}
            >
              Cancel
            </button>
          </div>

          <form onSubmit={handleAddNewSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px' }}>
            <div className="field" style={{ margin: 0 }}>
              <label style={{ fontSize: '12px', fontWeight: 600 }}>Tenant Full Name *</label>
              <input
                type="text"
                placeholder="e.g. Rahul Sharma"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
                required
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
              <div className="field" style={{ margin: 0 }}>
                <label style={{ fontSize: '12px', fontWeight: 600 }}>Email Address</label>
                <input
                  type="email"
                  placeholder="resident@gmail.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label style={{ fontSize: '12px', fontWeight: 600 }}>Phone Number</label>
                <input
                  type="tel"
                  placeholder="+91 98765 43210"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                />
              </div>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label style={{ fontSize: '12px', fontWeight: 600 }}>Temporary Password for Tenant *</label>
              <input
                type="text"
                placeholder="e.g. Welcome@123"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
              <span style={{ fontSize: '11px', color: 'var(--ink-soft)', marginTop: '3px', display: 'block' }}>
                Tenant will use this password to sign in for the first time and inspect the lease.
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
              <button
                type="button"
                className="btn secondary small"
                onClick={() => setIsAddingNew(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn brass small"
                disabled={!newName.trim()}
              >
                {selectedTenant ? 'Save Details' : 'Use This Tenant'}
              </button>
            </div>
          </form>
        </div>
      ) : (
        /* Search Box Input */
        <div>
          <div style={{ position: 'relative' }}>
            <Search
              size={16}
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--ink-soft)',
                pointerEvents: 'none',
              }}
            />
            <input
              ref={inputRef}
              type="text"
              placeholder={placeholder}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setIsOpen(true);
              }}
              onFocus={() => setIsOpen(true)}
              onBlur={() => {
                // If user typed something and leaves the field without explicitly picking,
                // auto-resolve so they are never blocked when clicking "Next"
                const trimmed = query.trim();
                if (trimmed && !selectedTenant) {
                  const exact = candidateTenants.find(
                    (c) => c.name.toLowerCase() === trimmed.toLowerCase() || c.email.toLowerCase() === trimmed.toLowerCase()
                  );
                  if (exact) {
                    onSelectTenant(exact);
                  } else {
                    onSelectTenant({
                      id: `usr_tenant_${Date.now()}`,
                      name: trimmed,
                      email: '',
                      phone: '',
                      tempPassword: 'Welcome@123',
                      isNew: true,
                    });
                  }
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const trimmed = query.trim();
                  if (!trimmed) return;
                  const exactMatch = filteredCandidates.find(
                    (c) => c.name.toLowerCase() === trimmed.toLowerCase() || c.email.toLowerCase() === trimmed.toLowerCase()
                  );
                  if (exactMatch) {
                    handleSelect(exactMatch);
                  } else if (filteredCandidates.length === 1) {
                    handleSelect(filteredCandidates[0]);
                  } else {
                    handleQuickUseTypedName(trimmed);
                  }
                }
              }}
              style={{
                width: '100%',
                paddingLeft: '38px',
                borderColor: isOpen ? 'var(--brass)' : undefined,
              }}
              required={required}
            />
          </div>

          {/* Search Results Dropdown Menu */}
          {isOpen && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                left: 0,
                right: 0,
                maxHeight: '280px',
                overflowY: 'auto',
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius, 8px)',
                boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                zIndex: 110,
              }}
            >
              {/* If query typed: Always offer 1-click "Use this typed name" */}
              {query.trim().length > 0 && (
                <div
                  onClick={() => handleQuickUseTypedName(query)}
                  style={{
                    padding: '10px 14px',
                    background: 'var(--surface-sunken)',
                    borderBottom: '1px solid var(--line)',
                    color: 'var(--brass)',
                    fontWeight: 600,
                    fontSize: '12.5px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--line)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--surface-sunken)')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <UserPlus size={15} />
                    <span>Use <strong>"{query.trim()}"</strong> as New Tenant</span>
                  </div>
                  <span style={{ fontSize: '11px', opacity: 0.8 }}>(Press Enter)</span>
                </div>
              )}

              <div style={{ padding: '6px 12px', background: 'var(--surface-sunken)', borderBottom: '1px solid var(--line)', fontSize: '11px', fontWeight: 600, color: 'var(--ink-soft)', display: 'flex', justifyContent: 'space-between' }}>
                <span>MATCHING TENANTS ({filteredCandidates.length})</span>
                <span>Select to Auto-Fill</span>
              </div>

              {filteredCandidates.length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center' }}>
                  <p style={{ fontSize: '12.5px', color: 'var(--ink-soft)', margin: '0 0 10px' }}>
                    No matching tenant found for "{query}".
                  </p>
                  <button
                    type="button"
                    className="btn brass small"
                    onClick={() => {
                      setNewName(query.trim());
                      setIsAddingNew(true);
                      setIsOpen(false);
                    }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    <UserPlus size={13} /> Register "{query.trim() || 'New Tenant'}" with Full Details
                  </button>
                </div>
              ) : (
                <>
                  {filteredCandidates.map((t) => (
                    <div
                      key={t.id}
                      onClick={() => handleSelect(t)}
                      style={{
                        padding: '10px 14px',
                        borderBottom: '1px solid var(--line)',
                        cursor: 'pointer',
                        transition: 'background 0.15s ease',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-sunken)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--ink)' }}>
                          {t.name}
                        </div>
                        {t.unit ? (
                          <span
                            style={{
                              fontSize: '11px',
                              background: '#E8F5E9',
                              color: '#2E7D32',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '3px',
                            }}
                          >
                            <Home size={10} /> Unit {t.unit}
                          </span>
                        ) : t.isPlatformUser ? (
                          <span
                            style={{
                              fontSize: '10.5px',
                              background: '#EFF6FF',
                              color: '#1D4ED8',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '3px',
                              fontWeight: 500,
                            }}
                          >
                            <UserCheck size={10} /> Registered on Propithub
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize: '10.5px',
                              background: '#F1F5F9',
                              color: '#475569',
                              padding: '2px 6px',
                              borderRadius: '4px',
                            }}
                          >
                            Directory
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '14px', fontSize: '11.5px', color: 'var(--ink-soft)', marginTop: '2px' }}>
                        {t.email && <span>{t.email}</span>}
                        {t.phone && <span>• {t.phone}</span>}
                      </div>
                    </div>
                  ))}

                  {/* Register New Resident Option at Bottom */}
                  <div
                    onClick={() => {
                      setNewName(query.trim());
                      setIsAddingNew(true);
                      setIsOpen(false);
                    }}
                    style={{
                      padding: '10px 14px',
                      background: 'var(--surface-sunken)',
                      color: 'var(--brass)',
                      fontWeight: 600,
                      fontSize: '12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--line)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--surface-sunken)')}
                  >
                    <UserPlus size={14} /> + Register new resident with email, phone & password
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
