import React, { useState } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';

interface DisputesPageProps {
  defaultTab?: 'disputes' | 'reviews';
}

export const DisputesPage: React.FC<DisputesPageProps> = () => {
  const { state, updateState, showToast } = useAppData();
  const { user } = useAuth();
  const ownerName = user?.displayName || 'Property Owner';
  const ownerId = user?.id || '';

  const [reviewReplies, setReviewReplies] = useState<Record<string, string>>({});
  const [activeReplyId, setActiveReplyId] = useState<string | null>(null);

  // Hard filter: require ownerId match
  const myReviews = (state.reviews?.owners || []).filter(
    (r: any) =>
      (ownerId && r.ownerId === ownerId) ||
      (user?.email && r.ownerEmail?.toLowerCase() === user.email.toLowerCase())
  );

  const avgRating =
    myReviews.length > 0
      ? (myReviews.reduce((sum: number, r: any) => sum + r.rating, 0) / myReviews.length).toFixed(1)
      : 'N/A';

  const renderStars = (rating: number = 5.0) => {
    if (isNaN(rating) || rating <= 0) {
      return (
        <span style={{ color: 'var(--ink-soft)', fontSize: '14px', fontWeight: 500 }}>
          No ratings yet
        </span>
      );
    }
    const fullStars = Math.min(5, Math.max(0, Math.floor(rating)));
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
      <div className="panel">
        <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h2>Your Landlord Reputation</h2>
            <div className="hint">Average across {myReviews.length} reviews</div>
          </div>
          <div style={{ fontSize: '24px' }}>
            {myReviews.length > 0 ? renderStars(Number(avgRating)) : <span style={{ color: 'var(--ink-soft)', fontSize: '14px' }}>No ratings yet</span>}
          </div>
        </div>
      </div>

      <div className="section-title">What tenants have said ({myReviews.length})</div>
      {myReviews.length === 0 ? (
        <div className="panel">
          <div className="panel-body" style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--ink-soft)' }}>
            <p style={{ margin: 0, fontSize: '14px' }}>No reviews recorded from tenants yet. When verified residents complete move-out or submit ratings, they will appear here.</p>
          </div>
        </div>
      ) : (
        myReviews.map((r: any, idx: number) => {
          const reviewId = r.id || `rev-${idx}`;
          return (
            <div key={reviewId} className="panel" style={{ marginBottom: '14px' }}>
              <div className="panel-body">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <b>{r.by || 'Verified Resident'}</b>
                    {r.createdAt && <span style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>{r.createdAt.split('T')[0]}</span>}
                  </div>
                  {renderStars(r.rating)}
                </div>
                <p style={{ color: 'var(--ink)', marginTop: '8px', lineHeight: 1.5, fontSize: '13.5px' }}>{r.text}</p>

                {/* Landlord Verified Reply */}
                {r.ownerReply && (
                  <div style={{ background: 'var(--surface-sunken)', borderLeft: '3px solid #10B981', padding: '10px 14px', borderRadius: '4px', marginTop: '12px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#10B981', display: 'flex', justifyContent: 'space-between' }}>
                      <span>✓ Landlord Response</span>
                      {r.ownerReplyDate && <span style={{ color: 'var(--ink-soft)', fontWeight: 400 }}>{r.ownerReplyDate}</span>}
                    </div>
                    <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--ink)' }}>{r.ownerReply}</p>
                  </div>
                )}

                {/* Reply Action */}
                {!r.ownerReply && (
                  <div style={{ marginTop: '12px' }}>
                    {activeReplyId === reviewId ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <textarea
                          rows={2}
                          placeholder="Write a professional, verified reply to this resident's review..."
                          value={reviewReplies[reviewId] || ''}
                          onChange={(e) => setReviewReplies({ ...reviewReplies, [reviewId]: e.target.value })}
                          style={{ width: '100%', boxSizing: 'border-box', fontSize: '13px', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--line)' }}
                        />
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            type="button"
                            className="btn brass small"
                            onClick={() => {
                              const reply = (reviewReplies[reviewId] || '').trim();
                              if (!reply) return;
                              const updatedReviews = (state.reviews?.owners || []).map((item: any) =>
                                item.id === r.id
                                  ? { ...item, ownerReply: reply, ownerReplyDate: new Date().toISOString().split('T')[0] }
                                  : item
                              );
                              const notif = r.tenantId ? {
                                id: `notif-reply-${Date.now()}`,
                                userId: r.tenantId,
                                title: `${ownerName} replied to your review!`,
                                body: `"${reply}"`,
                                link: '/tenant/trust',
                                isRead: false,
                                createdAt: new Date().toISOString(),
                              } : null;
                              updateState((prev) => ({
                                ...prev,
                                reviews: { ...prev.reviews, owners: updatedReviews },
                                notifications: notif ? [...(prev.notifications || []), notif] : prev.notifications,
                              }));
                              setActiveReplyId(null);
                              showToast('Reply published successfully.');
                            }}
                          >
                            Publish Reply
                          </button>
                          <button
                            type="button"
                            className="btn secondary small"
                            onClick={() => setActiveReplyId(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="btn secondary small"
                        onClick={() => setActiveReplyId(reviewId)}
                      >
                        Reply to Review
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
};

export const OwnerReviewsPage = DisputesPage;
