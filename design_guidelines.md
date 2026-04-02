# StackMate Go - Design Guidelines

## Design Approach

**System Foundation:** Dark theme dashboard inspired by Linear + Discord + poker aesthetics  
**Core Principle:** Information density with breathing room, professional gaming aesthetic

## Typography

**Families:**
- Primary: Inter (headings, labels, UI) via Google Fonts
- Monospace: JetBrains Mono (stats, numbers, chips counts)

**Scale:**
- Page title: text-3xl, font-bold
- Section headers: text-xl, font-semibold  
- Card titles: text-lg, font-medium
- Stats/numbers: text-2xl to text-4xl, font-bold, monospace
- Body text: text-sm to text-base
- Labels/meta: text-xs, uppercase tracking-wider

## Layout System

**Spacing Primitives:** Use Tailwind units of 3, 4, 6, 8, 12, 16  
**Container:** max-w-7xl, px-6, mx-auto  
**Grid System:** grid-cols-1 md:grid-cols-2 lg:grid-cols-3 for card layouts, gap-6

## Component Library

### Dashboard Cards
**Structure:** Rounded corners (rounded-xl), subtle borders, glass-morphism effect with backdrop blur  
**Padding:** p-6 for cards  
**Elevation:** Layered depth with subtle shadows and border treatments

### Stats Display
**Format:** Large numbers in monospace, small labels above, use flex/grid for multi-stat cards  
**Grouping:** 2-4 stats per card, equal spacing between items

### Progress Indicators
**Linear Progress:** Horizontal bars with gradient fills, showing chip stacks/tournament progression  
**Circular Progress:** For win rates, ROI percentages  
**Labels:** Always show current/total values beside bars

### Activity Feed
**Layout:** Vertical timeline with icons, timestamp on right, event description on left  
**Items:** py-3 spacing, border-b dividers between entries  
**Icons:** Use Heroicons (trophy, user-group, currency-dollar, chart-bar)

### Player Highlights Section
**Grid:** 2-column on desktop (lg:grid-cols-2), featuring top performers  
**Cards:** Include player avatar placeholder, rank badge, key stats (wins, earnings, ROI)

## Layout Structure

**Page Header:** Full-width bar with season title, date range, navigation tabs (Overview, Leaderboard, Tournaments)

**Grid Layout:**
```
Row 1: 3-column stat cards (Total Players, Active Tournaments, Prize Pool)
Row 2: 2-column split (Tournament History table + Top Players list)
Row 3: Full-width Recent Activity Feed
Row 4: 3-column Player Highlights cards
```

**Responsive Breakpoints:**
- Mobile: Single column stack
- Tablet (md): 2-column grid
- Desktop (lg): 3-column grid where specified

## Visual Elements

**Accent Colors (described without color names):**
- Success indicators: positive trends, wins
- Warning indicators: low chip counts, eliminations  
- Neutral: general stats, backgrounds

**Iconography:** Heroicons via CDN - solid style for stats, outline for navigation  
**Poker Elements:** Card suit symbols (♠ ♥ ♦ ♣) as decorative elements in headers, chip stack icons for currency displays

## Images

**No large hero image required** - this is an app dashboard view, not marketing page

**Avatar Placeholders:**
- Player profile images in highlights cards (40px × 40px circular)
- Tournament badges/logos in activity feed (32px × 32px)
- Use consistent placeholder styling with initials fallback

## Data Visualization

**Charts:** Use Chart.js or Recharts for line graphs (season performance trends) and bar charts (tournament buy-in distribution)  
**Tables:** Sticky headers, zebra striping on rows, hover states for interactivity  
**Badges:** Rounded-full pills for player ranks, tournament status

## Interactions

**Hover States:** Subtle lift on cards (transform scale), brightness increase on table rows  
**Loading States:** Skeleton screens matching card structures  
**Empty States:** Centered message with relevant icon, helpful CTA

## Key Design Patterns

**Information Hierarchy:** Stats > Tables > Activity Feed  
**Scanability:** Use borders, spacing, and typography weight to create clear sections  
**Density:** Comfortable spacing - not cramped, not sparse  
**Poker Aesthetic:** Dark surfaces, subtle gradients, professional gaming feel without being garish