# site

Site vitrine de Nidalheim — landing page et patch notes.

## Stack

- **Next.js 16** (App Router)
- **React 19**
- **Tailwind CSS 4** + typography plugin
- **Framer Motion** — animations
- **Supabase** — authentification et donnees
- **next-mdx-remote** + **gray-matter** — rendu des patch notes en MDX

## Lancer en dev

```bash
pnpm install
pnpm dev    # http://localhost:3000
```

## Scripts

```bash
pnpm dev      # Serveur de dev avec hot-reload
pnpm build    # Build de production
pnpm start    # Serveur de production
pnpm lint     # ESLint
```

## Structure

```
src/
├── app/
│   ├── page.tsx           # Page d'accueil
│   ├── layout.tsx         # Layout racine
│   ├── globals.css        # Styles globaux
│   └── patch-notes/       # Section patch notes
├── components/            # Composants reutilisables
├── features/              # Modules fonctionnels
└── lib/                   # Utilitaires
```
