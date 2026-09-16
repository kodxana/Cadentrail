# Handbook and tours

Open **Guide** for a searchable handbook and optional tours. The welcome screen offers **Show me around after I choose**; uncheck it to enter directly. Existing users can start or replay tours from Guide.

## Using it

- The **Guide** book button is present in Creation, Studio, Visuals, Listen and Radio. **F1** opens context-appropriate help when another dialog is not active.
- The handbook includes workflow instructions, model/download explanations, troubleshooting and a small glossary. Search examines titles, keywords and chapter content; related chapters and previous/next controls support reading it as a book.
- **Start tour**, **Resume tour**, **Start over** and **Replay tour** apply to the current workspace. Each tour highlights real controls and links to a relevant full chapter.
- Tours can be paused with **Finish later**, the close button or Escape. Left/right arrows move between steps. Completion and progress stay in this browser and survive a reload; a reload does not automatically reopen the tour.
- Create temporarily displays its four steps, then returns to the original step. Studio temporarily opens its editor tabs and restores the original editor. Project content, generation settings and audio are not changed by a tour.
- A missing control or an empty Library does not crash the guide. The explanation stays available without fabricated example results.
- Mobile uses a contents/article switch and a bottom tour panel. Desktop places explanations beside or below the highlighted area. Reduced motion disables spotlight movement. Native dialogs contain keyboard focus; the handbook also works inside fullscreen Listen.

## Implementation and boundaries

`src/helpContent.ts` holds typed chapter content and search. `src/helpTours.ts` holds selectors, explanations and permitted editor steps. `src/helpProgress.ts` validates browser-local progress. `HelpProvider` coordinates the lazy-loaded handbook and tour overlay through React context; it does not introduce new backend routes, models or services.

Handbook content ships in the frontend image. Reading it does not require an external documentation service or an AI provider. The static chunk must still be loaded from the workstation on first open; this is not a new offline/PWA mode.

Tour navigation never approves downloads, submits jobs or edits project data. First-run selection of Creation or Studio uses the app's existing project-opening behavior. Starting a project from that welcome choice remains separate from the tour itself. Existing playback continues while help is open; a server Radio session is not stopped by the guide.

The handbook describes implemented workflows. Exact generation quality, duration, singer identity and word timing remain model-dependent. Help is guidance, not a claim that these outputs are guaranteed.
