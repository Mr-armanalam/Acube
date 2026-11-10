import { z } from "zod";
export declare const sendOtpSchema: z.ZodObject<{
    email: z.ZodOptional<z.ZodString>;
    phone: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const verifyOtpSchema: z.ZodObject<{
    email: z.ZodOptional<z.ZodString>;
    phone: z.ZodOptional<z.ZodString>;
    otp: z.ZodString;
}, z.core.$strip>;
export declare const loginSchema: z.ZodObject<{
    idToken: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodString>;
    username: z.ZodOptional<z.ZodString>;
    picture: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const updateChannelSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    desc: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const channelIdParamSchema: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>;
export declare const watchCompleteSchema: z.ZodObject<{
    videoid: z.ZodString;
}, z.core.$strip>;
export declare const paginationQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    limit: z.ZodPipe<z.ZodOptional<z.ZodCoercedNumber<unknown>>, z.ZodTransform<number, number | undefined>>;
}, z.core.$strip>;
export declare const commentListQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    limit: z.ZodPipe<z.ZodOptional<z.ZodCoercedNumber<unknown>>, z.ZodTransform<number, number | undefined>>;
    videoid: z.ZodOptional<z.ZodString>;
    parentId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const chatUserSchema: z.ZodObject<{
    searchquery: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const messageIdParamSchema: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>;
export declare const deleteChatMessageSchema: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>;
export declare const sendMessageSchema: z.ZodObject<{
    message: z.ZodString;
    recieverId: z.ZodString;
}, z.core.$strip>;
export declare const createGroupSchema: z.ZodObject<{
    GroupId: z.ZodArray<z.ZodString>;
    GroupName: z.ZodString;
}, z.core.$strip>;
export declare const groupIdParamSchema: z.ZodObject<{
    groupId: z.ZodString;
}, z.core.$strip>;
export declare const sendGroupMessageSchema: z.ZodObject<{
    content: z.ZodString;
    groupId: z.ZodString;
}, z.core.$strip>;
export declare const postCommentSchema: z.ZodObject<{
    videoid: z.ZodOptional<z.ZodString>;
    userid: z.ZodOptional<z.ZodString>;
    commentbody: z.ZodString;
    usercommented: z.ZodOptional<z.ZodString>;
    parentId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const commentIdParamSchema: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>;
export declare const editCommentSchema: z.ZodObject<{
    commentbody: z.ZodString;
}, z.core.$strip>;
export declare const createPaymentRequestSchema: z.ZodObject<{}, z.core.$strip>;
export declare const handlePaymentStatusSchema: z.ZodObject<{
    sessionId: z.ZodString;
}, z.core.$strip>;
export declare const emptyBodySchema: z.ZodObject<{}, z.core.$strip>;
export declare const likeVideoSchema: z.ZodObject<{
    action: z.ZodEnum<{
        like: "like";
        unlike: "unlike";
    }>;
}, z.core.$strip>;
export declare const videoIdParamSchema: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>;
export declare const visibilitySchema: z.ZodEnum<{
    public: "public";
    unlisted: "unlisted";
    private: "private";
    draft: "draft";
}>;
export declare const uploadVideoBodySchema: z.ZodObject<{
    title: z.ZodString;
    chanel: z.ZodString;
    uploader: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    tags: z.ZodPipe<z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>, z.ZodTransform<string[] | undefined, string | string[] | undefined>>;
    visibility: z.ZodOptional<z.ZodEnum<{
        public: "public";
        unlisted: "unlisted";
        private: "private";
        draft: "draft";
    }>>;
    thumbnailUrl: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const updateVideoSchema: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    visibility: z.ZodOptional<z.ZodEnum<{
        public: "public";
        unlisted: "unlisted";
        private: "private";
        draft: "draft";
    }>>;
    description: z.ZodOptional<z.ZodString>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
    thumbnailUrl: z.ZodOptional<z.ZodString>;
    durationSec: z.ZodOptional<z.ZodNumber>;
}, z.core.$strict>;
export declare const studioAnalyticsQuerySchema: z.ZodObject<{
    range: z.ZodDefault<z.ZodEnum<{
        7: "7";
        28: "28";
        90: "90";
    }>>;
}, z.core.$strip>;
export declare const studioSettingsSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    desc: z.ZodOptional<z.ZodString>;
    handle: z.ZodOptional<z.ZodString>;
    links: z.ZodOptional<z.ZodArray<z.ZodObject<{
        label: z.ZodString;
        url: z.ZodString;
    }, z.core.$strip>>>;
    contactEmail: z.ZodOptional<z.ZodString>;
    country: z.ZodOptional<z.ZodString>;
    language: z.ZodOptional<z.ZodString>;
    bannerUrl: z.ZodOptional<z.ZodString>;
    avatarUrl: z.ZodOptional<z.ZodString>;
    channelPublic: z.ZodOptional<z.ZodBoolean>;
    keepSubscriptionsPrivate: z.ZodOptional<z.ZodBoolean>;
    uploadDefaultVisibility: z.ZodOptional<z.ZodEnum<{
        public: "public";
        unlisted: "unlisted";
        private: "private";
        draft: "draft";
    }>>;
    uploadDefaultComments: z.ZodOptional<z.ZodBoolean>;
    watermarkEnabled: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export declare const studioVideosQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    limit: z.ZodPipe<z.ZodOptional<z.ZodCoercedNumber<unknown>>, z.ZodTransform<number, number | undefined>>;
    q: z.ZodOptional<z.ZodString>;
    visibility: z.ZodOptional<z.ZodEnum<{
        public: "public";
        unlisted: "unlisted";
        private: "private";
        draft: "draft";
    }>>;
}, z.core.$strip>;
export declare const studioCommentsQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    limit: z.ZodPipe<z.ZodOptional<z.ZodCoercedNumber<unknown>>, z.ZodTransform<number, number | undefined>>;
    filter: z.ZodDefault<z.ZodEnum<{
        all: "all";
        unreplied: "unreplied";
    }>>;
    sort: z.ZodDefault<z.ZodEnum<{
        newest: "newest";
        oldest: "oldest";
    }>>;
}, z.core.$strip>;
export declare const videoProgressSchema: z.ZodObject<{
    progressSec: z.ZodNumber;
}, z.core.$strip>;
export declare const historyProgressParamSchema: z.ZodObject<{
    videoid: z.ZodString;
}, z.core.$strip>;
export declare const historyPausedSchema: z.ZodObject<{
    paused: z.ZodBoolean;
}, z.core.$strip>;
export declare const watchSuggestionsParamSchema: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>;
export declare const playlistIdParamSchema: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>;
export declare const createPlaylistSchema: z.ZodObject<{
    title: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    visibility: z.ZodDefault<z.ZodEnum<{
        public: "public";
        unlisted: "unlisted";
        private: "private";
        draft: "draft";
    }>>;
    videoIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export declare const updatePlaylistSchema: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    visibility: z.ZodOptional<z.ZodEnum<{
        public: "public";
        unlisted: "unlisted";
        private: "private";
        draft: "draft";
    }>>;
    addVideoIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
    removeVideoIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export declare const libraryKindSchema: z.ZodEnum<{
    watchlater: "watchlater";
    saved: "saved";
    liked: "liked";
}>;
export declare const libraryEntrySchema: z.ZodObject<{
    videoid: z.ZodString;
    kind: z.ZodEnum<{
        watchlater: "watchlater";
        saved: "saved";
        liked: "liked";
    }>;
}, z.core.$strip>;
export declare const libraryEntryParamSchema: z.ZodObject<{
    kind: z.ZodEnum<{
        watchlater: "watchlater";
        saved: "saved";
        liked: "liked";
    }>;
    videoid: z.ZodString;
}, z.core.$strip>;
export declare const historyEntrySchema: z.ZodObject<{
    videoid: z.ZodString;
    viewer: z.ZodString;
}, z.core.$strip>;
export declare const deleteHistoryParamSchema: z.ZodObject<{
    userid: z.ZodString;
}, z.core.$strip>;
export declare const videoViewerParamSchema: z.ZodObject<{
    videoid: z.ZodString;
    viewer: z.ZodString;
}, z.core.$strip>;
export type SendOtpInput = z.infer<typeof sendOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type WatchCompleteInput = z.infer<typeof watchCompleteSchema>;
export type LikeVideoInput = z.infer<typeof likeVideoSchema>;
export type CreatePaymentRequestInput = z.infer<typeof createPaymentRequestSchema>;
export type HandlePaymentStatusInput = z.infer<typeof handlePaymentStatusSchema>;
export type UploadVideoBodyInput = z.infer<typeof uploadVideoBodySchema>;
export type PostCommentInput = z.infer<typeof postCommentSchema>;
export type UpdateVideoInput = z.infer<typeof updateVideoSchema>;
export type StudioAnalyticsQueryInput = z.infer<typeof studioAnalyticsQuerySchema>;
export type StudioSettingsInput = z.infer<typeof studioSettingsSchema>;
export type StudioVideosQueryInput = z.infer<typeof studioVideosQuerySchema>;
export type StudioCommentsQueryInput = z.infer<typeof studioCommentsQuerySchema>;
export type VideoProgressInput = z.infer<typeof videoProgressSchema>;
export type HistoryPausedInput = z.infer<typeof historyPausedSchema>;
export type CreatePlaylistInput = z.infer<typeof createPlaylistSchema>;
export type UpdatePlaylistInput = z.infer<typeof updatePlaylistSchema>;
export type LibraryEntryInput = z.infer<typeof libraryEntrySchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type SendGroupMessageInput = z.infer<typeof sendGroupMessageSchema>;
export type HistoryEntryInput = z.infer<typeof historyEntrySchema>;
//# sourceMappingURL=schemas.d.ts.map