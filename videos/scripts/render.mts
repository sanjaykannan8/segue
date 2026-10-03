import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Final render (adapted from the skill's render.ts for a CPU-bound laptop with an NVIDIA GPU):
 * a 120 fps master (2 subframes per 60 fps frame) blended with ffmpeg tmix into
 * 60 fps motion blur, then H.264 deliverables encoded on the GPU (h264_nvenc).
 *
 *   npx tsx scripts/render.mts <CompositionId> <file-name> --duration 45 --poster 38
 */
const args = process.argv.slice(2);
const flag = (name: string) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const [composition, name] = args;
const duration = Number(flag("--duration"));
const posterSeconds = Number(flag("--poster") ?? duration / 2);
const SUB = 2;
if (!composition || !name || !duration) throw new Error("Usage: npx tsx scripts/render.mts <CompositionId> <file-name> --duration <s> [--poster <s>]");

const root = resolve(import.meta.dirname, "..");
const out = join(root, "out", name);
mkdirSync(out, { recursive: true });
const run = (command: string, list: string[]) => execFileSync(command, list, { cwd: root, stdio: "inherit" });
const remotion = (list: string[]) => run(process.execPath, [join(root, "node_modules/@remotion/cli/remotion-cli.js"), ...list]);
const ffmpeg = "ffmpeg";

const master = join(out, "master-120.mp4");
const blurred = join(out, "blurred-60.mov");
const audio = join(root, flag("--audio") ?? "public/audio/segue-mix.wav");

// 1. The master: PNG frames, 4:4:4, muted.
remotion(["render", "src/index.ts", composition, master, "--props", JSON.stringify({ fps: 60 * SUB, audio: false }), "--codec", "h264", "--crf", "10", "--pixel-format", "yuv444p", "--image-format", "png", "--muted", "--concurrency", "7", "--log", "error"]);

// 2. Motion blur: average each pair of subframes, keep one -> 60 fps.
//    The master is limited range BT.601, untagged: say so, convert once to BT.709.
run(ffmpeg, [
  "-v", "error", "-y", "-i", master,
  "-vf", `tmix=frames=${SUB},select='not(mod(n+1\\,${SUB}))',setpts=N/(60*TB),scale=in_range=tv:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv444p10le`,
  "-r", "60", "-c:v", "prores_ks", "-profile:v", "4444", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv",
  blurred,
]);

const nvenc = ["-c:v", "h264_nvenc", "-preset", "p7", "-tune", "hq", "-rc", "vbr", "-cq", "18", "-b:v", "0", "-profile:v", "high", "-pix_fmt", "yuv420p", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv", "-movflags", "+faststart"];

// 3. Deliverables: with music (the pitch film), muted, and the poster.
run(ffmpeg, ["-v", "error", "-y", "-i", blurred, "-i", audio, ...nvenc, "-c:a", "aac", "-b:a", "256k", "-shortest", join(out, `${name}-1080p60.mp4`)]);
run(ffmpeg, ["-v", "error", "-y", "-i", blurred, ...nvenc, "-an", join(out, `${name}-1080p60-muted.mp4`)]);
run(ffmpeg, ["-v", "error", "-y", "-ss", String(posterSeconds), "-i", blurred, "-frames:v", "1", "-q:v", "2", join(out, "poster.jpg")]);

rmSync(master);
rmSync(blurred);
for (const file of [`${name}-1080p60.mp4`, `${name}-1080p60-muted.mp4`, "poster.jpg"]) {
  console.log(`${file}: ${(statSync(join(out, file)).size / 1e6).toFixed(1)} MB`);
}
