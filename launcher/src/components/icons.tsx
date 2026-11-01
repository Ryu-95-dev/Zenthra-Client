import {
  Backpack,
  Box,
  Clock,
  Coffee,
  Flame,
  Heart,
  HeartPulse,
  MemoryStick,
  Rocket,
  Scan,
  Sun,
  TriangleAlert,
  Wifi,
  Waves,
  Wind,
  Compass,
  Crosshair,
  Eye,
  FlaskConical,
  Gauge,
  Hammer,
  House,
  Keyboard,
  ListOrdered,
  MapPin,
  MousePointerClick,
  Plus,
  Shield,
  Sprout,
  Star,
  Swords,
  Timer,
  TreePine,
  Zap,
  ZoomIn,
  type LucideIcon,
} from 'lucide-react';
import type { Profile, ProfileIcon } from '@shared/types';
import logoMask from '../assets/zenthra-logo-mask.png';

export const MODULE_ICONS: Record<string, LucideIcon> = {
  'map-pin': MapPin,
  crosshair: Crosshair,
  eye: Eye,
  'zoom-in': ZoomIn,
  keyboard: Keyboard,
  'mouse-pointer-click': MousePointerClick,
  gauge: Gauge,
  shield: Shield,
  'flask-conical': FlaskConical,
  plus: Plus,
  zap: Zap,
  compass: Compass,
  timer: Timer,
  'list-ordered': ListOrdered,
  home: House,
  backpack: Backpack,
  'heart-pulse': HeartPulse,
  wifi: Wifi,
  sun: Sun,
  clock: Clock,
  wind: Wind,
  'memory-stick': MemoryStick,
  'triangle-alert': TriangleAlert,
  flame: Flame,
  coffee: Coffee,
  rocket: Rocket,
  waves: Waves,
  scan: Scan,
  heart: Heart,
};

export const PROFILE_ICONS: Record<ProfileIcon, LucideIcon> = {
  sword: Swords,
  tree: TreePine,
  hammer: Hammer,
  grass: Sprout,
  gauge: Gauge,
  box: Box,
  star: Star,
};

export function ModuleIcon({ name, size = 18 }: { name: string; size?: number }) {
  const I = MODULE_ICONS[name] ?? Box;
  return <I size={size} strokeWidth={1.8} />;
}

export function ProfileGlyph({ icon, size = 18 }: { icon: ProfileIcon; size?: number }) {
  const I = PROFILE_ICONS[icon] ?? Box;
  return <I size={size} strokeWidth={1.8} />;
}

/** A profile's custom picture, or its icon when it has none. */
export function ProfileAvatar({ profile, size = 40, className = '' }: { profile: Pick<Profile, 'icon' | 'iconImage'>; size?: number; className?: string }) {
  const style = { width: size, height: size };
  if (profile.iconImage) return <img src={profile.iconImage} alt="" className={`profile-avatar img ${className}`} style={style} />;
  return (
    <span className={`profile-avatar ${className}`} style={style}>
      <ProfileGlyph icon={profile.icon} size={Math.round(size * 0.45)} />
    </span>
  );
}

/**
 * Zenthra logo. The artwork (assets-src/zenthra-logo.png, turned into a mask by
 * scripts/make-icon.cjs) is painted with the accent colour, so it follows the theme.
 */
export function Logo({ size = 34 }: { size?: number }) {
  return (
    <span
      className="logo-mark"
      role="img"
      aria-label="Zenthra"
      style={{ width: size, height: size, WebkitMaskImage: `url(${logoMask})`, maskImage: `url(${logoMask})` }}
    />
  );
}
