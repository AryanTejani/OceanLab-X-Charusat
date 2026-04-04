This is exactly what we need to elevate the platform. You have built a highly functional backend—integrating Stream SDK, Deepgram live transcription, and SSE streaming for Gemini is no small feat! However, looking at the code, the UI currently feels "tacked on." The components are floating arbitrarily, overlapping each other, and relying on basic CSS classes that don't convey the premium, "trusted AI" feel you are aiming for.

Here is your detailed, actionable Design & Refactoring Document to transition from the current state to a high-end "Minimalist Core + Liquid Glass" architecture.

---

# 🛠️ UI/UX Refactoring Blueprint: MeetingInsight

## Phase 1: System Foundation (Tailwind & CSS Cleanup)

Your current styling is fighting itself. You are using Tailwind, but your `globals.css` is full of hardcoded hex colors (like `#1c1f2e` and `#19232d`) and your `tailwind.config.ts` lacks the gradients and blur utilities needed for modern SaaS design.

**1. Revamp `tailwind.config.ts`**
* **Action:** Replace the basic `blue.1` and `dark.1` with a cohesive, modern palette. Add the animation keys required for the "wow factor."
* **Implementation:**
    ```typescript
    // Inside theme.extend
    colors: {
      brand: {
        bg: '#0A0A0B',      // Replaces dark-1
        surface: '#161618', // Replaces dark-2
        border: '#27272A',
        violet: '#8B5CF6',  // AI Primary
        cyan: '#06B6D4',    // AI Secondary
      }
    },
    backgroundImage: {
      'glass-gradient': 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%)',
      'ai-glow': 'radial-gradient(circle, rgba(139,92,246,0.15) 0%, rgba(10,10,11,0) 70%)',
    },
    ```

**2. Clean up `globals.css`**
* **Action:** Remove the custom `.glassmorphism` and `.show-block` CSS classes entirely. Tailwind handles this better natively with `backdrop-blur-md bg-white/5`.
* **Action:** Target the Stream SDK overrides to match your new `brand.bg` instead of the hardcoded `#1c1f2e`.

---

## Phase 2: The Meeting Room Architecture (`MeetingRoom.tsx`)

Currently, `MeetingRoom.tsx` places the video grid in the center, and the Transcript/QnA panels just float absolutely on top of it (`fixed right-4 top-20` and `fixed bottom-6 right-6`). This is messy and blocks the video.

**1. Implement a Responsive Grid Layout**
* **Action:** Stop using absolute positioning for sidebars. Use a CSS Grid or Flexbox container that physically shrinks the video stage when the AI sidebars open.
* **Structure:**
    * `w-full h-screen flex bg-brand-bg`
    * **Left:** Video container (`flex-1 transition-all duration-300`).
    * **Right:** The "AI Brain" sidebar (`w-96 border-l border-brand-border backdrop-blur-xl bg-glass-gradient`).

**2. Redesign the Call Controls Dock**
* **Current State:** Buttons sit at the bottom with hardcoded gray backgrounds (`bg-[#19232d]`).
* **New Design:** Create a floating "macOS-style" dock.
    * Use `absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 px-6 py-3 rounded-full backdrop-blur-md bg-white/10 border border-white/10 shadow-2xl`.
    * Apply Framer Motion `whileHover={{ scale: 1.05 }}` to individual buttons.

**3. Replace the Blocking "Saving" State**
* **Current State:** A full-screen dark overlay with a spinner `div className="absolute inset-0 z-50 flex flex-col... bg-dark-1/90 gap-3"`. This feels jarring.
* **New Design:** Use the `sonner` library. When a user clicks end call, slide a sleek, glowing toast notification in from the bottom right: *"✨ Extracting Business Insights..."* while routing them to the insights page.

---

## Phase 3: The "AI Brain" Sidebar (Merging Transcription & QnA)

Currently, `TranscriptionPanel.tsx` and `QnAChatbot.tsx` are completely separate floating elements that can overlap and clutter the screen.

**1. Create a Unified Panel**
* **Action:** Merge them into a single, unified right-hand sidebar.
* **Design:** Use a segmented control (Tabs) at the top of the sidebar to toggle between **"Live Transcript"** and **"AI Q&A"**. This is how professional tools like Fireflies.ai or Otter.ai handle it.

**2. Elevate the Live Transcript (`TranscriptionPanel.tsx`)**
* **Current State:** Basic map rendering `receiver.items.map(...)`. When new text arrives, it just appears abruptly.
* **New Design:** Wrap the map in Framer Motion's `<AnimatePresence>`.
    * Animate new items: `initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}`.
    * For the `entry.isFinal === false` state (the active listening state), instead of a standard `animate-pulse` text, use a subtle Aceternity `TextGenerateEffect` or a smooth liquid gradient text color to show it's "processing."

**3. Elevate the QnA Chatbot (`QnAChatbot.tsx`)**
* **Current State:** Basic blue chat bubbles (`bg-blue-600`) and dark gray bubbles (`bg-dark-2`).
* **New Design (Liquid Glass):**
    * **User Bubbles:** Sleek, minimalist border with a very subtle white background (`bg-white/5 border border-white/10`).
    * **AI Bubbles:** Remove the bubble background entirely. Let the AI text flow directly on the sidebar. When the SSE stream is active (`isStreaming === true`), render a soft glowing `brand-violet` to `brand-cyan` gradient behind the text block to make it feel alive.

---

## Phase 4: Micro-Interactions (The "Wow" Factor)

To make the UI feel expensive and trusted, you need to replace standard web behaviors with fluid interactions.

1.  **The "Active Bot" Indicator:** In `TranscriptionPanel.tsx`, you have a basic `w-2 h-2 bg-green-400 rounded-full animate-pulse` for the live status. Upgrade this using Aceternity's **Moving Border** component around the entire "Live Transcript" header to give it a high-tech recording feel.
2.  **Scrollbars:** Hide the default clunky browser scrollbars in your panels. Use Tailwind's `scrollbar-hide` plugin or style them to be 2px wide, semi-transparent tracks.
3.  **Chat Input:** In the QnA Chatbot, the input `input bg-dark-2 border-dark-3 focus:border-blue-500` is standard. Upgrade it to a "Glass Input": `bg-transparent border-white/10 focus:border-brand-violet ring-0`. Add a `Magic UI` animated glow effect to the Send button.