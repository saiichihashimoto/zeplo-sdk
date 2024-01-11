import type { NextApiHandler } from "next";

import { ZeploClient } from "./client";

export const Queue = <Payload>(
  route: Parameters<typeof ZeploClient<Payload>>[0]["route"],
  handler: Parameters<typeof ZeploClient<Payload>>[0]["handler"],
  options?: Parameters<typeof ZeploClient<Payload>>[0]["options"]
) => {
  const zeplo = ZeploClient({ handler, route, options });

  // eslint-disable-next-line fp/no-mutating-assign -- HACK
  return Object.assign(
    (async ({ body, headers }, res) => {
      const { status, body: responseBody } = await zeplo.respondTo(
        body,
        headers
      );

      res.status(status);
      res.send(
        typeof responseBody === "string"
          ? responseBody
          : // HACK Since mode: "direct" executes the handler rather than enqueuing, we respond with the same response as zeplo
            JSON.stringify(responseBody)
      );
    }) satisfies NextApiHandler<string>,
    {
      enqueue: async (...args: Parameters<typeof zeplo.enqueue>) =>
        zeplo.enqueue(...args),
    }
  );
};
