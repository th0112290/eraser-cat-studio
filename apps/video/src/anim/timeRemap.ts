function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function holdThenSnap(
  frame: number,
  holdStart: number,
  holdFrames: number,
  snapSpeed: number
): number {
  const safeHoldStart = Math.max(0, holdStart);
  const safeHoldFrames = Math.max(0, Math.floor(holdFrames));
  const safeSnapSpeed = Math.max(0, snapSpeed);
  const holdEnd = safeHoldStart + safeHoldFrames;

  if (frame <= safeHoldStart) {
    return frame;
  }

  if (frame <= holdEnd) {
    return safeHoldStart;
  }

  const elapsedAfterHold = frame - holdEnd;
  const laggedFrame = frame - safeHoldFrames;
  const recoveryRate = 0.12 + safeSnapSpeed * 0.18;
  const catchUp = safeHoldFrames * (1 - Math.exp(-elapsedAfterHold * recoveryRate));

  return laggedFrame + catchUp;
}

export function beatPunch(frame: number, punchFrame: number, strength: number): number {
  const safeStrength = Math.max(0, strength);
  const distance = frame - punchFrame;
  const radius = 12;

  if (Math.abs(distance) > radius || safeStrength === 0) {
    return 0;
  }

  const normalized = Math.abs(distance) / radius;
  const envelope = 1 - normalized;
  const prePunch = distance < 0;

  return (prePunch ? -0.45 : 0.9) * safeStrength * envelope;
}
