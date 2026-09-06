export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="empty-state">
      {Icon && (
        <div className="icon-wrap">
          <Icon size={24} />
        </div>
      )}
      {title && <h4>{title}</h4>}
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}
