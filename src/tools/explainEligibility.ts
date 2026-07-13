/** MCP tool: ExplainEligibility — business-friendly eligibility explanation. */
import { ToolNames } from "../config/index.js";
import { buildEligibilityExplanation, mapLoan } from "../models/loan.js";
import { referenceNumberSchema } from "./schemas.js";
import { defineTool } from "./shared.js";

export const explainEligibilityTool = defineTool({
  name: ToolNames.explainEligibility,
  title: "Explain Eligibility",
  description:
    "Explain a loan application's eligibility in business-friendly language, " +
    "including its eligibility status, remarks and whether manual review is " +
    "required.",
  inputSchema: { referenceNumber: referenceNumberSchema },
  execute: async ({ referenceNumber }, { service, config }) => {
    const record = await service.getLoanByReference(referenceNumber);
    return buildEligibilityExplanation(mapLoan(record, config.dataverse.officer));
  },
});
