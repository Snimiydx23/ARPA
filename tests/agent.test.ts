import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
const { evaluate, fmtNumber } = await import("../src/services/tools/calculator");
const A = await import("../src/services/agent");
const { runTool } = await import("../src/services/tools/executor");
const { __clearRegistryCache, publicModelList } = await import("../src/services/ai/registry");
const { sanitizeAgentSteps } = await import("../src/lib/citations");

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

beforeEach(() => {
  for (const k of ["OPENAI_API_KEY", "GEMINI_API_KEY", "GROQ_API_KEY", "MODELS", "AI_MODELS", "AGENT_MAX_STEPS"]) delete process.env[k];
  process.env.NVIDIA_API_KEY = "k";
  process.env.TAVILY_API_KEY = "tv";
  __clearRegistryCache();
});

test("calculator: arithmetic, precedence, percent vs modulo, constants", () => {
  assert.equal(evaluate("2 + 3 * 4"), 14);
  assert.equal(evaluate("(2 + 3) * 4"), 20);
  assert.equal(evaluate("2 ^ 3 ^ 2"), 512, "right-associative power");
  assert.equal(evaluate("-2 ^ 2"), -4);
  assert.equal(evaluate("2 ** 10"), 1024);
  near(evaluate("18% * 1000"), 180);
  assert.equal(evaluate("10 % 3"), 1);
  near(evaluate("₹1000 × 1.18"), 1180);
  near(evaluate("round(pi, 2)"), 3.14);
  assert.equal(evaluate("max(1, 7, 3) + min(4, 2)"), 9);
  assert.equal(evaluate("1.5e3 / .5"), 3000);
});

test("calculator: finance functions", () => {
  // EMI ₹45 lakh @ 9.5% for 84 months
  const r = 9.5 / 1200, n = 84;
  near(evaluate("emi(4500000, 9.5, 84)"), (4500000 * r * (1 + r) ** n) / ((1 + r) ** n - 1), 1e-6);
  near(evaluate("emi(1200, 0, 12)"), 100);
  near(evaluate("irr(-100, 110)"), 10, 1e-6);
  near(evaluate("irr(-1000, 300, 400, 500)"), 8.896, 1e-3);
  near(evaluate("npv(10, -100, 110)"), 0, 1e-9);
  near(evaluate("cagr(100, 200, 5)"), 14.8698, 1e-3);
  near(evaluate("fv(10, 2, 100)"), 121);
  near(evaluate("pv(10, 2, 121)"), 100);
  assert.equal(fmtNumber(1 / 3), "0.333333");
});

test("calculator: rejects code and bad input", () => {
  for (const bad of ["process.exit()", "constructor", "1 +", "foo(1)", "2 2", "1/0", "irr(100, 200)", "a".repeat(2001)]) {
    assert.throws(() => evaluate(bad), Error, bad.slice(0, 20));
  }
});

test("calculator tool via executor (permission + validation)", async () => {
  const r: any = await runTool("calculator", { expression: "emi(100000, 12, 12)" }, { userId: "u", granted: ["compute"] });
  assert.equal(r.result, "8884.878868");
  await assert.rejects(runTool("calculator", { expression: "1+1" }, { userId: "u", granted: [] }), /permission/);
});

test("parseAction: tolerant JSON extraction", () => {
  assert.deepEqual(A.parseAction('{"action":"final"}'), { thought: undefined, action: "final", input: {} });
  assert.equal(A.parseAction('```json\n{"thought":"x","action":"calculator","input":{"expression":"1+1"}}\n```')!.input!.expression, "1+1");
  assert.equal(A.parseAction('Sure! {"action":"web_search","input":{"query":"a {b}"}} hope this helps }')!.action, "web_search");
  assert.equal(A.parseAction("no json here"), null);
  assert.equal(A.parseAction('{"foo":1}'), null);
});

test("isAgentRequest / stripAgentCommand / tools availability / model list", () => {
  assert.ok(A.isAgentRequest("agent", "hi"));
  assert.ok(A.isAgentRequest("auto", "/agent compare EMI"));
  assert.ok(!A.isAgentRequest("auto", "what is an agent"));
  assert.equal(A.stripAgentCommand("/agent  compare EMI"), "compare EMI");
  assert.deepEqual(A.availableAgentTools(null), ["web_search", "web_read", "calculator"]);
  assert.ok(A.availableAgentTools("p1").includes("project_search"));
  delete process.env.TAVILY_API_KEY;
  assert.deepEqual(A.availableAgentTools(null), ["calculator"]);
  assert.ok(publicModelList().some((m) => m.id === "agent" && m.kind === "policy"));
});

