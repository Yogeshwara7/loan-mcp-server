/**
 * Batch tester: connects once to the built Loan MCP server and calls
 * GetLoanSummary for every reference number passed on the command line
 * (or a built-in list), printing one compact row per record.
 *
 * Usage: node scripts/batch-test.mjs [ref1 ref2 ...]
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const refs =
  process.argv.slice(2).length > 0
    ? process.argv.slice(2)
    : [
        "LN-20260708054201",
        "LN-20260708061353",
        "LN-20260708063934",
        "LN-20260708070005",
        "LN-20260616184556",
        "LN-20260708090758",
        "LN-20260709070715",
        "LN-20260709074145",
        "LN-20260616173442",
        "LN-20260616173617",
      ];

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["dist/index.js"],
  env: { ...process.env, LOG_LEVEL: "silent" },
});
const client = new Client({ name: "batch-test", version: "1.0.0" });
await client.connect(transport);

const pad = (v, n) => String(v ?? "").padEnd(n).slice(0, n);
console.log(
  pad("Reference", 20),
  pad("Applicant", 18),
  pad("Amount", 12),
  pad("Status", 16),
  pad("Officer", 14),
  "Review",
);
console.log("-".repeat(95));

let ok = 0;
for (const ref of refs) {
  const res = await client.callTool({
    name: "GetLoanSummary",
    arguments: { referenceNumber: ref },
  });
  const d = res.structuredContent ?? {};
  if (res.isError) {
    console.log(pad(ref, 20), " -> ERROR", d.code ?? "");
  } else {
    ok++;
    console.log(
      pad(d.referenceNumber, 20),
      pad(d.applicantName, 18),
      pad(d.loanAmount, 12),
      pad(d.status, 16),
      pad(d.assignedOfficer || "-", 14),
      d.reviewRequired,
    );
  }
}

console.log("-".repeat(95));
console.log(`${ok}/${refs.length} records retrieved successfully`);
await client.close();
process.exit(0);
