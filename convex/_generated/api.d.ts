/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as appraisalFormTemplates from "../appraisalFormTemplates.js";
import type * as attendance from "../attendance.js";
import type * as attendanceSettings from "../attendanceSettings.js";
import type * as auth from "../auth.js";
import type * as billing from "../billing.js";
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
import type * as email from "../email.js";
import type * as emailSettings from "../emailSettings.js";
import type * as employeeDocuments from "../employeeDocuments.js";
import type * as employees from "../employees.js";
import type * as equipment from "../equipment.js";
import type * as exchange from "../exchange.js";
import type * as feed from "../feed.js";
import type * as feedback from "../feedback.js";
import type * as feedback360 from "../feedback360.js";
import type * as goals from "../goals.js";
import type * as holidays from "../holidays.js";
import type * as http from "../http.js";
import type * as jobHistory from "../jobHistory.js";
import type * as leads from "../leads.js";
import type * as leaveBalances from "../leaveBalances.js";
import type * as leaveDashboard from "../leaveDashboard.js";
import type * as leavePolicies from "../leavePolicies.js";
import type * as leaveRequests from "../leaveRequests.js";
import type * as leaveTypes from "../leaveTypes.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_deployment from "../lib/deployment.js";
import type * as lib_emailTemplate from "../lib/emailTemplate.js";
import type * as lib_enums from "../lib/enums.js";
import type * as lib_modules from "../lib/modules.js";
import type * as lib_notificationRoutes from "../lib/notificationRoutes.js";
import type * as lib_performanceDefaults from "../lib/performanceDefaults.js";
import type * as lib_performanceForm from "../lib/performanceForm.js";
import type * as lib_permissions from "../lib/permissions.js";
import type * as lib_plans from "../lib/plans.js";
import type * as lib_sgDefaults from "../lib/sgDefaults.js";
import type * as lib_validators from "../lib/validators.js";
import type * as members from "../members.js";
import type * as migrations from "../migrations.js";
import type * as model_cpf from "../model/cpf.js";
import type * as model_datetime from "../model/datetime.js";
import type * as model_employee from "../model/employee.js";
import type * as model_funds from "../model/funds.js";
import type * as model_geo from "../model/geo.js";
import type * as model_leaveCalc from "../model/leaveCalc.js";
import type * as model_leavePolicy from "../model/leavePolicy.js";
import type * as model_notify from "../model/notify.js";
import type * as model_org from "../model/org.js";
import type * as model_projectAccess from "../model/projectAccess.js";
import type * as model_proration from "../model/proration.js";
import type * as model_qrToken from "../model/qrToken.js";
import type * as model_roster from "../model/roster.js";
import type * as model_shiftTime from "../model/shiftTime.js";
import type * as notifications from "../notifications.js";
import type * as offices from "../offices.js";
import type * as orgMembers from "../orgMembers.js";
import type * as organizations from "../organizations.js";
import type * as overtime from "../overtime.js";
import type * as paymentAttemptTypes from "../paymentAttemptTypes.js";
import type * as paymentAttempts from "../paymentAttempts.js";
import type * as paymentRequestSettings from "../paymentRequestSettings.js";
import type * as paymentRequestTemplates from "../paymentRequestTemplates.js";
import type * as paymentRequests from "../paymentRequests.js";
import type * as payroll from "../payroll.js";
import type * as payrollApproval from "../payrollApproval.js";
import type * as payrollSettings from "../payrollSettings.js";
import type * as payslipTemplates from "../payslipTemplates.js";
import type * as performance from "../performance.js";
import type * as performanceReminders from "../performanceReminders.js";
import type * as positions from "../positions.js";
import type * as projects from "../projects.js";
import type * as recruitment from "../recruitment.js";
import type * as reportBuilder from "../reportBuilder.js";
import type * as reports from "../reports.js";
import type * as reviewCompetencies from "../reviewCompetencies.js";
import type * as reviewCycles from "../reviewCycles.js";
import type * as reviewObjectives from "../reviewObjectives.js";
import type * as reviews from "../reviews.js";
import type * as roles from "../roles.js";
import type * as savedSignatures from "../savedSignatures.js";
import type * as schedules from "../schedules.js";
import type * as seed from "../seed.js";
import type * as shiftTemplates from "../shiftTemplates.js";
import type * as stripe from "../stripe.js";
import type * as superAdmin from "../superAdmin.js";
import type * as teams from "../teams.js";
import type * as timeEntries from "../timeEntries.js";
import type * as users from "../users.js";
import type * as workPatterns from "../workPatterns.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  appraisalFormTemplates: typeof appraisalFormTemplates;
  attendance: typeof attendance;
  attendanceSettings: typeof attendanceSettings;
  auth: typeof auth;
  billing: typeof billing;
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
  email: typeof email;
  emailSettings: typeof emailSettings;
  employeeDocuments: typeof employeeDocuments;
  employees: typeof employees;
  equipment: typeof equipment;
  exchange: typeof exchange;
  feed: typeof feed;
  feedback: typeof feedback;
  feedback360: typeof feedback360;
  goals: typeof goals;
  holidays: typeof holidays;
  http: typeof http;
  jobHistory: typeof jobHistory;
  leads: typeof leads;
  leaveBalances: typeof leaveBalances;
  leaveDashboard: typeof leaveDashboard;
  leavePolicies: typeof leavePolicies;
  leaveRequests: typeof leaveRequests;
  leaveTypes: typeof leaveTypes;
  "lib/audit": typeof lib_audit;
  "lib/deployment": typeof lib_deployment;
  "lib/emailTemplate": typeof lib_emailTemplate;
  "lib/enums": typeof lib_enums;
  "lib/modules": typeof lib_modules;
  "lib/notificationRoutes": typeof lib_notificationRoutes;
  "lib/performanceDefaults": typeof lib_performanceDefaults;
  "lib/performanceForm": typeof lib_performanceForm;
  "lib/permissions": typeof lib_permissions;
  "lib/plans": typeof lib_plans;
  "lib/sgDefaults": typeof lib_sgDefaults;
  "lib/validators": typeof lib_validators;
  members: typeof members;
  migrations: typeof migrations;
  "model/cpf": typeof model_cpf;
  "model/datetime": typeof model_datetime;
  "model/employee": typeof model_employee;
  "model/funds": typeof model_funds;
  "model/geo": typeof model_geo;
  "model/leaveCalc": typeof model_leaveCalc;
  "model/leavePolicy": typeof model_leavePolicy;
  "model/notify": typeof model_notify;
  "model/org": typeof model_org;
  "model/projectAccess": typeof model_projectAccess;
  "model/proration": typeof model_proration;
  "model/qrToken": typeof model_qrToken;
  "model/roster": typeof model_roster;
  "model/shiftTime": typeof model_shiftTime;
  notifications: typeof notifications;
  offices: typeof offices;
  orgMembers: typeof orgMembers;
  organizations: typeof organizations;
  overtime: typeof overtime;
  paymentAttemptTypes: typeof paymentAttemptTypes;
  paymentAttempts: typeof paymentAttempts;
  paymentRequestSettings: typeof paymentRequestSettings;
  paymentRequestTemplates: typeof paymentRequestTemplates;
  paymentRequests: typeof paymentRequests;
  payroll: typeof payroll;
  payrollApproval: typeof payrollApproval;
  payrollSettings: typeof payrollSettings;
  payslipTemplates: typeof payslipTemplates;
  performance: typeof performance;
  performanceReminders: typeof performanceReminders;
  positions: typeof positions;
  projects: typeof projects;
  recruitment: typeof recruitment;
  reportBuilder: typeof reportBuilder;
  reports: typeof reports;
  reviewCompetencies: typeof reviewCompetencies;
  reviewCycles: typeof reviewCycles;
  reviewObjectives: typeof reviewObjectives;
  reviews: typeof reviews;
  roles: typeof roles;
  savedSignatures: typeof savedSignatures;
  schedules: typeof schedules;
  seed: typeof seed;
  shiftTemplates: typeof shiftTemplates;
  stripe: typeof stripe;
  superAdmin: typeof superAdmin;
  teams: typeof teams;
  timeEntries: typeof timeEntries;
  users: typeof users;
  workPatterns: typeof workPatterns;
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
