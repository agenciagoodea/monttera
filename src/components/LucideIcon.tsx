import * as Icons from 'lucide-react';

interface LucideIconProps {
  name: string;
  className?: string;
  size?: number;
}

export default function LucideIcon({ name, className, size }: LucideIconProps) {
  const IconComponent = (Icons as any)[name];
  if (!IconComponent) return null;
  return <IconComponent className={className} size={size} />;
}
