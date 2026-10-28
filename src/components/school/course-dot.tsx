export function CourseDot({
  color,
  size = 10,
  className = "",
}: {
  color: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={`inline-block shrink-0 rounded-full ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        boxShadow: `0 0 0 3px ${color}22`,
      }}
      aria-hidden
    />
  );
}
