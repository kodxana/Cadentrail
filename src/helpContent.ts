export type Chapter = {
  id: string;
  group: string;
  title: string;
  summary: string;
  keywords: string;
  sections: {
    title: string;
    paragraphs?: string[];
    steps?: string[];
    tip?: string;
  }[];
  related: string[];
};
export const chapters: Chapter[] = [
  {
    id:"agents", group:"Start here", title:"Bring your own agent",
    summary:"Connect the assistant you already use and get help with your music.",
    keywords:"agents bring your own Codex Claude setup connect assistant permissions access token music tasks reconnect Runpod",
    related:["integrations","first-song","models"],
    sections:[
      {title:"Start with Agents",steps:["Open the visible Agents button in Creation, Listen or Radio.","Choose Codex, Claude Code or another compatible MCP agent.","Choose access to create a named token, then follow Set up to connect it. API documentation and detailed permissions remain in the separate setup area.","Use Back to Agents to return to your guide. Choose a starting task, add your direction, copy it and paste it into your connected assistant."]},
      {title:"Use your current project",paragraphs:["Task requests can include the current project name and ID. The agent reads the saved project through its connection; the copied request does not embed your lyrics or media.","Save current edits before copying a task for that project. Instrumental projects offer arrangement help instead of lyric writing.","Your agent works in its own app. Accepted work appears in Cadentrail's existing queue, projects and Library. Copying a request does not run it."]},
      {title:"Manage and reconnect",paragraphs:["My connections shows granted access and the last request time, not whether an agent is online. Manage access opens the existing token controls.","Reconnect uses the Runpod skills and offline recovery kit when a Pod replacement changes the MCP address. It keeps the connection name and token settings.","Agents have the model and export limits shown in Cadentrail. Browser playback and some advanced Studio operations still require the app."]}
    ]
  },

  {
    id: "integrations", group: "Workstation care", title: "API & agent integrations",
    summary: "Connect Codex, Claude Code or your own tools to the same projects and queue.",
    keywords: "API MCP agents automation integration OpenAPI tokens permissions Codex Claude developer Runpod skills companion Pod GPU",
    related: ["agents", "access", "models", "first-song"],
    sections: [
      {title:"Connect an assistant", steps:["Open the code-brackets button in Creation, Listen or Radio to open API & Integrations.","In Access tokens, name your connection, choose its permissions and expiry, then create the token. Save it privately; it is shown once.","Set CADENTRAIL_TOKEN in your agent's environment and follow the Connect example. MCP uses the same HTTPS address and application port.","Read the Agent guide before starting creative work. API reference lists live endpoints and data schemas."]},
      {title:"Pair with Runpod skills", paragraphs:["The Runpod section in API & Integrations links to the official skills and tool setup, offers a downloadable cadentrail-runpod companion skill, and builds an editable agent brief for this workstation.","Runpod tools manage Pods and storage. Cadentrail MCP manages creative work. The connections use separate credentials; Cadentrail never needs your Runpod API key. Installation is performed in your agent, not inside the music workstation.","The default starter brief repairs the Cadentrail MCP URL after a Pod replacement. Runpod skills discover the current Pod and match the persistent workstation identity; the agent keeps the existing connection name and token settings. Download the reconnect kit to retain these instructions and the identity locally even when the old endpoint is offline."]},
      {title:"Know what a token permits", paragraphs:["Permissions apply to every project on this workstation. Read access includes lyrics and media. Tokens cannot manage tokens, remove models or restore workstation backups.","Open access still permits anonymous REST requests. A token alone does not protect an open workstation. Set a workstation password to enforce access for everyone.","Model-download permission does not replace consent: the agent must present the requested models and sizes before sending approved model IDs. Revocation blocks new requests but does not cancel work already queued."]},
      {title:"Work safely with the shared project", paragraphs:["Agent jobs appear in the same queue with their connection name. Drafts, takes and derived assets remain in the project; agents use revision checks and should reconcile simultaneous edits.","MCP jobs return an ID for progress checks. Browser playback, microphone input, MIDI devices and some Studio mix rendering still require the browser. The API does not change YuE2's generation limitations."]}
    ]
  },
  {
    id: "start",
    group: "Start here",
    title: "Your first visit",
    summary: "Choose where to begin and understand what stays saved.",
    keywords:
      "beginner welcome introduction simple advanced modes name tour help",
    related: ["first-song", "listen", "radio"],
    sections: [
      {
        title: "Find your starting point",
        paragraphs: [
          "Creation is where you make songs and edit projects. Start with the guided Create workflow, then open Studio for detailed work. Listen is a dedicated player for your saved music. Radio makes successive original songs from a station description.",
          "These experiences share one workstation. Create, Studio and Visuals use the same project, songs and history. Switching views does not convert or duplicate a project.",
        ],
      },
      {
        title: "A good first session",
        steps: [
          "Choose Creation on the welcome screen. Your name is optional and stays in this browser.",
          "Keep Show me around enabled for a short tour of the actual controls, or turn it off and explore at your own pace.",
          "Follow Sound, Words, Performance and Listen to make a song. Start with one take and Balanced quality.",
          "Return to the book button whenever you need help. It has a tour for your current workspace, with resume and replay.",
        ],
        tip: "Tours show controls without changing project content, approving downloads or starting GPU work. Your tour progress stays in this browser.",
      },
      {
        title: "What is saved?",
        paragraphs: [
          "Projects and their music and visuals stay on workstation storage. Your browser remembers personal preferences and tour progress. Radio songs are temporary; saved stations keep only names and settings. Keep the Pod's persistent volume and make portable backups of projects you care about.",
        ],
      },
    ],
  },
  {
    id: "first-song",
    group: "Start here",
    title: "Make your first song",
    summary: "A practical route from an idea to a finished take.",
    keywords:
      "quick start generate create sound words performance listen beginner",
    related: ["prompts", "lyrics", "generation", "takes"],
    sections: [
      {
        title: "Describe → write → generate → compare",
        steps: [
          "Use New in the project toolbar to start a song, or Projects to search and switch. These controls stay available in Create, Studio and Visuals. Library also has New project.",
          "In Sound, give the song a working title and describe its music. Include a genre, mood and a few instruments.",
          "In Words, write lyrics or ask for a draft. Review and use the draft, or choose Instrumental.",
          "In Performance, choose vocals, quality and the number of takes. One take at Balanced is a useful starting point.",
          "Choose Generate. If an optional model is missing, review its download dialog. Queue shows the real generation stage.",
          "In Listen, audition the takes as they finish. Mark a favorite, download it, or continue in Studio or Visuals.",
        ],
      },
      {
        title: "You do not have to get everything right first",
        paragraphs: [
          "Go back to any creation step to revise the next generation. Earlier takes retain their generation metadata. Use a variation when you want another performance derived from a take.",
          "A generation takes time. Planning, acoustic generation and audio rendering are separate stages. You can browse the app while work runs; submitting more takes adds work to the queue.",
        ],
        tip: "The tour does not press Generate for you. Starting a real generation is always your action.",
      },
    ],
  },
  {
    id: "prompts",
    group: "Make music",
    title: "Write a useful music description",
    summary: "Tell the model what should be heard, not just a genre label.",
    keywords:
      "prompt enhance style mood instruments energy structure description",
    related: ["lyrics", "generation"],
    sections: [
      {
        title: "Start with a clear musical idea",
        paragraphs: [
          "Describe the genre, instruments, mood, energy and song development. A focused description is easier to work with than many contradictory styles.",
          "Example: Emotional acoustic duet, warm fingerpicked guitar and soft piano, intimate verses, a wide hopeful chorus, alternating male and female leads, gentle resolved ending.",
        ],
      },
      {
        title: "Enhance is a reviewable draft",
        paragraphs: [
          "Enhance opens the writing assistant. Choose a writer and describe what should change. Read the proposed description before using it. Your prompt is not secretly replaced.",
          "For the next take, change one or two things at a time. That makes it easier to hear which direction helped.",
        ],
        tip: "Exact instruments, duration and singer identity remain model guidance. Keep a take because of what you hear, not only because its prompt looks right.",
      },
    ],
  },
  {
    id: "lyrics",
    group: "Make music",
    title: "Lyrics, writers and vocal roles",
    summary:
      "Write naturally, review assistance and guide solo or duet vocals.",
    keywords:
      "lyrics generate rewrite continue assistant model qwen female male duet dialogue instrumental sections chorus verse language",
    related: ["prompts", "generation", "timing"],
    sections: [
      {
        title: "Plain text is enough",
        paragraphs: [
          "Write the actual words you want sung. Section buttons add Intro, Verse, Chorus, Bridge and other markers. Write repeated choruses in full when you want those words repeated. Advanced markup is optional.",
          "Instrumental automatically selects Mothersuperior’s trained adapter. Your lyrics stay saved, while optional arrangement sections guide the composition. Advanced controls let you use original YuE2 instead. Occasional vocal sounds may still occur. A vocal choice such as Female, Male, Duet or Dialogue guides the performance; it is not a guaranteed singer assignment.",
        ],
      },
      {
        title: "Use the lyric assistant",
        steps: [
          "Open the assistant from the creation step and choose a writer model. Larger writers require more memory and loading time.",
          "Choose Description or Lyrics. Instrumental mode offers Arrangement instead of lyric-writing tools. Each focus has its own drafts and an obvious selected state. Give a short creative direction.",
          "If needed, approve the named optional model download. Cancelling the dialog does not queue the task.",
          "Read and edit the returned draft before using it. Description drafts update only your description; arrangement drafts update only instrumental sections. Your existing lyrics, Studio score and mix remain saved.",
        ],
      },
      {
        title: "Duets and languages",
        paragraphs: [
          "Describe alternating parts and the relationship between the voices. After generation, listen for whether the roles are clear. Lyric timing can later be reviewed and assigned duet roles for the Listen display and video.",
          "The lyric assistant follows the language named in your task direction or music description, including Japanese / J-pop. Lyric language lets you override this. Rewriting keeps the existing language when none is named; new lyrics otherwise default to English. A mismatched draft is retried before saving. Written-language confidence is an estimate, not a guarantee of sung pronunciation. Radio has its own language selector.",
        ],
      },
    ],
  },
  {
    id: "generation",
    group: "Make music",
    title: "Rendering presets, takes and advanced controls",
    summary: "Choose how much generation work to do and what to compare.",
    keywords:
      "quality fast balanced high maximum candidates seed temperature sampling duration length ode gpu",
    related: ["first-song", "takes", "models"],
    sections: [
      {
        title: "Rendering presets change processing effort",
        paragraphs: [
          "Create uses 16 acoustic steps for Fast, 32 for Standard, 48 for Extended and 64 for Maximum effort. Standard is the recommended starting point. More processing takes longer and does not guarantee better music or clearer lyrics. Existing saved preset settings retain the same synthesis steps.",
          "More takes produce more performances to choose from. Start small, listen, then spend time on promising ideas. Do not mistake a longer queue for a stalled application.",
        ],
      },
      {
        title: "Duration and creative direction",
        paragraphs: [
          "Length guidance helps shape composition. Exact duration is model-dependent; it is not a precise stopwatch setting. Sampling variation and guidance controls influence generation settings but cannot guarantee every requested musical detail.",
          "Advanced controls expose seed, planning, score and sampling settings. Keep defaults for your first song. When comparing settings, change one thing and keep the rest consistent.",
        ],
      },
      {
        title: "Existing Studio edits stay safe",
        paragraphs: [
          "Custom Studio arrangement or Advanced mix means the project contains detailed edits that simple controls cannot fully summarize. Open Studio to inspect them. Returning to Create does not flatten the arrangement or replace your original audio.",
        ],
      },
    ],
  },
  {
    id: "hum",
    group: "Make music",
    title: "Start with a hummed melody",
    summary:
      "Turn a clear solo hum into an opening melody and performance guide.",
    keywords:
      "hum humming melody microphone recording adapter instrumental lora",
    related: ["generation", "lyrics", "models"],
    sections: [
      {
        title: "Try a melody",
        steps: [
          "In Create → Sound, open Start with a hummed melody. Record or upload 3–30 seconds of a clear solo melody without backing music.",
          "Audition the recording, choose its start and length, and set the tempo close to your performance.",
          "Write lyrics and choose a style as usual. Generating asks before the optional Hum-to-Song model downloads.",
          "The generated take retains its source recording, detected score, confidence summary and adapter details. Open the score in Studio to inspect the melody.",
        ],
      },
      {
        title: "What to expect",
        paragraphs: [
          "This is experimental monophonic pitch analysis, not transcription of a mixed song or voice cloning. Noisy or unclear recordings are rejected instead of inventing notes. Clear pitch detection does not guarantee the final performance will reproduce the melody exactly.",
          "The default continues your opening melody. Use just the detected melody keeps that score as guidance; neither choice sets exact song length. The hum adapter guides phrasing as well as the detected notes. Its effect can be subtle.",
          "A hum uses melody planning for the new take. An existing edited Studio score is protected: detach the hum or explicitly turn off Use edited score before generating. Detaching keeps the recording in the project audio library.",
          "Community adapter weights remain CC BY-NC 4.0. Original YuE2 stays available in Advanced controls; attaching a hum additionally uses the Hum-to-Song adapter.",
        ],
      },
    ],
  },
  {
    id: "takes",
    group: "Make music",
    title: "Compare, keep and vary takes",
    summary: "Turn generated candidates into a version you want to develop.",
    keywords:
      "candidate take favorite star heart compare ab regenerate variation extend remix history versions",
    related: ["studio", "visuals", "export"],
    sections: [
      {
        title: "Listen for the things that matter",
        steps: [
          "Play each completed take and compare the opening, chorus and ending.",
          "Check lyric clarity, voice roles and whether the music follows your description. A Generation limit reached notice identifies an incomplete score plan or a take whose ending may be incomplete. Prepare new take returns to editing without queuing work. Review or simplify the lyrics or score before generating again; another attempt is not guaranteed to fix it.",
          "Mark the take you prefer as a favorite. Take names and generation history remain with the project.",
          "Create a revised take prepares a related generation for review. Revise lyrics / style opens the words step. Generate another complete take immediately queues a fresh recording using the source settings and a new seed. All of these preserve the original; vocals, timing and other parts can change throughout the new recording.",
        ],
      },
      {
        title: "Keep originals while you develop a song",
        paragraphs: [
          "Open in Studio brings the song into the same project for arrangement and mixing. Artwork, stems, masters and videos are separate outputs connected to the source song.",
          "Export and download are different from choosing a favorite. A favorite helps organize your Library; a download gives you a file outside the workstation.",
        ],
      },
    ],
  },
  {
    id: "studio",
    group: "Studio",
    title: "Understand the Studio workspace",
    summary:
      "Arrange, Piano Roll, Score, Mix and Analyze are views of one project.",
    keywords:
      "advanced daw studio workstation tabs inspector browser phone more",
    related: ["arrange", "score", "mix", "export"],
    sections: [
      {
        title: "One editor at a time",
        paragraphs: [
          "Arrange works with tracks and clips. Piano Roll edits notes. Score exposes notation. Mix balances channels and effects. Analyze helps inspect audio. Switch editor tabs without leaving the project.",
          "Use the project browser and inspector buttons to reveal side panels when needed. Resize visible panels on desktop. On phones, Studio is available under More → Open Studio; detailed editing benefits from a wider screen.",
        ],
      },
      {
        title: "Keep a musical and a file view in mind",
        paragraphs: [
          "The timeline says when something plays. Files holds the underlying assets. A clip can use part of an audio file without cutting that source file. Generation history records how a take was made.",
          "The toolbar contains save status, Queue, Files, undo/redo, history, import and export. Keep an eye on save status, especially if your connection drops.",
        ],
      },
    ],
  },
  {
    id: "arrange",
    group: "Studio",
    title: "Arrange clips and tracks",
    summary: "Build a song on the timeline while retaining source recordings.",
    keywords:
      "timeline audio clip split trim move fade gain snap bpm tempo import stems demucs",
    related: ["score", "mix", "files"],
    sections: [
      {
        title: "Work on a selected clip",
        paragraphs: [
          "Place or import audio into the project, then select its clip in Arrange. Move the clip in time, trim its edges, split at the cursor and use fades to soften edits. Snap helps edits follow the musical grid.",
          "Clip edits are non-destructive references to source audio. Undo reverses project edits; it does not cancel a running generation or recover a deliberately deleted workstation file.",
        ],
      },
      {
        title: "Tempo and stems",
        paragraphs: [
          "Tempo controls the project's beat grid. An imported performance may not match that grid perfectly; inspect and listen before assuming it does.",
          "Stem separation creates separate parts for further work. The bundled Demucs model supports the separation workflow. Source separation is an estimate and can leave bleed or artifacts; keep the original mix for comparison.",
        ],
      },
    ],
  },
  {
    id: "score",
    group: "Studio",
    title: "Piano Roll, chords and YuE2 scores",
    summary: "Edit musical notes and inspect the score behind a generation.",
    keywords:
      "midi abc notation score chord notes piano roll velocity quantize melody planning",
    related: ["studio", "arrange", "generation"],
    sections: [
      {
        title: "Piano Roll",
        paragraphs: [
          "Select a suitable note or instrument clip. Add notes, drag pitches and positions, resize durations and adjust velocity. Use the grid and editing tools for quantization, transposition and other supported operations.",
          "Notes are musical instructions. Audio is a recording. Editing notes does not automatically rewrite an existing audio file.",
        ],
      },
      {
        title: "Score and chords",
        paragraphs: [
          "YuE2 can plan symbolic music as ABC notation. Score lets you inspect and edit that representation; chord tools help work with its harmony. Review the score and deliberately use it for another generation when ready.",
          "A new render becomes a new take. The original audio and its generation metadata remain available. Imported or unusual notation may need correction before YuE2 can use it.",
        ],
      },
    ],
  },
  {
    id: "mix",
    group: "Studio",
    title: "Mix, effects and mastering",
    summary: "Balance a song before preparing its final deliverables.",
    keywords:
      "volume pan solo mute bus routing effect eq compressor limiter automation mastering lufs clipping",
    related: ["arrange", "export"],
    sections: [
      {
        title: "Start with balance",
        steps: [
          "Set channel volume and pan so the important parts are clear.",
          "Use mute and solo to inspect individual tracks, then listen to them together again.",
          "Add or adjust effects deliberately and compare with bypass.",
          "Watch the master meter and leave headroom. Louder alone does not mean better.",
        ],
      },
      {
        title: "Automation and masters",
        paragraphs: [
          "Automation changes supported parameters over time. It belongs to the arrangement and should be reviewed together with clip levels and effects.",
          "A master is a separate processed version, not a replacement for the raw generation. Compare it at a sensible playback level. Export preflight explains when a renderer cannot reproduce project features.",
        ],
      },
    ],
  },
  {
    id: "listen",
    group: "Listen & Radio",
    title: "Use the listening room",
    summary: "A dedicated player for artwork, music and synchronized lyrics.",
    keywords:
      "player playback lyrics scroll synced duet artwork cover full screen queue favorites phone mobile",
    related: ["library", "timing", "radio"],
    sections: [
      {
        title: "Choose music and settle in",
        paragraphs: [
          "Open Listen and use Library to select a saved song. The player offers playback, volume, a listening queue and favorites. The bottom player keeps music accessible while you return to Creation.",
          "Show lyrics replaces the artwork with lyrics while keeping controls available. Hide lyrics returns to artwork. Timed lyrics follow playback and can display reviewed duet roles on different sides.",
        ],
      },
      {
        title: "If lyrics are missing or mistimed",
        steps: [
          "Confirm you are playing the intended take.",
          "Open that song's project and go to Visuals → Lyric timing.",
          "Align the correct audio source, then review uncertain lines and voice roles.",
          "Return to Listen to check the result against the song.",
        ],
        tip: "Untimed words cannot provide accurate karaoke highlighting. Correct the timing rather than inventing timestamps.",
      },
    ],
  },
  {
    id: "radio",
    group: "Listen & Radio",
    title: "Start and change a live Radio station",
    summary:
      "Original temporary music that keeps broadcasting until you stop it.",
    keywords:
      "radio live infinite no pause skip seek stop crossfade join retune adjust station",
    related: ["radio-settings", "models", "troubleshooting"],
    sections: [
      {
        title: "Start a station",
        steps: [
          "Describe the music you want: genre, mood, instruments or stories.",
          "Choose vocal direction, lyric language, writer, rendering preset and target length. Review any optional writer download.",
          "Start Radio and wait for the first song to finish generating. Join live appears if your browser needs a tap to enable audio.",
          "The next song prepares in the background and crossfades when ready. There is no skip, seek or pause control.",
        ],
      },
      {
        title: "Change the station while it plays",
        paragraphs: [
          "Open Adjust station and apply a new direction. For example, move from Japanese J-pop to instrumental classical. Current audio keeps its broadcast time while unfinished obsolete work is cancelled and the new direction prepares.",
          "A prepared direction joins at the next suitable transition. Generation can be slower than playback on some settings or hardware, so a gap is possible. The UI shows actual progress.",
        ],
      },
      {
        title: "Mute, leave or stop",
        paragraphs: [
          "Mute silences your device while the live clock continues. Closing the tab does not stop the station or its GPU work. Reopening Radio joins the current live position. Use Stop Radio to end the session.",
          "One station runs per workstation. Other signed-in browsers can join, adjust or stop it. A Pod restart ends this temporary session; persistent projects and saved station recipes remain.",
        ],
      },
    ],
  },
  {
    id: "radio-settings",
    group: "Listen & Radio",
    title: "Radio languages and saved stations",
    summary:
      "Keep a station recipe, choose its language and control its sound.",
    keywords:
      "japanese j-pop english korean k-pop language saved station preset bookmark rename delete writer quality length",
    related: ["radio", "models"],
    sections: [
      {
        title: "Language and voice direction",
        paragraphs: [
          "Choose a lyric language explicitly when it matters. Japanese guides the written lyrics and singing request even when the description is English; From station description infers a requested language from supported cues. The station label reports the request, not verified sung language. Instrumental requests do not need sung lyrics.",
          "Automatic vocals can follow the genre, such as instrumental classical. Set a specific vocal direction when that is important. Written-language checks help reject mismatched drafts but do not guarantee perfect sung pronunciation.",
        ],
      },
      {
        title: "Save a recipe, not the songs",
        steps: [
          "Open Saved stations and choose Save current settings.",
          "Give it a name. Description, writer, vocals, language, quality and length are saved on the workstation.",
          "Load it later to fill setup or a live direction for review. Start or Apply direction when ready.",
          "Use Edit to rename or replace its settings. Removing a saved recipe does not stop live Radio.",
        ],
        tip: "Radio audio never enters Library. Saved station recipes survive a Pod restart with the same volume, but are not included in project-only portable backups yet.",
      },
    ],
  },
  {
    id: "visuals",
    group: "Finish & share",
    title: "Covers, lyrics and music videos",
    summary: "Make visuals connected to the same song and project.",
    keywords: "visuals artwork cover video karaoke visualizer assets scene",
    related: ["artwork", "timing", "video"],
    sections: [
      {
        title: "A simple route",
        steps: [
          "Choose the take you want to present.",
          "Create artwork or import an image, then set a project cover if you want one.",
          "Align and review lyrics for a synchronized lyric or karaoke video.",
          "Use the simple music-video workflow, preview it, then render and download the full result.",
        ],
      },
      {
        title: "More control when you need it",
        paragraphs: [
          "Visuals separates Artwork, Cover designer, Lyric timing, Music video and Media library. Advanced video controls expose the supported scenes, typography, effects and output settings.",
          "Original music, artwork versions and video renders stay separate, with relationships to the project. An image provider is optional; imported artwork can be used without downloading a diffusion model.",
        ],
      },
    ],
  },
  {
    id: "artwork",
    group: "Finish & share",
    title: "Artwork and the cover designer",
    summary: "Generate or import an image, then add clean typography.",
    keywords:
      "image cover art prompt ratio square vertical typography title artist upload provider diffusion",
    related: ["visuals", "video", "models"],
    sections: [
      {
        title: "Build an editable visual prompt",
        paragraphs: [
          "Use the song context to suggest an artwork prompt, then edit the mood, environment, colors and composition. Choose the supported aspect ratio and number of images. Previous artwork is retained.",
          "Optional artwork models use the standard download confirmation. Core music creation remains usable without an artwork provider.",
        ],
      },
      {
        title: "Design the final cover",
        steps: [
          "Choose a generated or imported image as the background.",
          "Open Cover designer and adjust the crop, scale and position.",
          "Add title, artist or subtitle with the available font, alignment and text controls.",
          "Save the cover and choose it as the project cover or video background.",
        ],
        tip: "Generate background artwork without baked-in lettering. The application's text tools give you cleaner, editable typography.",
      },
    ],
  },
  {
    id: "timing",
    group: "Finish & share",
    title: "Correct lyric timing and duets",
    summary: "Review line and word timing against the actual performance.",
    keywords:
      "alignment sync karaoke timestamps duet singer speaker sortformer whisper words lines review confidence",
    related: ["listen", "lyrics", "video"],
    sections: [
      {
        title: "Align the correct take",
        paragraphs: [
          "Open Visuals → Lyric timing and select the song's audio source. Alignment uses the supported local models; a missing optional model asks for approval. Different takes can need different timing.",
          "Available timing may include sections, lines and words. Confidence and word-match coverage help identify review work; they do not prove that every boundary is correct.",
        ],
      },
      {
        title: "Listen and correct",
        steps: [
          "Use the review controls to find uncertain or stale lines.",
          "Play or loop a line and adjust its start and end to the actual singing.",
          "Correct word boundaries where word timing is available. Split or merge lines when the structure needs it.",
          "Review singer roles and overlaps for a duet. Confirm the left/right presentation in Listen and the timing in a video preview.",
        ],
        tip: "Do not accept guessed word timing just to fill the screen. Line-level highlighting is preferable when word boundaries are unreliable.",
      },
    ],
  },
  {
    id: "video",
    group: "Finish & share",
    title: "Render a music or karaoke video",
    summary: "From a song and artwork to a server-rendered deliverable.",
    keywords:
      "mp4 h264 video lyric karaoke render preview youtube vertical square timeline scenes visualizer fft",
    related: ["artwork", "timing", "export"],
    sections: [
      {
        title: "Use the simple workflow first",
        paragraphs: [
          "Choose your song and background, then select a suitable video style. Karaoke prioritizes readable synchronized lyrics; lyric-video presentation can be more visual. Review lyric timing before a full karaoke render.",
          "Use the short preview to check framing, text size and timing. Then render the full video. Queue reports preparation, rendering, encoding and completion.",
        ],
      },
      {
        title: "Customize and export",
        paragraphs: [
          "Advanced controls expose supported timeline, scene, typography, motion, visualizer and output settings. Match aspect ratio to the destination: wide for a conventional video, vertical for a phone feed, or square where appropriate.",
          "Video rendering runs on the server, not by recording your browser. Visualizers use actual audio data. The original WAV/FLAC remains separate from the encoded video soundtrack. Larger resolution and frame-rate choices require more render time and resources.",
        ],
      },
    ],
  },
  {
    id: "library",
    group: "Workstation care",
    title: "Library, projects and favorites",
    summary: "Find songs without losing the project they came from.",
    keywords:
      "library project song collection search favorite archive duplicate rename import player",
    related: ["listen", "files", "takes"],
    sections: [
      {
        title: "A project can contain several songs and versions",
        paragraphs: [
          "Library organizes projects and playable audio. Search, favorites and archive help you find work. Open a project's songs for listening or open the project for editing.",
          "Generated takes, separated stems and masters have different purposes. Use names and favorites to identify the version you want. Duplicating or archiving a project is a deliberate Library action, not part of switching modes.",
        ],
      },
      {
        title: "Starting from your own audio",
        paragraphs: [
          "Use the available import action for audio, MIDI, scores or supported project archives. Open or create a project before importing into the workstation. Imported files become assets that can be used by clips and other workflows.",
          "Listen's queue is a listening order, not a project arrangement. Changing the queue does not rearrange clips in Studio.",
        ],
      },
    ],
  },
  {
    id: "files",
    group: "Workstation care",
    title: "Saving, files, history and backups",
    summary: "Know where your work lives and how to keep a portable copy.",
    keywords:
      "save autosave files storage persistent restart backup restore history version recovery lost projects",
    related: ["library", "export", "access"],
    sections: [
      {
        title: "The workstation stores your project",
        paragraphs: [
          "Watch save status in the toolbar. Project edits are saved to workstation storage; Ctrl/Cmd+S requests a save. Files shows named project assets, and version history lets you inspect stored project revisions.",
          "If connection or sign-in is interrupted, recovery can preserve unsaved browser edits for review. Resolve a conflict deliberately instead of overwriting another tab's changes without checking them.",
        ],
      },
      {
        title: "Make a backup you can take away",
        steps: [
          "Open Workstation tools → Backups.",
          "Choose the project backup to prepare and wait for verification.",
          "Download the verified archive and keep it outside the Pod.",
          "Use the restore/import workflow when you need that portable project again.",
        ],
        tip: "Keep the same persistent /workspace volume and storage path when upgrading. A project-only backup does not currently include all workstation settings, saved Radio recipes or full revision history.",
      },
    ],
  },
  {
    id: "models",
    group: "Workstation care",
    title: "Models, downloads, Queue and VRAM",
    summary: "Understand first-use downloads and what the GPU is doing.",
    keywords:
      "model download optional baked included progress queue vram gpu memory slow loading runpod qwen demucs tokenizer sortformer cancel retry",
    related: ["generation", "radio", "troubleshooting"],
    sections: [
      {
        title: "Included and optional models",
        paragraphs: [
          "The Runpod image includes YuE2, its audio decoder, Mothersuperior real-audio v4 tools, the instrumental adapter, Demucs and NVIDIA Sortformer 2.1. Optional lyric writers, artwork and additional analysis/alignment models download when their workflow needs them and you approve.",
          "The confirmation names the model and its expected size. Cancel if you do not want it. Workstation tools → Models shows installed or partial models and the supported download/removal actions. Approved optional weights stay on persistent storage for reuse.",
        ],
      },
      {
        title: "Read progress by stage",
        paragraphs: [
          "Queue shows jobs, stages and named download files. Loading a model is different from downloading it. Music generation uses the GPU queue; some export work can run separately. Cancel and retry are available where supported.",
          "The VRAM display reports GPU memory use. Radio can keep smaller writers cached when there is enough memory, but larger models may alternate with YuE2. A model being on disk does not mean it is already in GPU memory.",
        ],
      },
      {
        title: "If work seems slow",
        paragraphs: [
          "Check the active stage and whether another job is ahead of yours. First use can include a download and model loading. More takes, more synthesis steps and long compositions add time. Repeatedly pressing Generate adds work rather than accelerating the first job.",
        ],
      },
    ],
  },
  {
    id: "export",
    group: "Finish & share",
    title: "Choose the right export",
    summary:
      "Download a take, render an arrangement or back up the whole project.",
    keywords:
      "download export wav flac mp3 audio mix master browser server compatibility tail stems midi abc zip",
    related: ["mix", "video", "files"],
    sections: [
      {
        title: "Three different outcomes",
        paragraphs: [
          "Download a take when you want its existing audio file. Export a mix when you want the arrangement and supported effects rendered. Prepare a portable backup when you need the editable project and its media.",
          "Keep original audio, mixes and masters as separate versions. A video export has its own encoded soundtrack; it does not replace the original audio file.",
        ],
      },
      {
        title: "Read export preflight",
        paragraphs: [
          "Choose the renderer and supported format in Export. Preflight reports features a selected renderer cannot reproduce. Instrument notes require browser rendering in the current implementation, and server dynamics can sound different from browser playback.",
          "Check the selected range, normalization and effect tail. Preview the result and listen to the ending so reverb or delay is not unexpectedly cut. Unsupported combinations must be corrected before rendering.",
        ],
      },
    ],
  },
  {
    id: "access",
    group: "Workstation care",
    title: "Access and your Runpod workstation",
    summary: "Understand open access, passwords and persistent storage.",
    keywords:
      "password sign in auth login security api runpod proxy https access restart",
    related: ["files", "models", "troubleshooting"],
    sections: [
      {
        title: "Open access or your own password",
        paragraphs: [
          "New installations have no password by default. Anyone who can reach an open workstation can use its app and API. Access settings explains the current state and how the Pod owner can set DAW_PASSWORD.",
          "With a password enabled, projects, jobs, models, media, exports and live updates require sign-in. Health checks, sign-in/session information and the static app shell remain public. HTTPS protects the connection; it does not choose who can access the workstation.",
        ],
      },
      {
        title: "Before restarting or changing the Pod",
        paragraphs: [
          "Save your project, wait for work you want to finish, and keep the same persistent volume and storage path. Restart ends a temporary Radio broadcast. A closed browser tab does not stop the Pod or Radio compute.",
          "Use the Runpod HTTPS proxy for the application. Access settings contains the password setup steps. Never paste your password into a music prompt, support report or shared project description.",
        ],
      },
    ],
  },
  {
    id: "troubleshooting",
    group: "Workstation care",
    title: "When something is not working",
    summary: "Find the next useful action without guessing at model internals.",
    keywords:
      "error failed no sound silent stuck slow offline reconnect download memory unavailable retry troubleshooting",
    related: ["models", "files", "timing", "radio"],
    sections: [
      {
        title: "No sound",
        paragraphs: [
          "Check device volume, player mute and whether a playable song is selected. A browser may need a tap on Play or Join live to permit audio. Creation, Listen and Radio coordinate playback so they do not all play at once.",
          "After a network or audio interruption, reconnect to the workstation. Radio refreshes the live position; it cannot replay an expired broadcast track.",
        ],
      },
      {
        title: "Generation failed or is waiting",
        paragraphs: [
          "Read the job's stage and error in Queue. Confirm the Runpod GPU is available and any requested optional model download was approved. Use Retry after resolving the reported issue.",
          "For GPU memory exhaustion, avoid stacking large model workloads and try a smaller writer or another GPU with more memory. More detail is available in model and job diagnostics. Do not keep queuing duplicates.",
        ],
      },
      {
        title: "Missing lyrics, files or edits",
        paragraphs: [
          "Confirm the correct project and take are open. For lyrics, check the selected alignment source and review timing. For saved work, inspect save status, project history and any recovery dialog.",
          "Keep errors and relevant steps when reporting a problem. Include the app version and device/browser version; omit passwords and private media unless you deliberately want to share them.",
        ],
      },
    ],
  },
  {
    id: "shortcuts",
    group: "Start here",
    title: "Shortcuts and a small glossary",
    summary: "A few useful keys and plain definitions for unfamiliar terms.",
    keywords:
      "keyboard shortcuts undo redo save glossary daw stem candidate clip score midi abc seed vram",
    related: ["studio", "generation", "files"],
    sections: [
      {
        title: "Useful workstation keys",
        paragraphs: [
          "Ctrl/Cmd+S saves. Ctrl/Cmd+Z undoes, and Ctrl/Cmd+Shift+Z redoes project edits. In Studio, Space controls playback; S splits at the cursor and M toggles a selected clip's mute where supported.",
          "Copy, paste, duplicate and selection shortcuts depend on the active editor. Typing in a field should keep normal text-editing behavior. The keyboard button lists workstation shortcuts. F1 opens the handbook when no other dialog is active.",
          "In a tour, use Next and Back or the left/right arrow keys. Escape pauses it. You can resume from the handbook.",
        ],
      },
      {
        title: "Words you will see",
        paragraphs: [
          "Take or candidate: one generated performance. Asset: a stored file such as audio or artwork. Clip: a timed reference to audio or notes in an arrangement. Stem: an estimated separated musical part.",
          "Score: written musical instructions; ABC is one text format for them. MIDI: note and performance instructions, not a finished audio recording. Seed: a generation setting used when reproducing or varying a run.",
          "Mix: the combined tracks and effects. Master: a separately processed final version. VRAM: the GPU's working memory. Alignment: timing that connects written lyrics to the sung performance.",
        ],
      },
    ],
  },
];

const groupOrder = [
  "Start here",
  "Make music",
  "Studio",
  "Listen & Radio",
  "Finish & share",
  "Workstation care",
];
chapters.sort(
  (a, b) => groupOrder.indexOf(a.group) - groupOrder.indexOf(b.group),
);

function normalize(value: string) {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase();
}
export function searchChapters(query: string): Chapter[] {
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return chapters;
  return chapters
    .map((chapter) => {
      const title = normalize(chapter.title + " " + chapter.keywords);
      const full = normalize(JSON.stringify(chapter));
      return {
        chapter,
        score: words.every((w) => full.includes(w))
          ? words.reduce((n, w) => n + (title.includes(w) ? 4 : 1), 0)
          : 0,
      };
    })
    .filter((v) => v.score)
    .sort((a, b) => b.score - a.score)
    .map((v) => v.chapter);
}
