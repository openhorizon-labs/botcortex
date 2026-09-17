import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { fetchSkill } from "@/lib/registry";
import { bodyFor, shortBodyName } from "@/lib/robot/bodies";

/**
 * The card a skill link unfurls into, in Discord, X, Slack, iMessage.
 *
 * Every skill used to share its ARM's picture: six images for the whole
 * registry, so a link to "red to right tray" and a link to "wave" looked the
 * same in a chat, and neither said what it was. The card now says the three
 * things that make someone click: what the robot does, which robot, and that
 * it runs in the browser. The render is the body's own card image, the same
 * model the player shows.
 *
 * Built-in font only: a font fetched at request time is a network dependency
 * in the one response that has to be fast and cannot show an error.
 */
export const alt = "A robot skill that runs in your browser";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#1a1a1a";
const MUTED = "#6b6b70";
const PANEL = "#d9d9dd";

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const skill = await fetchSkill((await params).id);
  const platform = skill?.platform ?? "openarm_v1";
  const bodyName = shortBodyName(bodyFor(platform).displayName);
  const title = skill ? skill.name.replace(/_/g, " ") : "Robot skills";
  const handle = skill?.author?.handle;
  const render = await readFile(join(process.cwd(), "public", "robots", "cards", `${platform}.png`))
    .then((bytes) => `data:image/png;base64,${bytes.toString("base64")}`)
    .catch(() => null);

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#fdfdfd", color: INK }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 600, padding: "56px 0 56px 64px" }}>
          <div style={{ display: "flex", fontSize: 26, fontWeight: 600, letterSpacing: -0.3 }}>BotCortex</div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 24, color: MUTED }}>On the {bodyName}</div>
            <div
              style={{
                display: "flex",
                marginTop: 14,
                fontSize: title.length > 28 ? 52 : 64,
                lineHeight: 1.05,
                letterSpacing: -1.2,
                textTransform: "capitalize",
              }}
            >
              {clip(title, 48)}
            </div>
            {skill && (
              <div style={{ display: "flex", marginTop: 20, fontSize: 25, lineHeight: 1.35, color: MUTED }}>
                {clip(skill.description, 110)}
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", fontSize: 24 }}>
            <div style={{ display: "flex", background: INK, color: "#fff", padding: "12px 22px", borderRadius: 12 }}>
              ▶ Run it in your browser
            </div>
            {handle && <div style={{ display: "flex", marginLeft: 22, color: MUTED }}>taught by @{handle}</div>}
          </div>
        </div>
        <div style={{ display: "flex", width: 600, height: 630, padding: 40 }}>
          <div
            style={{
              display: "flex",
              width: "100%",
              height: "100%",
              borderRadius: 32,
              overflow: "hidden",
              background: PANEL,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {render && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={render} alt="" width={733} height={550} style={{ objectFit: "cover" }} />
            )}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
