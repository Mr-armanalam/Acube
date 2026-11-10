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
export declare const uploadVideoBodySchema: z.ZodObject<{
    title: z.ZodString;
    chanel: z.ZodString;
    uploader: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const likeVideoSchema: z.ZodObject<{
    action: z.ZodEnum<{
        like: "like";
        unlike: "unlike";
    }>;
}, z.core.$strip>;
export declare const videoIdParamSchema: z.ZodObject<{
    id: z.ZodString;
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
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type SendGroupMessageInput = z.infer<typeof sendGroupMessageSchema>;
export type HistoryEntryInput = z.infer<typeof historyEntrySchema>;
//# sourceMappingURL=schemas.d.ts.map