# zeplo-sdk

[![NPM Downloads](https://img.shields.io/npm/dw/zeplo-sdk?style=flat&logo=npm)](https://www.npmjs.com/package/zeplo-sdk)
[![GitHub commit activity (branch)](https://img.shields.io/github/commit-activity/m/saiichihashimoto/zeplo-sdk?style=flat&logo=github)](https://github.com/saiichihashimoto/zeplo-sdk/pulls?q=is%3Apr+is%3Aclosed)
[![GitHub Repo stars](https://img.shields.io/github/stars/saiichihashimoto/zeplo-sdk?style=flat&logo=github)](https://github.com/saiichihashimoto/zeplo-sdk/stargazers)
[![GitHub contributors](https://img.shields.io/github/contributors/saiichihashimoto/zeplo-sdk?style=flat&logo=github)](https://github.com/saiichihashimoto/zeplo-sdk/graphs/contributors)
[![GitHub issues by-label](https://img.shields.io/github/issues/saiichihashimoto/zeplo-sdk/help%20wanted?style=flat&logo=github&color=007286)](https://github.com/saiichihashimoto/zeplo-sdk/labels/help%20wanted)
[![Minified Size](https://img.shields.io/bundlephobia/min/zeplo-sdk?style=flat)](https://www.npmjs.com/package/zeplo-sdk?activeTab=code)
[![License](https://img.shields.io/github/license/saiichihashimoto/zeplo-sdk?style=flat)](LICENSE)

[![GitHub Sponsors](https://img.shields.io/github/sponsors/saiichihashimoto?style=flat)](https://github.com/sponsors/saiichihashimoto)

A typed SDK for [zeplo](https://zeplo.io) to avoid http calls with untyped args.

## Getting Started

### Next.js (Pages Router)

Create a new [API Route](https://nextjs.org/docs/api-routes/introduction) and paste the following:

`pages/api/queues/email.ts`:

```typescript
import { Queue } from "zeplo-sdk/dist/next-pages"

export default Queue(
  "api/queues/email", // 👈 the route it's reachable on
  async job => {
    await email.send( ... )
  },
  {
    baseUrl: "your-website.com",
    token: "your-zeplo-token"
  }
)
```

Up top, we're importing `Queue`, which is a function that we use to declare a new Queue and export it as default.

`Queue` takes three arguments.

- The first one is the location of the API Route it's been declared in. This is required for the Zeplo server to know where jobs need to be sent upon execution.
- The second one is a worker function that actually executes the job. In this example, it sends an email.
- The third one is a worker function that actually executes the job. In this example, it sends an email.

Now that we declared the Queue, using it is straight forward. Simply import it and enqueue a new job:

```typescript
import EmailQueue from "pages/api/queues/email"

// could be some API route / getServerSideProps / ...
export default async (req, res) => {

  await EmailQueue.enqueue(
    ..., // job to be enqueued
    { delay: 10000 } // scheduling options
  )

}
```

Calling `.enqueue` will trigger a call to the Quirrel server to enqueue a new job. After 10 seconds, when the job is due, the Queue's worker function will receive the job payload and execute it.

## Options

All common options from the [zeplo documentation](https://zeplo.io/docs/queue/) are available. JSDoc and Typescript typings should help you find them.

### `mode`

There are three ways that Zeplo can be used:

- `production`: Calling `zeplo.to` as expected. Default value.
- `direct`: The easiest way to run Zeplo in your development environment is to simply remove the zeplo.to/ prefix based on an environment variable. This approach has the advantage that in development, errors are thrown directly which can lead to easier debugging 🙌.
- `dev-server`: Calls `localhost:4747` for use with [`zeplo dev`](https://zeplo.io/docs/cli), a local dev server that can be used during development. It implements the [same API](https://zeplo.io/docs) as zeplo.to.

### `encryptionSecret` / `oldSecrets`

A 32-character-long secret used for end-to-end encryption of your jobs. Can be generated using `openssl rand -hex 16` or [random.org](https://www.random.org/strings/?num=2&len=16&digits=on&upperalpha=on&loweralpha=on&unique=on&format=html&rnd=new). The `token` does tell zeplo that you enqueued the job but the token isn't carried into your endpoint, so you need a method for allowing open access for running jobs.

If your secret is leaked, move into the `oldSecrets` array and replace your `encryptionSecret`. Once all jobs that were encrypted with the old secret executed, remove `oldSecrets`.

### `serializer`

By default, your jobs are serialized and deserialized using `JSON.[parse,stringify]`. You can replace this with your own serializer. [Superjson](https://www.npmjs.com/package/superjson) is my favorite.

### `schema`

By default, your deserialized jobs are just cast to your `Queue<Payload>` typescript type. You can provide a schema for runtime validating the type. [Zod](https://zod.dev/) is my favorite.

## Environment Variables

| Variable                  | Meaning                                                                 |
| ------------------------- | ----------------------------------------------------------------------- |
| `ZEPLO_TOKEN`             | Access token for Zeplo.                                                 |
| `ZEPLO_BASE_URL`          | The base URL of your application's deployment.                          |
| `ZEPLO_API_URL`           | The endpoint your Quirrel Server is running under, e.g. `zeplo.to`.     |
| `ZEPLO_ENCRYPTION_SECRET` | A 32-character-long secret used for end-to-end encryption of your jobs. |
| `ZEPLO_OLD_SECRETS`       | Leaked `encryptionSecret`s to continue decrypting them in the meantime. |
