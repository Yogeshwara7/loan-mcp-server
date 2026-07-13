/** MCP tool: TrackLoanTimeline — chronological milestones for one loan. */
import { ToolNames } from "../config/index.js";
import { buildTimeline, mapLoan } from "../models/loan.js";
import { referenceNumberSchema } from "./schemas.js";
import { defineTool } from "./shared.js";

export const trackLoanTimelineTool = defineTool({
  name: ToolNames.trackLoanTimeline,
  title: "Track Loan Timeline",
  description:
    "Return a chronological timeline for a loan application using its created " +
    "date, eligibility-check date, officer assignment and current status.",
  inputSchema: { referenceNumber: referenceNumberSchema },
  execute: async ({ referenceNumber }, { service, config }) => {
    const record = await service.getLoanByReference(referenceNumber);
    return buildTimeline(mapLoan(record, config.dataverse.officer));
  },
});
