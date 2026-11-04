import React from 'react';
import { ExternalLink } from 'lucide-react';
import { getCleanAddressText } from '../../lib/addressUtils';

interface AddressDisplayProps {
  address?: any;
  fallback?: string;
  className?: string;
  style?: React.CSSProperties;
  linkStyle?: React.CSSProperties;
  showMapLink?: boolean;
}

export const AddressDisplay: React.FC<AddressDisplayProps> = ({
  address,
  fallback = 'Address on file',
  className,
  style,
  linkStyle,
  showMapLink = true,
}) => {
  const { text, mapUrl } = getCleanAddressText(address, fallback);

  if (mapUrl && showMapLink) {
    const hasText = Boolean(text && text !== fallback);
    return (
      <span
        className={className}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          flexWrap: 'wrap',
          ...style,
        }}
      >
        {hasText && <span>{text}</span>}
        {hasText && <span style={{ opacity: 0.7 }}>•</span>}
        <a
          href={mapUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: 'var(--teal-primary, #0d9488)',
            textDecoration: 'underline',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '3px',
            fontWeight: 500,
            cursor: 'pointer',
            ...linkStyle,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          View on Google Maps <ExternalLink size={11} style={{ flexShrink: 0 }} />
        </a>
      </span>
    );
  }

  return (
    <span className={className} style={style}>
      {text}
    </span>
  );
};

