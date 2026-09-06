/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as alerts from "../alerts.js";
import type * as analyze from "../analyze.js";
import type * as auth from "../auth.js";
import type * as auth_emailOtp from "../auth/emailOtp.js";
import type * as calls from "../calls.js";
import type * as circle from "../circle.js";
import type * as http from "../http.js";
import type * as messageCheck from "../messageCheck.js";
import type * as messages from "../messages.js";
import type * as numberLookup from "../numberLookup.js";
import type * as numbers from "../numbers.js";
import type * as resend from "../resend.js";
import type * as settings from "../settings.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  alerts: typeof alerts;
  analyze: typeof analyze;
  auth: typeof auth;
  "auth/emailOtp": typeof auth_emailOtp;
  calls: typeof calls;
  circle: typeof circle;
  http: typeof http;
  messageCheck: typeof messageCheck;
  messages: typeof messages;
  numberLookup: typeof numberLookup;
  numbers: typeof numbers;
  resend: typeof resend;
  settings: typeof settings;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
