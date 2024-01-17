import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { ZeploClient } from "./client";
import type { ClientHandler, ClientOptions, EnqueueOptions } from "./client";

export const Queue = <Payload>(
  route: string,
  handler: ClientHandler<Payload>,
  options?: ClientOptions<Payload>
) => {
  const zeplo = ZeploClient({ handler, route, options });

  // eslint-disable-next-line fp/no-mutating-assign -- HACK
  return Object.assign(
    (async ({ text, headers }) => {
      const { status, body } = await zeplo.respondTo(
        await text(),
        Object.fromEntries(headers.entries())
      );

      return new NextResponse(
        typeof body === "string"
          ? body
          : // HACK Since mode: "direct" executes the handler rather than enqueuing, we respond with the same response as zeplo
            JSON.stringify(body),
        { status }
      );
    }) satisfies (req: NextRequest) => Promise<NextResponse<string>>,
    {
      enqueue: async (payload: Payload, options?: EnqueueOptions<Payload>) =>
        zeplo.enqueue(payload, options),
    }
  );
};
