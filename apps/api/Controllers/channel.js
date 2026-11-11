import mongoose from "mongoose";
import users from "../Models/Auth.js"
import videofile from "../Models/videofile.js";
import Playlist from "../Models/Playlist.js";
import { isSubscribed, subscriberCountFor } from "./subscriptions.js";
import { paginate, paginationOf } from "../utils/pagination.js";

const NOT_FOUND = (message) => ({ error: { code: "NOT_FOUND", message } });


export const updatechaneldata=async(req,res)=>{
    const {id:_id}=req.params;
    const {name,desc}=req.body;
    if(!mongoose.Types.ObjectId.isValid(_id)){
        return res.status(400).send("Channel unavailable..")
    }
    // Phase 3b: owner check — a user may only edit their OWN channel.
    // (The route is also authed now; see Routes/User.js.)
    if (String(req.userid) !== String(_id)) {
        return res.status(403).json({ error: { code: "FORBIDDEN", message: "You can only edit your own channel" } })
    }
    try {
         await videofile.updateMany({videochanel: _id}, {
            $set: {
                uploader: name
            }
        });

        const updatedata=await users.findByIdAndUpdate(
            _id,{
                $set:{
                    name:name,
                    desc:desc,
                },
            },
            { returnDocument: "after" }
        );

        if (!updatedata) {
            return res.status(404).send("Channel unavailable..")
        }
        res.status(200).json(updatedata)
    } catch (error) {
        res.status(405).json({message:error.message})
        return
    }
}

export const getallchanels=async(req,res)=>{
    try {
        // Phase 3b: paginated + lean. Response shape is now
        // { items, page, limit, total, totalPages }; each item keeps the
        // old {_id, name, email, desc} projection. The list stays public
        // (it is the channel directory) — the route uses optionalAuth,
        // so anonymous callers still read it and `subscribed` is
        // simply false for them.
        const page = await paginate(
            users.find().sort({ createdAt: 1, _id: 1 }),
            paginationOf(req),
        );
        // Watch page: every channel item carries its honest derived
        // subscriberCount (0 when none) and `subscribed` for the
        // requesting user (false when anonymous — the route uses
        // optionalAuth, so req.userid is set only for a signed-in
        // caller). Both come from the Subscription rows, so the
        // channel header, the Watch page and GET /subscriptions/:id
        // can never disagree.
        const allchaneldata = await Promise.all(
            page.items.map(async (channel) => {
                const channelId = String(channel._id);
                const [subscriberCount, subscribed] = await Promise.all([
                    subscriberCountFor(channelId),
                    isSubscribed(channelId, req.userid ?? null),
                ]);
                return {
                    _id: channel._id,
                    name: channel.name,
                    email: channel.email,
                    desc: channel.desc,
            // Channel header renders "@handle" (Describechannel.tsx
            // reads channel.handle ?? channel.username) — the
            // projection used to drop it, so every header fell back
            // to the username even when a handle was set. The username
            // itself must be projected too: a channel with no handle
            // set (handle null) falls back to @username, and without
            // this field the header shows no @ at all.
            handle: channel.handle ?? null,
            username: channel.username ?? null,
            // Settings polish fix: the channel header renders the
            // uploaded avatar/banner — the projection used to drop
            // them, so an upload never reached the channel page.
            picture: channel.picture,
            avatarUrl: channel.avatarUrl ?? channel.picture ?? null,
            bannerUrl: channel.bannerUrl ?? null,
            subscriberCount,
            subscribed,
                };
            }),
        );
        res.status(200).json({ ...page, items: allchaneldata })
    } catch (error) {
        res.status(405).json({message:error.message})
        return
    }
}

// Public channel playlists, for the Channel page's Playlists tab
// (GET /channel/:id/playlists — see Routes/channel.js). A channel page
// is public, so there is no auth here. Only the owner's `public`
// playlists are returned — private and unlisted lists never leak to
// another viewer, exactly like the public playlist read
// (GET /studio/playlists/:id) and the Watch showcase
// (GET /watch/:id/playlists). Shape reuses GET /studio/playlists:
// the paginated { items, page, limit, total, totalPages } envelope,
// each item the playlist doc plus videoCount. A missing channel is a
// 404, matching getPlaylistsForVideo's missing-video 404; :id validity
// is enforced by validateParams(channelIdParamSchema) on the route
// (400 VALIDATION_ERROR, "must be a valid ObjectId").
export const getChannelPlaylists=async(req,res,next)=>{
    try {
        const {id:_id}=req.params;
        const channel=await users.findById(_id).lean();
        if (!channel) {
            return res.status(404).json(NOT_FOUND("Channel not found"));
        }
        const page = await paginate(
            Playlist.find({ owner: String(_id), visibility: "public" }).sort({
                createdAt: -1,
                _id: -1,
            }),
            paginationOf(req),
        );
        return res.status(200).json({
            ...page,
            items: page.items.map((p) => ({
                ...p,
                videoCount: p.videoIds.length,
            })),
        });
    } catch (error) {
        return next(error);
    }
}