function plannerSequence(actions: any[], tavily?: (body: any) => any) {
  const calls: any[] = [];
  (globalThis as any).fetch = async (url: string, init: any) => {
    const b = JSON.parse(init.body);
    if (url.includes("tavily")) {
      return new Response(JSON.stringify(tavily ? tavily(b) : { results: [{ title: "RBI repo rate", url: "https://rbi.org.in/x", content: "Repo rate 5.50%", score: 0.9 }] }), { status: 200 });
    }
    calls.push(b);
    const a = actions.shift() ?? { action: "final" };
    return new Response(JSON.stringify({ choices: [{ message: { content: typeof a === "string" ? a : JSON.stringify(a) } }] }), { status: 200 });
  };
  return calls;
}

test("runAgent: search → calculate → final, with events, sources and exact notes", async () => {
  const calls = plannerSequence([
    { thought: "need rate", action: "web_search", input: { query: "rbi repo rate" } },
    { thought: "emi", action: "calculator", input: { expression: "emi(4500000, 9.5, 84)" } },
    { action: "final" },
  ]);
  const events: any[] = [];
  const r = await A.runAgent({ question: "Repo rate kya hai aur 45 lakh ka EMI?", userId: "u", onEvent: (e) => events.push(e) });
  assert.equal(r.stoppedBy, "final");
  assert.deepEqual(r.steps.map((s) => [s.tool, s.ok]), [["web_search", true], ["calculator", true]]);
  assert.match(r.steps[0].label, /Searching the web: "rbi repo rate"/);
  assert.equal(r.sources[0].n, 1);
  assert.match(r.notes, /CALCULATION \(exact\): emi\(4500000, 9\.5, 84\) = 73547\.917566/);
  assert.match(r.notes, /<sources>[\s\S]*\[1\] RBI repo rate[\s\S]*<\/sources>/);
  assert.ok(events.some((e) => e.status === "Planning…"));
  assert.ok(events.some((e) => e.sources?.length === 1));
  assert.ok(events.at(-1).status === "Writing answer…");
  // the planner saw the previous observation
  assert.match(calls[1].messages[1].content, /Repo rate 5\.50%/);
  assert.match(calls[0].messages[0].content, /web_search[\s\S]*calculator/);
  assert.doesNotMatch(calls[0].messages[0].content, /project_search/, "no project tool outside a project");
});

test("runAgent: stops on repeated call, unknown tool, step budget; tool errors are observations", async () => {
  plannerSequence([
    { action: "calculator", input: { expression: "1+1" } },
    { action: "calculator", input: { expression: "1+1" } },
  ]);
  assert.equal((await A.runAgent({ question: "q", userId: "u" })).stoppedBy, "repeat");

  plannerSequence([{ action: "delete_database", input: {} }]);
  const u = await A.runAgent({ question: "q", userId: "u" });
  assert.equal(u.stoppedBy, "error");
  assert.equal(u.steps.length, 0);
  assert.equal(u.notes, "", "no findings → no notes block");

  process.env.AGENT_MAX_STEPS = "2";
  plannerSequence([
    { action: "calculator", input: { expression: "1/0" } },
    { action: "calculator", input: { expression: "2+2" } },
    { action: "calculator", input: { expression: "3+3" } },
  ]);
  const b = await A.runAgent({ question: "q", userId: "u" });
  assert.equal(b.stoppedBy, "budget");
  assert.deepEqual(b.steps.map((s) => s.ok), [false, true]);

  plannerSequence(["I think the answer is 42"]);
  assert.equal((await A.runAgent({ question: "q", userId: "u" })).stoppedBy, "final", "non-JSON → answer directly");
});

test("sanitizeAgentSteps keeps labels only", () => {
  const s = sanitizeAgentSteps([{ tool: "calculator", label: "Calculating 1+1", ok: true, ms: 12.4, secret: "x" }, { bad: 1 }]);
  assert.deepEqual(s, [{ tool: "calculator", label: "Calculating 1+1", ok: true, ms: 12 }]);
});
