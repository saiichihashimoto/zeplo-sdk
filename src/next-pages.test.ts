import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import type { Mock, SpiedFunction } from "jest-mock";
import type { NextApiRequest, NextApiResponse } from "next";

import { Queue } from "./next-pages";

jest.mock<typeof import("uuid")>(
  "uuid",
  () =>
    ({
      v4: () => "foo",
    } as typeof import("uuid"))
);

describe("next-pages", () => {
  const oldEnv = process.env;
  let fetchResponse: Response;
  let fetchSpy: SpiedFunction<typeof global.fetch>;
  let handler: Mock<() => Promise<void>>;
  let later: Promise<void>;
  let queue: ReturnType<typeof Queue<any>>;
  let res: NextApiResponse<string> & {
    send: Mock<NextApiResponse<string>["send"]>;
    status: Mock<NextApiResponse<string>["status"]>;
  };

  beforeEach(() => {
    process.env = { ...oldEnv };

    handler = jest.fn(async () => {});

    later = Promise.resolve();

    fetchResponse = {
      json: async () => ({ id: "foo" }),
      status: 200,
      text: async () => "res.text",
    } as typeof fetchResponse;

    res = {
      send: jest.fn(() => {}) as NextApiResponse["send"],
      status: jest.fn(() => res) as NextApiResponse["status"],
    } as typeof res;

    fetchSpy = jest
      .spyOn(global, "fetch")
      .mockImplementation(async (input, { body } = {}) => {
        if (fetchResponse.status < 400) {
          later = (async () => {
            await new Promise((resolve) => {
              process.nextTick(resolve);
            });

            await queue(
              {
                body,
                headers: {
                  "x-zeplo-id": "foo",
                  "x-zeplo-start": "1970-01-01T00:32:50.000Z",
                } as NextApiRequest["headers"],
              } as NextApiRequest,
              res
            );
          })();
        }

        return fetchResponse;
      });

    jest.spyOn(console, "error").mockReturnValue(undefined);
  });

  afterEach(() => {
    process.env = oldEnv;
  });

  it("successfully calls endpoint eventually", async () => {
    queue = Queue("route", handler);

    await expect(queue.enqueue({ foo: "bar" })).resolves.toStrictEqual({
      id: "foo",
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://zeplo.to/route?_env=test",
      expect.objectContaining({
        body: '{"foo":"bar"}',
        method: "POST",
      })
    );

    expect(handler).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(res.send).not.toHaveBeenCalled();

    jest.runAllTicks();
    await later;

    expect(handler).toHaveBeenCalledWith(
      { foo: "bar" },
      { jobId: "foo", start: new Date("1970-01-01T00:32:50.000Z") }
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith('{"id":"foo"}');
  });

  it("rethrows enqueue error", async () => {
    queue = Queue("route", handler);

    fetchSpy.mockRejectedValue(new Error("Mock Error"));

    await expect(queue.enqueue({ foo: "bar" })).rejects.toThrow("Mock Error");

    jest.runAllTicks();
    await later;

    expect(handler).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(res.send).not.toHaveBeenCalled();
  });

  it("throws error when zeplo 400s", async () => {
    queue = Queue("route", handler);

    fetchResponse = { ...fetchResponse, status: 400 };

    await expect(queue.enqueue({ foo: "bar" })).rejects.toThrow(
      'Unexpected response while trying to enqueue "{"foo":"bar"}" to https://zeplo.to/route: res.text'
    );

    jest.runAllTicks();
    await later;

    expect(handler).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(res.send).not.toHaveBeenCalled();
  });

  it("returns a 500 on handler error", async () => {
    queue = Queue("route", handler);

    handler.mockRejectedValue(new Error("Mock Error"));

    await queue.enqueue({ foo: "bar" });

    jest.runAllTicks();
    await later;

    // eslint-disable-next-line no-console -- Catching console.error
    expect(console.error).toHaveBeenCalledWith(new Error("Mock Error"));
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.send).toHaveBeenCalledWith("Error: Mock Error");
  });

  it("includes token in fetch", async () => {
    queue = Queue("route", handler, { token: "foo" });

    await queue.enqueue({ foo: "bar" });

    jest.runAllTicks();
    await later;

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        headers: expect.objectContaining({ "X-Zeplo-Token": "foo" }),
      })
    );
  });

  it("uses process.env.ZEPLO_TOKEN", async () => {
    process.env.ZEPLO_TOKEN = "bar";
    queue = Queue("route", handler);

    await queue.enqueue({ foo: "bar" });

    jest.runAllTicks();
    await later;

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        headers: expect.objectContaining({ "X-Zeplo-Token": "bar" }),
      })
    );
  });

  it("includes baseUrl in fetch", async () => {
    queue = Queue("route", handler, { baseUrl: "foo.com" });

    await queue.enqueue({ foo: "bar" });

    jest.runAllTicks();
    await later;

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://zeplo.to/foo.com/route?_env=test",
      expect.anything()
    );
  });

  it("uses process.env.ZEPLO_BASE_URL", async () => {
    process.env.ZEPLO_BASE_URL = "bar.com";
    queue = Queue("route", handler);

    await queue.enqueue({ foo: "bar" });

    jest.runAllTicks();
    await later;

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://zeplo.to/bar.com/route?_env=test",
      expect.anything()
    );
  });

  it("includes apiUrl in fetch", async () => {
    queue = Queue("route", handler, { apiUrl: "https://foo.com" });

    await queue.enqueue({ foo: "bar" });

    jest.runAllTicks();
    await later;

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://foo.com/route?_env=test",
      expect.anything()
    );
  });

  it("uses process.env.ZEPLO_API_URL", async () => {
    process.env.ZEPLO_API_URL = "https://bar.com";
    queue = Queue("route", handler);

    await queue.enqueue({ foo: "bar" });

    jest.runAllTicks();
    await later;

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://bar.com/route?_env=test",
      expect.anything()
    );
  });

  it("includes delay in fetch", async () => {
    queue = Queue("route", handler, { delay: 10 });

    await queue.enqueue({ foo: "bar" });

    jest.runAllTicks();
    await later;

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://zeplo.to/route?_env=test&_delay=10",
      expect.anything()
    );
  });

  it("includes delay_until in fetch", async () => {
    queue = Queue("route", handler, {
      delay: new Date("1970-01-01T00:32:50.000Z"),
    });

    await queue.enqueue({ foo: "bar" });

    jest.runAllTicks();
    await later;

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://zeplo.to/route?_env=test&_delay_until=1970000",
      expect.anything()
    );
  });

  it("can include delay in enqueue", async () => {
    queue = Queue("route", handler);

    await queue.enqueue({ foo: "bar" }, { delay: 10 });

    jest.runAllTicks();
    await later;

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://zeplo.to/route?_env=test&_delay=10",
      expect.anything()
    );
  });

  it("includes retry in fetch", async () => {
    queue = Queue("route", handler, { retry: 3 });

    await queue.enqueue({ foo: "bar" });

    jest.runAllTicks();
    await later;

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://zeplo.to/route?_env=test&_retry=3",
      expect.anything()
    );
  });

  it("can define retry as an object", async () => {
    queue = Queue("route", handler, { retry: { count: 3 } });

    await queue.enqueue({ foo: "bar" });

    jest.runAllTicks();
    await later;

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://zeplo.to/route?_env=test&_retry=3",
      expect.anything()
    );
  });

  it('can define retry with backoff="immediate"', async () => {
    queue = Queue("route", handler, {
      retry: { count: 3, backoff: "immediate" },
    });

    await queue.enqueue({ foo: "bar" });

    jest.runAllTicks();
    await later;

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://zeplo.to/route?_env=test&_retry=3%7Cimmediate",
      expect.anything()
    );
  });

  it("can define retry.backoff as an object", async () => {
    queue = Queue("route", handler, {
      retry: { count: 3, backoff: { approach: "immediate" } },
    });

    await queue.enqueue({ foo: "bar" });

    jest.runAllTicks();
    await later;

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://zeplo.to/route?_env=test&_retry=3%7Cimmediate",
      expect.anything()
    );
  });

  it("can define retry.backoff.approach=fixed", async () => {
    queue = Queue("route", handler, {
      retry: { count: 3, backoff: { approach: "fixed", interval: 4 } },
    });

    await queue.enqueue({ foo: "bar" });

    jest.runAllTicks();
    await later;

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://zeplo.to/route?_env=test&_retry=3%7Cfixed%7C4",
      expect.anything()
    );
  });

  it("can define retry.backoff.approach=exponential", async () => {
    queue = Queue("route", handler, {
      retry: { count: 3, backoff: { approach: "exponential", exponent: 4 } },
    });

    await queue.enqueue({ foo: "bar" });

    jest.runAllTicks();
    await later;

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://zeplo.to/route?_env=test&_retry=3%7Cexponential%7C4",
      expect.anything()
    );
  });

  it("can include retry in enqueue", async () => {
    queue = Queue("route", handler);

    await queue.enqueue({ foo: "bar" }, { retry: 3 });

    jest.runAllTicks();
    await later;

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://zeplo.to/route?_env=test&_retry=3",
      expect.anything()
    );
  });

  it("includes trace in fetch", async () => {
    queue = Queue("route", handler);

    await queue.enqueue({ foo: "bar" }, { trace: "foo" });

    jest.runAllTicks();
    await later;

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://zeplo.to/route?_env=test&_trace=foo",
      expect.anything()
    );
  });

  it("changes apiUrl with mode=dev-server", async () => {
    queue = Queue("route", handler, { mode: "dev-server" });

    await queue.enqueue({ foo: "bar" });

    jest.runAllTicks();
    await later;

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:4747/route?_env=test",
      expect.anything()
    );
  });

  it("removes apiUrl with mode=direct", async () => {
    queue = Queue("route", handler, { mode: "direct" });

    await queue.enqueue({ foo: "bar" });

    jest.runAllTicks();
    await later;

    expect(fetchSpy).toHaveBeenCalledWith(
      "/route?_env=test",
      expect.anything()
    );
  });

  it("calls queue inline instead of waiting with mode=direct", async () => {
    res.send.mockImplementation((body) => {
      fetchResponse = {
        ...fetchResponse,
        json: async () => JSON.parse(body),
        text: async () => body,
      };
    });

    res.status.mockImplementation((status) => {
      fetchResponse = { ...fetchResponse, status };

      return res;
    });

    fetchSpy.mockImplementation(async (input, { body, headers = {} } = {}) => {
      await queue(
        {
          body,
          headers: {
            "x-zeplo-id": headers["X-Zeplo-Id" as keyof HeadersInit],
            "x-zeplo-start": headers["X-Zeplo-Start" as keyof HeadersInit],
          } as NextApiRequest["headers"],
        } as NextApiRequest,
        res
      );

      return fetchResponse;
    });

    queue = Queue("route", handler, { mode: "direct" });

    await expect(queue.enqueue({ foo: "bar" })).resolves.toStrictEqual({
      id: "foo-iow",
    });

    // Don't need these, it's already happened
    // jest.runAllTicks();
    // await later;

    expect(fetchSpy).toHaveBeenCalledWith(
      "/route?_env=test",
      expect.anything()
    );

    expect(handler).toHaveBeenCalledWith(
      { foo: "bar" },
      { jobId: "foo-iow", start: new Date("2023-10-05T06:14:01.293Z") }
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith('{"id":"foo-iow"}');
  });

  it("encrypts body with encryptionSecret", async () => {
    queue = Queue("route", handler, {
      encryptionSecret: "6dea028d912dccf28d5e546141e1c048",
    });

    await queue.enqueue({ foo: "bar" });

    jest.runAllTicks();
    await later;

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        body: expect.not.stringMatching('{"foo":"bar"}'),
      })
    );

    expect(handler).toHaveBeenCalledWith(
      { foo: "bar" },
      { jobId: "foo", start: new Date("1970-01-01T00:32:50.000Z") }
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith('{"id":"foo"}');
  });

  it("uses serializer", async () => {
    queue = Queue("route", handler, {
      serializer: {
        stringify: (object) => JSON.stringify(object).toUpperCase(),
        parse: <T>(string: string) => JSON.parse(string.toLowerCase()) as T,
      },
    });

    await queue.enqueue({ foo: "bar" });

    jest.runAllTicks();
    await later;

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        body: '{"FOO":"BAR"}',
      })
    );

    expect(handler).toHaveBeenCalledWith(
      { foo: "bar" },
      { jobId: "foo", start: new Date("1970-01-01T00:32:50.000Z") }
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith('{"id":"foo"}');
  });

  it("uses schema", async () => {
    queue = Queue("route", handler, {
      schema: {
        parse: (data: unknown) => {
          if (!data || typeof data !== "object" || !("bar" in data)) {
            throw new Error("Mock Error");
          }

          return data;
        },
      },
    });

    await queue.enqueue({ foo: "bar" });

    jest.runAllTicks();
    await later;

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        body: '{"foo":"bar"}',
      })
    );

    expect(handler).not.toHaveBeenCalled();

    // eslint-disable-next-line no-console -- Catching console.error
    expect(console.error).toHaveBeenCalledWith(new Error("Mock Error"));
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.send).toHaveBeenCalledWith("Error: Mock Error");
  });

  it("uses headers", async () => {
    process.env.ZEPLO_TOKEN = "bar";
    queue = Queue("route", handler, { headers: { hello: "world" } });

    await queue.enqueue({ foo: "bar" });

    jest.runAllTicks();
    await later;

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        headers: expect.objectContaining({ hello: "world" }),
      })
    );
  });
});
