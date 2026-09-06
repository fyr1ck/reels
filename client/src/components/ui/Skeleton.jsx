export function Skeleton({ className = '', style }) {
  return <div className={`skeleton ${className}`} style={style} />;
}

export function StatCardSkeleton() {
  return <div className="skeleton skeleton-stat-card" />;
}

export function DashboardSkeleton() {
  return (
    <div>
      <div className="grid grid-4" style={{ marginBottom: 18 }}>
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
      <div className="grid grid-2">
        <div className="card">
          <Skeleton className="skeleton-line" style={{ width: '40%' }} />
          <Skeleton className="skeleton-line" style={{ width: '70%' }} />
          <Skeleton className="skeleton-line" style={{ width: '55%' }} />
        </div>
        <div className="card">
          <Skeleton className="skeleton-line" style={{ width: '40%' }} />
          <Skeleton className="skeleton-line" style={{ width: '70%' }} />
          <Skeleton className="skeleton-line" style={{ width: '55%' }} />
        </div>
      </div>
    </div>
  );
}

export function ListSkeleton({ rows = 4 }) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton skeleton-row" />
      ))}
    </div>
  );
}
