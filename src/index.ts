import { Hono } from "hono";
import * as QRCode from "qrcode/lib/browser";

type Bindings = {
  DISCORD_PUBLIC_KEY: string;
};

type DiscordOption = {
  name: string;
  type: number;
  value?: string | number | boolean;
  options?: DiscordOption[];
};

type DiscordInteraction = {
  id: string;
  application_id: string;
  type: number;
  token: string;
  data?: {
    name?: string;
    options?: DiscordOption[];
  };
};

const app = new Hono<{ Bindings: Bindings }>();

const EPHEMERAL = 1 << 6;
const MESSAGE = 4;
const DEFERRED_MESSAGE = 5;
const PONG = 1;

app.get("/", (c) =>
  c.html(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>X — Discord utility bot</title>
  <style>
    :root{color-scheme:dark}body{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#0b0b0d;color:#f3f3f3;max-width:760px;margin:0 auto;padding:64px 24px;line-height:1.55}h1{font-size:clamp(48px,12vw,96px);margin:0}.muted{color:#a7a7ad}.cmd{display:inline-block;background:#18181d;border:1px solid #2b2b33;border-radius:8px;padding:4px 8px;margin:4px 2px}a{color:inherit}</style>
</head>
<body>
  <h1>X.</h1>
  <p class="muted">X is a bot. A tiny Discord utility bot running on Hono + Cloudflare Workers.</p>
  <p><span class="cmd">/hash</span><span class="cmd">/random</span><span class="cmd">/qr</span><span class="cmd">/about</span></p>
  <p class="muted">No database. No gateway connection. No tracking.</p>
</body>
</html>`)
);

app.get("/health", (c) => c.json({ ok: true, service: "X" }));

app.post("/interactions", async (c) => {
  const signature = c.req.header("X-Signature-Ed25519");
  const timestamp = c.req.header("X-Signature-Timestamp");
  const body = await c.req.text();

  if (!signature || !timestamp || !c.env.DISCORD_PUBLIC_KEY) {
    return c.text("missing signature", 401);
  }

  if (!(await verifyDiscordRequest(c.env.DISCORD_PUBLIC_KEY, signature, timestamp, body))) {
    return c.text("invalid signature", 401);
  }

  let interaction: DiscordInteraction;
  try {
    interaction = JSON.parse(body) as DiscordInteraction;
  } catch {
    return c.text("invalid json", 400);
  }

  if (interaction.type === 1) return c.json({ type: PONG });
  if (interaction.type !== 2 || !interaction.data?.name) {
    return discordMessage(c, "Unsupported interaction.", true);
  }

  const { name } = interaction.data;

  try {
    if (name === "hash") {
      const text = getOption<string>(interaction, "text") ?? "";
      const algorithm = getOption<string>(interaction, "algorithm") ?? "sha256";
      const digest = await hashText(text, algorithm);
      return discordMessage(c, `\`${algorithm.toUpperCase()}\`\n\`\`\`${digest}\`\`\``, true);
    }

    if (name === "random") {
      const sub = interaction.data.options?.[0];
      if (!sub) return discordMessage(c, "Choose a random subcommand.", true);

      if (sub.name === "uuid") {
        return discordMessage(c, `\`${crypto.randomUUID()}\``);
      }

      if (sub.name === "number") {
        const min = getNestedOption<number>(sub, "min") ?? 1;
        const max = getNestedOption<number>(sub, "max") ?? 100;
        if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min > max) {
          return discordMessage(c, "`min` must be less than or equal to `max`.", true);
        }
        if (max - min > 4_000_000_000) {
          return discordMessage(c, "That range is too large.", true);
        }
        return discordMessage(c, `🎲 **${secureRandomInt(min, max)}**`);
      }

      if (sub.name === "choice") {
        const raw = getNestedOption<string>(sub, "choices") ?? "";
        const choices = raw.split("|").map((v) => v.trim()).filter(Boolean);
        if (choices.length < 2 || choices.length > 50) {
          return discordMessage(c, "Give 2–50 choices separated with `|`.", true);
        }
        const pick = choices[secureRandomInt(0, choices.length - 1)];
        return discordMessage(c, `🎯 **${escapeDiscord(pick)}**`);
      }

      return discordMessage(c, "Unknown random subcommand.", true);
    }

    if (name === "qr") {
      const text = getOption<string>(interaction, "text") ?? "";
      if (!text || new TextEncoder().encode(text).byteLength > 1200) {
        return discordMessage(c, "QR input must be between 1 and 1200 UTF-8 bytes.", true);
      }

      c.executionCtx.waitUntil(sendQrAttachment(interaction, text));
      return c.json({ type: DEFERRED_MESSAGE });
    }

    if (name === "about") {
      return discordMessage(
        c,
        "**X** — a tiny Discord utility bot.\n`/hash` · `/random` · `/qr`\nPowered by Hono + Cloudflare Workers."
      );
    }

    return discordMessage(c, "Unknown command.", true);
  } catch (error) {
    console.error(error);
    return discordMessage(c, "Something went wrong while handling that command.", true);
  }
});

