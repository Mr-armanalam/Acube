// Real Subscribe button (Watch channel row + Channel header).
// Red Subscribe pill per the approved preview; Subscribed state is a
// quiet pill. The count is the real server count — never invented:
// it renders only once the subscription query (or the video/channel
// DTO's initial value) supplies it. Hidden for the channel owner;
// disabled with a clear title when logged out (no faked subscription).
import React from "react";
import {
  useSubscription,
  useToggleSubscription,
  type SubscriptionState,
} from "../query/useSubscribe";

export default function SubscribeButton({
  channelId,
  channelName,
  isOwner,
  loggedIn,
  initial,
  className,
  subscribedClassName,
}: {
  channelId: string;
  channelName?: string;
  /** The owner sees their own row without the button, as before. */
  isOwner: boolean;
  loggedIn: boolean;
  /** DTO-carried state (video/channel) so the count shows before the
   * GET resolves; the query refetches and stays authoritative. */
  initial?: SubscriptionState;
  className?: string;
  subscribedClassName?: string;
}) {
  const { data } = useSubscription(channelId, initial);
  const toggle = useToggleSubscription(channelId);
  if (!channelId || isOwner) return null;
  const subscribed = data?.subscribed ?? initial?.subscribed ?? false;
  const count = data?.subscriberCount ?? initial?.subscriberCount;
  const label = subscribed ? "Subscribed" : "Subscribe";
  return (
    <span className="subscribe-wrap">
      <button
        type="button"
        className={subscribed ? (subscribedClassName ?? className) : className}
        aria-pressed={subscribed}
        aria-label={
          channelName
            ? `${label} to ${channelName}`
            : label
        }
        title={loggedIn ? undefined : "Sign in to subscribe"}
        disabled={!loggedIn || toggle.isPending}
        onClick={() => toggle.mutate()}
      >
        {label}
      </button>
      {typeof count === "number" ? (
        <span className="subscribe-count">
          {count} {count === 1 ? "subscriber" : "subscribers"}
        </span>
      ) : null}
    </span>
  );
}
