# Docker Setup Guide — Two-Component Architecture

This project has two independent Docker components that can run on separate computers (both with 8GB+ VRAM if using GPU):

1. **Discord Bot** — Voice transcription (Whisper ASR) — runs on a **trusted host** (any PC)
2. **AI Assistant** — LocalAI LLM inference — runs on the **GM's Foundry PC**

This guide covers setup for each component.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        GM's Foundry PC                          │
│                                                                 │
│  ┌──────────────────────────────────────┐                      │
│  │   Foundry VTT (port 13348)           │                      │
│  │   + Beaver's AI Assistant Module      │                      │
│  └──────────────────────────────────────┘                      │
│                        ↕                                         │
│  ┌──────────────────────────────────────┐                      │
│  │   LocalAI (port 8000)                 │                      │
│  │   Mistral 7B LLM (GPU)               │                      │
│  └──────────────────────────────────────┘                      │
│                                                                 │
│  Requirements: 8GB+ VRAM (GPU), 16GB+ RAM total                │
│  Optional cost: $0 (local, no API fees)                        │
└─────────────────────────────────────────────────────────────────┘
           ↕ API calls
           ↕ (HTTPS/HTTP)
           ↕
┌─────────────────────────────────────────────────────────────────┐
│                    Trusted Host (any PC)                        │
│                                                                 │
│  ┌──────────────────────────────────────┐                      │
│  │   Discord Bot                         │                      │
│  │   + Whisper ASR (port 9000)          │                      │
│  └──────────────────────────────────────┘                      │
│                        ↕                                         │
│  Connect to GM's Foundry over HTTPS                            │
│  Send transcripts & receive responses                          │
│                                                                 │
│  Requirements: 8GB+ VRAM (GPU) or CPU capable                  │
│  Cost: $0 (local, no API fees)                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### Option 1: Both on Same PC (simplest)

```bash
# On the GM's Foundry PC:

# Start LocalAI (choose GPU or CPU)
docker compose -f ai-assistant-compose.yml up -d        # GPU
# OR
docker compose -f ai-assistant-compose.cpu.yml up -d    # CPU

# Start Discord Bot
docker compose -f discord-bot-compose.yml up -d         # GPU (high quality)
# OR
docker compose -f discord-bot-compose.cpu.yml up -d     # CPU (low quality)
```

### Option 2: Discord Bot on Remote Trusted Host

```bash
# On a DIFFERENT trusted host (laptop, gaming PC, etc):
docker compose -f discord-bot-compose.yml up -d

# Then edit discord-bot-compose.yml and update FOUNDRY_URL:
# Change: FOUNDRY_URL=http://host.docker.internal:13348
# To: FOUNDRY_URL=http://<GM_IP>:13348
```

---

## Component: AI Assistant (LocalAI)

LocalAI provides a local LLM (Large Language Model) for the Beaver's AI Assistant Foundry module.
It's an **OpenAI-compatible API**, so the module can switch between Claude (cloud) and LocalAI (local) without code changes.

### Files

- `ai-assistant-compose.yml` — GPU version (Nvidia, 8GB+ VRAM)
- `ai-assistant-compose.cpu.yml` — CPU version (slow but free)

### Start the service

**With GPU (recommended):**

```bash
docker compose -f ai-assistant-compose.yml up -d
```

**With CPU only (slow):**

```bash
docker compose -f ai-assistant-compose.cpu.yml up -d
```

### Verify it's running

```bash
# Check container status
docker ps | grep local-ai

# Test the API
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mistral",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

### Configure in Foundry

In the Foundry module settings (**AI Assistant → Configure**):

1. **AI Provider:** Select "Local AI (Docker)"
2. **Local AI URL:** `http://localhost:8000` (if on same PC) or `http://<PC_IP>:8000` (if remote)
3. **Model:** `mistral` (or whatever model you loaded)

### Model Selection

Pick a model that fits your hardware:

| Model | Size | VRAM | Speed | Quality | GPU | CPU |
|---|---|---|---|---|---|---|
| **phi-3:mini** | 3B | 2GB | Fast (1-2 min) | Fair | ✓ | ✓ (acceptable) |
| **neural-chat** | 7B | 6GB | Medium (1-2 min) | Good | ✓ | ✗ (slow) |
| **mistral** | 7B | 6GB | Medium (30-60 sec) | Good | ✓ | ✗ (too slow) |
| **openchat** | 7B | 6GB | Medium | Good | ✓ | ✗ |

**For 8GB VRAM GPU:** Use `mistral` or `neural-chat`
**For CPU:** Use `phi-3:mini` and expect 2-5 min responses

The model is auto-downloaded on first run (1-5GB). Models persist in the `local-ai-models` Docker volume.

### Logs and debugging

```bash
# View real-time logs
docker logs -f local-ai

# Restart the container
docker restart local-ai

# Stop the service
docker compose -f ai-assistant-compose.yml down
```

---

## Component: Discord Bot + Whisper

The Discord bot listens to a voice channel, transcribes speech using Whisper ASR, and sends transcripts to Foundry.

### Files

