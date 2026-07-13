/**
 * Local acceptance test for the Streamable HTTP transport.
 *
 * Connects a real MCP client over HTTP (as Copilot Studio would), then lists
 * tools, calls a representative set and checks an error path — all against the
 * live environment.
 *
 * Assumes the HTTP server is running:  npm run build && npm run start:http
 * Config via env: MCP_URL (default http://127.0.0.1:3000/mcp), MCP_API_KEY,
 * TEST_REF, TEST_OFFICER.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const MCP_URL = process.env.MCP_URL ?? "http://127.0.0.1:3000/mcp";
const API_KEY = process.env.MCP_API_KEY;
const REF = process.env.TEST_REF ?? "LN-20260708090758";
const OFFICER = process.env.TEST_OFFICER ?? "Akshitha S";

let passed = 0;
let failed = 0;
function check(name, ok, detail) {
  if (ok) { passed += 1; console.log(`  ✅ ${name}`); }
  else { failed += 1; console.log(`  ❌ ${name}${detail ? ` -> ${detail}` : ""}`); }
}

const headers = API_KEY ? { "x-api-key": API_KEY } : {};
const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
  requestInit: { headers },
});
const client = new Client({ name: "loan-mcp-http-test", version: "1.0.0" });

async function call(name, args = {}) {
  const res = await client.callTool({ name, arguments: args });
  return { data: res.structuredContent ?? {}, isError: Boolean(res.isError) };
}

console.log(`Streamable HTTP -> ${MCP_URL} (auth: ${API_KEY ? "yes" : "no"})\n`);
await client.connect(transport);
check("Session established (initialize handshake)", true);

const { tools } = await client.listTools();
check("tools/list returns all 12 tools", tools.length === 12, String(tools.length));

{
  const { data, isError } = await call("GetLoanSummary", { referenceNumber: REF });
  check("GetLoanSummary returns live data", !isError && data.referenceNumber === REF, JSON.stringify(data));
  if (!isError) console.log("     summary:", JSON.stringify(data));
}
{
  const { data, isError } = await call("GetLoanAnalytics");
  check("GetLoanAnalytics returns totals", !isError && typeof data.totalApplications === "number");
  if (!isError) console.log("     analytics:", JSON.stringify(data));
}
{
  const { data, isError } = await call("ListPendingReviews");
  check("ListPendingReviews returns list", !isError && typeof data.count === "number", String(data.count));
}
{
  const { data, isError } = await call("GetOfficerWorkload", { officerName: OFFICER });
  check("GetOfficerWorkload returns workload", !isError && typeof data.totalWorkload === "number");
}
{
  const { data, isError } = await call("GetLoanSummary", { referenceNumber: "LN-NOPE-0000" });
  check("Unknown reference -> LOAN_NOT_FOUND", isError && data.code === "LOAN_NOT_FOUND");
}

await client.close();
console.log(`\n${failed === 0 ? "HTTP TRANSPORT OK ✅" : "SOME CHECKS FAILED ❌"}  (${passed} passed, ${failed} failed)`);
process.exit(failed === 0 ? 0 : 1);
