# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a personal development blog built with Next.js 14, deployed as a static site to GitHub Pages. The blog is written in Korean and focuses on software engineering topics including architecture, design patterns, and technical retrospectives.

## Common Commands

### Development
```bash
npm run dev          # Start development server on http://localhost:3000
npm run build        # Build static site (output to ./out/)
npm run start        # Start production server (not used for GitHub Pages)
npm run lint         # Run Next.js linter
```

### Deployment
- Automatic deployment via GitHub Actions on push to `master` branch
- Build output directory: `./out/`
- No manual deployment needed - pushing to master triggers the workflow

## Architecture

### Static Site Generation
- Configured with `output: 'export'` in next.config.js for static export
- All pages are pre-rendered at build time
- Images are unoptimized (`images.unoptimized: true`) for static hosting

### Content Management
- Blog posts are markdown files in `/posts/` directory
- Post filename format: `YYYY-MM-DD-title.md` (date is extracted from filename)
- Posts are sorted by date in descending order (newest first)

### Post Metadata (Frontmatter)
```yaml
---
layout: post
toc: true
title: "Post Title"
categories: category-name
tags: [tag1, tag2]
author:
  - Author Name
---
```

### Core Library (`src/lib/posts.ts`)
Central module for all post operations:
- `getAllPosts()` - Returns sorted list of all posts with metadata
- `getPostBySlug(slug)` - Fetches single post with HTML content
- `getAllCategories()` - Returns categories with post counts
- `getAllTags()` - Returns tags with post counts
- `getPostsByCategory(category)` - Filters posts by category
- `getPostsByTag(tag)` - Filters posts by tag

### Markdown Processing Pipeline
Posts are processed through a remark/rehype pipeline:
1. `remark-gfm` - GitHub Flavored Markdown support
2. `remark-rehype` - Convert markdown to HTML
3. `rehype-slug` - Auto-generate heading IDs for TOC
4. `rehype-highlight` - Syntax highlighting for code blocks
5. `rehype-stringify` - Convert to HTML string

### Routing Structure
- `/` - Home page listing all posts
- `/posts/[slug]` - Individual post page
- `/categories` - All categories page
- `/categories/[category]` - Posts filtered by category
- `/tags` - All tags page
- `/tags/[tag]` - Posts filtered by tag

### Key Components
- `TableOfContents` - Client-side component that extracts headings from rendered post and provides navigation with scroll tracking
- `ThemeProvider` - Dark/light theme toggle with localStorage persistence and system preference detection
- `Header` / `Footer` - Standard layout components

### Styling
- Global styles in `src/styles/globals.css`
- Post-specific styles in `src/styles/post.css`
- Code syntax highlighting in `src/styles/highlight.css`
- Font: Pretendard Variable (Korean) + JetBrains Mono (code)
- Theme system uses CSS custom properties with `data-theme` attribute

## Important Notes

### Static Export Considerations
- No server-side APIs or API routes
- All data fetching happens at build time
- Dynamic routes must be defined in `generateStaticParams()`
- Korean filenames/URLs are URL-encoded when used in routes

### Post Slugs
- Slugs are derived from filenames without `.md` extension
- Korean characters in filenames are decoded when reading files (`decodeURIComponent`)
- URLs use encoded versions for routing

### Path Aliases
- `@/*` maps to `src/*` (configured in tsconfig.json)
