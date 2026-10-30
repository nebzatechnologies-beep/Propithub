import React, { useMemo } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import { StaffMember } from '../../types';

export const StaffRatingsPage: React.FC = () => {
  const { state } = useAppData();
  const { user } = useAuth();
  const staffId = user?.id || '';
  const staffEmail = user?.email?.toLowerCase() || '';
  const staffName = user?.displayName || '';

  // Resolve by UID first, then email, then displayName.
  // If state.staff hasn't synced the document yet, dynamically synthesize from authenticated UserProfile.
  const currentStaff: StaffMember | undefined = useMemo(() => {
    const found =
      state.staff.find((s) => s.id === staffId) ||
      (staffEmail ? state.staff.find((s) => s.email?.toLowerCase() === staffEmail) : undefined) ||
      (staffName ? state.staff.find((s) => s.name.toLowerCase() === staffName.toLowerCase()) : undefined);
    if (found) return found;

    if (user && (user.role === 'staff' || (user as any).role === 'staff')) {
      return {
        id: user.id,
        name: user.displayName || user.email?.split('@')[0] || 'Technician',
        role: (user as any).staffRole || 'Maintenance Staff',
        ownerId: user.ownerId || '',
        ownerName: user.ownerName || 'Property Owner',
        phone: user.phone || '',
        email: user.email || '',
        activeTickets: 0,
        rating: (user as any).rating || 5.0,
        completed: (user as any).completed || 0,
        paymentDetails: {
          method: 'bank',
          bank: { accountName: user.displayName || '', accountNumber: '', country: 'India', routing: '' },
          upi: { upiId: '', qrImage: null },
          paypalEmail: '',
        },
      };
    }
    return undefined;
  }, [state.staff, staffId, staffEmail, staffName, user]);

  // Build feedback list from real resolved tickets assigned to this staff member.
  const resolvedTickets = state.tickets.filter(
    (t) =>
      t.status === 'resolved' &&
      ((staffId && t.assignedStaffId === staffId) || (currentStaff?.id && t.assignedStaffId === currentStaff.id))
  );

  const ratedTickets = resolvedTickets.filter((t) => (t as any).rating && (t as any).rating > 0);
  const averageScore = ratedTickets.length > 0
    ? (ratedTickets.reduce((acc, t) => acc + (t.rating || 5), 0) / ratedTickets.length).toFixed(1)
    : (currentStaff?.rating ? currentStaff.rating.toFixed(1) : '5.0');
  const numericAvg = parseFloat(averageScore) || 5.0;

  if (!currentStaff) {
    return (
      <div className="note-box">
        Your staff profile is not set up yet. Please contact your property owner to complete onboarding.
      </div>
    );
  }

  return (
    <div>
      <div className="panel" style={{ marginBottom: '20px' }}>
        <div className="panel-body" style={{ textAlign: 'center', padding: '28px 16px' }}>
          <div style={{ fontFamily: 'Fraunces, serif', fontSize: '38px', fontWeight: 600, color: 'var(--ink)' }}>
            {averageScore}
          </div>
          <div className="stars" style={{ fontSize: '22px', color: 'var(--brass)', letterSpacing: '2px', marginTop: '4px' }}>
            {'★'.repeat(Math.min(5, Math.round(numericAvg)))}
          </div>
          <div className="hint" style={{ marginTop: '8px', fontSize: '13px' }}>
            Based on <b>{ratedTickets.length}</b> verified resident reviews ({resolvedTickets.length} completed work orders)
          </div>

          {/* Dynamic Badges Row */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '16px' }}>
            {numericAvg >= 4.5 && (
              <span className="badge green" style={{ padding: '4px 10px', fontSize: '12px' }}>
                ✓ Top Rated Technician
              </span>
            )}
            {ratedTickets.length > 0 && (
              <span className="badge brass" style={{ padding: '4px 10px', fontSize: '12px' }}>
                ★ Resident Approved
              </span>
            )}
            <span className="badge grey" style={{ padding: '4px 10px', fontSize: '12px' }}>
              🛡️ Owner Certified Staff
            </span>
          </div>
        </div>
      </div>

      <div className="section-title">Recent Completed Jobs & Feedback ({resolvedTickets.length})</div>
      <div className="panel">
        <div className="panel-body" style={{ padding: '14px 18px' }}>
          {resolvedTickets.length === 0 ? (
            <div style={{ padding: '24px 16px', color: 'var(--ink-soft)', textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: '14px' }}>No completed jobs recorded yet. Resolved tickets will appear here with feedback.</p>
            </div>
          ) : (
            resolvedTickets.slice(0, 10).map((t, idx) => {
              const ticketRating = (t as any).rating || 5;
              return (
                <div
                  key={t.id}
                  style={{
                    padding: '14px 0',
                    borderBottom: idx < resolvedTickets.length - 1 ? '1px solid var(--line)' : 'none',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <b style={{ fontSize: '14px', color: 'var(--ink)' }}>{t.tenant || 'Resident'}</b>
                        <span className="badge grey" style={{ fontSize: '11px' }}>
                          Unit {t.unit}
                        </span>
                        <span style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>
                          Ticket #{t.id}
                        </span>
                      </div>
                    </div>
                    <span style={{ color: 'var(--brass)', fontSize: '14px', letterSpacing: '1px', fontWeight: 600 }}>
                      {'★'.repeat(ticketRating)}
                    </span>
                  </div>
                  <p style={{ color: 'var(--ink)', marginTop: '8px', fontSize: '13px', lineHeight: '1.5', background: 'var(--surface-sunken)', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--line)' }}>
                    {t.completionNotes || `Issue resolved: ${t.issue}`}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

