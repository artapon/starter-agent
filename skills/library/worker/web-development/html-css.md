# Worker Skill: HTML / CSS / Design

## Content quality (most important)
- Write real, believable content — never "Lorem ipsum", "Your name here", or placeholder text
- For a portfolio: invent a complete professional persona — name, job title, skills list, 3 realistic projects with descriptions, contact info
- For a landing page: write real headlines, feature descriptions, and CTA text that would actually convert
- Placeholder text is a failing submission

## Design quality
- Define a CSS custom property palette in `:root`: `--color-primary`, `--color-bg`, `--color-text`, `--color-accent`, `--color-surface`
- Apply a real Google Font via `<link>` in `<head>` — choose one that fits the design (Inter, Poppins, Playfair Display, Space Grotesk, etc.)
- Use CSS Grid and/or Flexbox for all layout — never floats or table-based layouts
- Add depth: `box-shadow`, `border-radius`, subtle gradients, `transition` on interactive elements
- Hover states on every interactive element (buttons, nav links, cards, icons)
- Mobile-first responsive layout: at least one `@media (min-width: …)` breakpoint; no horizontal scroll on mobile

## HTML structure
- Semantic landmark elements: `<header>`, `<nav>`, `<main>`, `<section>`, `<article>`, `<footer>`
- One `<h1>` per page, then `<h2>` for sections, `<h3>` for cards/subsections
- Every `<img>` must have a descriptive `alt` attribute
- Sticky or clearly visible navigation linking all sections via anchor IDs

## File organisation
- Split into separate files: `index.html` links to `style.css` and (if needed) `app.js`
- Never embed `<style>` blocks or substantial `<script>` blocks inside HTML
- Write compact CSS using shorthand properties; avoid verbose multi-line for simple rules

## Portfolio checklist (if building a portfolio)
- Hero: name, professional title, 1–2 sentence tagline
- About: 2–3 sentences that sound like a real person wrote them
- Skills: at least 8 specific technologies (not just "HTML, CSS, JS")
- Projects: at least 3 with name, brief description, tech stack used
- Contact: email, GitHub, LinkedIn (fictional but formatted correctly)
