import type { IncomingHttpHeaders } from "http";
import Encryptor from "secure-e2ee";
import { v4 } from "uuid";
import { z } from "zod";

type CommonOptions = {
  /**
   * You can delay a request (or if scheduled the start of the schedule) by providing a number of seconds to delay by. For example, you may want to send an e-mail 50 minutes after a new user signs up, or delete an accounts data after 30 days.
   *
   * Alternatively, you can specify a `Date` to set the time to run the request.
   *
   * https://zeplo.io/docs/delay/
   */
  delay?: Date | number;
  /**
   * You can automatically retry requests that fail.
   *
   * By default, retries will be attempted at a fixed interval of 1 second. You can specify how retries should be attempted by adding one of the following backoff approaches:
   *
   * - `immediate` - runs the retry requests immediately after the initial request
   * - `exponential,<seconds>` - exponentially increases the backoff by seconds^2. E.g. if set to 1, the first it would be 1 (1^2), 4 (2^2), 9 (3^2) seconds… and so on.
   * - `fixed,<seconds>` - interval remains constant
   *
   * With a retry of 3 a maximum of 4 calls will be made to your endpoint - 1 for the original request, and 3 retry requests.
   *
   * https://zeplo.io/docs/retry/
   */
  retry?:
    | number
    | {
        backoff?:
          | "immediate"
          | { approach: "exponential"; exponent: number }
          | { approach: "fixed"; interval: number }
          | { approach: "immediate" };
        count: number;
      };
};