- `discord-bot-compose.yml` — GPU version (Nvidia, faster transcription)
- `discord-bot-compose.cpu.yml` — CPU version (slower but works on any PC)

### Requirements

Before running, create `discord-bot/.env`:

```bash
# Discord
DISCORD_TOKEN=your_discord_bot_token_here
DISCORD_CHANNEL_ID=your_voice_channel_id

# Foundry credentials (from AI Assistant module settings)
FOUNDRY_USER=ai-assistant
FOUNDRY_PASS=<password_from_module_settings>
FOUNDRY_API_KEY=<generated_key>

# Foundry URL (auto-set below, update if on different PC)
FOUNDRY_URL=http://host.docker.internal:13348
```

See [`discord-bot/README.md`](./discord-bot/README.md) for detailed setup.

### Start the service

**With GPU (faster, recommended):**

```bash
docker compose -f discord-bot-compose.yml up -d
```

**With CPU only:**

```bash
docker compose -f discord-bot-compose.cpu.yml up -d
```

### Running on a different PC

If the Discord bot is on a **different PC than Foundry**:

1. Edit `discord-bot-compose.yml`
2. Change `FOUNDRY_URL=http://host.docker.internal:13348` to `FOUNDRY_URL=http://<GM_IP>:13348`
   - Replace `<GM_IP>` with the GM's Foundry PC IP (e.g., `192.168.1.50`)
3. Make sure the GM's Foundry is accessible from the Discord bot's network

### Verify it's running

```bash
# Check container status
docker ps | grep discord-bot

# View logs
docker logs -f discord_bot

# The bot should connect to Discord and be ready to join voice
```

### Voice commands

Once the bot joins a voice channel:

- Say "**`Whisper start`**" — Begin transcribing to Foundry
- Say "**`Whisper stop`**" — Stop transcribing (stays in voice)
- Say "**`Whisper page <name>`**" — Switch to a new journal page

See [`discord-bot/README.md`](./discord-bot/README.md) for full command reference.

### Logs and debugging

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

## Multi-PC Setup (Discord Bot on Remote Host)

### Scenario

- **PC 1 (GM's Foundry):** LocalAI + Foundry VTT
- **PC 2 (Trusted Host):** Discord Bot + Whisper

### Setup

**On PC 1 (GM's Foundry):**

```bash
# Start LocalAI
docker compose -f ai-assistant-compose.yml up -d

# Foundry VTT is already running on http://localhost:13348
# Configure Foundry firewall to allow port 13348 from PC 2
```

**On PC 2 (Trusted Host):**

```bash
# Edit discord-bot-compose.yml:
# FOUNDRY_URL=http://<PC1_IP>:13348
# Example: FOUNDRY_URL=http://192.168.1.50:13348

docker compose -f discord-bot-compose.yml up -d
```

### Networking requirements

- **PC 1 → PC 2:** No connection needed (Discord Bot reaches out to Foundry)
- **PC 2 → PC 1:** Bot must reach Foundry on HTTP port 13348
  - Both PCs on same local network, OR
  - Use a VPN/tunnel (Tailscale, ZeroTier, etc.)

---

## Troubleshooting

### LocalAI not starting / GPU not detected

```bash
# Verify Nvidia drivers
docker run --rm --gpus all nvidia/cuda:12.0-runtime nvidia-smi

# If fails: Install NVIDIA Container Toolkit
# https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html

# If still failing, fall back to CPU:
docker compose -f ai-assistant-compose.cpu.yml up -d
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

### LocalAI responding very slowly

- **GPU not working:** Check `docker logs local-ai` for CUDA errors
- **CPU too slow:** Consider using smaller model (phi-3:mini) or upgrade to GPU
- **Model still downloading:** First run downloads 3-6GB — wait for it to finish

### Whisper transcription quality is poor

- **On CPU:** Whisper base model is small. GPU version uses larger model.
- **Audio volume:** Ensure voice channel audio is clear and loud enough
- **Language:** Update `WHISPER_MODEL` env var if non-English

---

## Cost Comparison

### Option 1: Claude Cloud API
- Lore Index build: ~$0.20–0.66
- Per Interact call: ~$0.01–0.05
- **Monthly (10 sessions):** <$1

### Option 2: LocalAI GPU (local)
- Setup cost: None (use existing PC)
- Monthly cost: ~$5–20 electricity (estimate)
- **Monthly (10 sessions):** ~$5–20

### Option 3: LocalAI CPU (local)
- Setup cost: None
- Monthly cost: ~$2–5 electricity
- Quality: Lower (slower, less accurate)
- **Monthly (10 sessions):** ~$2–5

---

## Next steps

1. **[Foundry Module Setup](./foundry/README.md)** — Install and configure the module
2. **[Discord Bot Setup](./discord-bot/README.md)** — Configure Discord credentials and voice channel
3. **[Client Package](./client/README.md)** — (Optional) Connect your own voice bot

---

## References

- **LocalAI:** https://github.com/go-skynet/LocalAI
- **Whisper:** https://github.com/openai/whisper
- **NVIDIA Container Toolkit:** https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/
- **Discord.py:** https://discordpy.readthedocs.io/