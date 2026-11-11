import React, { useState } from "react";
import "./Describechannel.css";
import { Link } from "react-router";
import { useAppSelector } from "../../store";
import { useChannelById, useChannels } from "../../query/hooks";
import { resolveApiMediaUrl } from "../../Api";
import SubscribeButton from "../../Component/SubscribeButton";

// Channel header, rebuilt to the approved preview (image-26): wide
// banner, avatar circle overlapping the banner's bottom edge, channel
// name, "@handle · N videos", description with "…more" expansion, and
// — for the owner — "Customize channel" (Studio Settings) + "Manage
// videos" (Studio Analytics) instead of the old "Edit Channel" /
// "Upload Video" buttons.
//
// Subscribe is real now (POST /subscriptions/:channelId/toggle via
// SubscribeButton, with the real subscriber count): the disabled
// "Coming soon" button is gone. The old "⬇ 0" download counter and
// the "Points: 100" / "Premium: active" pills are gone with the old
// header.
const DESCRIPTION_PREVIEW_CHARS = 140;

const Describechannel = ({
  cid,
  videoCount,
}: {
  cid: string | undefined;
  videoCount: number | undefined;
}) => {
  const { isLoading: channelsLoading } = useChannels();
  const currentchannel = useChannelById(cid);
  const currentuser = useAppSelector((s) => s.auth.session);
  // Settings polish fix: the channel header used to render only the
  // first-letter initial — the uploaded avatar (preferred, falling
  // back to the Google login photo) and banner never reached it.
  // A failed avatar falls back to the initial; a missing banner
  // falls back to the gradient.
  const avatarUrl = resolveApiMediaUrl(
    currentchannel?.avatarUrl ?? currentchannel?.picture,
  );
  const bannerUrl = resolveApiMediaUrl(currentchannel?.bannerUrl);
  const [avatarBroken, setAvatarBroken] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);

  if (channelsLoading && !currentchannel) {
    return <p className="channel_empty">Loading channel…</p>;
  }
  if (cid && !currentchannel) {
    return <p className="channel_empty">This channel doesn&apos;t exist.</p>;
  }

  const isOwner =
    !!currentchannel && currentuser?.result._id === currentchannel._id;
  // The handle is set in Studio Settings; GET /user/getallchannel
  // projects it, falling back to the username for a channel with no
  // handle set (the projection carries username for exactly this).
  const handle = currentchannel?.handle ?? currentchannel?.username;
  const stats = [
    handle ? `@${handle}` : null,
    videoCount === undefined
      ? null
      : `${videoCount} ${videoCount === 1 ? "video" : "videos"}`,
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");
  const desc = currentchannel?.desc ?? "";
  const descTruncated =
    desc.length > DESCRIPTION_PREVIEW_CHARS && !descExpanded;

  return (
    <header className="channel_header">
      {bannerUrl ? (
        <div
          className="channel_banner"
          style={{ backgroundImage: `url("${bannerUrl}")` }}
          role="img"
          aria-label="Channel banner"
        />
      ) : (
        <div
          className="channel_banner channel_banner--gradient"
          role="img"
          aria-label="Channel banner"
        />
      )}
      <div className="channel_identity">
        <div className="channel_avatar">
          {avatarUrl && !avatarBroken ? (
            <img
              src={avatarUrl}
              alt=""
              onError={() => setAvatarBroken(true)}
            />
          ) : (
            <b>{currentchannel?.name?.charAt(0).toUpperCase()}</b>
          )}
        </div>
        <div className="channel_info">
          <h1 className="channel_name">{currentchannel?.name}</h1>
          {stats ? <p className="channel_meta">{stats}</p> : null}
          {desc ? (
            <p className="channel_desc">
              {descTruncated
                ? desc.slice(0, DESCRIPTION_PREVIEW_CHARS)
                : desc}
              {desc.length > DESCRIPTION_PREVIEW_CHARS ? (
                <button
                  type="button"
                  className="channel_desc_more"
                  onClick={() => setDescExpanded((v) => !v)}
                >
                  {descExpanded ? "Show less" : "…more"}
                </button>
              ) : null}
            </p>
          ) : null}
          <div className="channel_actions">
            {isOwner ? (
              <>
                <Link to="/studio/settings" className="channel_owner_btn">
                  Customize channel
                </Link>
                <Link to="/studio/analytics" className="channel_owner_btn">
                  Manage videos
                </Link>
              </>
            ) : (
              <SubscribeButton
                channelId={currentchannel?._id ?? cid ?? ""}
                channelName={currentchannel?.name}
                isOwner={false}
                loggedIn={Boolean(currentuser)}
                initial={
                  typeof currentchannel?.subscriberCount === "number"
                    ? {
                        subscribed: currentchannel.subscribed ?? false,
                        subscriberCount: currentchannel.subscriberCount,
                      }
                    : undefined
                }
                className="channel_subscribe"
                subscribedClassName="channel_subscribe channel_subscribe--subscribed"
              />
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Describechannel;
