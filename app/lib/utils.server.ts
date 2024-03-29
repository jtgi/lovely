import sharp from "sharp";
import { authenticator } from "./auth.server";
import { generateFrameSvg } from "./utils";
import axios from "axios";
import { MessageResponse } from "./types";

export async function convertSvgToPngBase64(svgString: string) {
  const buffer: Buffer = await sharp(Buffer.from(svgString)).png().toBuffer();
  const base64PNG: string = buffer.toString("base64");
  return `data:image/png;base64,${base64PNG}`;
}

export function requireUser({ request }: { request: Request }) {
  return authenticator.isAuthenticated(request, {
    failureRedirect: `/login`,
  });
}

export async function generateSystemFrame(message: string) {
  const svg = await generateFrameSvg(message, getSharedEnv().hostUrl, {
    scale: 1,
  });
  const imgSrc = await convertSvgToPngBase64(svg);
  return imgSrc;
}

export function getSharedEnv() {
  return {
    infuraProjectId: process.env.INFURA_PROJECT_ID!,
    hostUrl:
      process.env.NODE_ENV === "production"
        ? process.env.PROD_URL!
        : process.env.DEV_URL!,
  };
}

export function frameResponse(params: FrameResponseArgs) {
  const version = params.version || "vNext";
  const html = `
  <!DOCTYPE html>
  <html>
    <head>
      ${params.title ? `<title>${params.title}</title>` : ""}
      ${
        params.title
          ? `<meta property="og:title" content="${params.title}">`
          : ""
      }
      ${
        params.description
          ? `<meta property="description" content="${params.description}">
      <meta property="og:description" content="${params.description}">`
          : ""
      }
      ${
        params.input
          ? `<meta property="fc:frame:input:text" content="${params.input}">`
          : ""
      }
      <meta property="fc:frame" content="${version}">
      <meta property="fc:frame:image" content="${params.image}">
      ${
        params.postUrl
          ? `<meta property="fc:frame:post_url" content="${params.postUrl}">`
          : ""
      }
      ${
        params.buttons
          ? params.buttons
              .map((b, index) => {
                let out = `<meta property="fc:frame:button:${
                  index + 1
                }" content="${b.text}">`;
                if (b.link) {
                  out += `\n<meta property="fc:frame:button:${
                    index + 1
                  }:action" content="link">`;
                  out += `\n<meta property="fc:frame:button:${
                    index + 1
                  }:target" content="${b.link}">`;
                } else if (b.isRedirect) {
                  out += `\n<meta property="fc:frame:button:${
                    index + 1
                  }:action" content="post_redirect">`;
                }
                return out;
              })
              .join("\n")
          : ""
      }
    </head>
    <body>
      <h1>${params.title}</h1>
      <p>${params.description}</p>
      <div>
      <img src="${params.image}" />
      </div>
      ${params.buttons
        ?.map((b, index) => `<button name="button-${index}">${b.text}</button>`)
        .join("\n")}
    </body>
  </html>
  `;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html",
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

type FrameResponseArgs = {
  title?: string;
  input?: string;
  description?: string;
  version?: string;
  image: string;
  buttons?: Array<{
    text: string;
    link?: string;
    isRedirect?: boolean;
  }>;
  postUrl?: string;
};

export async function parseMessage(payload: any) {
  const res = await axios.post(
    `https://api.neynar.com/v2/farcaster/frame/validate`,
    {
      message_bytes_in_hex: payload.trustedData.messageBytes,
      follow_context: true,
    },
    {
      headers: {
        accept: "application/json",
        api_key: process.env.NEYNAR_API_KEY,
        "content-type": "application/json",
        Accept: "application/json",
      },
    }
  );

  const message = res.data as MessageResponse;
  if (!message.valid) {
    throw new Error("Invalid message");
  }

  if (
    new URL(message.action.url).host !== new URL(getSharedEnv().hostUrl).host
  ) {
    console.log({ url: message.action.url, hostUrl: getSharedEnv().hostUrl });
    throw new Error("No spoofs sir");
  }

  return message;
}
