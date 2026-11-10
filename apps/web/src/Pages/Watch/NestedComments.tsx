// Phase 5 fix — nested comments: threaded replies via parentId, reply
// box per thread, collapse toggle. The old `depth < 3` render gate HID
// replies created at depth 3+ (they existed server-side but were
// invisible); the tree now renders every depth and only CAPS the visual
// indent at level 3. The creator-pinned comment renders first with a
// "Pinned by creator" label; the video owner can pin via
// POST /comment/:id/pin (server-enforced, creator only).
import React, { useMemo, useState } from "react";
import { useAppSelector } from "../../store";
import {
  useCommentsForVideo,
  useDeleteComment,
  usePinComment,
  usePostComment,
} from "../../query/hooks";
import type { CommentItem } from "../../types";

interface TreeNode {
  comment: CommentItem;
  children: TreeNode[];
}

function buildTree(comments: CommentItem[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];
  for (const c of comments) byId.set(c._id, { comment: c, children: [] });
  for (const c of comments) {
    const node = byId.get(c._id);
    if (!node) continue;
    if (c.parentId && byId.has(c.parentId)) {
      byId.get(c.parentId)?.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function CommentNode({
  node,
  depth,
  videoid,
  isVideoOwner,
}: {
  node: TreeNode;
  depth: number;
  videoid: string | undefined;
  isVideoOwner: boolean;
}) {
  const currentuser = useAppSelector((s) => s.auth.session);
  const postMutation = usePostComment();
  const deleteMutation = useDeleteComment();
  const pinMutation = usePinComment();
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const c = node.comment;
  const isOwn = currentuser?.result._id === c.userid;
  // Visual indent caps at level 3; deeper replies still render.
  const indent = Math.min(depth, 3) * 16;

  const submitReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !currentuser) return;
    postMutation.mutate({
      videoid,
      userid: currentuser.result._id,
      commentbody: replyText.trim(),
      usercommented: currentuser.result.name,
      parentId: c._id,
    });
    setReplyText("");
    setReplyOpen(false);
  };

  return (
    <div className="watch-comment" style={depth > 3 ? { marginLeft: indent } : undefined}>
      <div className="watch-comment-body">
        <div className="studio-avatar">
          {(c.usercommented ?? "?").charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1 }}>
          <strong>{c.usercommented}</strong>
          {c.pinnedByCreator ? (
            <span className="watch-comment-pinned"> · Pinned by creator</span>
          ) : null}
          <p style={{ margin: "4px 0" }}>{c.commentbody}</p>
          <div style={{ display: "flex", gap: 8 }}>
            {currentuser ? (
              <button
                type="button"
                className="acube-btn-secondary"
                onClick={() => setReplyOpen((v) => !v)}
              >
                Reply
              </button>
            ) : null}
            {node.children.length > 0 ? (
              <button
                type="button"
                className="acube-btn-secondary"
                onClick={() => setCollapsed((v) => !v)}
              >
                {collapsed
                  ? `Show ${node.children.length} ${node.children.length === 1 ? "reply" : "replies"}`
                  : "Hide replies"}
              </button>
            ) : null}
            {isOwn ? (
              <button
                type="button"
                className="acube-btn-danger"
                onClick={() => deleteMutation.mutate(c._id)}
              >
                Delete
              </button>
            ) : null}
            {isVideoOwner && !c.pinnedByCreator ? (
              <button
                type="button"
                className="acube-btn-secondary"
                onClick={() => pinMutation.mutate(c._id)}
              >
                Pin
              </button>
            ) : null}
          </div>
          {replyOpen ? (
            <form onSubmit={submitReply} style={{ marginTop: 8 }}>
              <input
                className="acube-input"
                aria-label="Write a reply"
                placeholder="Write a reply..."
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
              />{" "}
              <button type="submit" className="acube-btn">
                Reply
              </button>
            </form>
          ) : null}
        </div>
      </div>
      {!collapsed && node.children.length > 0 ? (
        <div className="watch-replies">
          {node.children.map((child) => (
            <CommentNode
              key={child.comment._id}
              node={child}
              depth={depth + 1}
              videoid={videoid}
              isVideoOwner={isVideoOwner}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function NestedComments({
  videoid,
  videoOwnerId,
}: {
  videoid: string | undefined;
  /** User id of the video's owner — only they see the Pin button. */
  videoOwnerId?: string;
}) {
  const currentuser = useAppSelector((s) => s.auth.session);
  const commentlist = useCommentsForVideo(videoid);
  const postMutation = usePostComment();
  const [text, setText] = useState("");
  const isVideoOwner =
    Boolean(currentuser?.result._id) &&
    currentuser?.result._id === videoOwnerId;
  const tree = useMemo(() => {
    const built = buildTree(commentlist ?? []);
    // Pinned creator comment first, then the rest in server order.
    built.sort((a, b) =>
      a.comment.pinnedByCreator && !b.comment.pinnedByCreator
        ? -1
        : !a.comment.pinnedByCreator && b.comment.pinnedByCreator
          ? 1
          : 0,
    );
    return built;
  }, [commentlist]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) {
      alert("please type your comment!!");
      return;
    }
    if (!currentuser) {
      alert("Please login to comment");
      return;
    }
    postMutation.mutate({
      videoid,
      userid: currentuser.result._id,
      commentbody: text.trim(),
      usercommented: currentuser.result.name,
      parentId: null,
    });
    setText("");
  };

  return (
    <div>
      <h2>Comments</h2>
      <form onSubmit={handleSubmit} style={{ marginBottom: 16 }}>
        <input
          className="acube-input"
          aria-label="Add a comment"
          placeholder="add comment..."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />{" "}
        <button type="submit" className="acube-btn">
          add
        </button>
      </form>
      {tree.length === 0 ? (
        <p style={{ color: "var(--text-2)" }}>
          No comments yet. Be the first to comment.
        </p>
      ) : (
        tree.map((node) => (
          <CommentNode
            key={node.comment._id}
            node={node}
            depth={0}
            videoid={videoid}
            isVideoOwner={isVideoOwner}
          />
        ))
      )}
    </div>
  );
}
