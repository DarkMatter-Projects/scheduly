import { useState } from 'react';
import clsx from 'clsx';
import { getPlatform } from '../../utils/platforms';

// Always-fresh avatar URL via backend proxy. Meta CDN URLs (the values stored
// in social_accounts.profile_picture_url) expire after a few days, so we
// re-resolve them server-side on every load and cache for 5 min.
function proxyAvatarUrl(account) {
  if (!account?.id) return null;
  const API_URL = import.meta.env.VITE_API_URL || '';
  return `${API_URL}/api/social/accounts/${account.id}/avatar`;
}

export default function AccountAvatar({ account, size = 32, className, ringClass }) {
  const [errored, setErrored] = useState(false);
  const url = errored ? null : proxyAvatarUrl(account);
  const platform = getPlatform(account?.platform);
  const Icon = platform?.icon;

  if (url) {
    return (
      <img
        src={url}
        alt=""
        onError={() => setErrored(true)}
        className={clsx('rounded-full object-cover', ringClass, className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className={clsx(
        'rounded-full flex items-center justify-center text-white',
        platform?.bg || 'bg-slate-300',
        ringClass,
        className
      )}
      style={{ width: size, height: size }}
    >
      {Icon ? <Icon style={{ width: size * 0.5, height: size * 0.5 }} /> : null}
    </div>
  );
}
