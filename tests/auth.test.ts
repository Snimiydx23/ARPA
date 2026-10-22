import { test } from "node:test";
import assert from "node:assert/strict";
process.env.ARPA_AUTH_SECRET = "test-secret-0123456789abcdef0123456789";
const { issueToken, verifyToken, uidFromEmail } = await import("../src/lib/arpa");

test("issued token verifies to the same uid", () => {
  const uid = uidFromEmail("a@b.com");
  assert.equal(verifyToken(issueToken(uid)), uid);
});
test("tampered payload is rejected", () => {
  const t = issueToken(uidFromEmail("a@b.com"));
  const [p, s] = t.split(".");
  const forged = Buffer.from(JSON.stringify({ v: 2, uid: uidFromEmail("victim@x.com"), iat: 1, exp: 9999999999 })).toString("base64url");
  assert.equal(verifyToken(`${forged}.${s}`), null);
  assert.equal(verifyToken(`${p}.${s}x`), null);
});
test("expired token is rejected", () => {
  assert.equal(verifyToken(issueToken(uidFromEmail("a@b.com"), -10)), null);
});
test("legacy v1 tokens (uid:sig) are rejected", () => {
  const legacy = Buffer.from("u_0123456789abcdef:deadbeef").toString("base64");
  assert.equal(verifyToken(legacy), null);
});
test("token signed with a different secret is rejected", async () => {
  const t = issueToken(uidFromEmail("a@b.com"));
  process.env.ARPA_AUTH_SECRET = "another-secret-0123456789abcdef01234";
  assert.equal(verifyToken(t), null);
  process.env.ARPA_AUTH_SECRET = "test-secret-0123456789abcdef0123456789";
});
