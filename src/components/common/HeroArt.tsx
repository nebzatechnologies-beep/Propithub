import React from 'react';

interface HeroArtProps {
  countryCount?: number;
  className?: string;
}

export const HeroArt: React.FC<HeroArtProps> = ({ countryCount = 9, className = '' }) => {
  const lit = [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1].map(Boolean);

  const windows = lit.map((isLit, n) => {
    const col = n % 4;
    const row = Math.floor(n / 4);
    const x = 146 + col * 40;
    const y = 124 + row * 40;
    return (
      <React.Fragment key={n}>
        <rect
          x={x}
          y={y}
          width="26"
          height="28"
          rx="3"
          fill={isLit ? '#fde68a' : '#ffffff'}
          opacity={isLit ? 1 : 0.16}
        />
        {isLit && <rect x={x} y={y} width="26" height="12" rx="3" fill="#fff" opacity="0.28" />}
        {n % 7 === 3 ? (
          <>
            <rect x={x - 2} y={y + 28} width="30" height="5" rx="2" fill="#34d399" />
            <circle cx={x + 6} cy={y + 26} r="4" fill="#10b981" />
            <circle cx={x + 14} cy={y + 25} r="4.5" fill="#34d399" />
          </>
        ) : (
          <rect x={x - 2} y={y + 28} width="30" height="3" rx="1.5" fill="#fff" opacity="0.22" />
        )}
      </React.Fragment>
    );
  });

  const renderSideBuilding = (
    x: number,
    y: number,
    w: number,
    hh: number,
    rows: number,
    keyPrefix: string
  ) => (
    <React.Fragment key={keyPrefix}>
      <rect x={x} y={y} width={w} height={hh} rx="4" fill="var(--ha-b3)" />
      {Array.from({ length: rows * 2 }, (_, n) => {
        const cx = x + 12 + (n % 2) * (w - 36);
        const cy = y + 16 + Math.floor(n / 2) * 34;
        const windowLit = (n * 5) % 3 !== 0;
        return (
          <rect
            key={n}
            x={cx}
            y={cy}
            width="16"
            height="20"
            rx="2"
            fill={windowLit ? '#fde68a' : '#fff'}
            opacity={windowLit ? 0.9 : 0.18}
          />
        );
      })}
    </React.Fragment>
  );

  return (
    <div className={`hart ${className}`} aria-hidden="true">
      <svg viewBox="0 0 440 460" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="hs" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--ha-sky1)" />
            <stop offset="1" stopColor="var(--ha-sky2)" />
          </linearGradient>
          <linearGradient id="hb" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="var(--ha-b1)" />
            <stop offset="1" stopColor="var(--ha-b2)" />
          </linearGradient>
          <radialGradient id="hsun">
            <stop offset="0" stopColor="#fde68a" stopOpacity="0.95" />
            <stop offset="1" stopColor="#fde68a" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Sky background and Sun */}
        <rect width="440" height="460" rx="32" fill="url(#hs)" />
        <circle cx="352" cy="96" r="78" fill="url(#hsun)" />
        <circle cx="352" cy="96" r="28" fill="#fef3c7" />

        {/* Clouds */}
        <g fill="#fff" opacity="0.75">
          <ellipse cx="86" cy="86" rx="38" ry="12" />
          <ellipse cx="112" cy="76" rx="26" ry="12" />
          <ellipse cx="318" cy="170" rx="30" ry="9" />
          <ellipse cx="338" cy="163" rx="20" ry="9" />
        </g>

        {/* Distant background skyline */}
        <g fill="var(--ha-far)">
          <rect x="0" y="250" width="54" height="150" />
          <rect x="396" y="226" width="44" height="174" />
          <rect x="40" y="290" width="40" height="110" />
        </g>

        {/* Midground side buildings */}
        {renderSideBuilding(46, 236, 84, 164, 4, 'left-side')}
        {renderSideBuilding(310, 200, 84, 200, 5, 'right-side')}

        {/* Main Central Building */}
        <rect x="130" y="108" width="190" height="292" rx="6" fill="url(#hb)" />
        <rect x="300" y="108" width="20" height="292" fill="#000" opacity="0.16" />
        <rect x="124" y="100" width="202" height="14" rx="4" fill="var(--ha-roof)" />

        {/* Propithub 'p' Roof Sign */}
        <rect x="206" y="52" width="38" height="38" rx="11" fill="#10b981" />
        <path d="M206 78l19 12 19-12" fill="#10b981" />
        <text
          x="225"
          y="79"
          textAnchor="middle"
          fontFamily="Plus Jakarta Sans, Inter, sans-serif"
          fontWeight="800"
          fontSize="24"
          fill="#fff"
        >
          p
        </text>
        <rect x="222" y="90" width="6" height="12" fill="var(--ha-roof)" />

        {/* Windows */}
        {windows}

        {/* Ground Floor Entrance & Canopy */}
        <rect x="198" y="340" width="54" height="60" rx="3" fill="#0b3b33" />
        <rect x="204" y="346" width="19" height="54" fill="#bbf7d0" opacity="0.5" />
        <rect x="227" y="346" width="19" height="54" fill="#bbf7d0" opacity="0.38" />
        <path d="M190 340h70l-8 -16h-54z" fill="#10b981" />

        {/* Ground and Pathway */}
        <rect y="400" width="440" height="60" fill="var(--ha-ground)" />
        <rect x="170" y="400" width="110" height="60" fill="var(--ha-path)" />
        <path d="M200 400l-24 60M250 400l24 60" stroke="#fff" strokeOpacity="0.35" strokeWidth="2" />

        {/* Left Tree */}
        <g>
          <rect x="78" y="352" width="7" height="50" fill="#5b4636" />
          <circle cx="82" cy="338" r="30" fill="#10b981" />
          <circle cx="64" cy="354" r="20" fill="#34d399" />
          <circle cx="102" cy="352" r="20" fill="#059669" />
        </g>

        {/* Right Tree */}
        <g>
          <rect x="356" y="360" width="6" height="42" fill="#5b4636" />
          <circle cx="359" cy="348" r="24" fill="#34d399" />
          <circle cx="376" cy="360" r="16" fill="#10b981" />
        </g>
      </svg>

      {/* Floating Card 1: Top-Left Featured Listing */}
      <div className="hc hc1">
        <div className="hc-img">
          <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
            <defs>
              <linearGradient id="a6968051141s" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="hsl(216,68%,72%)" />
                <stop offset="1" stopColor="hsl(36,85%,93%)" />
              </linearGradient>
              <linearGradient id="a6968051141w" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="hsla(160,22%,93%,1)" />
                <stop offset="1" stopColor="hsla(160,20%,80%,1)" />
              </linearGradient>
              <linearGradient id="a6968051141f" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="hsl(28,38%,58%)" />
                <stop offset="1" stopColor="hsl(26,40%,36%)" />
              </linearGradient>
              <linearGradient id="a6968051141l" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
                <stop offset="1" stopColor="#fff" stopOpacity="0" />
              </linearGradient>
              <radialGradient id="a6968051141g">
                <stop offset="0" stopColor="#ffe9a8" stopOpacity="0.95" />
                <stop offset="1" stopColor="#ffe9a8" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="a6968051141v" cx="0.5" cy="0.5" r="0.75">
                <stop offset="0.6" stopColor="#000" stopOpacity="0" />
                <stop offset="1" stopColor="#000" stopOpacity="0.32" />
              </radialGradient>
              <linearGradient id="a6968051141b" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="hsla(160,14%,66%,1)" />
                <stop offset="1" stopColor="hsla(160,16%,50%,1)" />
              </linearGradient>
            </defs>
            <rect width="400" height="300" fill="url(#a6968051141w)" />
            <path d="M250 56h90l81 150h-99z" fill="url(#a6968051141l)" opacity="0.6" />
            <rect x="246" y="52" width="118" height="126" rx="3" fill="#fff" />
            <rect x="250" y="56" width="110" height="118" fill="url(#a6968051141s)" />
            <path d="M250 138.6q27.5 -21.24 55 0t55 0v35.4h-110z" fill="hsla(270,28%,48%,1)" opacity="0.55" />
            <rect x="303.5" y="56" width="3" height="118" fill="#fff" />
            <rect x="250" y="113.5" width="110" height="3" fill="#fff" />
            <path d="M250 56l55 118h30.8l-55 -118z" fill="#fff" opacity="0.18" />
            <path d="M236 48q10 59 2 132h22q-8 -59 -2 -132z" fill="hsla(190,30%,72%,1)" />
            <path d="M374 48q-10 59 -2 132h-22q8 -59 2 -132z" fill="hsla(190,30%,72%,1)" />
            <rect y="214" width="400" height="86" fill="url(#a6968051141f)" />
            <g stroke="#000" strokeOpacity="0.12">
              <path d="M0 222H400" />
              <path d="M0 234H400" />
              <path d="M0 246H400" />
              <path d="M0 258H400" />
              <path d="M0 270H400" />
              <path d="M0 282H400" />
              <path d="M0 294H400" />
            </g>
            <rect y="210" width="400" height="6" fill="hsla(160,10%,98%,1)" />
            <ellipse cx="170" cy="262" rx="150" ry="26" fill="hsla(224,34%,66%,1)" />
            <ellipse cx="170" cy="262" rx="120" ry="18" fill="none" stroke="#fff" strokeOpacity="0.5" strokeWidth="2" />
            <rect x="40" y="148" width="190" height="66" rx="14" fill="hsla(160,22%,40%,1)" />
            <rect x="26" y="168" width="34" height="58" rx="12" fill="hsla(160,22%,34%,1)" />
            <rect x="210" y="168" width="34" height="58" rx="12" fill="hsla(160,22%,34%,1)" />
            <rect x="52" y="176" width="166" height="40" rx="10" fill="hsla(160,22%,48%,1)" />
            <rect x="64" y="158" width="46" height="34" rx="8" fill="hsla(195,60%,70%,1)" />
            <rect x="170" y="160" width="40" height="32" rx="8" fill="hsla(350,35%,76%,1)" />
            <rect x="40" y="228" width="190" height="8" fill="#000" opacity="0.16" />
            <rect x="108" y="236" width="90" height="26" rx="4" fill="hsla(188,30%,32%,1)" />
            <rect x="104" y="232" width="98" height="8" rx="3" fill="hsla(188,30%,42%,1)" />
            <ellipse cx="150" cy="231" rx="12" ry="3" fill="#fff" opacity="0.8" />
            <circle cx="350" cy="150" r="38" fill="url(#a6968051141g)" />
            <path d="M338 158l5 -20h14l5 20z" fill="hsla(200,60%,86%,1)" />
            <rect x="348" y="158" width="4" height="38" fill="#6b5b4b" />
            <ellipse cx="350" cy="197" rx="12" ry="3" fill="#4a3d31" />
            <path d="M22.1 214l3 -24.2h13.2l3 24.2z" fill="hsla(180,40%,55%,1)" />
            <g fill="hsl(124,38%,38%)">
              <ellipse cx="32" cy="170" rx="7.7" ry="24.2" />
              <ellipse cx="18.8" cy="178.8" rx="6.6" ry="19.8" transform="rotate(-28 18.8 178.8)" />
              <ellipse cx="45.2" cy="178.8" rx="6.6" ry="19.8" transform="rotate(28 45.2 178.8)" />
            </g>
            <rect x="60" y="58" width="60" height="44" fill="#fff" stroke="hsla(160,10%,30%,1)" strokeWidth="3" />
            <rect x="68" y="66" width="44" height="28" fill="hsla(24,40%,64%,1)" />
            <path d="M68 94l16 -14 12 8 16 -16v22z" fill="hsla(180,36%,46%,1)" />
            <rect x="132" y="70" width="34" height="46" fill="#fff" stroke="hsla(160,10%,30%,1)" strokeWidth="3" />
            <circle cx="149" cy="93" r="10" fill="hsla(190,60%,62%,1)" />
            <rect width="400" height="300" fill="url(#a6968051141v)" />
          </svg>
        </div>
        <div className="hc-b">
          <b>1-bed in Dubai Marina</b>
          <span className="hc-row">
            <em>
              AED 5,000<small>/mo</small>
            </em>
            <i className="hc-v">Verified</i>
          </span>
        </div>
      </div>

      {/* Floating Card 4: Top-Right Global Countries */}
      <div className="hc hc4">
        <span className="hc-ic bl">
          <svg viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
          </svg>
        </span>
        <span>
          <b>{countryCount} countries</b>
          <small>Any currency</small>
        </span>
      </div>

      {/* Floating Card 2: Mid-Right Rent Received */}
      <div className="hc hc2">
        <span className="hc-ic ok">
          <svg viewBox="0 0 24 24">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
        <span>
          <b>Rent received</b>
          <small>AED 5,000 · Unit 101</small>
        </span>
      </div>

      {/* Floating Card 3: Bottom-Left Lease Signed */}
      <div className="hc hc3">
        <span className="hc-ic">
          <svg viewBox="0 0 24 24">
            <path d="M4 20l4-1 11-11-3-3L5 16zM14 6l3 3" />
          </svg>
        </span>
        <span>
          <b>Lease signed</b>
          <small>Digital signature</small>
        </span>
      </div>

      {/* Floating Card 5: Bottom-Right Repair Done */}
      <div className="hc hc5">
        <span className="hc-ic am">
          <svg viewBox="0 0 24 24">
            <path d="M14.7 6.3a4 4 0 00-5 5L4 17l3 3 5.7-5.7a4 4 0 005-5l-2.4 2.4-2.6-.6-.6-2.6z" />
          </svg>
        </span>
        <span>
          <b>Repair done</b>
          <small>Plumber · 2 hrs</small>
        </span>
      </div>
    </div>
  );
};
export default HeroArt;
