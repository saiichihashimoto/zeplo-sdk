import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { Mock, SpiedFunction } from "jest-mock";
import type { NextApiRequest, NextApiResponse } from "next";

import { Queue } from "./next-pages";

describe("queue", () => {
  let fetchResponse: Response;
  let fetchSpy: SpiedFunction<typeof global.fetch>;
  let handler: Mock<() => Promise<void>>;
  let later: Promise<void>;
  let queue: ReturnType<typeof Queue<any>>;
  let res: NextApiResponse<string>;

  beforeEach(() => {
    handler = jest.fn(async () => {});

    queue = Queue("route", handler);

    later = Promise.resolve();

    fetchResponse = {
      json: async () => ({ id: "foo" }),
      status: 200,
      text: async () => "res.text",
    } as Response;

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

    res = {
      send: jest.fn(() => {}) as NextApiResponse["send"],
      status: jest.fn(() => res) as NextApiResponse["status"],
    } as NextApiResponse<string>;
  });

  it("successfully calls endpoint eventually", async () => {
    await expect(queue.enqueue({ foo: "bar" })).resolves.toStrictEqual({
      id: "foo",
    });

    expect(fetchSpy).toHaveBeenCalledWith("https://zeplo.to/route?_env=test", {
      body: '{"foo":"bar"}',
      credentials: "omit",
      headers: {},
      method: "POST",
    });

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
    fetchSpy.mockRejectedValue(new Error("Mock Error"));

    await expect(queue.enqueue({ foo: "bar" })).rejects.toThrow("Mock Error");

    jest.runAllTicks();
    await later;

    expect(handler).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(res.send).not.toHaveBeenCalled();
  });

  it("throws error when zeplo 400s", async () => {
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
    jest.spyOn(console, "error").mockReturnValue(undefined);

    handler.mockRejectedValue(new Error("Mock Error"));

    await queue.enqueue({ foo: "bar" });

    jest.runAllTicks();
    await later;

    // eslint-disable-next-line no-console -- Catching console.error
    expect(console.error).toHaveBeenCalledWith(new Error("Mock Error"));
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.send).toHaveBeenCalledWith("Error: Mock Error");
  });
});
