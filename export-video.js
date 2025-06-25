const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Usage: node export-video.js input.mp4 edits.json output.mp4

if (process.argv.length < 5) {
  console.log('Usage: node export-video.js input.mp4 edits.json output.mp4');
  process.exit(1);
}

const inputVideo = process.argv[2];
const editsFile = process.argv[3];
const outputVideo = process.argv[4];

if (!fs.existsSync(inputVideo)) {
  console.error('Input video not found:', inputVideo);
  process.exit(1);
}
if (!fs.existsSync(editsFile)) {
  console.error('Edits JSON not found:', editsFile);
  process.exit(1);
}

const edits = JSON.parse(fs.readFileSync(editsFile, 'utf8'));

function buildFilter(edits) {
  if (!edits.zoomEffects || edits.zoomEffects.length === 0) return '';
  let filterParts = [];
  let concatInputs = [];
  let idx = 0;
  for (let i = 0; i < edits.zoomEffects.length; i++) {
    const effect = edits.zoomEffects[i];
    const nextEffect = edits.zoomEffects[i + 1];
    const zoomStart = effect.zoomLevel / 100;
    const zoomEnd = nextEffect ? nextEffect.zoomLevel / 100 : zoomStart;
    const posXStart = effect.position.x;
    const posXEnd = nextEffect ? nextEffect.position.x : posXStart;
    const posYStart = effect.position.y;
    const posYEnd = nextEffect ? nextEffect.position.y : posYStart;
    const duration = (nextEffect ? nextEffect.startTime : effect.endTime) - effect.startTime;
    const zoomExpr = duration > 0 ? `${zoomStart}+(${zoomEnd}-${zoomStart})*(t/${duration})` : `${zoomStart}`;
    const outW = `iw/(${zoomExpr})`;
    const outH = `ih/(${zoomExpr})`;
    const xExpr = duration > 0 ? `(iw-${outW})*(${posXStart}+(${posXEnd}-${posXStart})*(t/${duration}))/100` : `(iw-${outW})*${posXStart}/100`;
    const yExpr = duration > 0 ? `(ih-${outH})*(${posYStart}+(${posYEnd}-${posYStart})*(t/${duration}))/100` : `(ih-${outH})*${posYStart}/100`;
    filterParts.push(
      `[0:v]trim=start=${effect.startTime}:end=${effect.endTime},setpts=PTS-STARTPTS,crop=${outW}:${outH}:${xExpr}:${yExpr},scale=iw:ih[v${idx}]`
    );
    concatInputs.push(`[v${idx}]`);
    idx++;
  }
  filterParts.push(`${concatInputs.join('')}concat=n=${edits.zoomEffects.length}:v=1:a=0[outv]`);
  return filterParts.join(';');
}

const filter = buildFilter(edits);

let ffmpegCmd = `ffmpeg -y -i "${inputVideo}"`;

if (edits.trimSegments && edits.trimSegments.length > 0 && (!edits.zoomEffects || edits.zoomEffects.length === 0)) {
  // Fast trim/copy if no zooms
  const { start, end } = edits.trimSegments[0];
  ffmpegCmd += ` -ss ${start} -to ${end} -c copy "${outputVideo}"`;
} else if (filter) {
  ffmpegCmd += ` -filter_complex "${filter}" -map "[outv]" -map 0:a? -c:v libx264 -preset veryfast -crf 23 -c:a aac -strict experimental "${outputVideo}"`;
} else {
  ffmpegCmd += ` -c copy "${outputVideo}"`;
}

console.log('Running:', ffmpegCmd);
execSync(ffmpegCmd, { stdio: 'inherit' });
console.log('Export complete:', outputVideo); 