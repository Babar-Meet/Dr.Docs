# Midnight Orange Design System

## Overview

Midnight Orange is a high-contrast, dark-first interface system built around deep black surfaces, bright orange actions, and clean white typography. It takes inspiration from the visual language of bold internet platforms: dense layouts, strong CTA hierarchy, compact controls, dark content surfaces, and orange as the primary interaction signal.

The system is intentionally brand-neutral. It does not use any existing company logo, wordmark, proprietary artwork, trademarked shapes, or distinctive brand assets.

The aesthetic is confident, energetic, utilitarian, and slightly aggressive without becoming visually complicated.

The interface should feel like a serious digital product rather than a polished corporate dashboard.

---

## Colors

- **Ink Black** (#0B0B0B): Primary application background
- **Deep Black** (#141414): Secondary background and navigation surfaces
- **Panel Black** (#1C1C1C): Cards, menus, dialogs, and content panels
- **Elevated Black** (#242424): Hovered cards and elevated controls
- **Border Dark** (#333333): Default borders and separators
- **Border Strong** (#454545): Focused or emphasized borders
- **White** (#FFFFFF): Primary text and high-contrast content
- **Off White** (#E8E8E8): Secondary text
- **Muted Gray** (#A0A0A0): Metadata, helper text, timestamps
- **Orange** (#FF9900): Primary brand-independent accent and CTA color
- **Orange Dark** (#E67E00): Pressed and darker orange state
- **Orange Soft** (#FFB84D): Secondary orange highlight
- **Success** (#22C55E): Success state
- **Warning** (#F59E0B): Warning state
- **Error** (#EF4444): Error state
- **Info** (#3B82F6): Informational state

### Color Rules

Orange is the primary action color.

Do not use orange for every element.

Orange should identify:
- Primary actions
- Active navigation
- Selected tabs
- Progress
- Important numbers
- Focus indicators
- Key interactive states
- Small visual highlights

White is for content.

Black is for structure.

Gray is for hierarchy.

---

## Typography

- **Headline Font:** Inter
- **Body Font:** Inter
- **Mono Font:** JetBrains Mono

Typography should be bold, compact, highly readable, and functional.

Avoid decorative typefaces.

### Type Scale

- **h1:** Inter 700, 48px, 1.05 line height
- **h2:** Inter 700, 36px, 1.1 line height
- **h3:** Inter 700, 28px, 1.15 line height
- **h4:** Inter 600, 20px, 1.2 line height
- **body:** Inter 400, 15px, 1.5 line height
- **small:** Inter 400, 13px, 1.4 line height
- **tiny:** Inter 400, 11px, 1.3 line height
- **label:** Inter 600, 12px, 1.2 line height
- **button:** Inter 700, 13px, 1.0 line height
- **mono:** JetBrains Mono 13px, 1.5 line height

### Typography Rules

- Use bold weights for navigation and actions.
- Keep body text neutral and compact.
- Use uppercase sparingly for labels and metadata.
- Do not use huge editorial typography for normal application UI.
- Numbers may use heavier weights when representing statistics.
- Avoid excessive letter spacing.

---

## Spacing

Base unit: 4px.

The system favors compact spacing with larger gaps only between major sections.

- **sp-1:** 4px
- **sp-2:** 8px
- **sp-3:** 12px
- **sp-4:** 16px
- **sp-5:** 20px
- **sp-6:** 24px
- **sp-7:** 32px
- **sp-8:** 40px
- **sp-9:** 48px
- **sp-10:** 64px
- **sp-11:** 80px

Use tighter spacing inside components and larger spacing between sections.

---

## Border Radius

Midnight Orange uses subtle rounding rather than completely rounded UI.

- **radius-none:** 0px
- **radius-sm:** 3px
- **radius-md:** 5px
- **radius-lg:** 8px
- **radius-pill:** 999px

Default components use **4-6px** radius.

Do not use excessive pill-shaped UI.

Pills are reserved for:
- Status indicators
- Tags
- Compact filters
- Small metadata

---

## Elevation

Dark surfaces provide most of the visual hierarchy.

Shadows are allowed but should remain subtle.

- **shadow-none:** none
- **shadow-sm:** 0 2px 6px rgba(0,0,0,0.25)
- **shadow-md:** 0 6px 18px rgba(0,0,0,0.35)
- **shadow-lg:** 0 12px 32px rgba(0,0,0,0.45)

Do not use glowing orange shadows as a default effect.

Orange glow may be used only for special emphasis.

---

## Components

### Buttons

Buttons are compact, bold, and action-oriented.

#### Primary

Orange (#FF9900) fill, black text, no heavy border, 5px radius.

Font: Inter 700, 13px.

Text should normally use concise action language.

Examples:
- Continue
- Start
- Submit
- Upgrade
- Create
- Save

Hover:
- background #FFB84D
- text #000000

Active:
- background #E67E00
- text #000000
- slight downward visual movement

Focus:
- 2px orange focus ring
- 2px offset

#### Secondary

Deep black or panel-black fill, white text, 1px #454545 border, 5px radius.

Hover:
- background #242424
- border #666666

Active:
- background #111111

#### Ghost

Transparent background, white or off-white text, no visible border.

Hover:
- background #242424
- text #FF9900

#### Destructive

Error (#EF4444) fill, white text, 5px radius.

Hover:
- background #DC2626

#### Sizes

- **Small:** 6px 12px, 12px font, 30px height
- **Medium:** 9px 16px, 13px font, 38px height
- **Large:** 12px 22px, 15px font, 46px height

#### Disabled

- Background #242424
- Text #666666
- Border #333333
- No opacity reduction on the entire component
- Disabled cursor

---

### Navigation

Navigation should be dark and compact.

- Background: #0B0B0B
- Text: #E8E8E8
- Height: 56-64px
- Bottom border: 1px #333333

Active navigation item:
- Orange text
- Orange bottom border or small orange indicator

Hover:
- Text becomes white
- Background becomes #1C1C1C

Do not make navigation oversized.

---

### Cards

#### Default

- Background: #1C1C1C
- Border: 1px #333333
- Radius: 6px
- Padding: 16px

#### Interactive

Hover:
- Background: #242424
- Border: #454545

#### Featured

- Background: #1C1C1C
- Border: 1px #FF9900
- Orange used only for important featured content

Do not give every card an orange border.

---

### Inputs

- Background: #141414
- Text: #FFFFFF
- Placeholder: #777777
- Border: 1px #454545
- Radius: 5px
- Font: Inter 14px
- Padding: 10px 12px

#### Default

1px #454545 border.

#### Hover

1px #666666 border.

#### Focus

1px #FF9900 border.

Orange focus ring:
- 2px
- 2px offset

#### Error

1px #EF4444 border.

#### Disabled

- Background: #1C1C1C
- Text: #666666
- Border: #333333

### Label

Inter 600, 12px.

White or off-white.

4px margin-bottom.

### Helper Text

Inter 12px.

Muted gray by default.

Error state uses #EF4444.

---

### Search

Search is a major interaction pattern.

- Background: #1C1C1C
- Border: 1px #454545
- Radius: 5px
- Height: 40-44px
- Text: #FFFFFF
- Placeholder: #777777

Focus:
- Orange border
- Subtle orange focus ring

Search buttons may use orange fill.

Search should feel immediately accessible without dominating the interface.

---

### Tabs

Tabs use simple text hierarchy rather than large containers.

Default:
- Text #A0A0A0
- Transparent background

Hover:
- Text #FFFFFF

Active:
- Text #FF9900
- 2px orange bottom border

Avoid large rounded tab containers.

---

### Chips

#### Filter Chip

- Background: #1C1C1C
- Text: #E8E8E8
- Border: 1px #454545
- Radius: 999px
- Padding: 5px 10px
- Font: 12px Inter 600

Hover:
- Border #FF9900
- Text #FF9900

Active:
- Background #FF9900
- Text #000000
- Border #FF9900

#### Status Chip

Small pill with semantic colors.

- **Success:** green text and border
- **Warning:** orange text and border
- **Error:** red text and border
- **Default:** gray text and border

Use status chips for state, not decoration.

---

### Lists

- Background: transparent
- Text: #E8E8E8
- Divider: 1px #333333
- Item padding: 12px 0

Hover:
- Background: #1C1C1C
- Text: #FFFFFF

Active:
- Background: #242424
- Left indicator: 3px #FF9900
- Text: #FFFFFF

Lists may contain icons when they improve navigation or recognition.

---

### Dropdowns

- Background: #1C1C1C
- Border: 1px #454545
- Radius: 5px
- Shadow: shadow-md

Items:
- Padding: 9px 12px
- Text: #E8E8E8

Hover:
- Background: #242424
- Text: #FFFFFF

Selected:
- Text: #FF9900

Do not use giant dropdown menus.

---

### Checkboxes

18px x 18px.

- Background: #141414
- Border: 2px #666666
- Radius: 3px

Checked:
- Background: #FF9900
- Border: #FF9900
- Black checkmark

Focus:
- Orange focus ring

Disabled:
- Border #333333
- Background #1C1C1C

---

### Radio Buttons

18px x 18px.

Circular shape.

Unchecked:
- Background #141414
- Border 2px #666666

Selected:
- Border 2px #FF9900
- Inner dot #FF9900

Focus:
- Orange focus ring

---

### Toggle

Track:
- Background #333333
- Radius: 999px

Active:
- Background #FF9900

Thumb:
- White
- Circular

Active thumb:
- Black or white depending on contrast requirements

Transition should be quick and subtle.

---

### Progress Bars

Track:
- Background #333333
- Height: 6px
- Radius: 999px

Progress:
- Background #FF9900
- Radius: 999px

Do not use gradients.

Orange should represent actual progress or completion.

---

### Tooltips

- Background: #FFFFFF
- Text: #000000
- Font: JetBrains Mono 12px
- Radius: 4px
- Padding: 7px 10px
- Shadow: shadow-sm
- Maximum width: 260px

Tooltips should remain compact and functional.

---

### Alerts

#### Success

- Background: #102318
- Border: 1px #22C55E
- Text: #86EFAC

#### Warning

- Background: #241A08
- Border: 1px #F59E0B
- Text: #FCD34D

#### Error

- Background: #250F0F
- Border: 1px #EF4444
- Text: #FCA5A5

#### Info

- Background: #0D1726
- Border: 1px #3B82F6
- Text: #93C5FD

---

## Icons

Use simple, functional icons.

Preferred style:
- Monochrome
- 16-20px
- Consistent stroke width
- No decorative illustrations

Icons should normally use:
- #A0A0A0 by default
- #FFFFFF on hover
- #FF9900 when active

Do not turn every icon orange.

---

## Tables

Tables should feel dense and utilitarian.

Header:
- Background: #141414
- Text: #FFFFFF
- Inter 600, 12px

Rows:
- Background: #0B0B0B
- Border-bottom: 1px #333333

Hover:
- Background: #1C1C1C

Important values:
- Use bold white
- Use orange only for values requiring emphasis

Avoid excessive cell borders.

---

## Content Density

Midnight Orange is intentionally more compact than a conventional corporate design system.

Prefer:

- More information per viewport
- Compact controls
- Strong hierarchy
- Clear section boundaries
- Dark surfaces
- Short labels
- Strong CTAs

Avoid:

- Huge empty spaces
- Excessive rounded cards
- Excessive shadows
- Decorative gradients
- Glassmorphism
- Neon everywhere
- Excessive animation

---

## Interaction

### Hover

Hover should be immediately visible.

Preferred changes:
- Background becomes lighter
- Text becomes brighter
- Border becomes stronger
- Orange appears on important interactive elements

Do not rely only on opacity changes.

### Focus

Focus must always remain visible.

Primary focus treatment:
- Orange border
- Orange 2px ring

Never remove focus indicators.

### Active

Active controls should feel physically pressed.

Use:
- Darker background
- Orange accent
- Slight positional movement where appropriate

### Loading

Use simple spinners or progress indicators.

Orange is the loading accent.

Avoid elaborate skeleton animations.

---

## Motion

Motion should be fast and functional.

- **Fast:** 100ms
- **Normal:** 160ms
- **Slow:** 240ms

Use ease-out for entering elements.

Use ease-in for dismissing elements.

Do not animate every hover.

Do not use excessive bouncing or elastic animations.

---

## Layout

The system works best with:

- Dark full-page backgrounds
- Compact top navigation
- Optional sidebar navigation
- Dense content grids
- Clear content panels
- Strong orange CTA hierarchy

Recommended content widths:

- **Small:** 640px
- **Medium:** 960px
- **Large:** 1200px
- **Wide:** 1440px

Desktop layouts may use 3-5 column grids depending on content.

Mobile layouts should collapse into 1-2 columns.

---

## Do's and Don'ts

1. **Do** use near-black as the foundation of the interface.
2. **Do** use bright orange as the primary action signal.
3. **Do** keep text highly readable with strong white/gray hierarchy.
4. **Do** make primary buttons immediately recognizable.
5. **Do** use compact spacing for application interfaces.
6. **Do** use subtle dark borders to separate surfaces.
7. **Do** use orange selectively rather than covering the entire interface with it.
8. **Do** use bold sans-serif typography.
9. **Do** keep interactions fast and obvious.
10. **Do** maintain strong contrast between interactive and non-interactive elements.
11. **Don't** copy an existing company's logo or wordmark.
12. **Don't** reproduce proprietary brand assets or illustrations.
13. **Don't** use the exact branded name of another product as your product identity.
14. **Don't** make every button orange.
15. **Don't** use orange text on white when contrast is insufficient.
16. **Don't** use excessive gradients.
17. **Don't** use glassmorphism.
18. **Don't** use giant rounded cards.
19. **Don't** turn every element into a pill.
20. **Don't** make the interface look like an imitation of one specific website.
21. **Don't** use decorative elements that do not improve usability.
22. **Don't** use animation simply because animation is possible.

---

## Theme Toggle

Dr.Docs ships Midnight Orange as default but allows user choice. All themes use the same layout, typography, spacing, and orange action (#FF9900). Only surface colors change.

- **Midnight Orange (default)** - `data-theme="midnight"` - Ink Black #0B0B0B, Panel #1C1C1C, Border #333333/#454545, White #FFFFFF. High-contrast dark-first.
- **Total White** - `data-theme="white"` - Ink White #FFFFFF, Panel #FFFFFF, Deep #F5F5F5, Border #E5E5E5/#D4D4D4, Text #18181B, Muted #71717A. Clean light, orange stays for primary actions only.
- **AMOLED Dark** - `data-theme="amoled"` - Ink Pure Black #000000, Panel #0A0A0A, Deep #000000, Border #1A1A1A/#2A2A2A, White #FFFFFF. Battery-friendly OLED, true black.

Implementation: CSS variables `--ink`, `--deep`, `--panel`, etc. defined in `client/src/index.css` for `:root`/`[data-theme="midnight"]`, `[data-theme="white"]`, `[data-theme="amoled"]`. Tailwind colors use `var(--ink)` etc. Toggle in `client/src/App.jsx` header cycles `midnight -> white -> amoled`, persists to `localStorage["dr-docs-theme"]`, and sets `document.documentElement[data-theme]` (also early script in `client/index.html` to avoid flash). All components keep `bg-ink`, `bg-panel`, `text-white` etc. - they resolve via variables. For white theme, `.text-white` is overridden to dark.

Do not remove Midnight Orange. It stays the canonical brand. White and AMOLED are alternatives for accessibility and OLED.

## Core Design Formula

**Black structure + white content + gray hierarchy + orange action.**

The interface should be recognizable as a dark, high-energy, orange-accented product without depending on any existing company's visual assets.

If the design starts looking too colorful, remove colors.

If everything looks equally important, increase the contrast between black, white, gray, and orange.

If the interface starts looking too polished or corporate, simplify the components and increase content density.