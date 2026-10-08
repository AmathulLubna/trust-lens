import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // TrustLens — call screening ledger
    audioUploads: defineTable({
      userId: v.id("users"),
      storageId: v.id("_storage"),
      filename: v.string(),
      createdAt: v.number(),
      state: v.string(),
    })
      .index("by_storage", ["storageId"])
      .index("by_user", ["userId"]),
    analysisRuns: defineTable({
      userId: v.id("users"),
      eventId: v.string(),
      sequence: v.number(),
      offsetSec: v.number(),
      assessmentJson: v.string(),
      createdAt: v.number(),
    }).index("by_user_event", ["userId", "eventId"]),
    alertEvents: defineTable({
      userId: v.id("users"),
      eventId: v.string(),
      status: v.string(),
      recipients: v.array(v.string()),
      providerIds: v.optional(v.array(v.string())),
      deliveredIds: v.optional(v.array(v.string())),
      detail: v.optional(v.string()),
      createdAt: v.number(),
    }).index("by_user_event", ["userId", "eventId"]),
    callLogs: defineTable({
      userId: v.id("users"),
      callerName: v.optional(v.string()),
      callerNumber: v.optional(v.string()),
      channel: v.union(v.literal("phone"), v.literal("unknown")),
      startedAt: v.number(),
      endedAt: v.optional(v.number()),
      durationSec: v.optional(v.number()),
      verdict: v.union(
        v.literal("safe"),
        v.literal("no_strong_indicators"),
        v.literal("inconclusive"),
        v.literal("analysis_unavailable"),
        v.literal("insufficient_audio"),
        v.literal("suspicious"),
        v.literal("flagged"),
      ),
      riskScore: v.optional(v.number()),
      voiceScore: v.optional(v.number()),
      behaviorScore: v.optional(v.number()),
      flags: v.array(
        v.object({
          id: v.string(),
          label: v.string(),
          kind: v.union(
            v.literal("voice"),
            v.literal("behavior"),
            v.literal("contact"),
          ),
          severity: v.union(
            v.literal("info"),
            v.literal("warning"),
            v.literal("critical"),
          ),
        }),
      ),
      transcript: v.optional(
        v.array(
          v.object({
            speaker: v.union(v.literal("caller"), v.literal("you")),
            text: v.string(),
            t: v.number(),
          }),
        ),
      ),
      notifiedCircle: v.optional(v.boolean()),
      eventId: v.optional(v.string()),
      source: v.optional(
        v.union(
          v.literal("upload"),
          v.literal("microphone"),
          v.literal("demo"),
        ),
      ),
      assessmentJson: v.optional(v.string()),
      coverageGaps: v.optional(v.number()),
      transcriptConsent: v.optional(v.boolean()),
      notificationStatus: v.optional(v.string()),
    })
      .index("by_user", ["userId"])
      .index("by_user_time", ["userId", "startedAt"])
      .index("by_user_event", ["userId", "eventId"]),

    // TrustLens — family safety net
    trustedCircle: defineTable({
      userId: v.id("users"),
      name: v.string(),
      phone: v.string(),
      email: v.optional(v.string()),
      relation: v.string(),
      notifyOnFlag: v.boolean(),
      addedAt: v.number(),
      recipientVerifiedAt: v.optional(v.number()),
      recipientConsent: v.optional(v.boolean()),
    }).index("by_user", ["userId"]),

    // TrustLens — per-user protection settings
    userSettings: defineTable({
      userId: v.id("users"),
      autoNotifyCircle: v.boolean(),
      vibrationAlert: v.optional(v.boolean()),
      bannerAlert: v.optional(v.boolean()),
      fullscreenAlert: v.optional(v.boolean()),
      sensitivity: v.optional(
        v.union(v.literal(1), v.literal(2), v.literal(3)),
      ),
      channelPhone: v.optional(v.boolean()),
      channelWhatsapp: v.optional(v.boolean()),
      historyClearedAt: v.optional(v.number()),
    }).index("by_user", ["userId"]),

    // TrustLens — community number reports (shared spam/fraud knowledge base)
    numberReports: defineTable({
      userId: v.id("users"),
      number: v.string(), // normalized digits, e.g. "917000012345"
      display: v.string(), // pretty "+91 70000 12345" form
      category: v.string(), // scam-call | voice-clone | sms | telemarketing | legit
      note: v.optional(v.string()),
      createdAt: v.number(),
    })
      .index("by_number", ["number"])
      .index("by_user", ["userId"]),

    // TrustLens — screening desk ledger (number checks by this user)
    numberChecks: defineTable({
      userId: v.id("users"),
      number: v.string(),
      display: v.string(),
      riskScore: v.optional(v.number()),
      verdict: v.union(
        v.literal("safe"),
        v.literal("no_strong_indicators"),
        v.literal("inconclusive"),
        v.literal("analysis_unavailable"),
        v.literal("insufficient_audio"),
        v.literal("suspicious"),
        v.literal("flagged"),
      ),
      reasons: v.array(v.string()),
      createdAt: v.number(),
    }).index("by_user_time", ["userId", "createdAt"]),

    // TrustLens - SMS / pasted-message scam checks by this user
    messageChecks: defineTable({
      userId: v.id("users"),
      sender: v.optional(v.string()),
      messagePreview: v.string(),
      riskScore: v.optional(v.number()),
      verdict: v.union(
        v.literal("safe"),
        v.literal("no_strong_indicators"),
        v.literal("inconclusive"),
        v.literal("analysis_unavailable"),
        v.literal("insufficient_audio"),
        v.literal("suspicious"),
        v.literal("flagged"),
      ),
      reasons: v.array(v.string()),
      createdAt: v.number(),
    }).index("by_user_time", ["userId", "createdAt"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
