# docs

Site de documentation de Nidalheim — documentation API et guides du jeu.

## Stack

- **Next.js 16** (App Router)
- **Nextra 4.6** — framework de documentation
- **nextra-theme-docs** — theme documentation
- **Tailwind CSS 4** + typography plugin
- **Supabase** — authentification
- **pagefind** — moteur de recherche statique

## Lancer en dev

```bash
pnpm install
pnpm dev    # http://localhost:3000
```

## Scripts

```bash
pnpm dev        # Serveur de dev
pnpm build      # Build + indexation pagefind
pnpm start      # Serveur de production
pnpm lint       # ESLint
```

## Structure

```
src/
├── app/
│   ├── layout.tsx     # Layout racine
│   ├── globals.css    # Styles globaux
│   ├── docs/          # Pages documentation (MDX, Nextra)
│   └── login/         # Page d'authentification
├── lib/               # Utilitaires
└── proxy.ts           # Proxy API
```
