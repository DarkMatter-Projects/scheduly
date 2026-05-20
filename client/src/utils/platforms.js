import {
  FacebookIcon, InstagramIcon, PinterestIcon, TiktokIcon,
  LinkedinIcon, YoutubeIcon, SnapchatIcon, ThreadsIcon,
} from '../components/common/SocialIcons';

export const PLATFORMS = {
  facebook_page: {
    key: 'facebook_page',
    label: 'Facebook',
    sublabel: 'Page',
    icon: FacebookIcon,
    bg: 'bg-blue-600',
    bgSoft: 'bg-blue-50',
    text: 'text-blue-600',
    available: true,
    connectVia: 'facebook',
  },
  instagram_business: {
    key: 'instagram_business',
    label: 'Instagram',
    sublabel: 'Business',
    icon: InstagramIcon,
    bg: 'bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400',
    bgSoft: 'bg-pink-50',
    text: 'text-pink-600',
    available: true,
    connectVia: 'instagram', // direct Instagram Business Login
  },
  pinterest: {
    key: 'pinterest',
    label: 'Pinterest',
    sublabel: 'Board',
    icon: PinterestIcon,
    bg: 'bg-red-600',
    bgSoft: 'bg-red-50',
    text: 'text-red-600',
    available: false,
    connectVia: 'pinterest',
  },
  threads: {
    key: 'threads',
    label: 'Threads',
    sublabel: 'Profile',
    icon: ThreadsIcon,
    bg: 'bg-slate-900',
    bgSoft: 'bg-slate-100',
    text: 'text-slate-900',
    available: false,
    connectVia: 'threads',
  },
  tiktok: {
    key: 'tiktok',
    label: 'TikTok',
    sublabel: 'Account',
    icon: TiktokIcon,
    bg: 'bg-slate-900',
    bgSoft: 'bg-slate-100',
    text: 'text-slate-900',
    available: true,
    connectVia: 'tiktok_login',
  },
  linkedin: {
    key: 'linkedin',
    label: 'LinkedIn',
    sublabel: 'Page',
    icon: LinkedinIcon,
    bg: 'bg-sky-700',
    bgSoft: 'bg-sky-50',
    text: 'text-sky-700',
    available: false,
    connectVia: 'linkedin',
  },
  youtube: {
    key: 'youtube',
    label: 'YouTube',
    sublabel: 'Channel',
    icon: YoutubeIcon,
    bg: 'bg-red-600',
    bgSoft: 'bg-red-50',
    text: 'text-red-600',
    available: false,
    connectVia: 'youtube',
  },
  snapchat: {
    key: 'snapchat',
    label: 'Snapchat',
    sublabel: 'Profile',
    icon: SnapchatIcon,
    bg: 'bg-yellow-400',
    bgSoft: 'bg-yellow-50',
    text: 'text-yellow-700',
    available: false,
    connectVia: 'snapchat',
  },
};

export const PLATFORM_ORDER = [
  'facebook_page', 'instagram_business', 'pinterest', 'threads',
  'tiktok', 'linkedin', 'youtube', 'snapchat',
];

export function getPlatform(key) {
  return PLATFORMS[key] || PLATFORMS.facebook_page;
}
