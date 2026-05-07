"use client"

export function ChatSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '0' }}>
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} style={{
          padding: '12px 16px',
          borderRadius: '12px',
          background: 'var(--bg-glass)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          animation: `shimmer 1.5s ease-in-out infinite`,
          animationDelay: `${i * 100}ms`,
        }}>
          {/* Avatar skeleton */}
          <div className="skeleton-pulse" style={{
            width: '36px',
            height: '36px',
            borderRadius: '18px',
            background: 'rgba(255,255,255,0.06)',
            flexShrink: 0,
          }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {/* Name skeleton */}
            <div className="skeleton-pulse" style={{
              width: `${50 + Math.random() * 30}%`,
              height: '14px',
              borderRadius: '7px',
              background: 'rgba(255,255,255,0.06)',
            }} />
            {/* Subtitle skeleton */}
            <div className="skeleton-pulse" style={{
              width: '40%',
              height: '10px',
              borderRadius: '5px',
              background: 'rgba(255,255,255,0.04)',
            }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function PublicationSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {[1, 2, 3].map(i => (
        <div key={i} style={{
          padding: '16px',
          borderRadius: '16px',
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid var(--border-glass)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          animation: `shimmer 1.5s ease-in-out infinite`,
          animationDelay: `${i * 150}ms`,
        }}>
          {/* Author row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="skeleton-pulse" style={{
              width: '40px',
              height: '40px',
              borderRadius: '20px',
              background: 'rgba(255,255,255,0.06)',
              flexShrink: 0,
            }} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div className="skeleton-pulse" style={{ width: '35%', height: '14px', borderRadius: '7px', background: 'rgba(255,255,255,0.06)' }} />
              <div className="skeleton-pulse" style={{ width: '50%', height: '10px', borderRadius: '5px', background: 'rgba(255,255,255,0.04)' }} />
            </div>
          </div>
          {/* Content lines */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div className="skeleton-pulse" style={{ width: '100%', height: '12px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)' }} />
            <div className="skeleton-pulse" style={{ width: '85%', height: '12px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)' }} />
            <div className="skeleton-pulse" style={{ width: '60%', height: '12px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)' }} />
          </div>
          {/* Reaction row */}
          <div style={{ display: 'flex', gap: '16px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            {[1, 2, 3].map(j => (
              <div key={j} className="skeleton-pulse" style={{ width: '48px', height: '20px', borderRadius: '10px', background: 'rgba(255,255,255,0.04)' }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function MessageSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '24px' }}>
      {[1, 2, 3, 4, 5].map(i => {
        const isOwn = i % 3 === 0;
        return (
          <div key={i} style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: isOwn ? 'flex-end' : 'flex-start',
            animation: `shimmer 1.5s ease-in-out infinite`,
            animationDelay: `${i * 120}ms`,
          }}>
            <div className="skeleton-pulse" style={{
              width: `${30 + Math.random() * 40}%`,
              minWidth: '120px',
              height: '42px',
              borderRadius: '16px',
              borderBottomRightRadius: isOwn ? '4px' : '16px',
              borderBottomLeftRadius: !isOwn ? '4px' : '16px',
              background: isOwn ? 'rgba(65, 105, 225, 0.15)' : 'rgba(255,255,255,0.04)',
            }} />
          </div>
        );
      })}
    </div>
  );
}
