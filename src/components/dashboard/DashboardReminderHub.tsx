import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardReminder } from '../../lib/reminders';
import {
  AlertTriangle,
  Clock,
  Calendar,
  CreditCard,
  FileText,
  Wrench,
  Bell,
  ArrowRight,
  Send,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  X,
  Zap,
} from 'lucide-react';
import { useAppData } from '../../context/AppDataContext';
import { ButtonProcessing } from '../common/Spinner';
import { db, isFirebaseConfigured } from '../../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';

interface DashboardReminderHubProps {
  reminders: DashboardReminder[];
  role: 'tenant' | 'owner' | 'manager' | 'staff' | 'superadmin';
  title?: string;
  onSendNudge?: (reminder: DashboardReminder) => void;
}

export const DashboardReminderHub: React.FC<DashboardReminderHubProps> = ({
  reminders,
  role,
  title = 'Action Required & Reminders',
  onSendNudge,
}) => {
  const { showToast, updateState } = useAppData();
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [snoozedIds, setSnoozedIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('propithub_snoozed_reminders');
      if (!stored) return [];
      const parsed: Record<string, number> = JSON.parse(stored);
      const now = Date.now();
      return Object.keys(parsed).filter((id) => parsed[id] > now);
    } catch {
      return [];
    }
  });
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [nudgingId, setNudgingId] = useState<string | null>(null);

  const activeReminders = reminders.filter(
    (r) => !dismissedIds.includes(r.id) && !snoozedIds.includes(r.id)
  );

  if (activeReminders.length === 0) {
    return null;
  }

  const handleSnooze = (reminderId: string) => {
    const expireAt = Date.now() + 24 * 60 * 60 * 1000;
    try {
      const stored = localStorage.getItem('propithub_snoozed_reminders');
      const parsed: Record<string, number> = stored ? JSON.parse(stored) : {};
      parsed[reminderId] = expireAt;
      localStorage.setItem('propithub_snoozed_reminders', JSON.stringify(parsed));
      setSnoozedIds((prev) => [...prev, reminderId]);
      showToast('✓ Reminder snoozed for 24 hours.');
    } catch {
      setDismissedIds((prev) => [...prev, reminderId]);
    }
  };

  const handleNudge = async (reminder: DashboardReminder) => {
    setNudgingId(reminder.id);
    try {
      if (onSendNudge) {
        await onSendNudge(reminder);
        return;
      }

      await new Promise((r) => setTimeout(r, 450));

      const targetUserId = reminder.targetTenantId || reminder.targetUserId || 'all_tenants';
      const notif = {
        id: `notif_${Date.now()}`,
        userId: targetUserId,
        title: 'Rent Payment Reminder',
        body: reminder.amount && reminder.currency
          ? `Outstanding rent payment of ${reminder.currency}${reminder.amount.toLocaleString()} is due. Please review your active invoices.`
          : `A rent payment reminder has been dispatched by your property landlord. Please review your active invoices.`,
        link: '/tenant/payments',
        isRead: false,
        createdAt: new Date().toISOString(),
      };

      if (isFirebaseConfigured) {
        setDoc(doc(db, 'notifications', notif.id), notif).catch(console.warn);
      }

      updateState((prev) => ({
        ...prev,
        notifications: [notif, ...(prev.notifications || [])],
      }));

      showToast('✓ Rent payment reminder dispatched to resident portal.');
    } finally {
      setNudgingId(null);
    }
  };

  const getIcon = (iconName: DashboardReminder['icon'], color: string) => {
    switch (iconName) {
      case 'alert-triangle':
        return <AlertTriangle size={15} color={color} />;
      case 'clock':
        return <Clock size={15} color={color} />;
      case 'calendar':
        return <Calendar size={15} color={color} />;
      case 'credit-card':
        return <CreditCard size={15} color={color} />;
      case 'file-text':
        return <FileText size={15} color={color} />;
      case 'tool':
        return <Wrench size={15} color={color} />;
      default:
        return <Bell size={15} color={color} />;
    }
  };

  const getSeverityPill = (severity: DashboardReminder['severity']) => {
    switch (severity) {
      case 'urgent':
        return {
          bg: 'var(--danger-soft)',
          color: 'var(--danger)',
          border: 'var(--danger)',
          label: 'CRITICAL',
        };
      case 'warning':
        return {
          bg: 'var(--amber-soft)',
          color: 'var(--amber)',
          border: 'var(--amber)',
          label: 'ACTION REQUIRED',
        };
      case 'positive':
        return {
          bg: 'var(--teal-light)',
          color: 'var(--teal-primary)',
          border: 'var(--teal-border)',
          label: 'UPDATE',
        };
      case 'info':
      default:
        return {
          bg: 'rgba(59, 130, 246, 0.15)',
          color: '#3B82F6',
          border: 'rgba(59, 130, 246, 0.4)',
          label: 'NOTICE',
        };
    }
  };

  const urgentCount = activeReminders.filter((r) => r.severity === 'urgent').length;
  // Show up to 3 reminders initially, or all if expanded
  const displayedReminders = isExpanded ? activeReminders : activeReminders.slice(0, 3);
  const hiddenCount = activeReminders.length - displayedReminders.length;

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: '10px',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-sm)',
        marginBottom: '20px',
      }}
    >
      {/* Header Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 18px',
          background: 'var(--surface-sunken)',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '6px',
              background: urgentCount > 0 ? 'var(--danger-soft)' : 'var(--brass-soft)',
              color: urgentCount > 0 ? 'var(--danger)' : 'var(--brass)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Zap size={14} />
          </div>
          <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--ink)' }}>
            {title}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {urgentCount > 0 && (
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '12px',
                  background: 'var(--danger-soft)',
                  color: 'var(--danger)',
                  border: '1px solid var(--danger)',
                }}
              >
                {urgentCount} Urgent
              </span>
            )}
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: '12px',
                background: 'var(--surface)',
                color: 'var(--ink-soft)',
                border: '1px solid var(--line)',
              }}
            >
              {activeReminders.length} {activeReminders.length === 1 ? 'Action' : 'Actions'}
            </span>
          </div>
        </div>

        {activeReminders.length > 3 && (
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            style={{
              border: 'none',
              background: 'transparent',
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--brass)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer',
              padding: '4px 8px',
            }}
          >
            {isExpanded ? (
              <>
                Collapse <ChevronUp size={14} />
              </>
            ) : (
              <>
                View All {activeReminders.length} <ChevronDown size={14} />
              </>
            )}
          </button>
        )}
      </div>

      {/* Streamlined Rows */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {displayedReminders.map((reminder, idx) => {
          const pill = getSeverityPill(reminder.severity);
          const isLast = idx === displayedReminders.length - 1;

          return (
            <div
              key={reminder.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 18px',
                borderBottom: isLast ? 'none' : '1px solid var(--line)',
                background: reminder.severity === 'urgent' ? 'var(--surface-sunken)' : 'var(--surface)',
                transition: 'background-color 0.15s ease',
                gap: '14px',
                flexWrap: 'wrap',
              }}
            >
              {/* Left Column: Icon + Status Pill + Title + Description */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '320px' }}>
                <div
                  style={{
                    width: '30px',
                    height: '30px',
                    borderRadius: '8px',
                    background: pill.bg,
                    border: `1px solid ${pill.border}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {getIcon(reminder.icon, pill.color)}
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        letterSpacing: '0.04em',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        background: pill.bg,
                        color: pill.color,
                        border: `1px solid ${pill.border}`,
                      }}
                    >
                      {pill.label}
                    </span>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>
                      {reminder.title}
                    </span>
                    {reminder.propertyName && (
                      <span style={{ fontSize: '11.5px', color: 'var(--ink-soft)', fontWeight: 500 }}>
                        • {reminder.propertyName} {reminder.unitNumber ? `(Unit ${reminder.unitNumber})` : ''}
                      </span>
                    )}
                  </div>

                  <p
                    style={{
                      fontSize: '12px',
                      color: 'var(--ink-soft)',
                      margin: '2px 0 0',
                      lineHeight: 1.4,
                      maxWidth: '820px',
                    }}
                  >
                    {reminder.description}
                  </p>
                </div>
              </div>

              {/* Right Column: Actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                {reminder.actionType === 'nudge' ? (
                  <button
                    type="button"
                    className="btn brass small"
                    disabled={nudgingId === reminder.id}
                    onClick={() => handleNudge(reminder)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      fontWeight: 600,
                      fontSize: '12px',
                      padding: '5px 12px',
                    }}
                  >
                    <ButtonProcessing
                      loading={nudgingId === reminder.id}
                      loadingText="Sending..."
                      defaultText={reminder.actionLabel}
                      icon={<Send size={12} />}
                    />
                  </button>
                ) : (
                  <Link
                    to={reminder.actionLink}
                    className={`btn small ${reminder.severity === 'urgent' ? 'brass' : 'secondary'}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      fontWeight: 600,
                      fontSize: '12px',
                      padding: '5px 12px',
                      textDecoration: 'none',
                    }}
                  >
                    {reminder.actionLabel}
                    <ArrowRight size={12} />
                  </Link>
                )}

                {/* Snooze & Dismiss Buttons (for non-urgent notices) */}
                {reminder.severity !== 'urgent' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <button
                      type="button"
                      onClick={() => handleSnooze(reminder.id)}
                      title="Snooze for 24 hours"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--ink-soft)',
                        cursor: 'pointer',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        borderRadius: '4px',
                        fontSize: '11px',
                        gap: '2px',
                        opacity: 0.7,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                      onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.7')}
                    >
                      <Clock size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDismissedIds((prev) => [...prev, reminder.id])}
                      title="Dismiss notification"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--ink-soft)',
                        cursor: 'pointer',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        borderRadius: '4px',
                        opacity: 0.7,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                      onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.7')}
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer if more reminders are available */}
      {hiddenCount > 0 && !isExpanded && (
        <div
          style={{
            padding: '8px 18px',
            background: '#FAFAF9',
            borderTop: '1px solid #F0F0EE',
            textAlign: 'center',
          }}
        >
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '11.5px',
              color: 'var(--brass)',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            + {hiddenCount} more action item{hiddenCount > 1 ? 's' : ''} in queue. Click to view all.
          </button>
        </div>
      )}
    </div>
  );
};
