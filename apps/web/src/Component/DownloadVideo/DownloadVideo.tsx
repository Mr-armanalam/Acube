import React, { useCallback, useState } from "react";
import { useAppSelector } from "../../store";
import {
  useCreatePaymentRequest,
  useDownloadVideo,
  useDownloads,
  usePremiumStatus,
} from "../../query/downloads";
import { IoMdDownload } from "react-icons/io";
import { RiMoneyRupeeCircleLine } from "react-icons/ri";

// Phase 2c: the download is recorded for a specific video id, and the
// login guard is a real null check. (The old guard
// `user === null || undefined` was always falsy — `undefined` on its own
// is not a comparison — so logged-out users were never blocked, and the
// mutation was called with no video id at all.)
const DownloadVideo = ({
  video,
  videoId,
}: {
  video: string | undefined;
  videoId: string | undefined;
}) => {
  const user = useAppSelector((s) => s.auth.session);
  const { data: premiumData } = usePremiumStatus();
  const { data: downloadsData } = useDownloads();
  const isPremium = premiumData ?? false;
  const downloads = downloadsData ?? [];
  const [isDownloading, setIsDownloading] = useState(false);
  const downloadMutation = useDownloadVideo();
  const paymentMutation = useCreatePaymentRequest();

  const handleDownload = useCallback(
    async (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (!user) {
        // Block the anchor's native download for logged-out users.
        e.preventDefault();
        alert("Please login to download videos");
        return;
      }
      if (!videoId) {
        e.preventDefault();
        alert("Video not available for download");
        return;
      }

      // Record the download server-side for this video id. The file itself
      // is delivered by the anchor's native download, so the mutation is
      // fire-and-forget and must not block the click.
      setIsDownloading(true);
      try {
        const response = await downloadMutation.mutateAsync({ videoId });
        if (!response.success) {
          alert(response.message ?? "Download failed");
        }
      } catch {
        alert("Download failed. Please try again.");
      } finally {
        setIsDownloading(false);
      }
    },
    [downloadMutation, user, videoId],
  );

  // Phase 3b: the price comes from the server catalogue and the buyer
  // is the signed-in user — the client sends no amount, id, or email.
  // (The old code sent amount: 1000 and the server trusted it.)
  const handleUpgradeToPremium = useCallback(async () => {
    try {
      if (!user) {
        alert("Please login to upgrade your account to premium");
        return;
      }
      const response = await paymentMutation.mutateAsync();

      if (response.success) {
        const longurl = response.payment_request;
        if (longurl) window.location.href = longurl;
      } else {
        alert(response.message);
      }
    } catch (error) {
      console.error("Error creating payment request:", error);
      alert("Error creating payment request");
    }
  }, [paymentMutation, user]);

  return (
    <>
      <a
        href={video}
        download
        className={`btn_VideoPage download ${
          ((!isPremium && downloads.length >= 1) || !user) && "ishidden"
        } `}
        onClick={handleDownload}
        aria-disabled={isDownloading || (!isPremium && downloads.length >= 1)}
      >
        <IoMdDownload size={22} className="btns_videoPage" />
      </a>
      {!isPremium && (
        <button
          className="btn_VideoPage download"
          onClick={handleUpgradeToPremium}
        >
          <RiMoneyRupeeCircleLine size={22} className="btns_videoPage" />
          <b>Upgrade</b>
        </button>
      )}
    </>
  );
};

export default DownloadVideo;