export const ZeploClient = <Payload>({
  handler,
  route,
  options: {
    baseUrl = process.env.ZEPLO_BASE_URL,
    delay: defaultDelay,
    encryptionSecret = process.env.ZEPLO_ENCRYPTION_SECRET,
    env = process.env.NODE_ENV,
    mode = "production",
    retry: defaultRetry,
    schema = { parse: (data: unknown) => data as Payload },
    serializer = JSON,
    token: zeploToken = process.env.ZEPLO_TOKEN,
    oldSecrets = !process.env.ZEPLO_OLD_SECRETS
      ? undefined
      : z.array(z.string()).parse(JSON.parse(process.env.ZEPLO_OLD_SECRETS)),
    apiUrl = process.env.ZEPLO_API_URL ??
      (mode === "direct"
        ? ""
        : mode === "dev-server"
        ? "http://localhost:4747"
        : "https://zeplo.to"),
  } = {},
}: {
  handler: (
    payload: Payload,
    meta: {
      jobId: string;
      start: Date;
    }
  ) => Promise<void> | void;
  options?: Omit<CommonOptions, "trace"> & {
    /**
     * The endpoint your Zeplo Server is running under, e.g. https://zeplo.to
     *
     * @default process.env.ZEPLO_API_URL
     */
    apiUrl?: string;
    /**
     * The base URL of your application's deployment.
     *
     * @default process.env.ZEPLO_BASE_URL
     */
    baseUrl?: string;
    /**
     * A 32-character-long secret used for end-to-end encryption of your jobs.
     *
     * @default process.env.ZEPLO_ENCRYPTION_SECRET
     */
    encryptionSecret?: string;
    /**
     * You often want to run your queue in a development or test environment. You can specify which environment the request is running in. This will then appear in the console, and can be used to filter requests.
     *
     * https://zeplo.io/docs/environments/
     */
    env?: string;
    /**
     * - `production`: Calling `zeplo.to` as expected.
     * - `direct`: The easiest way to run Zeplo in your development environment is to simply remove the zeplo.to/ prefix based on an environment variable. This approach has the advantage that in development, errors are thrown directly which can lead to easier debugging 🙌.
     * - `dev-server`: Calls `localhost:4747` for use with {@link https://zeplo.io/docs/cli `zeplo dev`}, a local dev server that can be used during development. It implements the {@link https://zeplo.io/docs same API} as zeplo.to.
     */
    mode?: "dev-server" | "direct" | "production";
    /**
     * Old Secrets that have been rotated out.
     *
     * @default process.env.ZEPLO_OLD_SECRETS
     */
    oldSecrets?: string[];
    /**
     * A schema for runtime validating the payload before providing it to the handler.
     *
     * Great candidate for {@link https://zod.dev zod}.
     */
    schema?: {
      parse: (data: unknown) => Payload;
    };
    /**
     * A serializer when queueing jobs.
     *
     * Great candidate for {@link https://github.com/blitz-js/superjson superjson}.
     */
    serializer?: {
      parse: <T>(string: string) => T;
      stringify: (object: unknown) => string;
    };
    /**
     * You will need to provide your API token with every request. You can obtain your API token from the console (once you’ve signed up).
     *
     * You should keep this token secret at all times, and refresh it if it becomes compromised.
     *
     * https://zeplo.io/docs/authentication/
     *
     * @default process.env.ZEPLO_TOKEN
     */
    token?: string;
  };
  route: string;
}) => {
  const encryptor = !encryptionSecret
    ? {
        decrypt: async (input: string) => input,
        encrypt: async (input: string) => input,
      }
    : new Encryptor(encryptionSecret, oldSecrets);

  return {
    enqueue: async (
      payload: Payload,
      {
        trace,
        delay = defaultDelay,
        retry = defaultRetry,
      }: CommonOptions & {
        /**
         * You can add a trace ID to any request and that request will be linked as a child of the request with the trace ID you provided. This does not effect how your request will be queued, but simply helps connect the two items for discoverability in the Zeplo console.
         *
         * https://zeplo.io/docs/tracing/
         */
        trace?: string;
      } = {}
    ) => {
      const url = `${[apiUrl, baseUrl].filter(Boolean).join("/")}/${route}`;

      const stringifiedPayload = serializer.stringify(payload);

      const res = await fetch(
        `${url}?${new URLSearchParams({
          _env: env,
          ...(!trace ? {} : { _trace: trace }),
          ...(!delay
            ? {}
            : typeof delay === "number"
            ? { _delay: `${delay}` }
            : { _delay_until: `${delay.valueOf()}` }),
          ...(!retry
            ? {}
            : {
                _retry:
                  typeof retry === "number"
                    ? `${retry}`
                    : !retry.backoff
                    ? `${retry.count}`
                    : `${retry.count}|${
                        retry.backoff === "immediate" ||
                        retry.backoff.approach === "immediate"
                          ? "immediate"
                          : retry.backoff.approach === "fixed"
                          ? `fixed|${retry.backoff.interval}`
                          : `exponential|${retry.backoff.exponent}`
                      }`,
              }),
        })}`,
        {
          cache: "no-store",
          method: "POST",
          credentials: "omit",
          body: await encryptor.encrypt(stringifiedPayload),
          headers: {
            ...(mode !== "direct"
              ? { ...(!zeploToken ? {} : { "X-Zeplo-Token": zeploToken }) }
              : {
                  "X-Zeplo-Id": `${v4()}-iow`,
                  "X-Zeplo-Start": `${Date.now() / 1000}`,
                }),
          },
        }
      );

      if (res.status >= 400) {
        throw new Error(
          `Unexpected response while trying to enqueue "${stringifiedPayload}" to ${url}: ${await res.text()}`
        );
      }

      return z.object({ id: z.string() }).parse(await res.json());
    },
    respondTo: async (body: unknown, headers: IncomingHttpHeaders) => {
      try {
        const { "x-zeplo-id": jobId, "x-zeplo-start": start } = z
          .object({
            // https://zeplo.io/docs/queue/
            "x-zeplo-id": z.string(),
            "x-zeplo-start": z.string(),
          })
          .parse(headers);

        await handler(
          schema.parse(
            serializer.parse(await encryptor.decrypt(z.string().parse(body)))
          ),
          {
            jobId,
            start: new Date(Number.parseFloat(start) * 1000),
          }
        );

        return {
          status: 200,
          // HACK Since mode: "direct" executes the handler rather than enqueuing, we respond with the same response as zeplo
          body: { id: jobId },
        };
      } catch (error) {
        // eslint-disable-next-line no-console -- TODO Better zeplo logging
        console.error(error);

        return {
          status: 500,
          body: `${error}`,
        };
      }
    },
  };
};

export type ClientOptions<Payload> = NonNullable<
  Parameters<typeof ZeploClient<Payload>>[0]["options"]
>;

export type ClientHandler<Payload> = Parameters<
  typeof ZeploClient<Payload>
>[0]["handler"];

export type EnqueueOptions<Payload> = NonNullable<
  Parameters<ReturnType<typeof ZeploClient<Payload>>["enqueue"]>[1]
>;
