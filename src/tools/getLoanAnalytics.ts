/** MCP tool: GetLoanAnalytics — portfolio-level loan statistics. */
import { ToolNames } from "../config/index.js";
import { computeAnalytics, mapLoan } from "../models/loan.js";
import { defineTool } from "./shared.js";

export const getLoanAnalyticsTool = defineTool({
  name: ToolNames.getLoanAnalytics,
  title: "Get Loan Analytics",
  description:
    "Return portfolio-level analytics across all loan applications: totals by " +
    "status and average/highest/lowest loan amounts.",
  inputSchema: {},
  execute: async (_args, { service, config }) => {
    const records = await service.findAllLoans();
    const loans = records.map((r) => mapLoan(r, config.dataverse.officer));
    return computeAnalytics(loans, config.dataverse.statusLabels);
  },
});
