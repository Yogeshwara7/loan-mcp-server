/** MCP tool: GetOfficerWorkload — assigned loans and workload for an officer. */
import { ToolNames } from "../config/index.js";
import { computeOfficerWorkload, mapLoan } from "../models/loan.js";
import { officerNameSchema } from "./schemas.js";
import { defineTool } from "./shared.js";

export const getOfficerWorkloadTool = defineTool({
  name: ToolNames.getOfficerWorkload,
  title: "Get Officer Workload",
  description:
    "Summarize a loan officer's workload: total assigned applications, pending " +
    "reviews and a breakdown by status, with the underlying loan list.",
  inputSchema: { officerName: officerNameSchema },
  execute: async ({ officerName }, { service, config }) => {
    const records = await service.findLoansByOfficerName(officerName);
    const loans = records.map((r) => mapLoan(r, config.dataverse.officer));
    return computeOfficerWorkload(officerName, loans, config.dataverse.statusLabels);
  },
});
