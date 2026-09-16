import { createProject, edit, getState, setState, notice } from "./store";
import { newTrack, newClip, newNote, palette, id } from "./model";
export const startSketch = async (
  name = "After hours · composition sketch",
) => {
  const previous = getState().project?.id;
  await createProject(name);
  if (!getState().project || getState().project?.id === previous) return;
  edit("Composition sketch", (p) => {
    p.tempo = 104;
    p.key = "A minor";
    p.generation.style =
      "Warm downtempo electronic soul, late-night atmosphere, soft analog bass, restrained drums and intimate vocals";
    p.generation.lyrics =
      "[Verse]\nCity lights are fading slow\nThere is nowhere else to go\n\n[Chorus]\nKeep the light on, let it glow\nThere is somewhere we can go";
    p.chords = ["Am7", "Fmaj7", "Cmaj7", "G"].map((symbol, i) => ({
      id: id(),
      symbol,
      beat: i * 4,
      duration: 4,
    }));
    p.sections = [
      { id: id(), name: "Intro", beat: 0, duration: 16, lyrics: "" },
      {
        id: id(),
        name: "Verse",
        beat: 16,
        duration: 16,
        lyrics: "City lights are fading slow",
      },
      {
        id: id(),
        name: "Chorus",
        beat: 32,
        duration: 16,
        lyrics: "Keep the light on, let it glow",
      },
    ];
    const melody = [
      69, 72, 76, 74, 72, 69, 67, 64, 65, 69, 72, 76, 74, 72, 71, 67,
    ].map((pitch, i) => newNote(i, pitch, i % 4 === 3 ? 0.75 : 0.5));
    p.tracks = [
      newTrack({
        name: "Glass keys",
        type: "midi",
        instrument: "piano",
        color: palette[0],
        clips: [
          newClip({
            name: "Night melody",
            duration: 48,
            notes: melody,
            loop: true,
            loopBeats: 16,
            color: palette[0],
          }),
        ],
        effects: [
          {
            id: id(),
            type: "delay",
            bypass: false,
            params: { time: 0.288, feedback: 0.25, mix: 0.15 },
          },
        ],
      }),
      newTrack({
        name: "Low tide",
        type: "midi",
        instrument: "bass",
        volume: 0.45,
        color: palette[1],
        clips: [
          newClip({
            name: "Bass movement",
            duration: 48,
            notes: [45, 41, 48, 43].map((pitch, i) =>
              newNote(i * 4, pitch, 3.5),
            ),
            loop: true,
            loopBeats: 16,
            color: palette[1],
          }),
        ],
      }),
      newTrack({
        name: "Soft focus",
        type: "midi",
        instrument: "pad",
        volume: 0.3,
        color: palette[3],
        clips: [
          newClip({
            name: "Chord atmosphere",
            beat: 16,
            duration: 32,
            notes: [57, 60, 64, 53, 57, 60, 48, 52, 55, 55, 59, 62].map(
              (pitch, i) => newNote(Math.floor(i / 3) * 4, pitch, 3.8),
            ),
            loop: true,
            loopBeats: 16,
            color: palette[3],
          }),
        ],
      }),
      newTrack({
        name: "Pocket drums",
        type: "midi",
        instrument: "drums",
        volume: 0.6,
        color: palette[2],
        clips: [
          newClip({
            name: "Dusty groove",
            beat: 16,
            duration: 32,
            notes: Array.from({ length: 32 }, (_, i) => ({
              ...newNote(
                i * 0.5,
                i % 4 === 0 ? 36 : i % 4 === 2 ? 38 : 42,
                0.1,
              ),
              velocity: i % 4 === 0 ? 110 : 75,
            })),
            loop: true,
            loopBeats: 16,
            color: palette[2],
          }),
        ],
      }),
    ];
    p.loopEnd = 48;
  });
  const first = getState().project!.tracks[0];
  setState({
    selectedTrack: first.id,
    selectedClips: [first.clips[0].id],
    zoom: 14,
  });
  notice(
    "This is a synthesized composition template, ready to edit or use for YuE2 planning.",
  );
};
