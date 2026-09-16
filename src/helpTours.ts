import type { TourId } from "./helpProgress";
export type TourStep = {
  title: string;
  text: string;
  target: string;
  article: string;
  createStep?: number;
  studioView?: "arrange" | "score" | "notation" | "mix" | "analyze";
};
export const tours: Record<TourId, { title: string; steps: TourStep[] }> = {
  home: {
    title: "Find your way around",
    steps: [
      {
        title: "Three ways to enjoy music",
        text: "Creation makes and edits songs. Listen plays your saved music. Radio makes a live stream of temporary songs. Switching modes keeps your project available.",
        target: '[data-help="creation-modes"]',
        article: "start",
      },
      {
        title: "Your collection starts here",
        text: "Library keeps projects, songs and favorites together. Start a new song, open an existing project, or import your own audio. An empty Library is normal on a new workstation.",
        target: ".collection-header",
        article: "library",
      },
      {
        title: "A project can grow with you",
        text: "Create is the guided song workflow. Studio opens the same project for detailed editing. Visuals makes covers and videos. On a phone, Open Studio is under More.",
        target: '[data-help="workspaces"]',
        article: "studio",
      },
      {
        title: "Downloads, backups and help",
        text: "Workstation tools manages optional models and backups. The book button opens this handbook and lets you replay a tour. Start with Create when you are ready to make your first song.",
        target: '[data-help="creation-help"]',
        article: "models",
      },
    ],
  },
  create: {
    title: "Make your first song",
    steps: [
      {
        title: "One song, four small steps",
        text: "Sound → Words → Performance → Listen. This tour shows the controls without filling your fields or starting a generation. You can go back and change any step later.",
        target: ".create-steps",
        article: "first-song",
        createStep: 0,
      },
      {
        title: "Describe what you want to hear",
        text: "Name the genre, mood, instruments and how the song should build. For example: warm acoustic folk, an intimate verse and a big hopeful chorus. Enhance opens a draft for you to review.",
        target: ".music-description",
        article: "prompts",
        createStep: 0,
      },
      {
        title: "Give the song its words",
        text: "Write plain lyrics or ask the lyric assistant for a draft. Section buttons add verses and choruses. Review a draft before using it. Choose Instrumental if you want music without singing.",
        target: ".simple-lyrics, .guide-stage",
        article: "lyrics",
        createStep: 1,
      },
      {
        title: "Choose a performance",
        text: "Pick a vocal direction and rendering preset. Standard is recommended; more processing does not guarantee a better take. More takes give you more performances to compare and use more generation time. Keep Advanced controls closed for a first song.",
        target: ".guide-stage .simple-options, .guide-stage",
        article: "generation",
        createStep: 2,
      },
      {
        title: "Generate when you are ready",
        text: "Generate queues the song on your Runpod GPU. An optional model asks for download approval first. Follow Queue for progress; you can keep using the app. This tour never presses Generate.",
        target: ".guide-forward, .guide-footer",
        article: "models",
        createStep: 2,
      },
      {
        title: "Find the take you love",
        text: "Finished takes appear here. Play and compare them, choose a favorite, then download, open Studio, or make artwork and a music video. Results stay with this project.",
        target: ".listening-desk, .listen-guide",
        article: "takes",
        createStep: 3,
      },
      {
        title: "Your next step is yours",
        text: "The project toolbar holds Queue, Files, version history and Export. Create, Studio and Visuals share the same project. Closing this tour returns you to the creation step you were using.",
        target: '[data-help="project-actions"]',
        article: "files",
        createStep: 3,
      },
    ],
  },
  studio: {
    title: "Meet the workstation",
    steps: [
      {
        title: "The same song, more control",
        text: "Studio edits your current project. Returning to Create preserves advanced arrangements and mixes. This tour changes editor views only; it does not edit clips, notes or settings.",
        target: ".workspace-tabs",
        article: "studio",
        studioView: "arrange",
      },
      {
        title: "Arrange your audio",
        text: "Tracks run across the timeline. Select clips to move, trim, split or fade them. Edits refer to the original audio, so trimming a clip does not erase the source recording.",
        target: ".studio-main",
        article: "arrange",
        studioView: "arrange",
      },
      {
        title: "Shape the notes",
        text: "Select a note or instrument clip to work in Piano Roll. Add and move notes, resize their lengths and adjust velocity. The project browser and inspector can be opened from the editor toolbar.",
        target: ".studio-main",
        article: "score",
        studioView: "score",
      },
      {
        title: "Inspect YuE2's score",
        text: "Score exposes ABC notation and score tools. Review generated notation, edit it and deliberately use a score for another generation. A score edit does not silently replace an existing take.",
        target: ".studio-main",
        article: "score",
        studioView: "notation",
      },
      {
        title: "Balance the mix",
        text: "Use channel faders, pan, mute and solo to balance tracks. Effects and automation shape the sound. Keep room below clipping on the master and audition changes before exporting.",
        target: ".studio-main",
        article: "mix",
        studioView: "mix",
      },
      {
        title: "Check, then export",
        text: "Analyze helps inspect the audio. Export offers the supported browser or server renderer and reports compatibility issues. Your original generation, edited mix and master remain separate versions.",
        target: ".studio-main",
        article: "export",
        studioView: "analyze",
      },
    ],
  },
  visuals: {
    title: "Give music a visual world",
    steps: [
      {
        title: "Visuals belongs to your song",
        text: "Artwork, cover designs, lyric timing and videos live in the current project. The tabs divide those jobs so you can work on one thing at a time.",
        target: ".visuals-tabs",
        article: "visuals",
      },
      {
        title: "Artwork first, typography afterward",
        text: "In Artwork, build an editable prompt from the song or write your own. Optional image models ask before downloading. Use Cover designer to add clean title and artist text afterward.",
        target: ".visuals-heading",
        article: "artwork",
      },
      {
        title: "Timing makes lyrics come alive",
        text: "Lyric timing aligns the selected song, then lets you correct lines, words and duet roles. Review uncertain timings before relying on karaoke highlighting. Missing timing is never made up.",
        target: ".visuals-tabs",
        article: "timing",
      },
      {
        title: "Make a video, keep the originals",
        text: "Music video offers a simple workflow and advanced composition controls. Start with a preview, then render the full video through the queue. Audio and previous artwork remain separate assets.",
        target: ".visuals-workspace",
        article: "video",
      },
    ],
  },
  listen: {
    title: "Settle into Listen",
    steps: [
      {
        title: "A room for your saved music",
        text: "Listen plays songs from your Library. Open Library here to choose a song. If the list is empty, generate a song in Creation or import audio first.",
        target: ".listen-library-toggle",
        article: "listen",
      },
      {
        title: "Artwork or synchronized lyrics",
        text: "Show lyrics swaps the artwork for lyrics while keeping playback controls. Tap it again to return. Timed lyrics follow the song; without alignment, open Lyric timing in Visuals first.",
        target: ".listening-lyrics-toggle",
        article: "timing",
      },
      {
        title: "Keep listening while you explore",
        text: "Use the player for playback, volume and your listening queue. Favorites help you find good takes. Song options can open that exact song in Studio for editing.",
        target: ".listening-record-tools, .listening-record",
        article: "library",
      },
      {
        title: "Come back to creating anytime",
        text: "Creation returns to the workstation. Radio is a different experience: a live station with temporary music and no skipping. Opening this handbook does not stop your song.",
        target: '[data-help="listen-modes"]',
        article: "radio",
      },
    ],
  },
  radio: {
    title: "Tune your own Radio",
    steps: [
      {
        title: "A station made from your idea",
        text: "Describe a genre, mood or setting. Radio writes original lyrics and generates songs on the same YuE2 GPU. Its first song needs time to prepare; later songs are made in the background.",
        target: ".radio-tune, .radio-now",
        article: "radio",
      },
      {
        title: "Choose the language deliberately",
        text: "Choose the requested lyric language explicitly. It guides the words and singing; pronunciation is not verified. Vocal direction, rendering preset and target length guide the station. Results can vary.",
        target: ".radio-settings, .radio-station",
        article: "radio-settings",
      },
      {
        title: "Save the station's sound",
        text: "Saved stations keeps a name and all generation settings. Loading one fills a direction for review before you apply it. The generated songs stay temporary and never fill your Library.",
        target: ".radio-presets",
        article: "radio-settings",
      },
      {
        title: "Change direction without starting over",
        text: "During a live session, Adjust station can turn J-pop into jazz or classical. The current song continues while unfinished obsolete work is cancelled and the new direction prepares.",
        target: ".radio-station, .radio-start",
        article: "radio",
      },
      {
        title: "Live means the clock keeps moving",
        text: "There is no pause, seek or skip. Mute silences your device. Closing the tab does not stop the server station or its GPU work. Use Stop Radio to end it; Join live reconnects if the browser needs a tap.",
        target: ".radio-footer, .radio-start",
        article: "radio",
      },
    ],
  },
};
