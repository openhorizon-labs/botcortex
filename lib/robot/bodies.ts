/**
 * The arms BotCortex supports, as people meet them: a name, a one-line
 * shape, a paragraph, and the card image rendered from the simulation
 * itself. Shared by the connect dialog's chooser and the public skill
 * registry, so the two never describe the same arm two ways.
 *
 * The catalog of NAMES comes from the runtime wheel (MANIFEST.json); this
 * is only the copy beside them.
 */
import runtimeArtifact from "@/public/botcortex/MANIFEST.json";

export type BodyCard = { tagline: string; body: string };

export const BODY_CARDS: Record<string, BodyCard> = {
  openarm_v1: {
    tagline: "Two arms, seven joints each",
    body: "A bimanual research arm with parallel-jaw grippers. Left and right trays on a shared bench, three blocks. The body BotCortex was built on.",
  },
  roarm_m2: {
    tagline: "One arm, three joints, a clamp",
    body: "Waveshare's desktop arm: a single hinged clamp and about half a metre of reach, one tray. Cheap, and honest about what it cannot orient.",
  },
};

export type SupportedBody = { name: string; displayName: string; card?: BodyCard; image?: string };

/** Every body the shipped runtime can boot, with its copy and image. */
export const SUPPORTED_BODIES: SupportedBody[] = (
  runtimeArtifact.catalog as { name: string; displayName: string }[]
).map((body) => ({
  ...body,
  card: BODY_CARDS[body.name],
  image: BODY_CARDS[body.name] ? `/robots/cards/${body.name}.png` : undefined,
}));

export function bodyFor(platform: string): SupportedBody {
  return SUPPORTED_BODIES.find((body) => body.name === platform) ?? { name: platform, displayName: platform };
}
