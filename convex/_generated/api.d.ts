/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as attendance from "../attendance.js";
import type * as auth from "../auth.js";
import type * as board from "../board.js";
import type * as claimSettings from "../claimSettings.js";
import type * as claimTypes from "../claimTypes.js";
import type * as claims from "../claims.js";
import type * as compensation from "../compensation.js";
import type * as competencies from "../competencies.js";
import type * as crons from "../crons.js";
import type * as customFields from "../customFields.js";
import type * as dashboard from "../dashboard.js";
import type * as departments from "../departments.js";
import type * as developmentPlans from "../developmentPlans.js";
import type * as employeeDocuments from "../employeeDocuments.js";
import type * as employees from "../employees.js";
import type * as equipment from "../equipment.js";
import type * as feed from "../feed.js";
import type * as feedback from "../feedback.js";
import type * as feedback360 from "../feedback360.js";
import type * as goals from "../goals.js";
import type * as holidays from "../holidays.js";
import type * as http from "../http.js";
import type * as jobHistory from "../jobHistory.js";
import type * as leaveBalances from "../leaveBalances.js";
import type * as leaveDashboard from "../leaveDashboard.js";
import type * as leavePolicies from "../leavePolicies.js";
import type * as leaveRequests from "../leaveRequests.js";
import type * as leaveTypes from "../leaveTypes.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_enums from "../lib/enums.js";
import type * as lib_performanceDefaults from "../lib/performanceDefaults.js";
import type * as lib_permissions from "../lib/permissions.js";
import type * as lib_sgDefaults from "../lib/sgDefaults.js";
import type * as lib_validators from "../lib/validators.js";
import type * as members from "../members.js";
import type * as model_cpf from "../model/cpf.js";
import type * as model_datetime from "../model/datetime.js";
import type * as model_employee from "../model/employee.js";
import type * as model_geo from "../model/geo.js";
import type * as model_leaveCalc from "../model/leaveCalc.js";
import type * as model_leavePolicy from "../model/leavePolicy.js";
import type * as model_qrToken from "../model/qrToken.js";
import type * as model_shiftTime from "../model/shiftTime.js";
import type * as notifications from "../notifications.js";
import type * as offices from "../offices.js";
import type * as organizations from "../organizations.js";
import type * as paymentAttemptTypes from "../paymentAttemptTypes.js";
import type * as paymentAttempts from "../paymentAttempts.js";
import type * as payroll from "../payroll.js";
import type * as performance from "../performance.js";
import type * as positions from "../positions.js";
import type * as recruitment from "../recruitment.js";
import type * as reportBuilder from "../reportBuilder.js";
import type * as reports from "../reports.js";
import type * as reviewCompetencies from "../reviewCompetencies.js";
import type * as reviewCycles from "../reviewCycles.js";
import type * as reviewObjectives from "../reviewObjectives.js";
import type * as reviews from "../reviews.js";
import type * as schedules from "../schedules.js";
import type * as seed from "../seed.js";
import type * as shiftTemplates from "../shiftTemplates.js";
import type * as teams from "../teams.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  attendance: typeof attendance;
  auth: typeof auth;
  board: typeof board;
  claimSettings: typeof claimSettings;
  claimTypes: typeof claimTypes;
  claims: typeof claims;
  compensation: typeof compensation;
  competencies: typeof competencies;
  crons: typeof crons;
  customFields: typeof customFields;
  dashboard: typeof dashboard;
  departments: typeof departments;
  developmentPlans: typeof developmentPlans;
  employeeDocuments: typeof employeeDocuments;
  employees: typeof employees;
  equipment: typeof equipment;
  feed: typeof feed;
  feedback: typeof feedback;
  feedback360: typeof feedback360;
  goals: typeof goals;
  holidays: typeof holidays;
  http: typeof http;
  jobHistory: typeof jobHistory;
  leaveBalances: typeof leaveBalances;
  leaveDashboard: typeof leaveDashboard;
  leavePolicies: typeof leavePolicies;
  leaveRequests: typeof leaveRequests;
  leaveTypes: typeof leaveTypes;
  "lib/audit": typeof lib_audit;
  "lib/enums": typeof lib_enums;
  "lib/performanceDefaults": typeof lib_performanceDefaults;
  "lib/permissions": typeof lib_permissions;
  "lib/sgDefaults": typeof lib_sgDefaults;
  "lib/validators": typeof lib_validators;
  members: typeof members;
  "model/cpf": typeof model_cpf;
  "model/datetime": typeof model_datetime;
  "model/employee": typeof model_employee;
  "model/geo": typeof model_geo;
  "model/leaveCalc": typeof model_leaveCalc;
  "model/leavePolicy": typeof model_leavePolicy;
  "model/qrToken": typeof model_qrToken;
  "model/shiftTime": typeof model_shiftTime;
  notifications: typeof notifications;
  offices: typeof offices;
  organizations: typeof organizations;
  paymentAttemptTypes: typeof paymentAttemptTypes;
  paymentAttempts: typeof paymentAttempts;
  payroll: typeof payroll;
  performance: typeof performance;
  positions: typeof positions;
  recruitment: typeof recruitment;
  reportBuilder: typeof reportBuilder;
  reports: typeof reports;
  reviewCompetencies: typeof reviewCompetencies;
  reviewCycles: typeof reviewCycles;
  reviewObjectives: typeof reviewObjectives;
  reviews: typeof reviews;
  schedules: typeof schedules;
  seed: typeof seed;
  shiftTemplates: typeof shiftTemplates;
  teams: typeof teams;
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
