# ADR-0004: Hand-written CSS design system instead of Tailwind

**Status:** accepted · 2026-11-03

## Context

The brief suggests Tailwind with a shadcn-style system. The product is a dense scientific
workstation with charts, tables, numerical readouts and a strict semantic colour contract.
It also needs to ship as a static bundle with predictable asset size.

## Decision

`packages/ui/src/styles.css` defines design tokens (colour, typography, spacing, radii, focus,
motion) and component classes. Components in `packages/ui/src/index.tsx` are typed React
primitives using those classes. The web app adds only layout-specific CSS.

## Consequences

- No build-time content scanning across workspace packages, which avoids a class of
  "styles missing in production" failures.
- Design tokens are readable and themeable (`[data-theme="light"]`).
- Slightly more CSS is authored by hand; every new component must reuse tokens.
- Tailwind can still be introduced later for app-level layout without rewriting the primitives.

## Colour semantics

- cyan/teal: active selection and primary action;
- amber: warnings, uncertainty, reduced reliability;
- red: errors and destructive actions only;
- status is always accompanied by a text label, never colour alone.

## Alternatives rejected

- **Tailwind + shadcn/ui**: extra dependency surface, scanning complexity for workspace packages,
  and the default visual language fights the "scientific instrument" brief.
- **CSS-in-JS runtime**: bundle and performance cost for a static scientific tool.
