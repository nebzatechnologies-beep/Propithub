import React from 'react';

interface AppStoreBadgesProps {
  playStoreUrl?: string;
  appStoreUrl?: string;
  label?: string;
  className?: string;
}

export const AppStoreBadges: React.FC<AppStoreBadgesProps> = ({
  playStoreUrl,
  appStoreUrl,
  label,
  className = '',
}) => {
  if (!playStoreUrl && !appStoreUrl) return null;

  return (
    <div className={`sfoot-apps ${className}`}>
      {label && <span className="sfoot-apps-label">{label}</span>}
      <div className="sfoot-badges-group">
        {playStoreUrl && (
          <a
            href={playStoreUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="app-badge-btn"
            title="Get it on Google Play"
            aria-label="Get it on Google Play"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M3.609 1.814L13.792 12 3.61 22.186A2.217 2.217 0 0 1 3 20.615V3.385c0-.604.226-1.16.609-1.571z"
                fill="#00E676"
              />
              <path
                d="M17.18 8.614l-3.388 3.386 3.388 3.386 3.824-2.185c1.088-.622 1.088-1.765 0-2.402L17.18 8.614z"
                fill="#FFD600"
              />
              <path
                d="M3.609 1.814L13.792 12l3.388-3.386-11.83-6.76c-.463-.265-.968-.23-1.35.02L3.609 1.814z"
                fill="#00B0FF"
              />
              <path
                d="M13.792 12L3.609 22.186c.382.25.887.285 1.35.02l11.83-6.76-3.388-3.386-.388-.388.78.328z"
                fill="#FF3D00"
              />
            </svg>
            <div className="app-badge-text">
              <span className="app-badge-kicker">GET IT ON</span>
              <span className="app-badge-store">Google Play</span>
            </div>
          </a>
        )}
        {appStoreUrl && (
          <a
            href={appStoreUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="app-badge-btn"
            title="Download on the App Store"
            aria-label="Download on the App Store"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.62-.75 1.04-1.8 0.92-2.85-.9.04-1.99.6-2.63 1.35-.57.65-.98 1.72-.85 2.74 1.01.08 2.03-.54 2.56-1.24z" />
            </svg>
            <div className="app-badge-text">
              <span className="app-badge-kicker">Download on the</span>
              <span className="app-badge-store">App Store</span>
            </div>
          </a>
        )}
      </div>
    </div>
  );
};
