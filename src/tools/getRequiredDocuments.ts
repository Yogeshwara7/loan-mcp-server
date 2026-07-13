/** MCP tool: GetRequiredDocuments — required document list for a loan type. */
import { ToolNames } from "../config/index.js";
import { loanTypeSchema } from "./schemas.js";
import { defineTool } from "./shared.js";

export const getRequiredDocumentsTool = defineTool({
  name: ToolNames.getRequiredDocuments,
  title: "Get Required Documents",
  description:
    "Return the list of documents required for a given loan type. Falls back to " +
    "a default checklist for unrecognized loan types.",
  inputSchema: { loanType: loanTypeSchema },
  execute: async ({ loanType }, { config }) => {
    const entries = Object.entries(config.documents.byLoanType);
    const match = entries.find(
      ([key]) => key.toLowerCase() === loanType.trim().toLowerCase(),
    );

    if (match) {
      const [canonicalType, documents] = match;
      return {
        loanType: canonicalType,
        recognized: true,
        requiredDocuments: [...documents],
      };
    }

    return {
      loanType,
      recognized: false,
      requiredDocuments: [...config.documents.fallback],
      note:
        `No specific document list is configured for "${loanType}"; showing the ` +
        `default checklist. Known loan types: ${entries.map(([k]) => k).join(", ")}.`,
    };
  },
});
