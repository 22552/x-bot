const applicationId = process.env.DISCORD_APPLICATION_ID;
const token = process.env.DISCORD_TOKEN;
const guildId = process.env.DISCORD_GUILD_ID;

if (!applicationId || !token) {
  console.error("Set DISCORD_APPLICATION_ID and DISCORD_TOKEN first.");
  process.exit(1);
}

const commands = [
  {
    name: "hash",
    description: "Hash text with SHA-2",
    type: 1,
    options: [
      {
        name: "text",
        description: "Text to hash",
        type: 3,
        required: true,
        max_length: 2000
      },
      {
        name: "algorithm",
        description: "Hash algorithm",
        type: 3,
        required: false,
        choices: [
          { name: "SHA-256", value: "sha256" },
          { name: "SHA-384", value: "sha384" },
          { name: "SHA-512", value: "sha512" }
        ]
      }
    ]
  },
  {
    name: "random",
    description: "Secure random utilities",
    type: 1,
    options: [
      {
        name: "number",
        description: "Pick a random integer",
        type: 1,
        options: [
          { name: "min", description: "Minimum (default 1)", type: 4, min_value: -1000000000, max_value: 1000000000 },
          { name: "max", description: "Maximum (default 100)", type: 4, min_value: -1000000000, max_value: 1000000000 }
        ]
      },
      {
        name: "choice",
        description: "Pick from a list separated by |",
        type: 1,
        options: [
          { name: "choices", description: "Example: apple | banana | orange", type: 3, required: true, max_length: 1000 }
        ]
      },
      {
        name: "uuid",
        description: "Generate a random UUID",
        type: 1
      }
    ]
  },
  {
    name: "qr",
    description: "Generate a QR code",
    type: 1,
    options: [
      { name: "text", description: "Text or URL to encode", type: 3, required: true, max_length: 1200 }
    ]
  },
  {
    name: "about",
    description: "About X",
    type: 1
  }
];

const path = guildId
  ? `/applications/${applicationId}/guilds/${guildId}/commands`
  : `/applications/${applicationId}/commands`;

const response = await fetch(`https://discord.com/api/v10${path}`, {
  method: "PUT",
  headers: {
    Authorization: `Bot ${token}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify(commands)
});

if (!response.ok) {
  console.error(`Discord returned ${response.status}: ${await response.text()}`);
  process.exit(1);
}

const result = await response.json();
console.log(`Registered ${result.length} commands ${guildId ? `in guild ${guildId}` : "globally"}.`);
