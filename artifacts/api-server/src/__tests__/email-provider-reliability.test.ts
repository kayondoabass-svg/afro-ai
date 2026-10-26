// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { sendEmail } from "../email-provider";
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
function setup(fetcher:any) {
  vi.stubEnv("EMAIL_PROVIDER","resend");vi.stubEnv("RESEND_API_KEY","test-only");
  vi.stubGlobal("fetch",fetcher);
}
const input={from:"hello@example.test",to:"recipient@example.test",subject:"Test",text:"Test",idempotencyKey:"email-api/test"};
it("uses bounded requests with stable provider idempotency and never retries",async()=>{
  const fetcher=vi.fn().mockResolvedValue(new Response('{"id":"provider-id"}'));setup(fetcher);
  expect(await sendEmail(input)).toMatchObject({messageId:"provider-id",provider:"resend"});
  expect(fetcher).toHaveBeenCalledOnce();
  expect(fetcher.mock.calls[0][1]).toMatchObject({headers:{"Idempotency-Key":"email-api/test"},signal:expect.any(AbortSignal)});
});
it.each([401,403,429,422])("marks definitive %s rejection without exposing provider response",async status=>{
  const fetcher=vi.fn().mockResolvedValue(new Response('{"message":"private provider diagnostic"}',{status}));setup(fetcher);
  try { await sendEmail(input); throw Error("expected failure"); }
  catch(error:any){expect(error.uncertain).toBe(false);expect(error.message).not.toContain("private provider");}
  expect(fetcher).toHaveBeenCalledOnce();
});
it("keeps network interruption uncertain without retry",async()=>{
  const fetcher=vi.fn().mockRejectedValue(new Error("socket closed"));setup(fetcher);
  await expect(sendEmail(input)).rejects.toMatchObject({uncertain:true,code:"EMAIL_OUTCOME_UNKNOWN"});
  expect(fetcher).toHaveBeenCalledOnce();
});
it("does not treat a successful status without a message ID as proven acceptance",async()=>{
  setup(vi.fn().mockResolvedValue(new Response('{}')));
  await expect(sendEmail(input)).rejects.toMatchObject({uncertain:true});
});
