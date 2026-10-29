import React, { useState } from 'react';
import { InAppNotification } from '../types';
import { Bell, Check, CheckCircle2, XCircle } from 'lucide-react';
import { useAppData } from '../context/AppDataContext';

interface NotificationBellProps {
  notifications: InAppNotification[];
  onMarkAsRead: (id: string) => void;
  onNavigate?: (link: string) => void;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({
  notifications,
  onMarkAsRead,
  onNavigate,
}) => {
  const { confirmCashClaim, rejectCashClaim } = useAppData();
  const [isOpen, setIsOpen] = useState(false);
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const handleConfirm = async (e: React.MouseEvent, claimId: string) => {
    e.stopPropagation();
    await confirmCashClaim(claimId);
  };

  const handleDecline = async (e: React.MouseEvent, claimId: string) => {
    e.stopPropagation();
    const reason = window.prompt('Please state the reason for declining this cash claim (e.g. Cash was not received, or incorrect amount):');
    if (reason && reason.trim()) {
      await rejectCashClaim(claimId, reason.trim());
    }
  };

  return (
    <div className="notif-bell-wrap">
      <button
        type="button"
        className="bell-btn"
        onClick={() => setIsOpen(!isOpen)}
        title="Notifications"
      >
        <Bell size={17} />
        {unreadCount > 0 && <span className="bell-badge">{unreadCount}</span>}
      </button>

      {isOpen && (
        <div className="notif-dropdown">
          <div className="notif-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700 }}>Notifications</span>
            {unreadCount > 0 ? (
              <span
                style={{ fontSize: '11px', color: 'var(--teal-primary)', fontWeight: 600, cursor: 'pointer' }}
                onClick={() => {
                  notifications.forEach((n) => {
                    if (!n.isRead) onMarkAsRead(n.id);
                  });
                }}
              >
                Mark all read ({unreadCount})
              </span>
            ) : (
              <span style={{ fontSize: '11px', color: 'var(--ink-soft)', fontWeight: 400 }}>
                All caught up
              </span>
            )}
          </div>
          <div className="notif-list">
            {notifications.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--ink-soft)', fontSize: '12px' }}>
                No notifications
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`notif-item ${!notif.isRead ? 'unread' : ''}`}
                  onClick={() => {
                    onMarkAsRead(notif.id);
                    if (notif.link && onNavigate) {
                      onNavigate(notif.link);
                      setIsOpen(false);
                    }
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div className="title">{notif.title}</div>
                    {!notif.isRead && (
                      <span
                        title="Mark read"
                        onClick={(e) => {
                          e.stopPropagation();
                          onMarkAsRead(notif.id);
                        }}
                        style={{ cursor: 'pointer', color: 'var(--ledger)' }}
                      >
                        <Check size={14} />
                      </span>
                    )}
                  </div>
                  <div style={{ color: 'var(--ink-soft)', fontSize: '12px' }}>{notif.body}</div>
                  
                  {notif.type === 'cash_claim_confirmation_needed' && notif.cashClaimId && notif.actionable !== false && (
                    <div
                      style={{
                        marginTop: '8px',
                        display: 'flex',
                        gap: '6px',
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={(e) => handleConfirm(e, notif.cashClaimId!)}
                        style={{
                          background: '#16a34a',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '4px 8px',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <CheckCircle2 size={12} /> Confirm Receipt
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDecline(e, notif.cashClaimId!)}
                        style={{
                          background: 'transparent',
                          color: '#dc2626',
                          border: '1px solid #dc2626',
                          borderRadius: '4px',
                          padding: '4px 8px',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <XCircle size={12} /> Decline
                      </button>
                    </div>
                  )}

                  <div className="time">{new Date(notif.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
