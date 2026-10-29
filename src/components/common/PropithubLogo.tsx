import React from 'react';

interface PropithubLogoProps {
  size?: number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
  showText?: boolean;
  textColor?: string;
  accentColor?: string;
  textStyle?: React.CSSProperties;
}

export const PropithubIcon: React.FC<{
  size?: number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}> = ({ size = 28, color = 'var(--primary-color, #10B981)', className = '', style = {} }) => {
  return (
    <svg
      width={size}
      height={Math.round((size * 138) / 116)}
      viewBox="0 0 116 138"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: 'inline-block', flexShrink: 0, ...style }}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="
          M 58 0
          L 116 50
          V 137.5
          H 31.5
          V 111.5
          H 0
          V 50
          Z

          M 58 21.5
          L 15.5 58
          V 96
          H 31.5
          A 27.5 27.5 0 1 1 59 111
          H 47.5
          V 122
          H 100.5
          V 58
          Z

          M 59 71.5
          A 12 12 0 1 0 59 95.5
          A 12 12 0 1 0 59 71.5
          Z
        "
        fill={color}
      />
    </svg>
  );
};

export const PropithubLogo: React.FC<PropithubLogoProps> = ({
  size = 28,
  color = '#10B981',
  className = '',
  style = {},
  showText = false,
  textColor,
  accentColor = '#10B981',
  textStyle = {},
}) => {
  if (!showText) {
    return <PropithubIcon size={size} color={color} className={className} style={style} />;
  }

  return (
    <div
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        userSelect: 'none',
        ...style,
      }}
    >
      <PropithubIcon size={size} color={color} />
      <span
        style={{
          fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
          fontSize: `${Math.max(16, Math.round(size * 0.8))}px`,
          fontWeight: 800,
          letterSpacing: '-0.5px',
          color: textColor || 'var(--heading-color, var(--ink, #0F172A))',
          lineHeight: 1,
          display: 'inline-flex',
          alignItems: 'center',
          ...textStyle,
        }}
      >
        <span>propit</span>
        <span style={{ color: accentColor }}>hub</span>
      </span>
    </div>
  );
};

export default PropithubLogo;
