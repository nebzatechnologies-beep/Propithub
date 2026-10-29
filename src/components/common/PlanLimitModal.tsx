import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowRight, X, Zap, ShieldCheck, Check, Layers } from 'lucide-react';
import { ResourceQuotaType } from '../../hooks/usePlanLimits';

interface PlanLimitModalProps {
  resourceType: ResourceQuotaType;
  currentUsage: number;
  limit: number;
  planName: string;
  onClose: () => void;
  onUpgrade?: () => void;
}

const RESOURCE_LABELS: Record<ResourceQuotaType, { singular: string; plural: string; description: string }> = {
  properties: {
    singular: 'Property',
    plural: 'Properties',
    description: 'Add more buildings, estates, or commercial complexes to your portfolio.',
  },
  units: {
    singular: 'Unit',
    plural: 'Units',
    description: 'Create additional apartments, flats, or commercial spaces under your properties.',
  },
  tenants: {
    singular: 'Tenant',
    plural: 'Tenants',
    description: 'Onboard and manage additional tenants with automated billing and agreements.',
  },
  managers: {
    singular: 'Property Manager',
    plural: 'Property Managers',
    description: 'Delegate building operations and tenant communications to managers.',
  },
  staff: {
    singular: 'Staff Member',
    plural: 'Staff Members',
    description: 'Add maintenance techs, security personnel, and support team members.',
  },
};

export const PlanLimitModal: React.FC<PlanLimitModalProps> = ({
  resourceType,
  currentUsage,
  limit,
  planName,
  onClose,
  onUpgrade,
}) => {
  const navigate = useNavigate();
  const info = RESOURCE_LABELS[resourceType] || {
    singular: 'Resource',
    plural: 'Resources',
    description: 'Unlock more capacity by upgrading your subscription tier.',
  };

  const handleUpgradeClick = () => {
    onClose();
    if (onUpgrade) {
      onUpgrade();
    } else {
      navigate('/owner/subscription');
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        animation: 'fadeIn 0.2s ease-out',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '520px',
          backgroundColor: 'var(--bg-surface, #ffffff)',
          color: 'var(--text-main, #0f172a)',
          borderRadius: '20px',
          border: '1px solid var(--border-color, #e2e8f0)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(234, 88, 12, 0.1)',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Top Decorative Banner */}
        <div
          style={{
            background: 'linear-gradient(135deg, #ea580c 0%, #d97706 50%, #ca8a04 100%)',
            padding: '24px 28px 20px',
            color: '#ffffff',
            position: 'relative',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              background: 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#ffffff',
              transition: 'background 0.2s',
            }}
            aria-label="Close"
          >
            <X size={18} />
          </button>

          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(0, 0, 0, 0.25)', padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '12px' }}>
            <Zap size={13} style={{ fill: '#fbbf24', stroke: '#fbbf24' }} />
            Plan Limit Intercept
          </div>

          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, lineHeight: 1.25, display: 'flex', alignItems: 'center', gap: '8px' }}>
            {info.plural} Limit Reached
          </h2>
          <p style={{ margin: '6px 0 0', fontSize: '13px', opacity: 0.92, lineHeight: 1.4 }}>
            {info.description}
          </p>
        </div>

        {/* Content Body */}
        <div style={{ padding: '24px 28px' }}>
          {/* Current Usage Card */}
          <div
            style={{
              background: 'var(--bg-subtle, #f8fafc)',
              border: '1px solid var(--border-color, #e2e8f0)',
              borderRadius: '14px',
              padding: '16px',
              marginBottom: '20px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', fontSize: '13px' }}>
              <span style={{ fontWeight: 600, color: 'var(--text-muted, #64748b)' }}>
                Current Plan Quota: <strong style={{ color: 'var(--text-main, #0f172a)' }}>{planName}</strong>
              </span>
              <span style={{ fontWeight: 700, color: '#ea580c' }}>
                {currentUsage} of {limit} used (100%)
              </span>
            </div>

            {/* Quota Progress Bar */}
            <div
              style={{
                width: '100%',
                height: '8px',
                borderRadius: '4px',
                background: 'var(--border-color, #e2e8f0)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  background: 'linear-gradient(90deg, #f97316, #ef4444)',
                  borderRadius: '4px',
                }}
              />
            </div>
          </div>

          {/* Upgrade Benefits */}
          <div style={{ marginBottom: '24px' }}>
            <h4 style={{ margin: '0 0 10px', fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted, #64748b)' }}>
              What you unlock with an upgrade:
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
                <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(34, 197, 94, 0.15)', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Check size={13} strokeWidth={3} />
                </div>
                <span>Expanded capacity for <strong>properties, units, and tenants</strong></span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
                <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(34, 197, 94, 0.15)', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Check size={13} strokeWidth={3} />
                </div>
                <span>Full role-based delegation for <strong>managers and staff</strong></span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
                <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(34, 197, 94, 0.15)', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Check size={13} strokeWidth={3} />
                </div>
                <span>Automated multi-gateway rent processing & GST invoices</span>
              </div>
            </div>
          </div>

          {/* Action CTAs */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button
              type="button"
              onClick={handleUpgradeClick}
              style={{
                flex: 1,
                padding: '13px 20px',
                borderRadius: '12px',
                border: 'none',
                background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 14px rgba(234, 88, 12, 0.35)',
                transition: 'all 0.2s ease',
              }}
            >
              <Sparkles size={16} />
              Upgrade Plan Now
              <ArrowRight size={16} />
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '13px 18px',
                borderRadius: '12px',
                border: '1px solid var(--border-color, #e2e8f0)',
                background: 'transparent',
                color: 'var(--text-muted, #64748b)',
                fontWeight: 600,
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
