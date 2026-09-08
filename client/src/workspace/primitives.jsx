import { Plus, CalendarDays } from "lucide-react";
import {
  InstagramIcon,
  FacebookIcon,
  LinkedinIcon,
  YoutubeIcon,
  TiktokIcon,
} from "../components/common/SocialIcons";
import { labels, networks, timeLabel, mediaUrl } from "./api";
const icons = {
  instagram: InstagramIcon,
  facebook: FacebookIcon,
  linkedin: LinkedinIcon,
  youtube: YoutubeIcon,
  tiktok: TiktokIcon,
};
export function Network({ network }) {
  const Icon = icons[network] || CalendarDays;
  return (
    <span className={`network ${network}`} title={networks[network]}>
      <Icon size={15} />
    </span>
  );
}
export function Avatar({ client, small = false }) {
  return (
    <span
      className={`avatar ${small ? "small" : ""}`}
      style={{ background: client?.colour }}
    >
      {client?.name
        .split(" ")
        .map((x) => x[0])
        .join("") || "D"}
    </span>
  );
}
export function Status({ status }) {
  return (
    <span className={`status ${status}`}>
      <i />
      {labels[status]}
    </span>
  );
}
export function Empty({ title, children, action }) {
  return (
    <div className="empty">
      <CalendarDays size={30} strokeWidth={1.2} />
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function PostCard({ post, data, onOpen }) {
  const client = data.clients.find((c) => c.id === post.client_id);
  return (
    <button
      className="post-card"
      onClick={() => onOpen(post)}
      aria-label={`Open ${post.title}`}
    >
      <div className="post-card-top">
        <Avatar client={client} small />
        <span>
          <b>{client?.name}</b>
          <small>{timeLabel(post.scheduled_at)}</small>
        </span>
        <div className="network-stack">
          {post.account_ids.slice(0, 2).map((id) => (
            <Network
              key={id}
              network={data.accounts.find((a) => a.id === id)?.network}
            />
          ))}
        </div>
      </div>
      <p>{post.title}</p>
      {post.media[0] &&
        (data.media
          .find((item) => item.id === post.media[0])
          ?.mime?.startsWith("video/") ? (
          <span className="muted">Video attachment</span>
        ) : (
          <img
            className="card-image"
            src={mediaUrl(post.media[0])}
            alt="Post media"
          />
        ))}
      <Status status={post.status} />
    </button>
  );
}
export function AddButton({ onClick, children = "New post" }) {
  return (
    <button className="primary" onClick={onClick}>
      <Plus size={17} />
      {children}
    </button>
  );
}
