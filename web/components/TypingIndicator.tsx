"use client"

export default function TypingIndicator({ username }: { username: string }) {
  return (
    <div className="animate-slide-up" style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 16px',
      marginBottom: '8px',
    }}>
      <div style={{
        display: 'flex',
        gap: '4px',
        alignItems: 'center',
        padding: '10px 16px',
        background: 'var(--bg-glass)',
        borderRadius: '16px',
        borderBottomLeftRadius: '4px',
        border: '1px solid var(--border-glass)',
      }}>
        <div className="typing-dots">
          <span className="typing-dot" style={{ animationDelay: '0ms' }} />
          <span className="typing-dot" style={{ animationDelay: '150ms' }} />
          <span className="typing-dot" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
      <span style={{
        fontSize: '12px',
        color: 'var(--accent-gold)',
        fontStyle: 'italic',
        opacity: 0.8,
      }}>
        {username} est en train d&apos;écrire...
      </span>
    </div>
  );
}
