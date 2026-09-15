/**
 * The robots BotCortex supports, as people meet them: a name, a one-line
 * shape, a paragraph, and a card image rendered from the simulation itself.
 * Shared by the connect dialog's chooser and the public skill registry, so
 * the two never describe the same body two ways.
 *
 * The list of BODIES comes from the runtime wheel (MANIFEST.json): every
 * platform the runtime knows, arms and bimanual rigs today, humanoids when
 * one lands in the catalog. `browser` marks the subset this tab can boot;
 * the registry lists them all, because a skill proven on a native-only
 * body is no less proven.
 */
import runtimeArtifact from "@/public/botcortex/MANIFEST.json";

export type BodyCard = { tagline: string; body: string };

export const BODY_CARDS: Record<string, BodyCard> = {
  openarm_v1: {
    tagline: "Two arms, seven joints each",
    body: "A bimanual research arm with parallel-jaw grippers. Left and right trays and a small pocket on a shared bench, three blocks. The body BotCortex was built on.",
  },
  roarm_m2: {
    tagline: "One arm, three joints, a clamp",
    body: "Waveshare's desktop arm: a single hinged clamp and about half a metre of reach, one tray and a pocket it cannot yaw a block into. Cheap, and honest about what it cannot orient.",
  },
  panda: {
    tagline: "One arm, seven joints, a two-finger hand",
    body: "The Franka Emika Panda from MuJoCo Menagerie: the lab-standard collaborative arm, 0.85 m of reach, a tendon-driven parallel gripper. Native simulation only for now.",
  },
  xarm7: {
    tagline: "One arm, seven joints, a parallel gripper",
    body: "UFACTORY's xArm7 from MuJoCo Menagerie, standing on its pedestal: 0.7 m of reach and a two-finger gripper. Native simulation only for now.",
  },
};

/** What the registry calls each kind of body. */
export const KIND_LABELS: Record<string, string> = {
  arm: "Robot arm",
  bimanual: "Bimanual arm",
  humanoid: "Humanoid",
  mobile: "Mobile manipulator",
};

export type SupportedBody = {
  name: string;
  displayName: string;
  kind: string;
  joints: number;
  arms: number;
  reachM: number;
  /** Whether this tab can boot it — the connect dialog's list. */
  browser: boolean;
  card?: BodyCard;
  image?: string;
};

const IMAGES = new Set(["openarm_v1", "roarm_m2", "panda", "xarm7"]);

/** Every body the shipped runtime knows, with its copy and image. */
export const SUPPORTED_BODIES: SupportedBody[] = (
  runtimeArtifact.bodies as Omit<SupportedBody, "card" | "image">[]
).map((body) => ({
  ...body,
  card: BODY_CARDS[body.name],
  image: IMAGES.has(body.name) ? `/robots/cards/${body.name}.png` : undefined,
}));

/** The subset this browser can simulate — what the connect dialog offers. */
export const BOOTABLE_BODIES = SUPPORTED_BODIES.filter((body) => body.browser);

export function bodyFor(platform: string): SupportedBody {
  return (
    SUPPORTED_BODIES.find((body) => body.name === platform) ?? {
      name: platform,
      displayName: platform,
      kind: "arm",
      joints: 0,
      arms: 1,
      reachM: 0,
      browser: false,
    }
  );
}
