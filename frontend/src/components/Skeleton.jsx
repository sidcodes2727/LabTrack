export default function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded-2xl bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 ${className}`} />;
}
