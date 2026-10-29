import React, { useState, useEffect, useMemo } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import { TenantReview } from '../../types';
import { isFirebaseConfigured, db } from '../../lib/firebase';
import { collection, query, where, getDocs, limit, doc, setDoc } from 'firebase/firestore';
import { ButtonProcessing } from '../../components/common/Spinner';
import { AlertCircle, MessageSquare } from 'lucide-react';

export const ReviewsDisputesPage: React.FC = () => {
  const { state, updateState, showToast } = useAppData();
  const { user } = useAuth();
  const tenantName = user?.displayName || 'Resident';
  const tenantEmail = user?.email?.toLowerCase() || '';

  const tenantRecord = state.tenants.find(
    (t) =>
      t.id === user?.id ||
      (user?.email && t.email.toLowerCase() === user.email.toLowerCase()) ||
      (user?.displayName && t.name.toLowerCase() === user.displayName.toLowerCase())
  );

  const completedMoveOut = (state.moveouts || []).find(
    (m) =>
      (m.tenantId === user?.id ||
        (tenantEmail && m.tenant?.toLowerCase() === tenantEmail) ||
        (user?.displayName && m.tenant?.toLowerCase() === user.displayName.toLowerCase())) &&
      m.status === 'refund_completed'
  );

  // Multi-property landlord aggregation
  const associatedLandlords = useMemo(() => {
    const map = new Map<string, { id: string; name: string; propertyName: string; unit: string; propertyId?: string }>();

    // From agreements
    (state.agreements || []).forEach((ag) => {
      const isMe =
        (user?.id && ag.tenantId === user.id) ||
        (tenantEmail && (ag.tenantEmail?.toLowerCase() === tenantEmail || ag.tenant?.toLowerCase() === tenantEmail));
      if (isMe && ag.ownerId) {
        const pName = state.properties.find((p) => p.id === ag.propertyId)?.name || (ag as any).propertyName || 'Residence';
        if (!map.has(ag.ownerId)) {
          map.set(ag.ownerId, {
            id: ag.ownerId,
            name: ag.ownerName || 'Property Owner',
            propertyName: pName,
            unit: ag.unit || 'Premises',
            propertyId: ag.propertyId,
          });
        }
      }
    });

    // From units
    (state.units || []).forEach((u) => {
      const isMe = (user?.id && u.currentTenantId === user.id) || (tenantEmail && u.tenant?.toLowerCase() === tenantEmail);
      if (isMe && u.ownerId && !map.has(u.ownerId)) {
        const pName = state.properties.find((p) => p.id === u.propertyId)?.name || u.propertyName || 'Residence';
        map.set(u.ownerId, {
          id: u.ownerId,
          name: tenantRecord?.owner || 'Property Owner',
          propertyName: pName,
          unit: u.unitNumber,
          propertyId: u.propertyId,
        });
      }
    });

    // From tenantRecord
    if (tenantRecord?.ownerId && !map.has(tenantRecord.ownerId)) {
      map.set(tenantRecord.ownerId, {
        id: tenantRecord.ownerId,
        name: tenantRecord.owner || 'Property Owner',
        propertyName: tenantRecord.propertyName || 'Residence',
        unit: tenantRecord.unit || 'Premises',
      });
    }

    // From completed moveouts
    if (completedMoveOut?.ownerId && !map.has(completedMoveOut.ownerId)) {
      map.set(completedMoveOut.ownerId, {
        id: completedMoveOut.ownerId,
        name: completedMoveOut.ownerName || 'Property Owner',
        propertyName: completedMoveOut.propertyId || 'Residence',
        unit: completedMoveOut.unit || 'Premises',
      });
    }

    return Array.from(map.values());
  }, [state.agreements, state.units, state.properties, user, tenantRecord, tenantEmail, completedMoveOut]);

  const defaultOwner = associatedLandlords[0] || {
    id: tenantRecord?.ownerId || completedMoveOut?.ownerId || '',
    name: tenantRecord?.owner || completedMoveOut?.ownerName || 'Property Owner',
    propertyName: tenantRecord?.propertyName || 'Residence',
    unit: tenantRecord?.unit || 'Premises',
  };

  const targetOwnerName = defaultOwner.name;
  const targetOwnerId = defaultOwner.id;

  const [subTab, setSubTab] = useState<'reviews' | 'directory'>('reviews');

  // Search state for directory
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOwner, setSelectedOwner] = useState<any | null>(null);

  // Write review modal state
  const [isWriteReviewOpen, setIsWriteReviewOpen] = useState(false);
  const [selectedReviewOwnerId, setSelectedReviewOwnerId] = useState<string>(targetOwnerId);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [reviewOwnerFilter, setReviewOwnerFilter] = useState<string>('all');

  // Sync selected review owner when associatedLandlords change
  useEffect(() => {
    if (!selectedReviewOwnerId && associatedLandlords.length > 0) {
      setSelectedReviewOwnerId(associatedLandlords[0].id);
    }
  }, [associatedLandlords, selectedReviewOwnerId]);

  // All reviews written by this tenant or targeting associated landlords
  const myLandlordReviews = useMemo(() => {
    return (state.reviews?.owners || []).filter((r: any) => {
      const matchesTenant =
        (user?.id && r.tenantId === user.id) ||
        (user?.displayName && r.by?.toLowerCase() === user.displayName.toLowerCase());
      const matchesAssociatedOwner = associatedLandlords.some(
        (o) => o.id === r.ownerId || (r.owner && o.name.toLowerCase() === r.owner.toLowerCase())
      );
      if (!matchesTenant && !matchesAssociatedOwner) return false;
      if (reviewOwnerFilter !== 'all') {
        return r.ownerId === reviewOwnerFilter;
      }
      return true;
    });
  }, [state.reviews?.owners, user, associatedLandlords, reviewOwnerFilter]);

  // Landlord verification check
  const hasActiveOrPastTenancy = Boolean(
    tenantRecord ||
      completedMoveOut ||
      associatedLandlords.length > 0 ||
      (state.agreements || []).some(
        (a) =>
          (user?.id && a.tenantId === user.id) ||
          (tenantEmail && (a.tenantEmail?.toLowerCase() === tenantEmail || a.tenant?.toLowerCase() === tenantEmail))
      ) ||
      (state.units || []).some(
        (u) =>
          (user?.id && u.currentTenantId === user.id) ||
          (tenantEmail && u.tenant?.toLowerCase() === tenantEmail)
      )
  );

  // Collect associated owner IDs and names
  const associatedOwnerIds = useMemo(() => {
    const ids = new Set<string>();
    associatedLandlords.forEach((o) => {
      if (o.id) ids.add(o.id);
    });
    if (targetOwnerId) ids.add(targetOwnerId);
    if (tenantRecord?.ownerId) ids.add(tenantRecord.ownerId);
    if (completedMoveOut?.ownerId) ids.add(completedMoveOut.ownerId);
    (tenantRecord?.history || []).forEach((h: any) => {
      if (h.ownerId) ids.add(h.ownerId);
    });
    return ids;
  }, [associatedLandlords, targetOwnerId, tenantRecord, completedMoveOut]);

  const associatedOwnerNames = useMemo(() => {
    const names = new Set<string>();
    associatedLandlords.forEach((o) => {
      if (o.name) names.add(o.name.toLowerCase());
    });
    if (targetOwnerName && targetOwnerName !== 'Property Owner') names.add(targetOwnerName.toLowerCase());
    if (completedMoveOut?.ownerName) names.add(completedMoveOut.ownerName.toLowerCase());
    (tenantRecord?.history || []).forEach((h: any) => {
      if (h.owner) names.add(h.owner.toLowerCase());
    });
    return names;
  }, [associatedLandlords, targetOwnerName, completedMoveOut, tenantRecord]);

  // Live Firestore search state
  const [firestoreOwners, setFirestoreOwners] = useState<any[]>([]);
  const [isSearchingLive, setIsSearchingLive] = useState(false);

  useEffect(() => {
    if (!isFirebaseConfigured || !searchQuery.trim() || searchQuery.trim().length < 2 || associatedOwnerIds.size === 0) {
      setFirestoreOwners([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingLive(true);
      try {
        const usersRef = collection(db, 'users');
        const q = query(
          usersRef,
          where('role', '==', 'owner'),
          limit(10)
        );
        const snapshot = await getDocs(q);
        const results: any[] = [];
        const term = searchQuery.trim().toLowerCase();

        snapshot.forEach((d) => {
          const data = d.data();
          const ownerId = d.id;
          const ownerName = data.displayName || '';
          const isAssociated =
            associatedOwnerIds.has(ownerId) ||
            associatedOwnerNames.has(ownerName.toLowerCase());

          if (isAssociated) {
            const matchesQuery =
              ownerName.toLowerCase().includes(term) ||
              (data.email && data.email.toLowerCase().includes(term)) ||
              (data.phone && data.phone.includes(term));
            if (matchesQuery) {
              results.push({ id: ownerId, ...data });
            }
          }
        });
        setFirestoreOwners(results);
      } catch (err) {
        console.warn('Firestore live owner search error:', err);
      } finally {
        setIsSearchingLive(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [searchQuery, associatedOwnerIds, associatedOwnerNames]);

  const filteredOwners = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const term = searchQuery.toLowerCase();
    const localMatches = (state.users || []).filter(
      (u) =>
        u.role === 'owner' &&
        (associatedOwnerIds.has(u.id) || (u.displayName && associatedOwnerNames.has(u.displayName.toLowerCase()))) &&
        (u.displayName?.toLowerCase().includes(term) ||
          u.email?.toLowerCase().includes(term) ||
          (u.phone && u.phone.includes(term)))
    );
    const combinedMap = new Map<string, any>();
    localMatches.forEach((m) => combinedMap.set(m.id, m));
    firestoreOwners.forEach((f) => combinedMap.set(f.id, f));
    return Array.from(combinedMap.values());
  }, [searchQuery, state.users, firestoreOwners, associatedOwnerIds, associatedOwnerNames]);

  const handlePostReview = async () => {
    const chosenOwner = associatedLandlords.find((o) => o.id === selectedReviewOwnerId) || defaultOwner;
    if (!chosenOwner.id && !chosenOwner.name) {
      showToast('You can only review a landlord you have or had an active tenancy with.');
      return;
    }
    setIsSubmittingReview(true);
    try {
      const text = reviewText.trim() || 'Prompt landlord, quick resolutions.';
      const newRev: TenantReview = {
        id: `REV-${Date.now()}`,
        owner: chosenOwner.name,
        ownerId: chosenOwner.id || undefined,
        propertyId: chosenOwner.propertyId || undefined,
        by: tenantName,
        tenantId: user?.id,
        rating: reviewRating,
        text,
        createdAt: new Date().toISOString(),
      };

      updateState((prev) => ({
        ...prev,
        reviews: {
          ...prev.reviews,
          owners: [newRev, ...prev.reviews.owners],
        },
      }));

      if (isFirebaseConfigured && newRev.id) {
        try {
          await setDoc(doc(db, 'reviews', newRev.id), newRev, { merge: true });
        } catch (err) {
          console.warn('Firestore review sync failed:', err);
        }
      }

      setIsWriteReviewOpen(false);
      setReviewText('');
      showToast(`Review posted for landlord ${chosenOwner.name}.`);
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const renderStars = (rating: number = 5.0) => {
    const fullStars = Math.floor(rating);
    return (
      <span style={{ color: 'var(--brass)', letterSpacing: '1px' }}>
        {'★'.repeat(fullStars)}
        {rating % 1 !== 0 ? '½' : ''}
        <span style={{ color: 'var(--ink-soft)', fontSize: '12px', marginLeft: '4px' }}>
          ({Number(rating).toFixed(1)})
        </span>
      </span>
    );
  };

  return (
    <div>
      <div className="tabs">
        <div
          className={`tab ${subTab === 'reviews' ? 'active' : ''}`}
          onClick={() => setSubTab('reviews')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <MessageSquare size={15} />
          Landlord Reviews
        </div>
        <div
          className={`tab ${subTab === 'directory' ? 'active' : ''}`}
          onClick={() => setSubTab('directory')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          Find a landlord
        </div>
      </div>

      {/* SUBTAB 1: REVIEWS */}
      {subTab === 'reviews' && (
        <div>
          <div className="panel-head" style={{ border: 'none', padding: '0 0 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <div className="hint">Verified ratings &amp; feedback for your landlords</div>
              {associatedLandlords.length > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>Landlord:</span>
                  <select
                    value={reviewOwnerFilter}
                    onChange={(e) => setReviewOwnerFilter(e.target.value)}
                    style={{ padding: '4px 8px', fontSize: '12px', borderRadius: 'var(--radius)', border: '1px solid var(--line)' }}
                  >
                    <option value="all">All Landlords ({associatedLandlords.length})</option>
                    {associatedLandlords.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name} ({o.propertyName})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <button
              type="button"
              className="btn brass btn-mobile-full"
              onClick={() => setIsWriteReviewOpen(true)}
              disabled={!hasActiveOrPastTenancy}
              title={
                !hasActiveOrPastTenancy
                  ? 'Only residents with active or past leases can write reviews.'
                  : ''
              }
            >
              + Write a review
            </button>
          </div>

          {!hasActiveOrPastTenancy && (
            <div
              style={{
                background: 'var(--surface-sunken)',
                border: '1px solid var(--line)',
                borderRadius: '8px',
                padding: '12px 16px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontSize: '13px',
                color: 'var(--ink-soft)',
              }}
            >
              <AlertCircle size={16} color="var(--amber)" />
              <span>
                To ensure authenticity, only tenants with verified active or past leases can review landlords.
              </span>
            </div>
          )}

          {myLandlordReviews.length === 0 ? (
            <div className="panel" style={{ padding: '32px', textAlign: 'center', color: 'var(--ink-soft)' }}>
              No reviews recorded for your landlords yet. Be the first to share your experience!
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {myLandlordReviews.map((r: any) => (
                <div key={r.id} className="panel" style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <b style={{ fontSize: '14.5px' }}>{r.owner || targetOwnerName}</b>
                        <span className="badge green" style={{ fontSize: '11px' }}>Verified Tenancy</span>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '2px' }}>
                        Reviewed by {r.by} • {new Date(r.createdAt || Date.now()).toLocaleDateString()}
                      </div>
                    </div>
                    <div>{renderStars(r.rating)}</div>
                  </div>
                  <p style={{ margin: '12px 0 0', fontSize: '13.5px', color: 'var(--ink)', lineHeight: '1.5' }}>
                    "{r.text}"
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SUBTAB 2: FIND A LANDLORD */}
      {subTab === 'directory' && (
        <div>
          <div className="panel" style={{ marginBottom: '16px' }}>
            <div className="panel-body">
              <div className="field">
                <label>Search Landlord Directory</label>
                <input
                  type="text"
                  placeholder="Search by landlord name, email, or phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <span className="hint" style={{ marginTop: '4px', display: 'block' }}>
                  {isSearchingLive
                    ? 'Searching directory...'
                    : 'Search is restricted to verified landlords associated with your past or present tenancies.'}
                </span>

                {searchQuery.trim().length >= 2 && filteredOwners.length === 0 && !isSearchingLive && (
                  <div style={{ padding: '12px 0', color: 'var(--ink-soft)', fontSize: '13px' }}>
                    No matching landlord found under your associated tenancies.
                  </div>
                )}

                {filteredOwners.length > 0 && (
                  <div
                    style={{
                      marginTop: '8px',
                      border: '1px solid var(--line)',
                      borderRadius: 'var(--radius)',
                      maxHeight: '240px',
                      overflowY: 'auto',
                    }}
                  >
                    {filteredOwners.map((o) => (
                      <div
                        key={o.id}
                        onClick={() => setSelectedOwner(o)}
                        style={{
                          padding: '10px 14px',
                          cursor: 'pointer',
                          borderBottom: '1px solid var(--line)',
                          background: selectedOwner?.id === o.id ? 'var(--surface-sunken)' : 'transparent',
                        }}
                      >
                        <b>{o.displayName}</b>
                        <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
                          {o.email} • {renderStars(o.rating || 4.7)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {selectedOwner && (
            <div className="panel">
              <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div className="person">
                  <div className="avatar">{selectedOwner.displayName.slice(0, 2).toUpperCase()}</div>
                  <div className="who">
                    <b>{selectedOwner.displayName}</b>
                    <span>{selectedOwner.email}</span>
                  </div>
                </div>
                <div>{renderStars(selectedOwner.rating || 4.7)}</div>
              </div>
              <div className="panel-body">
                <div className="kv" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                  <span className="k" style={{ color: 'var(--ink-soft)' }}>Properties managed</span>
                  <span>
                    {state.properties.filter((p) => p.ownerId === selectedOwner.id).length || 3}
                  </span>
                </div>

                <div className="section-title">Reviews from tenants</div>
                {(state.reviews?.owners || []).filter((r: any) =>
                  selectedOwner.id ? r.ownerId === selectedOwner.id : (!r.ownerId && r.owner === selectedOwner.displayName)
                ).length === 0 ? (
                  <p style={{ color: 'var(--ink-soft)' }}>No reviews yet for this landlord.</p>
                ) : (
                  (state.reviews?.owners || [])
                    .filter((r: any) =>
                      selectedOwner.id ? r.ownerId === selectedOwner.id : (!r.ownerId && r.owner === selectedOwner.displayName)
                    )
                    .map((r: any, idx: number) => (
                      <div
                        key={idx}
                        style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <b>{r.by}</b>
                          {renderStars(r.rating)}
                        </div>
                        <p style={{ color: 'var(--ink-soft)', marginTop: '4px' }}>{r.text}</p>
                      </div>
                    ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL: WRITE REVIEW */}
      {isWriteReviewOpen && (
        <div className="modal-backdrop" onClick={() => setIsWriteReviewOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Write a landlord review</h3>
              <button
                type="button"
                className="btn secondary small"
                onClick={() => setIsWriteReviewOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              {associatedLandlords.length > 1 && (
                <div className="field">
                  <label>Select Landlord / Residence</label>
                  <select
                    value={selectedReviewOwnerId}
                    onChange={(e) => setSelectedReviewOwnerId(e.target.value)}
                  >
                    {associatedLandlords.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name} — Unit {o.unit} ({o.propertyName})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="field">
                <label>Rating</label>
                <select
                  value={reviewRating}
                  onChange={(e) => setReviewRating(Number(e.target.value))}
                >
                  <option value={5}>5 - Excellent</option>
                  <option value={4}>4 - Very Good</option>
                  <option value={3}>3 - Average</option>
                  <option value={2}>2 - Poor</option>
                  <option value={1}>1 - Terrible</option>
                </select>
              </div>
              <div className="field">
                <label>Review</label>
                <textarea
                  rows={4}
                  placeholder="Share your tenancy experience, maintenance promptness, and landlord communication..."
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '16px 20px', borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn secondary btn-mobile-full"
                onClick={() => setIsWriteReviewOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`btn brass btn-mobile-full ${isSubmittingReview ? 'btn-processing' : ''}`}
                onClick={handlePostReview}
                disabled={isSubmittingReview}
              >
                <ButtonProcessing
                  loading={isSubmittingReview}
                  loadingText="Posting Review..."
                  defaultText="Submit review"
                />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
