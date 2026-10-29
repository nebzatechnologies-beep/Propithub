import React, { useEffect, useState } from 'react';
import { toast, ToastItem } from '../../lib/toast';
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  Loader2,
  X,
} from 'lucide-react';

export const ModernToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const unsubscribe = toast.subscribe((updatedToasts) => {
      setToasts(updatedToasts);
    });
    return unsubscribe;
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      className="modern-toast-wrapper"
      role="region"
      aria-label="Notifications"
    >
      {toasts.map((item) => (
        <ToastCard key={item.id} item={item} onDismiss={() => toast.dismiss(item.id)} />
      ))}
    </div>
  );
};

interface ToastCardProps {
  item: ToastItem;
  onDismiss: () => void;
}

const ToastCard: React.FC<ToastCardProps> = ({ item, onDismiss }) => {
  const [isPaused, setIsPaused] = useState(false);

  const getIcon = () => {
    switch (item.type) {
      case 'success':
        return <CheckCircle2 className="toast-icon text-emerald" size={18} />;
      case 'error':
        return <AlertCircle className="toast-icon text-rose" size={18} />;
      case 'warning':
        return <AlertTriangle className="toast-icon text-amber" size={18} />;
      case 'loading':
        return <Loader2 className="toast-icon text-brass animate-spin-fast" size={18} />;
      case 'info':
      default:
        return <Info className="toast-icon text-sky" size={18} />;
    }
  };

  const getVariantClass = () => {
    switch (item.type) {
      case 'success':
        return 'toast-variant-success';
      case 'error':
        return 'toast-variant-error';
      case 'warning':
        return 'toast-variant-warning';
      case 'loading':
        return 'toast-variant-loading';
      case 'info':
      default:
        return 'toast-variant-info';
    }
  };

  return (
    <div
      className={`modern-toast-card ${getVariantClass()}`}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      role="alert"
      aria-live="assertive"
    >
      <div className="modern-toast-body">
        <div className="modern-toast-icon-wrap">{getIcon()}</div>
        <div className="modern-toast-content">
          {item.title && <div className="modern-toast-title">{item.title}</div>}
          <div className="modern-toast-message">{item.msg}</div>
          {item.action && (
            <button
              type="button"
              className="modern-toast-action-btn"
              onClick={(e) => {
                item.action?.onClick(e);
                onDismiss();
              }}
            >
              {item.action.label}
            </button>
          )}
        </div>
        <button
          type="button"
          className="modern-toast-close"
          onClick={onDismiss}
          aria-label="Dismiss notification"
        >
          <X size={14} />
        </button>
      </div>

      {item.duration > 0 && (
        <div className="modern-toast-progress-track">
          <div
            className={`modern-toast-progress-bar ${isPaused ? 'paused' : ''}`}
            style={{
              animationDuration: `${item.duration}ms`,
            }}
          />
        </div>
      )}
    </div>
  );
};