function discordMessage(c: any, content: string, ephemeral = false) {
  return c.json({
    type: MESSAGE,
    data: {
      content,
      flags: ephemeral ? EPHEMERAL : undefined,
      allowed_mentions: { parse: [] }
    }
  });
}

async function verifyDiscordRequest(
  publicKeyHex: string,
  signatureHex: string,
  timestamp: string,
  body: string
): Promise<boolean> {
  try {
    const publicKey = hexToBytes(publicKeyHex).buffer as ArrayBuffer;
    const signature = hexToBytes(signatureHex).buffer as ArrayBuffer;
    const data = new TextEncoder().encode(timestamp + body).buffer as ArrayBuffer;
    const key = await crypto.subtle.importKey(
      "raw",
      publicKey,
      { name: "Ed25519" },
      false,
      ["verify"]
    );
    return await crypto.subtle.verify({ name: "Ed25519" }, key, signature, data);
  } catch {
    return false;
  }
}

function hexToBytes(hex: string): Uint8Array {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) throw new Error("invalid hex");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function hashText(text: string, algorithm: string): Promise<string> {
  const algorithms: Record<string, AlgorithmIdentifier> = {
    sha256: "SHA-256",
    sha384: "SHA-384",
    sha512: "SHA-512"
  };
  const selected = algorithms[algorithm];
  if (!selected) throw new Error("unsupported hash algorithm");
  const digest = await crypto.subtle.digest(selected, new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function secureRandomInt(min: number, max: number): number {
  const span = max - min + 1;
  if (!Number.isSafeInteger(span) || span <= 0 || span > 0x1_0000_0000) {
    throw new Error("invalid random range");
  }
  const limit = Math.floor(0x1_0000_0000 / span) * span;
  const values = new Uint32Array(1);
  do crypto.getRandomValues(values); while (values[0] >= limit);
  return min + (values[0] % span);
}

function getOption<T>(interaction: DiscordInteraction, name: string): T | undefined {
  return interaction.data?.options?.find((o) => o.name === name)?.value as T | undefined;
}

function getNestedOption<T>(subcommand: DiscordOption, name: string): T | undefined {
  return subcommand.options?.find((o) => o.name === name)?.value as T | undefined;
}

function escapeDiscord(value: string): string {
  return value.replace(/([\\`*_{}\[\]()#+\-.!|>~])/g, "\\$1").replace(/@/g, "＠");
}

async function sendQrAttachment(interaction: DiscordInteraction, text: string): Promise<void> {
  const endpoint = `https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`;
  try {
    const svg = await QRCode.toString(text, {
      type: "svg",
      margin: 2,
      width: 768,
      errorCorrectionLevel: "M"
    });

    const form = new FormData();
    form.append(
      "payload_json",
      JSON.stringify({
        content: "QR code generated.",
        allowed_mentions: { parse: [] },
        attachments: [{ id: 0, filename: "qr.svg", description: "Generated QR code" }]
      })
    );
    form.append("files[0]", new File([svg], "qr.svg", { type: "image/svg+xml" }));

    const response = await fetch(endpoint, { method: "PATCH", body: form });
    if (!response.ok) throw new Error(`Discord webhook returned ${response.status}`);
  } catch (error) {
    console.error(error);
    await fetch(endpoint, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content: "Failed to generate the QR code.",
        allowed_mentions: { parse: [] }
      })
    });
  }
}

export default app;
