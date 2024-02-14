import { User } from "@prisma/client";
import { ActionFunctionArgs } from "@remix-run/node";
import axios from "axios";
import satori from "satori";
import { db } from "~/lib/db.server";
import {
  frameResponse,
  generateSystemFrame,
  getSharedEnv,
  parseMessage,
} from "~/lib/utils.server";

export async function action({ request }: ActionFunctionArgs) {
  const data = await request.json();
  const env = getSharedEnv();

  const url = new URL(request.url);
  const candidateFid = url.searchParams.get("fid");

  const message = await parseMessage(data);

  if (candidateFid) {
    const candidate = await db.user.findFirst({
      where: {
        providerId: candidateFid,
      },
    });

    if (!candidate) {
      return frameResponse({
        title: "onframe dating",
        version: "vNext",
        description: "Dating on farcaster",
        image: await generateSystemFrame("That's not a real candidate..."),
        buttons: [
          {
            text: "I'm feelin lucky",
          },
        ],
      });
    }

    const liked = message.action.tapped_button.index === 2;

    await db.seen.create({
      data: {
        userId: String(message.action.interactor.fid),
        toFid: candidateFid,
        result: liked ? "like" : "dislike",
      },
    });

    if (liked) {
      const isMutual = await db.seen.findFirst({
        where: {
          userId: candidateFid,
          toFid: String(message.action.interactor.fid),
          result: "like",
        },
      });

      if (isMutual) {
        return frameResponse({
          title: "onframe dating",
          version: "vNext",
          description: "Dating on farcaster",
          image: await generateSystemFrame(
            "It's a match! You two should message each other urgently."
          ),
          buttons: [
            {
              text: "Panic",
            },
          ],
          postUrl: `${env.hostUrl}/next`,
        });
      }
    }
  }

  return renderNextCandidateFrame(message.action.interactor.fid);
}

export async function renderCandidate(user: User) {
  const userData = JSON.parse(user.userData);

  const imageResponse = await axios.get(user.avatarUrl, {
    responseType: "arraybuffer",
  });
  const base64 = Buffer.from(imageResponse.data, "binary").toString("base64");
  const contentType = imageResponse.headers["content-type"] || "image/jpeg";
  const dataURL = `data:${contentType};base64,${base64}`;

  const svg = await satori(
    <div
      style={{
        display: "flex",
        color: "white",
        fontFamily: "Inter Regular",
        backgroundColor: "black",
        height: "100%",
        width: "100%",
        padding: 72,
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        fontSize: 18,
        fontWeight: 600,
      }}
    >
      <img
        src={dataURL}
        style={{ borderRadius: "50%", width: 200, marginBottom: 5 }}
      />
      <h1>@{user.name}</h1>
      <p>{userData.profile}</p>
    </div>,
    {
      width: 800,
      height: 800,
      fonts: [],
    }
  );

  return svg;
}

export async function getNextCandidate(user: User) {
  return db.user.findFirst({
    where: {
      providerId: {
        not: user.providerId,
      },
      seeking: {
        in: [user.sex, "any"],
      },
      sex: user.seeking === "any" ? undefined : user.seeking,
      NOT: {
        sightings: {
          some: {
            userId: user.id,
          },
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });
}

export async function renderNextCandidateFrame(interactorFid: string | number) {
  const user = await db.user.findFirstOrThrow({
    where: {
      providerId: String(interactorFid),
    },
  });

  const next = await getNextCandidate(user);
  if (!next) {
    return frameResponse({
      title: "onframe dating",
      version: "vNext",
      description: "Dating on farcaster",
      image: await generateSystemFrame(
        "Damn. All out of candidates. Try again later."
      ),
      buttons: [
        {
          text: "I'm feelin lucky",
        },
      ],
      postUrl: `${getSharedEnv().hostUrl}/next`,
    });
  }

  return frameResponse({
    title: "onframe dating",
    version: "vNext",
    description: "Dating on farcaster",
    image: await renderCandidate(next),
    buttons: [
      {
        text: "Nay",
      },
      {
        text: "Yay",
      },
    ],
    postUrl: `${getSharedEnv().hostUrl}/next?fid=${next.providerId}`,
  });
}