/* eslint-disable react/no-unescaped-entities */
import { typedjson, useTypedLoaderData } from "remix-typedjson";
import { db } from "~/lib/db.server";
import { LoaderFunctionArgs } from "@remix-run/node";
import { useClipboard } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { getSharedEnv, requireUser } from "~/lib/utils.server";
import { Link } from "@remix-run/react";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser({ request });
  const env = getSharedEnv();

  const sightings = await db.seen.findMany({
    where: {
      userId: user.id,
    },
  });

  const likes = await db.seen.findMany({
    where: {
      userId: user.id,
      result: "like",
    },
    include: {
      user: true,
    },
  });

  const otherlikes = await db.seen.findMany({
    where: {
      toFid: user.providerId,
      result: "like",
      user: {
        seeking: {
          in: [user.sex, "any"],
        },
      },
    },
    include: {
      user: true,
    },
  });

  const mutual = otherlikes.filter((otherlike) =>
    likes.some((like) => otherlike.user.providerId === like.toFid)
  );

  console.log({ user, mutual, likes, otherlikes, sightings });

  return typedjson({
    sightings,
    user,
    mutual,
    env: getSharedEnv(),
    hostUrl: env.hostUrl,
  });
}

export default function FrameConfig() {
  const { user, sightings, mutual, env } = useTypedLoaderData<typeof loader>();

  return (
    <div>
      <h2>Matches</h2>
      {mutual.length > 0 && (
        <div className="divide-y">
          {mutual.map((like) => (
            <div
              className="flex items-center justify-between py-4"
              key={like.id}
            >
              <p>{like.createdAt.toDateString()}</p>
              <Link
                to={`https://warpcast.com/${like.user.name}`}
                target="_blank"
              >
                @{like.user?.name}
              </Link>
            </div>
          ))}
        </div>
      )}

      <h2>History</h2>
      {sightings.length > 0 && (
        <div className="divide-y">
          {sightings.map((sighting) => (
            <div
              className="flex items-center justify-between py-4"
              key={sighting.id}
            >
              <p>{sighting.createdAt.toDateString()}</p>
              {sighting.toFid} - {sighting.result}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function CopyButton({
  frame,
  env,
}: {
  frame: { slug: string };
  env: { hostUrl: string };
}) {
  const { copy, copied } = useClipboard();

  return (
    <Button
      className="w-[100px]"
      size={"sm"}
      variant={"outline"}
      onClick={() => copy(`${env.hostUrl}/${frame.slug}`)}
    >
      {copied ? "Copied!" : "Copy URL"}
    </Button>
  );
}
