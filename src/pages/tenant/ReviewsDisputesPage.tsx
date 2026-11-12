import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import { TenantReview } from '../../types';
import { isFirebaseConfigured, db } from '../../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { ButtonProcessing } from '../../components/common/Spinner';
import { AlertCircle, MessageSquare, Compass, CheckCircle2, Clock, ExternalLink } from 'lucide-react';

export const ReviewsDisputesPage: React.FC = () => {
  const { state, updateState, showToast } = useAppData();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialTab = searchParams.get('tab') === 'enquiries' ? 'enquiries' : 'reviews';
  const [activeTab, setActiveTab] = useState<'reviews' | 'enquiries'>(initialTab);

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'enquiries') {
      setActiveTab('enquiries');
    } else if (tabParam === 'reviews') {
      setActiveTab('reviews');
    }
  }, [searchParams]);

  const handleTabChange = (tab: 'reviews' | 'enquiries') => {
    setActiveTab(tab);
    setSearchParams(tab === 'enquiries' ? { tab: 'enquiries' } : {});
  };

  const tenantName = user?.displayName || 'Resident';
  const tenantEmail = user?.email?.toLowerCase() || '';

  // My submitted enquiries (matched by tenantId, email, or phone)
  const myEnquiries = useMemo(() => {
    if (!user) return [];
    const userEmailLower = user.email?.toLowerCase().trim();
    const userPhoneClean = (user.phone || '').replace(/[^0-9]/g, '');

    return (state.enquiries || []).filter((e) => {
      if (e.tenantId && e.tenantId === user.id) return true;
      if (userEmailLower && e.prospectEmail?.toLowerCase().trim() === userEmailLower) return true;
      if (userPhoneClean && e.prospectPhone.replace(/[^0-9]/g, '') === userPhoneClean) return true;
      return false;
    });
  }, [state.enquiries, user]);

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
          className={`tab ${activeTab === 'reviews' ? 'active' : ''}`}
          onClick={() => handleTabChange('reviews')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
        >
          <MessageSquare size={15} />
          Landlord Reviews
        </div>
        <div
          className={`tab ${activeTab === 'enquiries' ? 'active' : ''}`}
          onClick={() => handleTabChange('enquiries')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
        >
          <Compass size={15} />
          <span>My Enquiries</span>
          {myEnquiries.length > 0 && (
            <span
              className="badge green"
              style={{
                borderRadius: '999px',
                padding: '1px 7px',
                fontSize: '11px',
                fontWeight: 700,
              }}
            >
              {myEnquiries.length}
            </span>
          )}
        </div>
      </div>

      {activeTab === 'enquiries' ? (
        <div>
          <div
            className="panel-head"
            style={{
              border: 'none',
              padding: '0 0 16px',
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '10px',
            }}
          >
            <button
              type="button"
              className="btn brass btn-mobile-full"
              onClick={() => navigate('/homes')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Compass size={15} /> Browse Available Homes
            </button>
          </div>

          {myEnquiries.length === 0 ? (
            <div
              className="panel"
              style={{
                padding: '44px 20px',
                textAlign: 'center',
                color: 'var(--ink-soft)',
              }}
            >
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>📬</div>
              <h4 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: 700, color: 'var(--ink)' }}>
                No enquiries submitted yet
              </h4>
              <p style={{ margin: '0 auto 18px', fontSize: '13px', maxWidth: '420px' }}>
                When you find an available home and submit a viewing request, its real-time status from the landlord will appear here.
              </p>
              <button
                type="button"
                className="btn brass"
                onClick={() => navigate('/homes')}
              >
                Explore Available Homes →
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {myEnquiries.map((enq) => (
                <div
                  key={enq.id}
                  className="panel"
                  style={{
                    padding: '18px 20px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '14px',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '15.5px', fontWeight: 800, color: 'var(--ink)' }}>
                        Unit {enq.unitNumber}
                      </span>
                      <span style={{ fontSize: '13px', color: 'var(--ink-soft)' }}>•</span>
                      <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)' }}>
                        {enq.propertyName}
                      </span>
                      {enq.unitId && (
                        <button
                          type="button"
                          onClick={() => navigate(`/homes/${enq.unitId}`)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--teal-primary, #10b981)',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                            padding: 0,
                          }}
                        >
                          View listing <ExternalLink size={12} />
                        </button>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: '12.5px',
                        color: 'var(--ink-soft)',
                        display: 'flex',
                        gap: '14px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <span>
                        Desired Move-In: <b>{enq.moveInDate}</b>
                      </span>
                      <span>
                        Submitted: <b>{new Date(enq.createdAt).toLocaleDateString()}</b>
                      </span>
                      <span>
                        Contact Phone: <b>{enq.prospectPhone}</b>
                      </span>
                    </div>
                    {enq.notes && (
                      <div
                        style={{
                          marginTop: '8px',
                          fontSize: '13px',
                          color: 'var(--ink)',
                          fontStyle: 'italic',
                        }}
                      >
                        "{enq.notes}"
                      </div>
                    )}
                  </div>

                  <div>
                    {enq.status === 'onboarded' ? (
                      <span
                        className="badge green"
                        style={{ padding: '6px 12px', fontSize: '12px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                      >
                        <CheckCircle2 size={13} /> Lease Invitation Prepared
                      </span>
                    ) : enq.status === 'reviewed' ? (
                      <span
                        className="badge blue"
                        style={{ padding: '6px 12px', fontSize: '12px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                      >
                        <CheckCircle2 size={13} /> Reviewed by Landlord
                      </span>
                    ) : (
                      <span
                        className="badge amber"
                        style={{ padding: '6px 12px', fontSize: '12px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                      >
                        <Clock size={13} /> Submitted — Awaiting Call
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div>
          <div className="panel-head" style={{ border: 'none', padding: '0 0 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
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
              <AlertCircle size={16} color="var(--amber)" style={{ flexShrink: 0 }} />
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
