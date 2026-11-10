// Phase 5 — nested comments: threaded replies via parentId, max indent
// depth 3, reply box per thread, collapse toggle. Deleting a parent hides
// its subtree (server soft-deletes; the client just re-renders the list).
import React, { useMemo, useState } from "react";
import { useAppSelector } from "../../store";
import {
  useCommentsForVideo,
  useDeleteComment,
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
}: {
  node: TreeNode;
  depth: number;
  videoid: string | undefined;
}) {
  const currentuser = useAppSelector((s) => s.auth.session);
  const postMutation = usePostComment();
  const deleteMutation = useDeleteComment();
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const c = node.comment;
  const isOwn = currentuser?.result._id === c.userid;

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
    <div className="watch-comment">
      <div className="watch-comment-body">
        <div className="studio-avatar">
          {(c.usercommented ?? "?").charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1 }}>
          <strong>{c.usercommented}</strong>
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
      {!collapsed && node.children.length > 0 && depth < 3 ? (
        <div className="watch-replies">
          {node.children.map((child) => (
            <CommentNode
              key={child.comment._id}
              node={child}
              depth={depth + 1}
              videoid={videoid}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function NestedComments({
  videoid,
}: {
  videoid: string | undefined;
}) {
  const currentuser = useAppSelector((s) => s.auth.session);
  const commentlist = useCommentsForVideo(videoid);
  const postMutation = usePostComment();
  const [text, setText] = useState("");
  const tree = useMemo(
    () => buildTree(commentlist ?? []),
    [commentlist],
  );

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
          />
        ))
      )}
    </div>
  );
}
