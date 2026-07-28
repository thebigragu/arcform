/** Proportional ladder candidates — caps enforced at encode time. */
const DESKTOP_TIERS = [
  { id: "d1440", maxWidth: 1440, device: "desktop" },
  { id: "d1080", maxWidth: 1080, device: "desktop" },
  { id: "d720", maxWidth: 720, device: "desktop" },
];

const MOBILE_TIERS = [
  { id: "m900", maxWidth: 900, device: "mobile" },
  { id: "m720", maxWidth: 720, device: "mobile" },
  { id: "m540", maxWidth: 540, device: "mobile" },
];

const DESKTOP_CAP = 1440;
const MOBILE_CAP = 900;
const FPS = 30;
const SCRUB_GOP = 1;
const PLAYBACK_GOP = 60; // ~2s @ 30fps
const CRF_MIN = 18;
const CRF_MAX = 26;
const CRF_START = 21;
const PRESET = "slower";
const MAX_TIER_BYTES = 40 * 1024 * 1024;

module.exports = {
  DESKTOP_TIERS,
  MOBILE_TIERS,
  DESKTOP_CAP,
  MOBILE_CAP,
  FPS,
  SCRUB_GOP,
  PLAYBACK_GOP,
  CRF_MIN,
  CRF_MAX,
  CRF_START,
  PRESET,
  MAX_TIER_BYTES,
};
