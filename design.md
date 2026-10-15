# SaaS Demo UI Design System Rules

## 1. Core Typography
* **Primary Display & Body Font:** `Geist Mono`, monospace.
* **Fallback Stack:** `SFMono-Regular`, `Consolas`, `Liberation Mono`, `Menlo`, monospace.
* **Styling Rules:** 
  * Keep all text tracking (letter-spacing) tight or neutral. Do not use wide letter-spacing.
  * Use strictly lowercase for UI labels (e.g., `submit`, `live metrics`, `settings`) to reinforce a technical, human-crafted engineering aesthetic.

## 2. Color Palette & Theming (Anti-AI Fingerprint)
* **Forbidden Elements:** No purple-to-indigo gradients, no multi-color mesh gradients, and no neon glowing borders.
* **Theme:** High-contrast Monochrome Utilitarian.
  * `Background`: Pure white `#FFFFFF` or slate-black `#0A0A0A`.
  * `Surface/Cards`: Neutral slate `#F4F4F5` (Light) or `#18181B` (Dark).
  * `Text Primary`: `#09090B` (Light) or `#FAFAFA` (Dark).
  * `Text Secondary`: `#71717A` (Light) or `#A1A1AA` (Dark).
  * `Accent/Action`: Deep Cobalt `#0025FF` or Crimson `#E11D48` used sparingly (maximum 5% visual real estate).

## 3. Layout Rhythm & Structure
* **Anti-Card Constraint:** Do not structure feature lists using grids of uniform rounded rectangles with top-centered icons.
* **Alternative Structures:**
  * Use **bento grids** with highly asymmetric column spans (e.g., 1/3 and 2/3 splits) where panels contain raw code outputs, data visuals, or terminal outputs instead of static paragraphs.
  * Separate sections using clean, thin structural lines (`border-1px` in slate/zinc) instead of heavy box shadows.
  * Keep all borders sharp or slightly rounded (`border-radius: 4px` or `6px` maximum). Absolutely no pill-shaped (`rounded-full`) layouts for containers.

## 4. Reactivity & State Changes
* **Micro-interactions:** 
  * Buttons must use an active push state (`active:scale-[0.98] transition-transform`).
  * Hover states must swap colors sharply (`duration-150`), avoiding sluggish fades.
* **Dynamic Feed Elements:** 
  * Include an interactive command menu (`Cmd+K`) mock interface.
  * Implement live-updating chart animations or pseudo-terminal streams to prove the page is a functioning runtime interface rather than static mock vectors.
* **Component Framework:** Tailored for dynamic rendering via React/Next.js using Tailwind CSS utility primitives.
