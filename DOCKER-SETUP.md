# Docker Setup Guide — Discord Bot + Whisper

The Discord bot listens to a voice channel, transcribes speech using Whisper ASR, and sends transcripts to Foundry. It runs on a **trusted host** — the GM's Foundry PC or any other PC that can reach it.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        GM's Foundry PC                          │
│                                                                 │
│  ┌──────────────────────────────────────┐                      │
│  │   Foundry VTT (port 13348)           │                      │
│  │   + Beaver's Voice Transcript Module  │                      │
│  └──────────────────────────────────────┘                      │
└─────────────────────────────────────────────────────────────────┘
           ↕ socket.io
           ↕ (HTTPS/HTTP)
           ↕
┌─────────────────────────────────────────────────────────────────┐
│                    Trusted Host (any PC)                        │
│                                                                 │
│  ┌──────────────────────────────────────┐                      │
│  │   Discord Bot                         │                      │
│  │   + Whisper ASR (port 9000)          │                      │
│  └──────────────────────────────────────┘                      │
│                                                                 │
│  Requirements: 8GB+ VRAM (GPU) or CPU capable                  │
│  Cost: $0 (local, no API fees)                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Files

- `discord-bot-compose.yml` — GPU version (Nvidia, faster transcription)
- `discord-bot-compose.cpu.yml` — CPU version (slower but works on any PC)

## Requirements

Before running, create `discord-bot/.env`:

```bash
# Discord
DISCORD_TOKEN=your_discord_bot_token_here
DISCORD_CHANNEL_ID=your_voice_channel_id

# Foundry credentials (from the Voice Transcript module settings)
FOUNDRY_USER=<user_id_from_module_settings>
FOUNDRY_PASS=<password_from_module_settings>

# Foundry URL (auto-set below, update if on different PC)
FOUNDRY_URL=http://host.docker.internal:13348
```

See [`discord-bot/README.md`](./discord-bot/README.md) for detailed setup.

## Start the service

**With GPU (faster, recommended):**

```bash
docker compose -f discord-bot-compose.yml up -d
```

**With CPU only:**

```bash
docker compose -f discord-bot-compose.cpu.yml up -d
```

## Running on a different PC

If the Discord bot is on a **different PC than Foundry**:

1. Edit `discord-bot-compose.yml`
2. Change `FOUNDRY_URL=http://host.docker.internal:13348` to `FOUNDRY_URL=http://<GM_IP>:13348`
   - Replace `<GM_IP>` with the GM's Foundry PC IP (e.g., `192.168.1.50`)
3. Make sure the GM's Foundry is accessible from the Discord bot's network

### Networking requirements

- **Foundry PC → bot PC:** No connection needed (the bot reaches out to Foundry)
- **Bot PC → Foundry PC:** Bot must reach Foundry on HTTP port 13348
  - Both PCs on same local network, OR
  - Use a VPN/tunnel (Tailscale, ZeroTier, etc.)

## Verify it's running

```bash
# Check container status
docker ps | grep discord-bot

# View logs
docker logs -f discord_bot

# The bot should connect to Discord and be ready to join voice
```

## Voice commands

Once the bot joins a voice channel it starts paused. With the default `BOT_NAME=Scribe`:

- Say "**`Scribe write down`**" — Begin transcribing to Foundry
- Say "**`Scribe stop it`**" — Stop transcribing (stays in voice)

See [`discord-bot/README.md`](./discord-bot/README.md) for full command reference.

## Logs and debugging

```bash
# View real-time logs
docker logs -f discord_bot

# Restart the container
docker restart discord_bot

# Stop the service
docker compose -f discord-bot-compose.yml down

# View Whisper transcription logs
docker logs -f whisper
```

---

## Troubleshooting

### Whisper GPU not detected

```bash
# Verify Nvidia drivers
docker run --rm --gpus all nvidia/cuda:12.0-runtime nvidia-smi

# If fails: Install NVIDIA Container Toolkit
# https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html

# If still failing, fall back to CPU:
docker compose -f discord-bot-compose.cpu.yml up -d
```

### Discord bot can't reach Foundry

```bash
# Check connectivity
docker exec discord_bot curl -v http://host.docker.internal:13348

# If on different PC:
docker exec discord_bot curl -v http://<GM_IP>:13348

# If fails:
# 1. Check firewall on GM's PC (allow port 13348)
# 2. Verify FOUNDRY_URL in discord-bot-compose.yml
# 3. Check .env file has correct credentials
```

### Whisper transcription quality is poor

- **On CPU:** Whisper base model is small. GPU version uses larger model.
- **Audio volume:** Ensure voice channel audio is clear and loud enough
- **Language:** Set `WHISPER_LANGUAGE` in `discord-bot/.env` if non-English

---

## Next steps

1. **[Foundry Module Setup](./foundry/README.md)** — Install and configure the module
2. **[Discord Bot Setup](./discord-bot/README.md)** — Configure Discord credentials and voice channel
3. **[Client Package](./client/README.md)** — (Optional) Connect your own voice bot

---

## References

- **Whisper:** https://github.com/openai/whisper
- **NVIDIA Container Toolkit:** https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/
