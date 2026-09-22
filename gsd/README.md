# Grok Strategy Department (GSD)

Département autonome du trading desk : wallet Hyperliquid dédié, agent Grok existant, gates J0–J2, coupe des perdants.

**Ce dossier ne remplace pas le desk.** Branche `gsd` — le `main` du cockpit HTML reste intact.

## Secrets (hors git)

Copier `.env.example` → `deploy/vps/.env` **uniquement sur le VPS**.

| Variable | Rôle |
|---|---|
| `XAI_API_KEY` | Appels Grok |
| `HL_AGENT_KEY` | Clé API agent Hyperliquid (64 hex) |
| `HL_MASTER` | Adresse du wallet du département |
| `GSD_ACCESS_PIN` | PIN d’accès web |

Jamais ces valeurs dans le repo.

## VPS

```bash
cd gsd
sudo docker compose -f deploy/vps/compose.yml up -d --build
```

Coupe auto : ROE ≤ −1 % ou P&L < −0,20 $, toutes les 60 s, slip 8 %.
